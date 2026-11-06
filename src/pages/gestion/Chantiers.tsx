import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, STATUTS, type Chantier, type Statut } from '../../lib/supabase'
import { dateCourte } from '../../lib/format'

export default function ChantiersGestion() {
  const [liste, setListe] = useState<(Chantier & { affectations: { membre_id: string; membres: { prenom: string } | null }[]; taches: { fait: boolean; est_groupe: boolean }[] })[]>([])
  const [filtre, setFiltre] = useState<Statut | 'tous'>('en_cours')
  const [cherche, setCherche] = useState('')

  useEffect(() => {
    supabase
      .from('chantiers')
      .select('*, affectations(membre_id, membres(prenom)), taches(fait, est_groupe)')
      .order('date_debut', { ascending: false, nullsFirst: true })
      .then(({ data }) => setListe((data ?? []) as never))
  }, [])

  const visibles = liste.filter(
    (c) => (filtre === 'tous' || c.statut === filtre) && (!cherche || `${c.client_nom} ${c.ville ?? ''} ${c.reference ?? ''}`.toLowerCase().includes(cherche.toLowerCase()))
  )
  const nb = (s: Statut) => liste.filter((c) => c.statut === s).length

  return (
    <div className="page">
      <div className="titre-ligne">
        <h1>Chantiers</h1>
        <Link className="btn pri" to="/gestion/chantiers/nouveau">+ Nouveau</Link>
      </div>
      <div className="filtres">
        {(['a_venir', 'en_cours', 'termine'] as Statut[]).map((s) => (
          <button key={s} className="puce" aria-pressed={filtre === s} onClick={() => setFiltre(s)}>{STATUTS[s]} <span>{nb(s)}</span></button>
        ))}
        <button className="puce" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>Tous</button>
      </div>
      <input className="recherche" placeholder="Rechercher un client, une ville…" value={cherche} onChange={(e) => setCherche(e.target.value)} />
      {visibles.length === 0 && <div className="vide">Aucun chantier.</div>}
      {visibles.map((c) => {
        const t = c.taches.filter((x) => !x.est_groupe)
        const p = t.length ? Math.round((t.filter((x) => x.fait).length / t.length) * 100) : null
        return (
          <Link key={c.id} to={`/gestion/chantiers/${c.id}`} className="carte-ch">
            <div className="titre-ligne">
              <strong>{c.client_nom}</strong>
              <span className={`pastille ${c.statut}`}>{STATUTS[c.statut]}</span>
            </div>
            <span className="sous">{[c.ville, c.reference, c.date_debut ? `${dateCourte(c.date_debut)}${c.date_fin && c.date_fin !== c.date_debut ? ` → ${dateCourte(c.date_fin)}` : ''}` : 'dates à fixer'].filter(Boolean).join(' · ')}</span>
            <div className="ch-bas">
              <div className="equipe-ch">
                {c.affectations.length ? c.affectations.map((a) => <span key={a.membre_id} className="membre-ch petit"><b>{a.membres?.prenom?.[0] ?? '?'}</b>{a.membres?.prenom}</span>) : <span className="alerte-txt">Aucune équipe affectée</span>}
              </div>
              {p != null && <span className="ch-pct"><i style={{ width: `${p}%` }} /><em>{p} %</em></span>}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
