import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, erreurLisible, ROLES, STATUTS, type Chantier, type Membre, type Statut, type Tache } from '../../lib/supabase'
import { normaliserTel } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'
import { ajouter, changerNiveau, deplacerGroupe, deplacerLigne, ecrireGroupe, lireGroupe, numerotationStandard, peutDescendreNiveau, renumeroter, retirer, type LigneBordereau } from '../../lib/bordereau'

type Form = Omit<Chantier, 'id' | 'termine_le'>
type Cat = 'travaux' | 'bordereau'
type LigneTache = LigneBordereau
type Bon = NonNullable<Chantier['bon']>
const CHAMPS_BON = ['devis', 'objet', 'client_nom', 'sur_place', 'sur_place_note', 'duree', 'duree_note', 'intervenants', 'intervenants_note', 'acces', 'materiaux_note'] as const
type BonTxt = Record<(typeof CHAMPS_BON)[number] | 'materiaux' | 'materiel' | 'vigilance', string>

function bonVersTexte(b: Bon | null | undefined): BonTxt {
  const t = Object.fromEntries(CHAMPS_BON.map((k) => [k, (b?.[k] as string | undefined) ?? ''])) as BonTxt
  t.materiaux = (b?.materiaux ?? []).map((m) => [m.nom, m.qte ?? '', m.source ?? '', m.etat ?? ''].join(' | ')).join('\n')
  t.materiel = (b?.materiel ?? []).join('\n')
  t.vigilance = (b?.vigilance ?? []).join('\n')
  return t
}

function texteVersBon(t: BonTxt, avant: Bon | null | undefined): Bon {
  const l = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
  const b: Record<string, unknown> = { ...(avant ?? {}) }
  for (const k of CHAMPS_BON) {
    if (t[k].trim()) b[k] = t[k].trim()
    else delete b[k]
  }
  b.materiaux = l(t.materiaux).map((x) => {
    const [nom, qte, source, etat] = x.split('|').map((y) => y.trim())
    return { nom, qte: qte || undefined, source: source || undefined, etat: etat || undefined }
  })
  b.materiel = l(t.materiel)
  b.vigilance = l(t.vigilance)
  return b as Bon
}

const VIDE: Form = {
  reference: '', client_nom: '', adresse: '', code_postal: '', ville: '',
  date_debut: '', date_fin: '', duree_jours: null, nb_intervenants: null, heures_prevues: null, statut: 'a_venir',
  acces: '', consignes: '', vigilance: '', materiaux: '', materiel: '', onedrive_dossier: ''
}

