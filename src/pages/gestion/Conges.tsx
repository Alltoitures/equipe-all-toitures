import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { dateCourte, isoJour } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'

interface C { id: string; du: string; au: string; motif: string; commentaire: string | null; statut: string; membres: { prenom: string; nom: string } | null }

export function joursOuvres(du: string, au: string) {
  let n = 0
  for (let d = new Date(du + 'T12:00'); d <= new Date(au + 'T12:00'); d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) n++
  return n
}

export default function Conges() {
  const [liste, setListe] = useState<C[]>([])
  const charger = () => supabase.from('conges').select('id, du, au, motif, commentaire, statut, membres(prenom, nom)').gte('au', isoJour(new Date(Date.now() - 60 * 864e5))).order('du')
    .then(({ data }) => setListe((data ?? []) as unknown as C[]))
  useEffect(() => { charger() }, [])
  async function decider(id: string, statut: string) {
    await supabase.from('conges').update({ statut, decide_le: new Date().toISOString() }).eq('id', id)
    charger()
  }
  const demandes = liste.filter((c) => c.statut === 'demande')
  const acceptes = liste.filter((c) => c.statut === 'accepte' && c.au >= isoJour())
  const ligne = (c: C, actions: boolean) => (
    <section key={c.id} className="carte">
      <div className="titre-ligne"><strong>{c.membres?.prenom} {c.membres?.nom}</strong><span className="sous">{joursOuvres(c.du, c.au)} j ouvré{joursOuvres(c.du, c.au) > 1 ? 's' : ''}</span></div>
      <p>{c.motif} · du {dateCourte(c.du)} au {dateCourte(c.au)}</p>
      {c.commentaire && <p className="sous">{c.commentaire}</p>}
      {actions && (
        <div className="boutons">
          <button className="btn go" onClick={() => decider(c.id, 'accepte')}>Accepter</button>
          <button className="btn danger" onClick={() => decider(c.id, 'refuse')}>Refuser</button>
        </div>
      )}
    </section>
  )
  return (
    <div className="page">
      <Link className="retour" to="/gestion"><IcoRetour /> Gestion</Link>
      <h1>Congés et absences</h1>
      <h3>À valider ({demandes.length})</h3>
      {demandes.length === 0 && <p className="sous">Aucune demande en attente.</p>}
      {demandes.map((c) => ligne(c, true))}
      <h3>Prévus</h3>
      {acceptes.length === 0 && <p className="sous">Aucun congé à venir.</p>}
      {acceptes.map((c) => ligne(c, false))}
      <p className="aide">La personne est prévenue par notification. Les jours acceptés n'ont pas de rappel d'heures et apparaissent dans le planning.</p>
    </div>
  )
}
