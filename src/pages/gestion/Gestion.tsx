import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { estGerant, useAuth } from '../../lib/auth'
import { dateCourte, lundi } from '../../lib/format'
import { alertesOutil, type Outil } from '../Outillage'

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
  const [nb, setNb] = useState({ demandes: 0, urgentes: 0, conges: 0, chantiersSansEquipe: 0, outils: 0 })

  async function charger() {
    const [imp, jr, ph] = await Promise.all([
      supabase.from('imprevus').select('id, texte, created_at, statut, chantiers(id, client_nom), membres(prenom)').eq('statut', 'ouvert').order('created_at', { ascending: false }),
      supabase.from('journees').select('id', { count: 'exact', head: true }).eq('valide', false).lt('jour', lundi()),
      supabase.from('photos').select('id', { count: 'exact', head: true }).neq('onedrive_statut', 'envoye')
    ])
    const [dm, dmu, cg, ch, ou] = await Promise.all([
      supabase.from('demandes_materiel').select('id', { count: 'exact', head: true }).eq('statut', 'ouverte'),
      supabase.from('demandes_materiel').select('id', { count: 'exact', head: true }).eq('statut', 'ouverte').eq('urgent', true),
      supabase.from('conges').select('id', { count: 'exact', head: true }).eq('statut', 'demande'),
      supabase.from('chantiers').select('id, affectations(membre_id)').neq('statut', 'termine'),
      supabase.from('outils').select('*').eq('actif', true)
    ])
    setNb({ demandes: dm.count ?? 0, urgentes: dmu.count ?? 0, conges: cg.count ?? 0, chantiersSansEquipe: ((ch.data ?? []) as { affectations: unknown[] }[]).filter((c) => !c.affectations.length).length, outils: ((ou.data ?? []) as Outil[]).filter((o) => alertesOutil(o).length > 0).length })
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

      {/* À traiter : seulement ce qui attend une décision, avec le nombre. */}
      <section className="carte">
        <h2>À traiter</h2>
        <div className="a-traiter">
          {([
            ['/gestion/heures', '⏱', 'Heures à valider', aValider, aValider ? `${aValider} journée${aValider > 1 ? 's' : ''} des semaines passées` : 'Tout est validé'],
            ['/gestion/demandes', '📦', 'Demandes de matériel', nb.demandes, nb.urgentes ? `dont ${nb.urgentes} urgente${nb.urgentes > 1 ? 's' : ''}` : nb.demandes ? 'à commander' : 'Aucune en attente'],
            ['/gestion/conges', '🌴', 'Congés à répondre', nb.conges, nb.conges ? 'la personne attend ta réponse' : 'Aucune demande'],
            ['/gestion/chantiers', '👷', 'Chantiers sans équipe', nb.chantiersSansEquipe, nb.chantiersSansEquipe ? 'personne n\'est affecté' : 'Tous ont une équipe'],
            ['/outils', '🛠', 'Outils à surveiller', nb.outils, nb.outils ? 'abîmé, sorti longtemps ou vérification' : 'Rien à signaler']
          ] as [string, string, string, number, string][]).map(([to, ico, titre, n, sous]) => (
            <Link key={to} to={to} className={`at-ligne${n ? ' actif' : ''}${to === '/gestion/demandes' && nb.urgentes ? ' urgent' : ''}`}>
              <span className="at-ico">{ico}</span>
              <span className="at-txt"><strong>{titre}</strong><small>{sous}</small></span>
              <b className="at-nb">{n || '✓'}</b>
            </Link>
          ))}
        </div>
        {photosAttente > 0 && <p className="aide">{photosAttente} photo{photosAttente > 1 ? 's' : ''} en cours d'envoi vers OneDrive.</p>}
      </section>

      <h3>Équipe et chantiers</h3>
      <div className="tuiles">
        <Link to="/gestion/planning" className="tuile"><span className="t-ico">📅</span><strong>Planning</strong><span className="sous">Qui est où cette semaine</span></Link>
        <Link to="/gestion/chantiers" className="tuile"><span className="t-ico">🏠</span><strong>Chantiers</strong><span className="sous">Dossiers et affectations</span></Link>
        <Link to="/gestion/vehicules" className="tuile"><span className="t-ico">🚐</span><strong>Camions</strong><span className="sous">Contrôles, échéances, documents</span></Link>
        <Link to="/outils" className="tuile"><span className="t-ico">🛠</span><strong>Outillage</strong><span className="sous">Où sont les outils, QR codes</span></Link>
        {estGerant(membre) && <Link to="/gestion/equipe" className="tuile"><span className="t-ico">👥</span><strong>Équipe</strong><span className="sous">Comptes et accès</span></Link>}
      </div>

      <h3>Chiffres</h3>
      <div className="tuiles">
        {estGerant(membre) && <Link to="/gestion/boite" className="tuile"><span className="t-ico">💶</span><strong>Ma boîte</strong><span className="sous">CA, trésorerie, carnet</span></Link>}
        {estGerant(membre) && <Link to="/gestion/rentabilite" className="tuile"><span className="t-ico">📊</span><strong>Heures par chantier</strong><span className="sous">Prévu / réalisé</span></Link>}
        {estGerant(membre) && <Link to="/gestion/temps" className="tuile"><span className="t-ico">⏱</span><strong>Temps moyens</strong><span className="sous">Par ouvrage, pour chiffrer</span></Link>}
        <Link to="/gestion/export" className="tuile"><span className="t-ico">🧾</span><strong>Export paie</strong><span className="sous">Fichier du mois</span></Link>
      </div>

      <section className="carte">
        <h2>Imprévus ouverts <span className="sous">{imprevus.length}</span></h2>
        {imprevus.length === 0 && <p className="sous">Aucun imprévu en attente. ✓</p>}
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
