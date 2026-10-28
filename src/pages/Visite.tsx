import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { SECTIONS, TYPES_TRAVAUX, statutRdv, UNITES, MESURES_RAPIDES, nbReponses, type Fiche, type Mesure, type Question, type Visite as TVisite } from '../lib/visite'
import { ajouterPhotoVisite, compresser } from '../lib/photos'
import { dateLongue, normaliserTel, telAffiche } from '../lib/format'
import { IcoPhoto, IcoRetour, IcoRoute, IcoTel } from '../components/Icones'
import Meteo from '../components/Meteo'

type Infos = Pick<TVisite, 'client_nom' | 'telephone' | 'email' | 'adresse' | 'code_postal' | 'ville' | 'type_travaux'>

export default function Visite() {
  const { id } = useParams()
  const nav = useNavigate()
  const [v, setV] = useState<TVisite | null>(null)
  const [fiche, setFiche] = useState<Fiche>({})
  const [infos, setInfos] = useState<Infos | null>(null)
  const [editInfos, setEditInfos] = useState(false)
  const [nbPhotos, setNbPhotos] = useState(0)
  const [etat, setEtat] = useState<'' | 'attente' | 'ok' | 'hors'>('')
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')
  const [legende, setLegende] = useState('')
  const minuteur = useRef<number | undefined>(undefined)
  const cle = `at-visite-${id}`

  useEffect(() => {
    Promise.all([
      supabase.from('visites').select('*').eq('id', id).single(),
      supabase.from('photos_visite').select('id', { count: 'exact', head: true }).eq('visite_id', id)
    ]).then(([r, p]) => {
      if (!r.data) return
      const d = r.data as TVisite
      // Une saisie faite hors connexion et pas encore envoyée l'emporte.
      let local: { fiche: Fiche; infos: Infos } | null = null
      try {
        local = JSON.parse(localStorage.getItem(cle) ?? 'null')
      } catch { /* rien */ }
      setV(d)
      setFiche(local?.fiche ?? d.fiche ?? {})
      setInfos(local?.infos ?? { client_nom: d.client_nom, telephone: d.telephone, email: d.email, adresse: d.adresse, code_postal: d.code_postal, ville: d.ville, type_travaux: d.type_travaux })
      setNbPhotos(p.count ?? 0)
      if (local) planifier(local.fiche, local.infos)
    })
  }, [id])

  function planifier(f: Fiche, i: Infos) {
    setEtat('attente')
    try {
      localStorage.setItem(cle, JSON.stringify({ fiche: f, infos: i }))
    } catch { /* stockage plein */ }
    window.clearTimeout(minuteur.current)
    minuteur.current = window.setTimeout(() => enregistrer(f, i), 900)
  }

  async function enregistrer(f: Fiche, i: Infos, statut?: TVisite['statut']) {
    if (!navigator.onLine) {
      setEtat('hors')
      return false
    }
    const maj: Record<string, unknown> = { ...i, fiche: f, updated_at: new Date().toISOString() }
    maj.statut = statut ?? (v?.statut === 'a_faire' ? 'en_cours' : v?.statut)
    if (statut === 'terminee') maj.terminee_le = new Date().toISOString()
    const { error } = await supabase.from('visites').update(maj).eq('id', id)
    if (error) {
      setEtat('hors')
      setErreur(erreurLisible(error))
      return false
    }
    localStorage.removeItem(cle)
    setEtat('ok')
    setV((x) => (x ? { ...x, ...(maj as Partial<TVisite>) } : x))
    return true
  }

  useEffect(() => {
    const on = () => infos && planifier(fiche, infos)
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  })

  function repondre(q: Question, val: string) {
    let nv: string | string[]
    if (q.type === 'multi') {
      const cur = (fiche[q.id] as string[] | undefined) ?? []
      nv = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]
    } else if (q.type === 'choix') {
      nv = fiche[q.id] === val ? '' : val
    } else nv = val
    const f = { ...fiche, [q.id]: nv }
    setFiche(f)
    planifier(f, infos!)
  }

  function majMesures(m: Mesure[]) {
    const f = { ...fiche, mesures: m }
    setFiche(f)
    planifier(f, infos!)
  }

  function majInfos(k: keyof Infos, val: string) {
    const i = { ...infos!, [k]: val }
    setInfos(i)
    planifier(fiche, i)
  }

  async function photos(fichiers: FileList | null) {
    if (!fichiers?.length || !v) return
    const n = fichiers.length
    for (const f of Array.from(fichiers)) {
      const blob = await compresser(f)
      await ajouterPhotoVisite({ visite_id: v.id, legende: legende.trim() || undefined, blob })
    }
    setNbPhotos((x) => x + n)
    setLegende('')
    setMessage(`${n} photo${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''}. Rangement automatique dans OneDrive.`)
  }

  async function terminer() {
    if (!infos || !v) return
    if (!confirm('Terminer la visite ? La fiche de visite PDF sera préparée et le Pilotage mis à jour.')) return
    window.clearTimeout(minuteur.current)
    const ok = await enregistrer(fiche, { ...infos, telephone: infos.telephone ? normaliserTel(infos.telephone) : null }, 'terminee')
    if (ok) {
      setMessage('Visite terminée. La fiche de visite sera prête dans l\'heure (OneDrive + Pilotage).')
      window.scrollTo({ top: 0 })
    } else setErreur('Pas de réseau : la visite sera terminée dès le retour de la connexion. Réessayez dans un instant.')
  }

  async function rouvrir() {
    if (!infos) return
    await supabase.from('visites').update({ statut: 'en_cours', terminee_le: null, traitee_le: null, traitee_note: null }).eq('id', id)
    setV((x) => (x ? { ...x, statut: 'en_cours', traitee_le: null } : x))
  }

  if (!v || !infos) return <div className="page"><p className="sous">Chargement…</p></div>

  const adresse = [infos.adresse, [infos.code_postal, infos.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const mesures = fiche.mesures ?? []
  const termine = v.statut === 'terminee'
  const suggestions = [...((fiche.travaux as string[] | undefined) ?? []).filter((t) => t !== 'Autre'), 'Couverture', 'Faîtage', 'Gouttière', 'Descente', 'Rive', 'Solin', 'Velux', 'Charpente', 'Isolation']

  return (
    <div className="page fiche visite">
      <button className="retour" onClick={() => nav('/visites')}><IcoRetour /> Visites</button>

      <header className="fiche-tete">
        <div className="fiche-ref">
          {v.date_rdv ? dateLongue(v.date_rdv) : 'Sans date'}{v.heure ? ` · ${v.heure}` : ''}
          <span className={`pastille-rdv ${statutRdv(v).classe}`}>{statutRdv(v).nom}</span>
        </div>
        <h1>{infos.client_nom}</h1>
        <p>{[infos.type_travaux, infos.ville].filter(Boolean).join(' · ') || 'Fiche de visite'}</p>
      </header>

      <div className="etat-saisie">
        {etat === 'attente' && 'Enregistrement…'}
        {etat === 'ok' && `Enregistré · ${nbReponses(fiche)} réponses · ${nbPhotos} photo${nbPhotos > 1 ? 's' : ''}`}
        {etat === 'hors' && 'Hors connexion : saisie gardée sur le téléphone, envoi automatique au retour du réseau.'}
        {etat === '' && `${nbReponses(fiche)} réponses · ${nbPhotos} photo${nbPhotos > 1 ? 's' : ''}`}
      </div>
      {message && <p className="ok">{message}</p>}
      {erreur && <p className="erreur">{erreur}</p>}
      {termine && (
        <section className="carte accent">
          <p><strong>{v.traitee_le ? 'Fiche de visite prête dans OneDrive.' : 'Fiche de visite en préparation (dans l\'heure).'}</strong></p>
          {v.traitee_note && <p className="sous">{v.traitee_note}</p>}
          <button className="lien" onClick={rouvrir}>Rouvrir pour compléter</button>
        </section>
      )}

      <fieldset disabled={termine} className="champs">
        <section className="carte">
          <div className="titre-ligne">
            <h2>Client</h2>
            <button type="button" className="lien" onClick={() => setEditInfos(!editInfos)}>{editInfos ? 'Fermer' : 'Modifier'}</button>
          </div>
          {!editInfos ? (
            <>
              <p className="gros">{adresse || 'Adresse à compléter'}</p>
              <div className="boutons">
                {infos.telephone && <a className="btn" href={`tel:${infos.telephone}`}><IcoTel /> {telAffiche(infos.telephone)}</a>}
                {adresse && <a className="btn" href={`https://waze.com/ul?q=${encodeURIComponent(adresse)}&navigate=yes`} target="_blank" rel="noreferrer"><IcoRoute /> Waze</a>}
              </div>
            </>
          ) : (
            <>
              <label>Client<input value={infos.client_nom} onChange={(e) => majInfos('client_nom', e.target.value)} /></label>
              <div className="deux">
                <label>Téléphone<input type="tel" value={infos.telephone ?? ''} onChange={(e) => majInfos('telephone', e.target.value)} /></label>
                <label>Mail<input type="email" value={infos.email ?? ''} onChange={(e) => majInfos('email', e.target.value)} /></label>
              </div>
              <label>Adresse<input value={infos.adresse ?? ''} onChange={(e) => majInfos('adresse', e.target.value)} /></label>
              <div className="deux">
                <label>Code postal<input inputMode="numeric" value={infos.code_postal ?? ''} onChange={(e) => majInfos('code_postal', e.target.value)} /></label>
                <label>Ville<input value={infos.ville ?? ''} onChange={(e) => majInfos('ville', e.target.value)} /></label>
              </div>
            </>
          )}
          <div className="choix">
            {TYPES_TRAVAUX.map((t) => (
              <button type="button" key={t} aria-pressed={infos.type_travaux === t} onClick={() => majInfos('type_travaux', infos.type_travaux === t ? '' : t)}>{t}</button>
            ))}
          </div>
        </section>

        {!termine && <Meteo ville={infos.ville} cp={infos.code_postal} />}

        {SECTIONS.map((s) => (
          <section className="carte" key={s.titre}>
            <h2>{s.titre}</h2>
            {s.questions.map((q) => (
              <div className="question" key={q.id}>
                <span className="q-label">{q.label}{q.type === 'multi' && <small> · plusieurs choix</small>}</span>
                {q.type === 'texte' ? (
                  <textarea rows={q.lignes ?? 3} placeholder={q.aide} value={(fiche[q.id] as string) ?? ''} onChange={(e) => repondre(q, e.target.value)} />
                ) : (
                  <div className={`choix ${q.type}`}>
                    {q.options.map((o) => {
                      const val = fiche[q.id] as string | string[] | undefined
                      const actif = Array.isArray(val) ? val.includes(o) : val === o
                      return <button type="button" key={o} aria-pressed={actif} onClick={() => repondre(q, o)}>{o}</button>
                    })}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}

        <section className="carte">
          <h2>Mesures et quantités</h2>
          <p className="aide">Ce qu'il faut pour chiffrer. Laissez la quantité vide si c'est à mesurer.</p>
          <datalist id="ouvrages">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
          {mesures.map((m, i) => (
            <div className="mesure" key={i}>
              <input list="ouvrages" placeholder="Ouvrage" value={m.ouvrage} onChange={(e) => majMesures(mesures.map((x, k) => (k === i ? { ...x, ouvrage: e.target.value } : x)))} />
              <div className="mesure-ligne">
                <input inputMode="decimal" placeholder="Qté" value={m.qte} onChange={(e) => majMesures(mesures.map((x, k) => (k === i ? { ...x, qte: e.target.value } : x)))} />
                <select value={m.unite} onChange={(e) => majMesures(mesures.map((x, k) => (k === i ? { ...x, unite: e.target.value } : x)))}>
                  {UNITES.map((u) => <option key={u}>{u}</option>)}
                </select>
                <input placeholder="Remarque" value={m.remarque} onChange={(e) => majMesures(mesures.map((x, k) => (k === i ? { ...x, remarque: e.target.value } : x)))} />
                <button type="button" className="btn ghost" aria-label="Retirer" onClick={() => majMesures(mesures.filter((_, k) => k !== i))}>×</button>
              </div>
            </div>
          ))}
          <div className="choix mesures-rapides">
            {MESURES_RAPIDES.map((r) => (
              <button type="button" key={r.ouvrage} onClick={() => majMesures([...mesures, { ouvrage: r.ouvrage, qte: '', unite: r.unite, remarque: '' }])}>+ {r.ouvrage}</button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => majMesures([...mesures, { ouvrage: '', qte: '', unite: 'm²', remarque: '' }])}>+ Autre mesure</button>
        </section>

        <section className="carte">
          <h2>Photos <span className="sous">{nbPhotos}</span></h2>
          <label>Légende (facultatif, pour les prochaines photos)<input value={legende} onChange={(e) => setLegende(e.target.value)} placeholder="Ex. : versant nord, chéneau" /></label>
          <p className="aide">Rangées dans OneDrive : Visite - AO › {v.date_rdv?.slice(0, 4) ?? 'année'} › dossier du client › Photos visite. Rien dans la galerie du téléphone.</p>
        </section>

        {!termine && <button type="button" className="btn go large" onClick={terminer}>Visite terminée</button>}
      </fieldset>

      {!termine && (
        <div className="barre-actions visite-actions">
          <label className="act-photo">
            <IcoPhoto />
            <span>Photo{nbPhotos ? ` · ${nbPhotos}` : ''}</span>
            <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { photos(e.target.files); e.target.value = '' }} />
          </label>
          <label className="act-photo">
            <IcoPhoto />
            <span>Galerie</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { photos(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      )}
    </div>
  )
}
