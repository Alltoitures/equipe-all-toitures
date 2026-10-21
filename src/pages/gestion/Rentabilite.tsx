import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, STATUTS, type Statut } from '../../lib/supabase'
import { dateCourte, hFormat } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'

interface R { id: string; client: string; ville: string | null; statut: Statut; debut: string | null; fin: string | null; heures_prevues: number | null; heures_reelles: number; jours: number; personnes: number }

export default function Rentabilite() {
  const [liste, setListe] = useState<R[] | null>(null)
  const [erreur, setErreur] = useState('')
  useEffect(() => {
    supabase.rpc('rentabilite').then(({ data, error }) => (error ? setErreur(error.message) : setListe((data ?? []) as R[])))
  }, [])
  const avec = (liste ?? []).filter((r) => r.heures_reelles > 0 || r.statut !== 'termine')
  return (
    <div className="page">
      <Link className="retour" to="/gestion"><IcoRetour /> Gestion</Link>
      <h1>Heures par chantier</h1>
      <p className="aide">Heures saisies par l'équipe comparées aux heures prévues (champ « Heures prévues » du dossier, sinon durée × intervenants × 8 h). Visible par vous seul.</p>
      {erreur && <p className="erreur">{erreur}</p>}
      {!liste && !erreur && <p className="sous">Chargement…</p>}
      {avec.map((r) => {
        const p = r.heures_prevues ? Math.round((r.heures_reelles / r.heures_prevues) * 100) : null
        const niveau = p == null ? '' : p > 110 ? 'rouge' : p > 90 ? 'orange' : 'vert'
        return (
          <Link key={r.id} to={`/gestion/chantiers/${r.id}`} className="carte rentab">
            <div className="titre-ligne"><strong>{r.client}</strong><span className={`pastille ${r.statut}`}>{STATUTS[r.statut]}</span></div>
            <p className="sous">{[r.ville, r.debut ? `${dateCourte(r.debut)} → ${dateCourte(r.fin)}` : null, r.jours ? `${r.jours} j · ${r.personnes} pers.` : null].filter(Boolean).join(' · ')}</p>
            <div className="jauge"><i className={niveau} style={{ width: `${Math.min(p ?? 0, 100)}%` }} /></div>
            <p><strong>{hFormat(r.heures_reelles)}</strong> réalisées sur {r.heures_prevues ? hFormat(r.heures_prevues) : '— (à renseigner)'} prévues{p != null ? ` · ${p} %` : ''}{p != null && p > 100 ? ' ⚠️ dépassement' : ''}</p>
          </Link>
        )
      })}
      {liste && avec.length === 0 && <div className="vide">Pas encore d'heures saisies sur les chantiers.</div>}
    </div>
  )
}
