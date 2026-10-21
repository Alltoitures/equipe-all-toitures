import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, STATUTS, type Chantier } from '../lib/supabase'
import { ajouterJours, dateCourte, isoJour } from '../lib/format'
import { estStaff, useAuth } from '../lib/auth'
import { RappelNotifications } from '../components/Notifications'

export default function MesChantiers() {
  const { membre } = useAuth()
  const [liste, setListe] = useState<Chantier[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('at-chantiers') ?? '[]')
    } catch {
      return []
    }
  })
  const [voirTermines, setVoirTermines] = useState(false)
  const [charge, setCharge] = useState(false)

  useEffect(() => {
    supabase
      .from('chantiers')
      .select('*')
      .order('date_debut', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        setCharge(true)
        if (data) {
          setListe(data as Chantier[])
          try {
            localStorage.setItem('at-chantiers', JSON.stringify(data))
          } catch { /* stockage plein */ }
        }
      })
  }, [])

  const auj = isoJour()
  const finSemaine = ajouterJours(auj, 7)
  const actifs = liste.filter((c) => c.statut !== 'termine')
  const jour = actifs.filter((c) => c.statut === 'en_cours' || (c.date_debut && c.date_debut <= auj && (c.date_fin ?? c.date_debut) >= auj))
  const semaine = actifs.filter((c) => !jour.includes(c) && c.date_debut && c.date_debut <= finSemaine)
  const plusTard = actifs.filter((c) => !jour.includes(c) && !semaine.includes(c))
  const termines = liste.filter((c) => c.statut === 'termine').reverse()

  return (
    <div className="page">
      <div className="titre-ligne">
        <h1>Mes chantiers</h1>
        {estStaff(membre) && <Link className="btn pri" to="/gestion/chantiers/nouveau">+ Chantier</Link>}
      </div>

      <RappelNotifications />
      {new Date().getDay() === 5 && !estStaff(membre) && (
        <Link to="/vehicules" className="rappel-notif">🚚 C'est vendredi : pensez au contrôle de votre camion avant de rentrer.</Link>
      )}

      {charge && liste.length === 0 && (
        <div className="vide">Aucun chantier ne vous est affecté pour le moment.</div>
      )}

      <Groupe titre="Aujourd'hui" items={jour} accent />
      <Groupe titre="Cette semaine" items={semaine} />
      <Groupe titre="Plus tard" items={plusTard} />

      {termines.length > 0 && (
        <section className="groupe">
          <button className="lien" onClick={() => setVoirTermines(!voirTermines)}>
            {voirTermines ? 'Masquer' : 'Voir'} les chantiers terminés ({termines.length})
          </button>
          {voirTermines && termines.slice(0, 30).map((c) => <Ligne key={c.id} c={c} />)}
        </section>
      )}
    </div>
  )
}

function Groupe({ titre, items, accent }: { titre: string; items: Chantier[]; accent?: boolean }) {
  if (!items.length) return null
  return (
    <section className="groupe">
      <h2>{titre}</h2>
      {items.map((c) => <Ligne key={c.id} c={c} accent={accent} />)}
    </section>
  )
}

function Ligne({ c, accent }: { c: Chantier; accent?: boolean }) {
  return (
    <Link to={`/chantier/${c.id}`} className={accent ? 'ligne-chantier accent' : 'ligne-chantier'}>
      <div>
        <strong>{c.client_nom}</strong>
        <span className="sous">{[c.ville, c.reference].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="droite">
        <span className={`pastille ${c.statut}`}>{STATUTS[c.statut]}</span>
        <span className="sous">
          {dateCourte(c.date_debut)}
          {c.date_fin && c.date_fin !== c.date_debut ? ` → ${dateCourte(c.date_fin)}` : ''}
        </span>
      </div>
    </Link>
  )
}
