import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { estGerant, useAuth } from '../../lib/auth'
import { dateCourte, lundi } from '../../lib/format'

interface ImprevuLigne {
  id: string
  texte: string
  created_at: string
  statut: string
  chantiers: { id: string; client_nom: string } | null
  membres: { prenom: string } | null
}

export default function Gestion() {
  const { membre } = useAuth()
  const [imprevus, setImprevus] = useState<ImprevuLigne[]>([])
  const [aValider, setAValider] = useState(0)
  const [photosAttente, setPhotosAttente] = useState(0)

  async function charger() {
    const [imp, jr, ph] = await Promise.all([
      supabase.from('imprevus').select('id, texte, created_at, statut, chantiers(id, client_nom), membres(prenom)').eq('statut', 'ouvert').order('created_at', { ascending: false }),
      supabase.from('journees').select('id', { count: 'exact', head: true }).eq('valide', false).lt('jour', lundi()),
      supabase.from('photos').select('id', { count: 'exact', head: true }).neq('onedrive_statut', 'envoye')
    ])
    setImprevus((imp.data ?? []) as unknown as ImprevuLigne[])
    setAValider(jr.count ?? 0)
    setPhotosAttente(ph.count ?? 0)
  }

  useEffect(() => {
    charger()
  }, [])

  async function traiter(id: string) {
    await supabase.from('imprevus').update({ statut: 'traite' }).eq('id', id)
    charger()
  }

  return (
    <div className="page">
      <h1>Gestion</h1>

      <div className="tuiles">
        <Link to="/gestion/heures" className="tuile">
          <span className="lb">Heures</span>
          <strong>Valider la semaine</strong>
          {aValider > 0 && <span className="badge">{aValider} jour{aValider > 1 ? 's' : ''} en retard</span>}
        </Link>
        <Link to="/gestion/chantiers" className="tuile">
          <span className="lb">Chantiers</span>
          <strong>Dossiers et affectations</strong>
        </Link>
        {estGerant(membre) && (
          <Link to="/gestion/equipe" className="tuile">
            <span className="lb">Équipe</span>
            <strong>Comptes et accès</strong>
          </Link>
        )}
        <Link to="/gestion/export" className="tuile">
          <span className="lb">Paie</span>
          <strong>Export mensuel</strong>
        </Link>
        <Link to="/gestion/planning" className="tuile">
          <span className="lb">Planning</span>
          <strong>Qui est où cette semaine</strong>
        </Link>
        <Link to="/gestion/demandes" className="tuile">
          <span className="lb">Matériel</span>
          <strong>Demandes des équipes</strong>
        </Link>
        <Link to="/gestion/conges" className="tuile">
          <span className="lb">Congés</span>
          <strong>Demandes et absences</strong>
        </Link>
        <Link to="/gestion/vehicules" className="tuile">
          <span className="lb">Véhicules</span>
          <strong>Contrôles et entretiens</strong>
        </Link>
        {estGerant(membre) && (
          <Link to="/gestion/rentabilite" className="tuile">
            <span className="lb">Rentabilité</span>
            <strong>Heures par chantier</strong>
          </Link>
        )}
      </div>

      <section className="carte">
        <h2>Imprévus ouverts ({imprevus.length})</h2>
        {imprevus.length === 0 && <p className="sous">Aucun imprévu en attente.</p>}
        {imprevus.map((i) => (
          <div key={i.id} className="imprevu">
            <div>
              <strong>{i.chantiers?.client_nom}</strong>
              <span className="sous"> · {i.membres?.prenom} · {dateCourte(i.created_at)}</span>
              <p className="pre">{i.texte}</p>
            </div>
            <div className="boutons">
              {i.chantiers && <Link className="btn" to={`/chantier/${i.chantiers.id}`}>Voir</Link>}
              <button className="btn" onClick={() => traiter(i.id)}>Traité</button>
            </div>
          </div>
        ))}
      </section>

      <section className="carte">
        <h2>Photos</h2>
        <p className="sous">{photosAttente === 0 ? 'Toutes les photos sont dans OneDrive.' : `${photosAttente} photo${photosAttente > 1 ? 's' : ''} en attente de transfert vers OneDrive.`}</p>
      </section>
    </div>
  )
}
