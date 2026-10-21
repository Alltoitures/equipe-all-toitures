import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, erreurLisible, STATUTS, type Chantier as TChantier, type Phase, type Tache } from '../lib/supabase'
import { ajouterPhoto, compresser } from '../lib/photos'
import { dateCourte, isoJour, telAffiche } from '../lib/format'
import { estGerant, estStaff, useAuth } from '../lib/auth'
import { IcoAlerte, IcoPhoto, IcoRetour, IcoRoute, IcoTel } from '../components/Icones'
import Documents from '../components/Documents'
import Meteo from '../components/Meteo'
import { DemandesMateriel, Reception, SecuriteJour } from '../components/ChantierPlus'
import RealisationCarte from '../components/RealisationCarte'

type Onglet = 'fiche' | 'travaux' | 'materiel' | 'documents'

const PHASES: { id: Phase; nom: string }[] = [
  { id: 'avant', nom: 'Avant' },
  { id: 'pendant', nom: 'Pendant' },
  { id: 'apres', nom: 'Après' }
]

const COULEUR_ETAT: Record<string, string> = {
  'À prendre': 'etat-prendre',
  'Sur place': 'etat-place',
  'Livré': 'etat-livre',
  'Dépôt': 'etat-depot'
}

/** « Titre : texte » -> titre en gras. */
function Point({ texte }: { texte: string }) {
  const i = texte.indexOf(' : ')
  if (i > 0 && i < 60) return <><strong>{texte.slice(0, i)} :</strong> {texte.slice(i + 3)}</>
  return <>{texte}</>
}

