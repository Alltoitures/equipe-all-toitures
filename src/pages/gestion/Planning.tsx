import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, erreurLisible, STATUTS, type Chantier, type Membre } from '../../lib/supabase'
import { ajouterJours, dateCourte, isoJour, jourCourt, lundi } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'

interface Conge { membre_id: string; du: string; au: string }

export default function Planning() {
  const [debut, setDebut] = useState(lundi())
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [membres, setMembres] = useState<Membre[]>([])
  const [aff, setAff] = useState<{ chantier_id: string; membre_id: string }[]>([])
  const [conges, setConges] = useState<Conge[]>([])
  const [erreur, setErreur] = useState('')
  const fin = ajouterJours(debut, 5)
  const jours = Array.from({ length: 6 }, (_, i) => ajouterJours(debut, i))

  useEffect(() => {
    Promise.all([
      supabase.from('chantiers').select('*').neq('statut', 'termine').not('client_nom', 'like', '[TEST]%').order('date_debut', { nullsFirst: false }),
      supabase.from('membres').select('*').eq('actif', true).in('role', ['chef', 'ouvrier', 'apprenti']).order('prenom'),
      supabase.from('affectations').select('chantier_id, membre_id'),
      supabase.from('conges').select('membre_id, du, au').eq('statut', 'accepte').lte('du', fin).gte('au', debut)
    ]).then(([c, m, a, g]) => {
      setChantiers((c.data ?? []) as Chantier[])
      setMembres((m.data ?? []) as Membre[])
      setAff(a.data ?? [])
      setConges((g.data ?? []) as Conge[])
    })
  }, [debut])

  const actif = (c: Chantier, j: string) => {
    if (!c.date_debut) return c.statut === 'en_cours'
    return c.date_debut <= j && (c.date_fin ?? c.date_debut) >= j
  }
  const semaine = chantiers.filter((c) => c.statut === 'en_cours' || jours.some((j) => actif(c, j)))
  const sansDate = chantiers.filter((c) => !semaine.includes(c) && !c.date_debut)
  const plusTard = chantiers.filter((c) => !semaine.includes(c) && c.date_debut && c.date_debut > fin)
  const absent = (m: string) => conges.find((g) => g.membre_id === m)

  async function basculer(c: string, m: string) {
    setErreur('')
    const a = aff.some((x) => x.chantier_id === c && x.membre_id === m)
    if (a) {
      setAff(aff.filter((x) => !(x.chantier_id === c && x.membre_id === m)))
      const { error } = await supabase.from('affectations').delete().eq('chantier_id', c).eq('membre_id', m)
      if (error) setErreur(erreurLisible(error))
    } else {
      setAff([...aff, { chantier_id: c, membre_id: m }])
      const { error } = await supabase.from('affectations').insert({ chantier_id: c, membre_id: m })
      if (error) setErreur(erreurLisible(error))
    }
  }

  const carte = (c: Chantier) => (
    <section className="carte planning" key={c.id}>
      <div className="titre-ligne">
        <Link to={`/chantier/${c.id}`}><strong>{c.client_nom}</strong></Link>
        <span className={`pastille ${c.statut}`}>{STATUTS[c.statut]}</span>
      </div>
      <p className="sous">{[c.ville, c.date_debut ? `${dateCourte(c.date_debut)} → ${dateCourte(c.date_fin ?? c.date_debut)}` : 'dates à fixer', c.nb_intervenants ? `${c.nb_intervenants} pers.` : null].filter(Boolean).join(' · ')}</p>
      <div className="bande-jours">
        {jours.map((j) => <span key={j} className={actif(c, j) ? 'on' : ''} title={j}>{jourCourt(j).slice(0, 3)}</span>)}
      </div>
      <div className="choix">
        {membres.map((m) => {
          const g = absent(m.id)
          return (
            <button key={m.id} type="button" aria-pressed={aff.some((x) => x.chantier_id === c.id && x.membre_id === m.id)} onClick={() => basculer(c.id, m.id)} className={g ? 'absent' : ''}>
              {m.prenom}{g ? ' (absent)' : ''}
            </button>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="page">
      <Link className="retour" to="/gestion"><IcoRetour /> Gestion</Link>
      <h1>Planning</h1>
      <div className="nav-jour">
        <button className="btn" onClick={() => setDebut(ajouterJours(debut, -7))}>‹</button>
        <h2>Semaine du {jourCourt(debut)}{debut === lundi(isoJour()) ? ' (cette semaine)' : ''}</h2>
        <button className="btn" onClick={() => setDebut(ajouterJours(debut, 7))}>›</button>
      </div>
      <p className="aide">Touchez un prénom pour l'affecter ou le retirer d'un chantier. La personne reçoit une notification.</p>
      {erreur && <p className="erreur">{erreur}</p>}

      <section className="carte">
        <h2>Équipe</h2>
        <ul className="liste-simple">
          {membres.map((m) => {
            const ch = semaine.filter((c) => aff.some((x) => x.chantier_id === c.id && x.membre_id === m.id))
            const g = absent(m.id)
            return (
              <li key={m.id}>
                <span>{m.prenom} {m.nom}</span>
                <span className="sous">{g ? `Absent ${dateCourte(g.du)} → ${dateCourte(g.au)}` : ch.length ? ch.map((c) => c.client_nom).join(', ') : 'Non affecté'}</span>
              </li>
            )
          })}
          {membres.length === 0 && <li className="sous">Aucun compte d'équipe pour l'instant (Gestion › Équipe).</li>}
        </ul>
      </section>

      {semaine.length > 0 && <h3>Cette semaine</h3>}
      {semaine.map(carte)}
      {plusTard.length > 0 && <h3>Plus tard</h3>}
      {plusTard.map(carte)}
      {sansDate.length > 0 && <h3>Sans date</h3>}
      {sansDate.map(carte)}
    </div>
  )
}
