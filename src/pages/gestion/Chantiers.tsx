import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, STATUTS, type Chantier, type Statut } from '../../lib/supabase'
import { dateCourte } from '../../lib/format'

export default function ChantiersGestion() {
  const [liste, setListe] = useState<(Chantier & { affectations: { membre_id: string }[] })[]>([])
  const [filtre, setFiltre] = useState<Statut | 'tous'>('a_venir')
  const [cherche, setCherche] = useState('')

  useEffect(() => {
    supabase
      .from('chantiers')
      .select('*, affectations(membre_id)')
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
      {visibles.map((c) => (
        <Link key={c.id} to={`/gestion/chantiers/${c.id}`} className="ligne-chantier">
          <div>
            <strong>{c.client_nom}</strong>
            <span className="sous">{[c.ville, c.reference].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="droite">
            <span className="sous">{dateCourte(c.date_debut)}</span>
            <span className={c.affectations.length ? 'sous' : 'sous alerte-txt'}>
              {c.affectations.length ? `${c.affectations.length} pers.` : 'Aucune affectation'}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
