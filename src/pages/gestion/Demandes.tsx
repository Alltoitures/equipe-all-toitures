import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { dateCourte } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'

interface D { id: string; texte: string; urgent: boolean; statut: string; created_at: string; chantier_id: string; chantiers: { client_nom: string; ville: string | null } | null; membres: { prenom: string } | null }
const SUIVANT: Record<string, [string, string][]> = {
  ouverte: [['commandee', 'Commandé'], ['livree', 'Livré'], ['annulee', 'Annuler']],
  commandee: [['livree', 'Livré'], ['annulee', 'Annuler']]
}

export default function Demandes() {
  const [liste, setListe] = useState<D[]>([])
  const [toutes, setToutes] = useState(false)
  const charger = () => {
    let q = supabase.from('demandes_materiel').select('id, texte, urgent, statut, created_at, chantier_id, chantiers(client_nom, ville), membres(prenom)').order('urgent', { ascending: false }).order('created_at', { ascending: false }).limit(100)
    if (!toutes) q = q.in('statut', ['ouverte', 'commandee'])
    q.then(({ data }) => setListe((data ?? []) as unknown as D[]))
  }
  useEffect(charger, [toutes])

  async function changer(id: string, statut: string) {
    await supabase.from('demandes_materiel').update({ statut, traitee_le: new Date().toISOString() }).eq('id', id)
    charger()
  }

  return (
    <div className="page">
      <Link className="retour" to="/gestion"><IcoRetour /> Gestion</Link>
      <div className="titre-ligne"><h1>Demandes de matériel</h1><button className="lien" onClick={() => setToutes(!toutes)}>{toutes ? 'En cours seulement' : 'Tout voir'}</button></div>
      {liste.length === 0 && <div className="vide">Aucune demande en cours.</div>}
      {liste.map((d) => (
        <section key={d.id} className={`carte ${d.urgent && d.statut === 'ouverte' ? 'carte-urgente' : ''}`}>
          <div className="titre-ligne">
            <Link to={`/chantier/${d.chantier_id}`}><strong>{d.chantiers?.client_nom}</strong></Link>
            <span className={`statut-demande ${d.statut}`}>{d.urgent ? 'URGENT · ' : ''}{({ ouverte: 'Demandée', commandee: 'Commandée', livree: 'Livrée', annulee: 'Annulée' } as Record<string, string>)[d.statut]}</span>
          </div>
          <p className="pre">{d.texte}</p>
          <p className="sous">{d.membres?.prenom} · {dateCourte(d.created_at)}{d.chantiers?.ville ? ` · ${d.chantiers.ville}` : ''}</p>
          {SUIVANT[d.statut] && (
            <div className="boutons">
              {SUIVANT[d.statut].map(([s, l]) => <button key={s} className={s === 'annulee' ? 'btn ghost' : 'btn'} onClick={() => changer(d.id, s)}>{l}</button>)}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