function lignes(t: string | null | undefined): string[] {
  return (t ?? '').split('\n').map((l) => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
}

export default function Chantier() {
  const { id } = useParams()
  const nav = useNavigate()
  const { membre } = useAuth()
  const [c, setC] = useState<TChantier | null>(null)
  const [taches, setTaches] = useState<Tache[]>([])
  const [contact, setContact] = useState<{ client_telephone: string | null } | null>(null)
  const [compte, setCompte] = useState<Record<string, number>>({})
  const [onglet, setOnglet] = useState<Onglet>(() => (sessionStorage.getItem(`at-onglet-${id}`) as Onglet) || 'fiche')
  const [imprevu, setImprevu] = useState(false)
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  // Matériel coché au chargement du camion (propre au téléphone et au jour).
  const cleCharge = `at-charge-${id}-${isoJour()}`
  const [charge, setCharge] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(cleCharge) ?? '[]'))
    } catch {
      return new Set()
    }
  })

  async function charger() {
    const [ch, ta, co, ph] = await Promise.all([
      supabase.from('chantiers').select('*').eq('id', id).maybeSingle(),
      supabase.from('taches').select('*').eq('chantier_id', id).order('categorie', { ascending: false }).order('ordre'),
      supabase.from('chantier_contacts').select('client_telephone').eq('chantier_id', id).maybeSingle(),
      supabase.from('photos').select('phase').eq('chantier_id', id)
    ])
    if (ch.data) {
      setC(ch.data as TChantier)
      try {
        localStorage.setItem(`at-ch-${id}`, JSON.stringify({ c: ch.data, t: ta.data }))
      } catch { /* stockage plein */ }
    } else {
      const cache = localStorage.getItem(`at-ch-${id}`)
      if (cache) {
        const v = JSON.parse(cache)
        setC(v.c)
        setTaches(v.t ?? [])
      }
    }
    if (ta.data) setTaches(ta.data as Tache[])
    setContact(co.data)
    const n: Record<string, number> = {}
    for (const p of ph.data ?? []) n[p.phase] = (n[p.phase] ?? 0) + 1
    setCompte(n)
  }

  useEffect(() => {
    charger()
  }, [id])

  function changerOnglet(o: Onglet) {
    setOnglet(o)
    sessionStorage.setItem(`at-onglet-${id}`, o)
    window.scrollTo({ top: 0 })
  }

  async function cocher(t: Tache) {
    if (t.est_groupe) return
    const fait = !t.fait
    setTaches((l) => l.map((x) => (x.id === t.id ? { ...x, fait } : x)))
    const { error } = await supabase.from('taches').update({ fait }).eq('id', t.id)
    if (error) {
      setTaches((l) => l.map((x) => (x.id === t.id ? { ...x, fait: !fait } : x)))
      setErreur(erreurLisible(error))
    }
  }

  function basculerCharge(i: number) {
    const s = new Set(charge)
    if (s.has(i)) s.delete(i)
    else s.add(i)
    setCharge(s)
    try {
      localStorage.setItem(cleCharge, JSON.stringify([...s]))
    } catch { /* stockage indisponible */ }
  }

  async function prendrePhotos(phase: Phase, fichiers: FileList | null) {
    if (!fichiers?.length || !membre || !c) return
    const n = fichiers.length
    setMessage(`Préparation de ${n} photo${n > 1 ? 's' : ''}…`)
    for (const f of Array.from(fichiers)) {
      const blob = await compresser(f)
      await ajouterPhoto({ chantier_id: c.id, membre_id: membre.id, phase, blob })
    }
    setCompte((x) => ({ ...x, [phase]: (x[phase] ?? 0) + n }))
    setMessage(`${n} photo${n > 1 ? 's' : ''} « ${phase === 'apres' ? 'après' : phase} » enregistrée${n > 1 ? 's' : ''}. Envoi automatique dans OneDrive.`)
    const input = inputs.current[phase]
    if (input) input.value = ''
  }

  async function terminer() {
    if (!c) return
    if (!confirm('Confirmer que le chantier est terminé ?')) return
    const { error } = await supabase.rpc('terminer_chantier', { c: c.id })
    if (error) return setErreur(erreurLisible(error))
    setC({ ...c, statut: 'termine' })
    setMessage('Chantier marqué terminé. Le gérant est prévenu.')
  }

  if (!c) return <div className="page"><p className="sous">Chargement…</p></div>

  const b = c.bon ?? {}
  const adresse = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const travaux = taches.filter((t) => t.categorie === 'travaux')
  const bordereau = taches.filter((t) => t.categorie !== 'travaux')
  const aCocher = taches.filter((t) => !t.est_groupe)
  const faites = aCocher.filter((t) => t.fait).length
  const vigilance = b.vigilance?.length ? b.vigilance : lignes(c.vigilance)
  const materiel = b.materiel?.length ? b.materiel : lignes(c.materiel)
  const materiaux = b.materiaux ?? []
  const duree = b.duree ?? (c.duree_jours ? `${String(c.duree_jours).replace('.', ',')} jour${Number(c.duree_jours) > 1 ? 's' : ''}` : '—')
  const surPlace = b.sur_place ?? (c.date_debut ? dateCourte(c.date_debut) : '—')
  const intervenants = b.intervenants ?? (c.nb_intervenants ? String(c.nb_intervenants) : '—')

  return (
    <div className="page fiche">
      <button className="retour" onClick={() => nav(-1)}><IcoRetour /> Retour</button>

      <header className="fiche-tete">
        <div className="fiche-ref">
          {[c.reference, b.devis ? `Devis ${b.devis}` : null].filter(Boolean).join(' · ')}
          <span className={`pastille ${c.statut}`}>{STATUTS[c.statut]}</span>
        </div>
        <h1>{c.client_nom}</h1>
        {(b.objet || c.ville) && <p>{[b.objet, c.ville].filter(Boolean).join(' · ')}</p>}
      </header>

      <div className="bandeau-fiche">
        <div className="b-orange"><small>Sur place</small><strong>{surPlace}</strong>{b.sur_place_note && <em>{b.sur_place_note}</em>}</div>
        <div className="b-bleu"><small>Durée</small><strong>{duree}</strong>{b.duree_note && <em>{b.duree_note}</em>}</div>
        <div className="b-bleu"><small>Équipe</small><strong>{intervenants}</strong>{b.intervenants_note && <em>{b.intervenants_note}</em>}</div>
      </div>

      <nav className="onglets-fiche" role="tablist">
        {([
          ['fiche', 'Fiche'],
          ['travaux', `Travaux ${aCocher.length ? `${faites}/${aCocher.length}` : ''}`],
          ['materiel', 'Matériel'],
          ['documents', 'Documents']
        ] as [Onglet, string][]).map(([o, l]) => (
          <button key={o} role="tab" aria-selected={onglet === o} onClick={() => changerOnglet(o)}>{l}</button>
        ))}
      </nav>

      {message && <p className="ok">{message}</p>}
      {erreur && <p className="erreur">{erreur}</p>}
      {estStaff(membre) && <Link className="lien" to={`/gestion/chantiers/${c.id}`}>Modifier le dossier</Link>}

      {onglet === 'fiche' && (
        <>
          {c.statut !== 'termine' && <SecuriteJour chantierId={c.id} />}
          {c.statut !== 'termine' && <Meteo ville={c.ville} cp={c.code_postal} />}
          <section className="carte">
            <h2>Adresse</h2>
            <p className="gros">{adresse || '—'}</p>
            {adresse && (
              <div className="boutons">
                <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`} target="_blank" rel="noreferrer"><IcoRoute /> Maps</a>
                <a className="btn" href={`https://waze.com/ul?q=${encodeURIComponent(adresse)}&navigate=yes`} target="_blank" rel="noreferrer"><IcoRoute /> Waze</a>
              </div>
            )}
          </section>

          <section className="carte">
            <h2>Client et accès</h2>
            <p><strong>{b.client_nom ?? c.client_nom}</strong></p>
            {contact?.client_telephone && (
              <a className="btn" href={`tel:${contact.client_telephone}`}><IcoTel /> {telAffiche(contact.client_telephone)}</a>
            )}
            {(b.acces || c.acces) && <p className="pre">{b.acces ?? c.acces}</p>}
            {c.consignes && <p className="pre sous">{c.consignes}</p>}
          </section>

          {vigilance.length > 0 && (
            <section className="carte vigilance">
              <h2><IcoAlerte /> Points de vigilance</h2>
              <ul className="puces">
                {vigilance.map((v, i) => <li key={i}><Point texte={v} /></li>)}
              </ul>
            </section>
          )}

          {travaux.length > 0 && (
            <section className="carte">
              <h2>En bref</h2>
              <ol className="etapes">
                {travaux.map((t) => <li key={t.id} className={t.fait ? 'fait' : ''}>{t.libelle}</li>)}
              </ol>
              <button className="lien" onClick={() => changerOnglet('travaux')}>Cocher l'avancement ›</button>
            </section>
          )}
        </>
      )}

      {onglet === 'travaux' && (
        <>
          {aCocher.length > 0 && (
            <div className="avancement">
              <div className="barre-av"><i style={{ width: `${Math.round((faites / aCocher.length) * 100)}%` }} /></div>
              <span>{faites} / {aCocher.length} fait{faites > 1 ? 's' : ''}</span>
            </div>
          )}

          {travaux.length > 0 && (
            <section className="carte">
              <h2>Travaux à réaliser</h2>
              <ul className="taches">
                {travaux.map((t) => (
                  <li key={t.id}>
                    <label className={t.fait ? 'fait' : ''}>
                      <input type="checkbox" checked={t.fait} onChange={() => cocher(t)} />
                      <span>{t.libelle}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="carte">
            <h2>Bordereau des travaux <span className="sous">sans prix</span></h2>
            {bordereau.length === 0 && <p className="sous">Pas encore de bordereau pour ce chantier.</p>}
            <ul className="bordereau">
              {bordereau.map((t) =>
                t.est_groupe ? (
                  <li key={t.id} className="groupe-ligne">{t.libelle}</li>
                ) : (
                  <li key={t.id}>
                    <label className={t.fait ? 'fait' : ''}>
                      <input type="checkbox" checked={t.fait} onChange={() => cocher(t)} />
                      <span className="n">{t.numero}</span>
                      <span className="d">{t.libelle}</span>
                      <span className="q">{t.quantite != null ? String(t.quantite).replace('.', ',') : ''} {t.unite ?? ''}</span>
                    </label>
                  </li>
                )
              )}
            </ul>
            {bordereau.length > 0 && (
              <p className="aide">Les quantités sont celles du devis. Tout écart constaté sur place (quantité, état du support, travaux supplémentaires) doit être signalé à Aurélien avant d'être réalisé.</p>
            )}
          </section>

          <Reception chantier={c} />
          {c.statut !== 'termine' && <button className="btn go large" onClick={terminer}>Chantier terminé</button>}
          {c.statut === 'termine' && estGerant(membre) && <RealisationCarte chantierId={c.id} />}
        </>
      )}

      {onglet === 'materiel' && (
        <>
          <section className="carte">
            <h2>Matériaux</h2>
            {materiaux.length === 0 && !c.materiaux && <p className="sous">Pas de matériaux renseignés.</p>}
            {materiaux.map((m, i) => (
              <div key={i} className="materiau">
                <div>
                  <strong>{m.nom}</strong>
                  <small>{[m.qte, m.source && m.source !== '—' ? m.source : null].filter(Boolean).join(' · ')}</small>
                </div>
                {m.etat && <span className={`etat ${COULEUR_ETAT[m.etat] ?? ''}`}>{m.etat}</span>}
              </div>
            ))}
            {materiaux.length === 0 && c.materiaux && <p className="pre">{c.materiaux}</p>}
            {b.materiaux_note && <p className="note">{b.materiaux_note}</p>}
          </section>

          <section className="carte">
            <h2>Matériel à charger <span className="sous">{charge.size}/{materiel.length}</span></h2>
            {materiel.length === 0 && <p className="sous">Pas de liste de matériel.</p>}
            <ul className="taches">
              {materiel.map((m, i) => (
                <li key={i}>
                  <label className={charge.has(i) ? 'fait' : ''}>
                    <input type="checkbox" checked={charge.has(i)} onChange={() => basculerCharge(i)} />
                    <span>{m}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="aide">Liste estimative : il appartient à l'équipe de contrôler ses besoins avant le départ du dépôt. Les cases servent au chargement du jour sur ce téléphone.</p>
          </section>
          <DemandesMateriel chantierId={c.id} />
        </>
      )}

      {onglet === 'documents' && <Documents chantierId={c.id} />}

      <div className="barre-actions">
        {PHASES.map((p) => (
          <label key={p.id} className="act-photo">
            <IcoPhoto />
            <span>{p.nom}{compte[p.id] ? ` · ${compte[p.id]}` : ''}</span>
            <input
              ref={(el) => { inputs.current[p.id] = el }}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={(e) => prendrePhotos(p.id, e.target.files)}
            />
          </label>
        ))}
        <button className="act-imprevu" onClick={() => setImprevu(true)}><IcoAlerte /><span>Imprévu</span></button>
      </div>

      {imprevu && membre && (
        <Imprevu
          chantierId={c.id}
          membreId={membre.id}
          fermer={(ok) => {
            setImprevu(false)
            if (ok) setMessage('Imprévu transmis au gérant. Ne réalisez pas de travaux supplémentaires sans son accord.')
          }}
        />
      )}
    </div>
  )
}

function Imprevu({ chantierId, membreId, fermer }: { chantierId: string; membreId: string; fermer: (ok: boolean) => void }) {
  const [texte, setTexte] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)

  async function envoyer(e: React.FormEvent) {
    e.preventDefault()
    setOccupe(true)
    setErreur('')
    try {
      if (photo) {
        const blob = await compresser(photo)
        await ajouterPhoto({ chantier_id: chantierId, membre_id: membreId, phase: 'imprevu', blob, imprevu_texte: texte })
      } else {
        const { error } = await supabase.from('imprevus').insert({ chantier_id: chantierId, membre_id: membreId, texte })
        if (error) throw error
      }
      fermer(true)
    } catch (e) {
      setErreur(erreurLisible(e))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="fond-modal" onClick={() => fermer(false)}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={envoyer}>
        <h2>Signaler un imprévu</h2>
        <p className="aide">Tout écart doit être validé par Aurélien avant d'être réalisé.</p>
        <label>
          Que se passe-t-il ?
          <textarea rows={4} value={texte} onChange={(e) => setTexte(e.target.value)} required placeholder="Ex. : chevrons pourris côté nord, environ 3 m²" />
        </label>
        <label className="btn">
          <IcoPhoto /> {photo ? 'Photo ajoutée' : 'Ajouter une photo'}
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="boutons">
          <button type="button" className="btn" onClick={() => fermer(false)}>Annuler</button>
          <button className="btn pri" disabled={occupe}>Envoyer</button>
        </div>
      </form>
    </div>
  )
}
