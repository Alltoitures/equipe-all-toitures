import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ROLES, STATUTS, type Role, type Statut } from '../lib/supabase'
import { dateCourte, hFormat, isoJour, moisAnnee } from '../lib/format'
import { estGerant, useAuth } from '../lib/auth'
import { RappelNotifications } from '../components/Notifications'
import { heureAffichee, minutesHeure } from './Visites'

interface TB {
  mois: string
  visites_mois: number
  visites_faites: number
  visites_a_venir: number
  visites_fiche_en_cours: number
  prochaines_visites: { id: string; client: string; ville: string | null; date: string; heure: string | null; type: string | null }[]
  chantiers_en_cours: number
  chantiers_a_venir: number
  chantiers_termines_mois: number
  sans_bon: number
  semaine: { id: string; ref: string | null; client: string; ville: string | null; statut: Statut; debut: string | null; fin: string | null; equipe: string | null; avancement: number | null }[]
  heures_mois: number
  paniers_mois: number
  jours_a_valider: number
  heures_par_personne: { nom: string; role: Role; heures: number; jours: number; paniers: number }[]
  imprevus_ouverts: number
  photos_mois: number
  photos_en_erreur: number
  fins_a_facturer: { client: string; le: string; note: string | null }[]
  demandes_ouvertes: number
  demandes_urgentes: number
  conges_a_valider: number
  absents_aujourdhui: string[]
  anomalies_vehicules: number
  vehicules_alertes: { nom: string; motif: string }[]
  controles_vehicules_semaine: number
  vehicules_actifs: number
  securite_manquante: string[]
}

function moisDecale(iso: string, n: number) {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return isoJour(d)
}

