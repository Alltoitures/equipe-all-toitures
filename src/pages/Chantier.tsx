import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, erreurLisible, STATUTS, type Chantier as TChantier, type Phase, type Tache } from '../lib/supabase'
import { ajouterPhoto, compresser } from '../lib/photos'
import { dateCourte, telAffiche } from '../lib/format'
import { estStaff, useAuth } from '../lib/auth'
import { IcoAlerte, IcoPhoto, IcoRetour, IcoRoute, IcoTel } from '../components/Icones'

const PHASES: { id: Phase; nom: string }[] = [
  { id: 'avant', nom: 'Avant' },
  { id: 'pendant', nom: 'Pendant' },
  { id: 'apres', nom: 'Après' }
]

export default function Chantier() {
  const { id } = useParams()
  const nav = useNavigate()
  const { membre } = useAuth()
  const [c, setC] = useState<TChantier | null>(null)
  const [taches, setTaches] = useState<Tache[]>([])
  const [contact, setContact] = useState<{ client_telephone: string | null } | null>(null)
  const [compte, setCompte] = useState<Record<string, number>>({})
  const [imprevu, setImprevu] = useState(false)
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  async function charger() {
    const [ch, ta, co, ph] = await Promise.all([
      supabase.from('chantiers').select('*').eq('id', id).maybeSingle(),
      supabase.from('taches').select('*').eq('chantier_id', id).order('ordre'),
      supabase.from('chantier_contacts').select('client_telephone').eq('chantier_id', id).maybeSingle(),
      supabase.from('photos').select('phase').eq('chantier_id', id)
    ])
    if (ch.data) {
      setC(ch.data as TChantier)
      localStorage.setItem(`at-ch-${id}`, JSON.stringify({ c: ch.data, t: ta.data }))
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

  async function cocher(t: Tache) {
    const fait = !t.fait
    setTaches((l) => l.map((x) => (x.id === t.id ? { ...x, fait } : x)))
    const { error } = await supabase.from('taches').update({ fait }).eq('id', t.id)
    if (error) {
      setTaches((l) => l.map((x) => (x.id === t.id ? { ...x, fait: !fait } : x)))
      setErreur(erreurLisible(error))
    }
  }

  async function prendrePhotos(phase: Phase, fichiers: FileList | null) {
    if (!fichiers?.length || !membre || !c) return
    setMessage(`Préparation de ${fichiers.length} photo${fichiers.length > 1 ? 's' : ''}…`)
    for (const f of Array.from(fichiers)) {
      const blob = await compresser(f)
      await ajouterPhoto({ chantier_id: c.id, membre_id: membre.id, phase, blob })
    }
    setCompte((n) => ({ ...n, [phase]: (n[phase] ?? 0) + fichiers.length }))
    setMessage(`${fichiers.length} photo${fichiers.length > 1 ? 's' : ''} « ${phase === 'apres' ? 'après' : phase} » enregistrée${fichiers.length > 1 ? 's' : ''}. Envoi automatique vers OneDrive.`)
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

  const adresse = [c.adresse, c.code_postal, c.ville].filter(Boolean).join(', ')
  const faites = taches.filter((t) => t.fait).length

  return (
    <div className="page">
      <button className="retour" onClick={() => nav(-1)}><IcoRetour /> Retour</button>

      <div className="entete-chantier">
        <div>
          <h1>{c.client_nom}</h1>
          <p className="sous">
            {c.reference ? `${c.reference} · ` : ''}
            {dateCourte(c.date_debut)}
            {c.date_fin && c.date_fin !== c.date_debut ? ` → ${dateCourte(c.date_fin)}` : ''}
            {c.duree_jours ? ` · ${c.duree_jours} j prévus` : ''}
            {c.nb_intervenants ? ` · ${c.nb_intervenants} pers.` : ''}
          </p>
        </div>
        <span className={`pastille ${c.statut}`}>{STATUTS[c.statut]}</span>
      </div>

      {estStaff(membre) && <Link className="btn" to={`/gestion/chantiers/${c.id}`}>Modifier le dossier</Link>}

      {message && <p className="ok">{message}</p>}
      {erreur && <p className="erreur">{erreur}</p>}

      <section className="carte">
        <h2>Adresse</h2>
        <p>{adresse || '—'}</p>
        {adresse && (
          <div className="boutons">
            <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`} target="_blank" rel="noreferrer"><IcoRoute /> Google Maps</a>
            <a className="btn" href={`https://waze.com/ul?q=${encodeURIComponent(adresse)}&navigate=yes`} target="_blank" rel="noreferrer"><IcoRoute /> Waze</a>
          </div>
        )}
        {contact?.client_telephone && (
          <a className="btn" href={`tel:${contact.client_telephone}`}><IcoTel /> Client : {telAffiche(contact.client_telephone)}</a>
        )}
        {c.acces && <><h3>Accès</h3><p className="pre">{c.acces}</p></>}
        {c.consignes && <><h3>Consignes</h3><p className="pre">{c.consignes}</p></>}
      </section>

      {c.vigilance && (
        <section className="carte vigilance">
          <h2><IcoAlerte /> Points de vigilance</h2>
          <p className="pre">{c.vigilance}</p>
        </section>
      )}

      <section className="carte">
        <h2>Photos</h2>
        <div className="grille-photos">
          {PHASES.map((p) => (
            <label key={p.id} className="btn-photo">
              <IcoPhoto />
              <span>{p.nom}</span>
              <small>{compte[p.id] ?? 0}</small>
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
        </div>
        <p className="aide">Les photos partent directement dans le dossier OneDrive du chantier. Elles ne sont pas enregistrées dans votre galerie.</p>
      </section>

      <section className="carte">
        <h2>Travaux à réaliser <span className="sous">{faites}/{taches.length}</span></h2>
        {taches.length === 0 && <p className="sous">Pas encore de liste de travaux.</p>}
        <ul className="taches">
          {taches.map((t) => (
            <li key={t.id}>
              <label className={t.fait ? 'fait' : ''}>
                <input type="checkbox" checked={t.fait} onChange={() => cocher(t)} />
                <span>
                  {t.libelle}
                  {(t.quantite || t.unite) && <small> — {t.quantite ?? ''} {t.unite ?? ''}</small>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {(c.materiaux || c.materiel) && (
        <section className="carte">
          {c.materiaux && <><h2>Matériaux</h2><p className="pre">{c.materiaux}</p></>}
          {c.materiel && (
            <>
              <h2>Matériel à charger</h2>
              <p className="pre">{c.materiel}</p>
              <p className="aide">Liste estimative, à contrôler avant le départ du dépôt.</p>
            </>
          )}
        </section>
      )}

      <div className="actions-bas">
        <button className="btn alerte large" onClick={() => setImprevu(true)}><IcoAlerte /> Signaler un imprévu</button>
        {c.statut !== 'termine' && <button className="btn go large" onClick={terminer}>Chantier terminé</button>}
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
