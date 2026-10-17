import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, erreurLisible, ROLES, STATUTS, type Chantier, type Membre, type Statut, type Tache } from '../../lib/supabase'
import { normaliserTel } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'

type Form = Omit<Chantier, 'id' | 'termine_le'>
type LigneTache = { id?: string; libelle: string; quantite: string; unite: string }

const VIDE: Form = {
  reference: '', client_nom: '', adresse: '', code_postal: '', ville: '',
  date_debut: '', date_fin: '', duree_jours: null, nb_intervenants: null, statut: 'a_venir',
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
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)

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
        setF({ ...VIDE, ...Object.fromEntries(Object.entries(reste).filter(([k]) => k in VIDE).map(([k, v]) => [k, v ?? ''])) } as Form)
      }
      setTel(co.data?.client_telephone ?? '')
      setAffectes(new Set((af.data ?? []).map((a) => a.membre_id)))
      setTachesInit((ta.data ?? []) as Tache[])
      setTaches(((ta.data ?? []) as Tache[]).map((t) => ({ id: t.id, libelle: t.libelle, quantite: t.quantite?.toString() ?? '', unite: t.unite ?? '' })))
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
      donnees.duree_jours = f.duree_jours ? Number(String(f.duree_jours).replace(',', '.')) : null
      donnees.nb_intervenants = f.nb_intervenants ? Number(f.nb_intervenants) : null
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
      for (const [i, t] of taches.entries()) {
        if (!t.libelle.trim()) continue
        const ligne = { chantier_id: cid, ordre: i, libelle: t.libelle.trim(), quantite: t.quantite ? Number(t.quantite.replace(',', '.')) : null, unite: t.unite || null }
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

  function collerTaches() {
    const t = prompt('Collez la liste des travaux (une ligne par poste) :')
    if (!t) return
    const lignes = t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ libelle: l, quantite: '', unite: '' }))
    setTaches([...taches, ...lignes])
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
          <h2>Dossier d'intervention</h2>
          <label>Accès<textarea rows={2} {...champ('acces')} placeholder="Portail, stationnement, clés…" /></label>
          <label>Consignes<textarea rows={3} {...champ('consignes')} /></label>
          <label>Points de vigilance<textarea rows={3} {...champ('vigilance')} /></label>
          <label>Matériaux<textarea rows={3} {...champ('materiaux')} placeholder="Livrés sur chantier le… / à prendre au dépôt" /></label>
          <label>Matériel à charger<textarea rows={3} {...champ('materiel')} /></label>
          <label>Dossier OneDrive des photos<input {...champ('onedrive_dossier')} placeholder="ALL TOITURES - 04 - CHANTIERS/2026/…" /></label>
          <p className="aide">Chemin du dossier du chantier. Les photos iront dans son sous-dossier « C - Photos (avant pendant après) ».</p>
        </section>

        <section className="carte">
          <h2>Travaux à réaliser (sans prix)</h2>
          {taches.map((t, i) => (
            <div key={i} className="ligne-tache">
              <input placeholder="Désignation" value={t.libelle} onChange={(e) => setTaches(taches.map((x, k) => (k === i ? { ...x, libelle: e.target.value } : x)))} />
              <input className="court" placeholder="Qté" inputMode="decimal" value={t.quantite} onChange={(e) => setTaches(taches.map((x, k) => (k === i ? { ...x, quantite: e.target.value } : x)))} />
              <input className="court" placeholder="Unité" value={t.unite} onChange={(e) => setTaches(taches.map((x, k) => (k === i ? { ...x, unite: e.target.value } : x)))} />
              <button type="button" className="btn ghost" onClick={() => setTaches(taches.filter((_, k) => k !== i))} aria-label="Retirer">×</button>
            </div>
          ))}
          <div className="boutons">
            <button type="button" className="btn" onClick={() => setTaches([...taches, { libelle: '', quantite: '', unite: '' }])}>+ Ligne</button>
            <button type="button" className="btn" onClick={collerTaches}>Coller une liste</button>
          </div>
        </section>

        {erreur && <p className="erreur">{erreur}</p>}
        <button className="btn pri large" disabled={occupe}>{occupe ? 'Enregistrement…' : 'Enregistrer'}</button>
        {!nouveau && <button type="button" className="btn danger large" onClick={supprimer}>Supprimer le chantier</button>}
      </form>
    </div>
  )
}