export default function Accueil() {
  const { membre } = useAuth()
  const [jour, setJour] = useState(isoJour())
  const [tb, setTb] = useState<TB | null>(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    supabase.rpc('tableau_bord', { d: jour }).then(({ data, error }) => {
      if (error) setErreur('Tableau de bord indisponible pour le moment.')
      else setTb(data as TB)
    })
  }, [jour])

  const courant = jour.slice(0, 7) === isoJour().slice(0, 7)
  const gerant = estGerant(membre)

  if (!tb) return <div className="page"><h1>Bonjour {membre?.prenom}</h1><p className="sous">{erreur || 'Chargement…'}</p></div>

  const alertes: { texte: string; lien: string; niveau: 'rouge' | 'orange' | 'bleu' }[] = []
  if (tb.demandes_ouvertes) alertes.push({ texte: `${tb.demandes_ouvertes} demande${tb.demandes_ouvertes > 1 ? 's' : ''} de matériel${tb.demandes_urgentes ? ` dont ${tb.demandes_urgentes} urgente${tb.demandes_urgentes > 1 ? 's' : ''}` : ''}`, lien: '/gestion/demandes', niveau: tb.demandes_urgentes ? 'rouge' : 'orange' })
  if (tb.conges_a_valider) alertes.push({ texte: `${tb.conges_a_valider} demande${tb.conges_a_valider > 1 ? 's' : ''} de congé à valider`, lien: '/gestion/conges', niveau: 'orange' })
  if (tb.anomalies_vehicules) alertes.push({ texte: `${tb.anomalies_vehicules} anomalie${tb.anomalies_vehicules > 1 ? 's' : ''} véhicule signalée${tb.anomalies_vehicules > 1 ? 's' : ''}`, lien: '/gestion/vehicules', niveau: 'rouge' })
  for (const v of tb.vehicules_alertes ?? []) alertes.push({ texte: `${v.nom} : ${v.motif}`, lien: '/gestion/vehicules', niveau: 'orange' })
  if (new Date().getDay() === 5 && tb.vehicules_actifs > tb.controles_vehicules_semaine) alertes.push({ texte: `Contrôle du vendredi : ${tb.vehicules_actifs - tb.controles_vehicules_semaine} véhicule${tb.vehicules_actifs - tb.controles_vehicules_semaine > 1 ? 's' : ''} pas encore contrôlé${tb.vehicules_actifs - tb.controles_vehicules_semaine > 1 ? 's' : ''}`, lien: '/gestion/vehicules', niveau: 'bleu' })
  if (new Date().getHours() >= 10 && tb.securite_manquante?.length) alertes.push({ texte: `Point sécurité non fait : ${tb.securite_manquante.join(', ')}`, lien: '/gestion/planning', niveau: 'orange' })
  if (tb.absents_aujourdhui?.length) alertes.push({ texte: `Absent${tb.absents_aujourdhui.length > 1 ? 's' : ''} aujourd'hui : ${tb.absents_aujourdhui.join(', ')}`, lien: '/gestion/conges', niveau: 'bleu' })
  if (tb.imprevus_ouverts) alertes.push({ texte: `${tb.imprevus_ouverts} imprévu${tb.imprevus_ouverts > 1 ? 's' : ''} à traiter`, lien: '/gestion', niveau: 'rouge' })
  if (tb.jours_a_valider) alertes.push({ texte: `${tb.jours_a_valider} journée${tb.jours_a_valider > 1 ? 's' : ''} d'heures à valider`, lien: '/gestion/heures', niveau: 'orange' })
  if (tb.fins_a_facturer.length) alertes.push({ texte: `${tb.fins_a_facturer.length} fin${tb.fins_a_facturer.length > 1 ? 's' : ''} de chantier prête${tb.fins_a_facturer.length > 1 ? 's' : ''} : brouillon de mail + facture à envoyer (${tb.fins_a_facturer.map((f) => f.client).join(', ')})`, lien: '/chantiers', niveau: 'orange' })
  if (tb.sans_bon) alertes.push({ texte: `${tb.sans_bon} chantier${tb.sans_bon > 1 ? 's' : ''} sans bon d'intervention`, lien: '/gestion/chantiers', niveau: 'bleu' })
  if (tb.photos_en_erreur) alertes.push({ texte: `${tb.photos_en_erreur} photo${tb.photos_en_erreur > 1 ? 's' : ''} bloquée${tb.photos_en_erreur > 1 ? 's' : ''} avant OneDrive`, lien: '/gestion', niveau: 'rouge' })
  if (tb.visites_fiche_en_cours) alertes.push({ texte: `${tb.visites_fiche_en_cours} fiche${tb.visites_fiche_en_cours > 1 ? 's' : ''} de visite en préparation`, lien: '/visites', niveau: 'bleu' })

  return (
    <div className="page accueil">
      <div className="titre-ligne">
        <h1>Bonjour {membre?.prenom}</h1>
      </div>

      <RappelNotifications />
      <div className="nav-jour">
        <button className="btn" onClick={() => setJour(moisDecale(jour, -1))} aria-label="Mois précédent">‹</button>
        <h2>{moisAnnee(tb.mois)}</h2>
        <button className="btn" disabled={courant} onClick={() => { const n = moisDecale(jour, 1); setJour(n.slice(0, 7) === isoJour().slice(0, 7) ? isoJour() : n) }} aria-label="Mois suivant">›</button>
      </div>

      <div className="kpis">
        {gerant && (
          <Link to="/visites" className="kpi">
            <small>Visites du mois</small>
            <strong>{tb.visites_mois}</strong>
            <span>{tb.visites_faites} faite{tb.visites_faites > 1 ? 's' : ''}{courant ? ` · ${tb.visites_a_venir} à venir` : ''}</span>
          </Link>
        )}
        <Link to="/chantiers" className="kpi accent">
          <small>Chantiers en cours</small>
          <strong>{tb.chantiers_en_cours}</strong>
          <span>{tb.chantiers_a_venir} à venir</span>
        </Link>
        <Link to="/chantiers" className="kpi">
          <small>Terminés ce mois</small>
          <strong>{tb.chantiers_termines_mois}</strong>
          <span>chantier{tb.chantiers_termines_mois > 1 ? 's' : ''}</span>
        </Link>
        <Link to="/gestion/heures" className="kpi">
          <small>Heures équipe</small>
          <strong>{hFormat(tb.heures_mois)}</strong>
          <span>{tb.paniers_mois} panier{tb.paniers_mois > 1 ? 's' : ''}</span>
        </Link>
        {!gerant && (
          <div className="kpi">
            <small>Photos</small>
            <strong>{tb.photos_mois}</strong>
            <span>ce mois-ci</span>
          </div>
        )}
      </div>

      {courant && (
        <section className="carte">
          <h2>À faire</h2>
          {alertes.length === 0 && <p className="sous">Rien en attente. ✓</p>}
          <ul className="alertes">
            {alertes.map((a, i) => (
              <li key={i}><Link to={a.lien} className={`alerte ${a.niveau}`}>{a.texte}<span>›</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {courant && gerant && (
        <section className="carte">
          <div className="titre-ligne"><h2>Prochaines visites</h2><Link className="lien" to="/visites">Tout voir</Link></div>
          {tb.prochaines_visites.length === 0 && <p className="sous">Aucune visite dans les 7 prochains jours.</p>}
          {[...tb.prochaines_visites].sort((a, b) => a.date.localeCompare(b.date) || (minutesHeure(a.heure) ?? 9999) - (minutesHeure(b.heure) ?? 9999)).map((v) => (
            <Link key={v.id} to={`/visites/${v.id}`} className="ligne-simple">
              <span><strong>{v.client}</strong><small>{[v.ville, v.type].filter(Boolean).join(' · ')}</small></span>
              <span className="d">{v.date === isoJour() ? "Aujourd'hui" : dateCourte(v.date)} · <strong>{heureAffichee(v.heure)}</strong></span>
            </Link>
          ))}
        </section>
      )}

      {courant && (
        <section className="carte">
          <div className="titre-ligne"><h2>Chantiers cette semaine</h2><Link className="lien" to="/chantiers">Tout voir</Link></div>
          {tb.semaine.length === 0 && <p className="sous">Aucun chantier en cours cette semaine.</p>}
          {tb.semaine.map((c) => (
            <Link key={c.id} to={`/chantier/${c.id}`} className="ligne-simple">
              <span>
                <strong>{c.client}</strong>
                <small>{[c.ville, c.equipe ?? 'Équipe non affectée'].filter(Boolean).join(' · ')}</small>
                {c.avancement != null && <span className="barre-av mini"><i style={{ width: `${c.avancement}%` }} /></span>}
              </span>
              <span className="d"><span className={`pastille ${c.statut}`}>{STATUTS[c.statut]}</span>{c.avancement != null && <small>{c.avancement} %</small>}</span>
            </Link>
          ))}
        </section>
      )}

      <section className="carte">
        <h2>Heures du mois par personne</h2>
        {tb.heures_par_personne.length === 0 && <p className="sous">Aucune heure saisie ce mois-ci.</p>}
        {tb.heures_par_personne.length > 0 && (
          <table className="tableau">
            <thead><tr><th>Personne</th><th className="d">Jours</th><th className="d">Heures</th><th className="d">Paniers</th></tr></thead>
            <tbody>
              {tb.heures_par_personne.map((p) => (
                <tr key={p.nom}><td>{p.nom}<br /><small className="sous">{ROLES[p.role]}</small></td><td className="d">{p.jours}</td><td className="d">{hFormat(p.heures)}</td><td className="d">{p.paniers}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