export default function ChantierEdition() {
  const { id } = useParams()
  const nouveau = !id || id === 'nouveau'
  const nav = useNavigate()
  const [f, setF] = useState<Form>(VIDE)
  const [tel, setTel] = useState('')
  const [membres, setMembres] = useState<Membre[]>([])
  const [affectes, setAffectes] = useState<Set<string>>(new Set())
  const [taches, setTaches] = useState<LigneTache[]>([])
  const [tachesInit, setTachesInit] = useState<Tache[]>([])
  const [bonInit, setBonInit] = useState<Bon | null>(null)
  const [bon, setBon] = useState<BonTxt>(bonVersTexte(null))
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    supabase.from('membres').select('*').eq('actif', true).in('role', ['chef', 'ouvrier', 'apprenti']).order('prenom')
      .then(({ data }) => setMembres((data ?? []) as Membre[]))
    if (nouveau) return
    Promise.all([
      supabase.from('chantiers').select('*').eq('id', id).single(),
      supabase.from('chantier_contacts').select('*').eq('chantier_id', id).maybeSingle(),
      supabase.from('affectations').select('membre_id').eq('chantier_id', id),
      supabase.from('taches').select('*').eq('chantier_id', id).order('ordre')
    ]).then(([c, co, af, ta]) => {
      if (c.data) {
        const { id: _i, termine_le: _t, ...reste } = c.data as Chantier & Record<string, unknown>
        setBonInit((c.data as Chantier).bon ?? null)
        setBon(bonVersTexte((c.data as Chantier).bon))
        setF({ ...VIDE, ...Object.fromEntries(Object.entries(reste).filter(([k]) => k in VIDE).map(([k, v]) => [k, v ?? ''])) } as Form)
      }
      setTel(co.data?.client_telephone ?? '')
      setAffectes(new Set((af.data ?? []).map((a) => a.membre_id)))
      setTachesInit((ta.data ?? []) as Tache[])
      const lues: LigneTache[] = ((ta.data ?? []) as Tache[]).map((t) => {
        const base = { id: t.id, categorie: (t.categorie ?? 'bordereau') as Cat, numero: t.numero ?? '', est_groupe: !!t.est_groupe, niveau: 1 as const, libelle: t.libelle, quantite: t.quantite?.toString() ?? '', unite: t.unite ?? '' }
        return t.est_groupe ? { ...base, ...lireGroupe(t.libelle) } : base
      })
      setTaches(lues)
      setAuto(numerotationStandard(lues.filter((t) => t.categorie === 'bordereau')))
    })
  }, [id])

  const champ = (k: keyof Form) => ({
    value: (f[k] ?? '') as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  })

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    setErreur('')
    setOccupe(true)
    try {
      const vide = (v: unknown) => (v === '' ? null : v)
      const donnees = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, vide(v)]))
      donnees.heures_prevues = f.heures_prevues ? Number(String(f.heures_prevues).replace(',', '.')) : null
      donnees.duree_jours = f.duree_jours ? Number(String(f.duree_jours).replace(',', '.')) : null
      donnees.nb_intervenants = f.nb_intervenants ? Number(f.nb_intervenants) : null
      donnees.bon = texteVersBon(bon, bonInit)
      let cid = id as string
      if (nouveau) {
        const r = await supabase.from('chantiers').insert(donnees).select('id').single()
        if (r.error) throw r.error
        cid = r.data.id
      } else {
        const r = await supabase.from('chantiers').update(donnees).eq('id', cid)
        if (r.error) throw r.error
      }

      const rc = await supabase.from('chantier_contacts').upsert({ chantier_id: cid, client_telephone: tel ? normaliserTel(tel) : null })
      if (rc.error) throw rc.error

      await supabase.from('affectations').delete().eq('chantier_id', cid)
      if (affectes.size) {
        const ra = await supabase.from('affectations').insert([...affectes].map((m) => ({ chantier_id: cid, membre_id: m })))
        if (ra.error) throw ra.error
      }

      const gardes = new Set(taches.filter((t) => t.id).map((t) => t.id))
      const supprimees = tachesInit.filter((t) => !gardes.has(t.id)).map((t) => t.id)
      if (supprimees.length) await supabase.from('taches').delete().in('id', supprimees)
      const rang: Record<Cat, number> = { travaux: 0, bordereau: 0 }
      for (const t of taches) {
        if (!t.libelle.trim()) continue
        const ligne = {
          chantier_id: cid, categorie: t.categorie, ordre: rang[t.categorie]++, libelle: t.est_groupe ? ecrireGroupe(t) : t.libelle.trim(),
          numero: t.est_groupe ? null : t.numero.trim() || null, est_groupe: t.est_groupe,
          quantite: !t.est_groupe && t.quantite ? Number(t.quantite.replace(',', '.')) : null,
          unite: t.est_groupe ? null : t.unite || null
        }
        const r = t.id ? await supabase.from('taches').update(ligne).eq('id', t.id) : await supabase.from('taches').insert(ligne)
        if (r.error) throw r.error
      }
      nav(`/chantier/${cid}`, { replace: true })
    } catch (e) {
      setErreur(erreurLisible(e))
    } finally {
      setOccupe(false)
    }
  }

  async function supprimer() {
    if (!confirm('Supprimer définitivement ce chantier, ses tâches et ses heures réparties ? Les photos déjà dans OneDrive restent.')) return
    const { error } = await supabase.from('chantiers').delete().eq('id', id)
    if (error) return setErreur(erreurLisible(error))
    nav('/gestion/chantiers', { replace: true })
  }

  const nouvelle = (categorie: Cat, libelle = '', est_groupe = false, niveau: 1 | 2 = 1): LigneTache => ({ categorie, numero: '', est_groupe, niveau, libelle, quantite: '', unite: '' })
  const maj = (i: number, v: Partial<LigneTache>) => setTaches(taches.map((x, k) => (k === i ? { ...x, ...v } : x)))
  // Bordereau : manipulé à part, toujours rangé après les travaux dans la liste.
  const bord = taches.filter((t) => t.categorie === 'bordereau')
  const setBord = (b: LigneTache[]) => setTaches([...taches.filter((t) => t.categorie !== 'bordereau'), ...b])
  const majB = (i: number, v: Partial<LigneTache>) => setBord(bord.map((x, k) => (k === i ? { ...x, ...v } : x)))
  const champBon = (k: keyof BonTxt) => ({ value: bon[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBon({ ...bon, [k]: e.target.value }) })

  function collerTaches(categorie: Cat) {
    const t = prompt(categorie === 'travaux' ? 'Collez les travaux à réaliser (une ligne par étape) :' : 'Collez le bordereau (une ligne par poste) :')
    if (!t) return
    const ajout = t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => nouvelle(categorie, l))
    if (categorie === 'bordereau') setBord(auto ? renumeroter([...bord, ...ajout]) : [...bord, ...ajout])
    else setTaches([...taches, ...ajout])
  }

  return (
    <div className="page">
      <button className="retour" onClick={() => nav(-1)}><IcoRetour /> Retour</button>
      <h1>{nouveau ? 'Nouveau chantier' : 'Modifier le dossier'}</h1>

      <form onSubmit={enregistrer} className="pile">
        <section className="carte">
          <h2>Client et adresse</h2>
          <div className="deux">
            <label>Client (nom)<input {...champ('client_nom')} required /></label>
            <label>Référence<input {...champ('reference')} placeholder="2026_10_004_NOM" /></label>
          </div>
          <label>Adresse<input {...champ('adresse')} /></label>
          <div className="deux">
            <label>Code postal<input {...champ('code_postal')} inputMode="numeric" /></label>
            <label>Ville<input {...champ('ville')} /></label>
          </div>
          <label>Téléphone du client<input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} /></label>
          <p className="aide">Visible des équipes affectées uniquement pendant le chantier.</p>
        </section>

        <section className="carte">
          <h2>Planning</h2>
          <div className="deux">
            <label>Début<input type="date" {...champ('date_debut')} /></label>
            <label>Fin<input type="date" {...champ('date_fin')} /></label>
          </div>
          <div className="deux">
            <label>Durée prévue (jours)<input inputMode="decimal" value={f.duree_jours ?? ''} onChange={(e) => setF({ ...f, duree_jours: e.target.value as never })} /></label>
            <label>Intervenants<input inputMode="numeric" value={f.nb_intervenants ?? ''} onChange={(e) => setF({ ...f, nb_intervenants: e.target.value as never })} /></label>
          </div>
          <label>Heures prévues au devis (main d'œuvre)<input inputMode="decimal" value={f.heures_prevues ?? ''} onChange={(e) => setF({ ...f, heures_prevues: e.target.value as never })} placeholder="Sinon : durée × intervenants × 8 h" /></label>
          <label>
            Statut
            <select {...champ('statut')}>
              {(Object.keys(STATUTS) as Statut[]).map((s) => <option key={s} value={s}>{STATUTS[s]}</option>)}
            </select>
          </label>
        </section>

        <section className="carte">
          <h2>Équipe affectée</h2>
          {membres.length === 0 && <p className="sous">Ajoutez d'abord des personnes dans Gestion › Équipe.</p>}
          <div className="cases">
            {membres.map((m) => (
              <label key={m.id} className="case">
                <input
                  type="checkbox"
                  checked={affectes.has(m.id)}
                  onChange={(e) => {
                    const s = new Set(affectes)
                    if (e.target.checked) s.add(m.id)
                    else s.delete(m.id)
                    setAffectes(s)
                  }}
                />
                {m.prenom} {m.nom} <small>{ROLES[m.role]}</small>
              </label>
            ))}
          </div>
        </section>

        <section className="carte">
          <h2>Bon d'intervention</h2>
          <div className="deux">
            <label>N° de devis<input {...champBon('devis')} /></label>
            <label>Objet<input {...champBon('objet')} placeholder="Remplacement du faîtage" /></label>
          </div>
          <label>Client (tel qu'affiché)<input {...champBon('client_nom')} placeholder="Mr & Mme …" /></label>
          <div className="deux">
            <label>Sur place<input {...champBon('sur_place')} placeholder="Lun. 12/10 · 7h20" /></label>
            <label>Précision<input {...champBon('sur_place_note')} placeholder="PILE, à confirmer…" /></label>
          </div>
          <div className="deux">
            <label>Durée<input {...champBon('duree')} placeholder="2 jours" /></label>
            <label>Précision<input {...champBon('duree_note')} /></label>
          </div>
          <div className="deux">
            <label>Intervenants<input {...champBon('intervenants')} /></label>
            <label>Précision<input {...champBon('intervenants_note')} /></label>
          </div>
          <label>Accès et consignes client<textarea rows={3} {...champBon('acces')} /></label>
          <label>Points de vigilance <small>(une ligne par point, « Titre : texte »)</small><textarea rows={4} {...champBon('vigilance')} /></label>
          <label>Matériaux <small>(une ligne : Nom | qté | provenance | état)</small><textarea rows={4} {...champBon('materiaux')} placeholder="Closoir ventilé rouge | 28 ml | Négoce | À prendre" /></label>
          <p className="aide">États possibles : À prendre, Sur place, Livré, Dépôt.</p>
          <label>Note matériaux<textarea rows={2} {...champBon('materiaux_note')} /></label>
          <label>Matériel à charger <small>(une ligne par élément)</small><textarea rows={5} {...champBon('materiel')} /></label>
          <label>Dossier OneDrive<input {...champ('onedrive_dossier')} placeholder="ALL TOITURES - 04 - CHANTIERS/2026/…" /></label>
        </section>

        <section className="carte">
          <h2>Travaux à réaliser</h2>
          <p className="aide">Les étapes, dans l'ordre, telles qu'expliquées à l'équipe.</p>
          {taches.map((t, i) => t.categorie !== 'travaux' ? null : (
            <div key={i} className="ligne-tache">
              <input placeholder="Étape" value={t.libelle} onChange={(e) => maj(i, { libelle: e.target.value })} />
              <button type="button" className="btn ghost" onClick={() => setTaches(taches.filter((_, k) => k !== i))} aria-label="Retirer">×</button>
            </div>
          ))}
          <div className="boutons">
            <button type="button" className="btn" onClick={() => setTaches([...taches, nouvelle('travaux')])}>+ Étape</button>
            <button type="button" className="btn" onClick={() => collerTaches('travaux')}>Coller une liste</button>
          </div>
        </section>

        <section className="carte">
          <h2>Bordereau (sans prix)</h2>
          <label className="case">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (e.target.checked) setBord(renumeroter(bord)) }} />
            Numérotation automatique <small>(titres 1, sous-titres 1.1, ouvrages 1.1.1)</small>
          </label>
          <p className="aide">Les flèches d'un titre ou d'un sous-titre déplacent tout son contenu. Un ouvrage en haut ou en bas de son groupe passe dans le groupe voisin. ⇥ transforme un titre en sous-titre du titre au-dessus, ⇤ fait l'inverse. Un « — » comme numéro est conservé (hors devis).</p>
          {bord.map((t, i) => t.est_groupe ? (
            <div key={t.id ?? `n${i}`} className={`ligne-tache ${t.niveau === 2 ? 'niv2' : 'niv1'}`}>
              <input className="court" placeholder="N°" value={t.numero} readOnly={auto} onChange={(e) => majB(i, { numero: e.target.value })} />
              <input className="groupe" placeholder={t.niveau === 2 ? 'Sous-titre' : 'Titre'} value={t.libelle} onChange={(e) => majB(i, { libelle: e.target.value })} />
              <span className="fleches">
                <button type="button" onClick={() => setBord(deplacerGroupe(bord, i, -1, auto))} aria-label="Monter le groupe">▲</button>
                <button type="button" onClick={() => setBord(deplacerGroupe(bord, i, 1, auto))} aria-label="Descendre le groupe">▼</button>
              </span>
              <button type="button" className="btn ghost" disabled={t.niveau === 1 && !peutDescendreNiveau(bord, i)} onClick={() => setBord(changerNiveau(bord, i, auto))} aria-label={t.niveau === 1 ? 'En faire un sous-titre' : 'En faire un titre'}>{t.niveau === 1 ? '⇥' : '⇤'}</button>
              <button type="button" className="btn ghost" onClick={() => setBord(retirer(bord, i, auto))} aria-label="Retirer">×</button>
            </div>
          ) : (
            <div key={t.id ?? `n${i}`} className="ligne-tache">
              <input className="court" placeholder="N°" value={t.numero} onChange={(e) => majB(i, { numero: e.target.value })} />
              <input placeholder="Désignation" value={t.libelle} onChange={(e) => majB(i, { libelle: e.target.value })} />
              <input className="court" placeholder="Qté" inputMode="decimal" value={t.quantite} onChange={(e) => majB(i, { quantite: e.target.value })} />
              <input className="court" placeholder="Unité" value={t.unite} onChange={(e) => majB(i, { unite: e.target.value })} />
              <span className="fleches">
                <button type="button" onClick={() => setBord(deplacerLigne(bord, i, -1, auto))} aria-label="Monter l'ouvrage">▲</button>
                <button type="button" onClick={() => setBord(deplacerLigne(bord, i, 1, auto))} aria-label="Descendre l'ouvrage">▼</button>
              </span>
              <button type="button" className="btn ghost" onClick={() => setBord(retirer(bord, i, auto))} aria-label="Retirer">×</button>
            </div>
          ))}
          <div className="boutons">
            <button type="button" className="btn" onClick={() => setBord(ajouter(bord, nouvelle('bordereau'), auto))}>+ Ligne</button>
            <button type="button" className="btn" onClick={() => setBord(ajouter(bord, nouvelle('bordereau', '', true, 1), auto))}>+ Titre</button>
            <button type="button" className="btn" onClick={() => setBord(ajouter(bord, nouvelle('bordereau', '', true, 2), auto))}>+ Sous-titre</button>
            <button type="button" className="btn" onClick={() => collerTaches('bordereau')}>Coller</button>
          </div>
        </section>

        {erreur && <p className="erreur">{erreur}</p>}
        <button className="btn pri large" disabled={occupe}>{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
        {!nouveau && <button type="button" className="btn danger large" onClick={supprimer}>Supprimer le chantier</button>}
      </form>
    </div>
  )
}
