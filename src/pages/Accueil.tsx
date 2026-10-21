import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ROLES, STATUTS, type Role, type Statut } from '../lib/supabase'
import { dateCourte, hFormat, isoJour, moisAnnee } from '../lib/format'
import { estGerant, useAuth } from '../lib/auth'
import { RappelNotifications } from '../components/Notifications'
import { Barres, Classement, Repartition } from '../components/Graphiques'
import { STATUTS_RDV } from '../lib/visite'
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

interface Stats {
  visites_par_mois: { mois: string; visites: number; acceptes: number }[]
  chantiers_par_mois: { mois: string; termines: number }[]
  statuts: Record<string, number>
  provenances: { nom: string; n: number }[]
  types: { nom: string; n: number }[]
  heures_par_semaine: { semaine: string; heures: number }[]
}
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const moisCourt = (m: string) => MOIS_COURTS[Number(m.slice(5, 7)) - 1]
/** Retire les mois vides du début (avant l'historique disponible). */
function depuisPremier<T>(l: T[], v: (x: T) => number): T[] {
  const i = l.findIndex((x) => v(x) > 0)
  return i < 0 ? l.slice(-3) : l.slice(Math.min(i, Math.max(0, l.length - 3)))
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
  const [st, setSt] = useState<Stats | null>(null)
  const [relances, setRelances] = useState<{ chantier_id: string; chantiers: { client_nom: string } | null }[]>([])
  const [reals, setReals] = useState<{ id: string; statut: string; chantiers: { client_nom: string } | null }[]>([])
  useEffect(() => {
    if (!estGerant(membre)) return
    supabase.from('realisations').select('id, statut, chantiers(client_nom)').in('statut', ['brouillon', 'erreur']).then(({ data }) => setReals((data ?? []) as any))
    supabase.from('avis_demandes').select('chantier_id, chantiers(client_nom)').eq('recu', false).is('relance_le', null).lt('demande_le', new Date(Date.now() - 7 * 864e5).toISOString()).then(({ data }) => setRelances((data ?? []) as any))
  }, [membre])
  useEffect(() => {
    supabase.rpc('stats_dashboard', { d: isoJour() }).then(({ data }) => setSt(data as Stats))
  }, [])

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
  for (const x of reals) alertes.push({ texte: x.statut === 'erreur' ? `Réalisation site web à republier (${x.chantiers?.client_nom ?? ''})` : `Réalisation site web à valider (${x.chantiers?.client_nom ?? ''})`, lien: `/gestion/realisations/${x.id}`, niveau: x.statut === 'erreur' ? 'rouge' : 'orange' })
  for (const x of relances) alertes.push({ texte: `Avis Google à relancer : ${x.chantiers?.client_nom ?? ''} (demandé il y a plus de 7 jours)`, lien: `/chantier/${x.chantier_id}?onglet=travaux`, niveau: 'bleu' })
  if (tb.visites_fiche_en_cours) alertes.push({ texte: `${tb.visites_fiche_en_cours} fiche${tb.visites_fiche_en_cours > 1 ? 's' : ''} de visite en préparation`, lien: '/visites', niveau: 'bleu' })

  const stat = (n: string) => st?.statuts?.[n] ?? 0
  const signes = stat('Accepté')
  const perdus = stat('Refusé') + stat('Sans suite')
  const enAttente = stat('Devis envoyé')

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
        {gerant && (
          <div className="kpi accent">
            <small>Taux de signature</small>
            <strong>{signes + perdus ? `${Math.round((signes / (signes + perdus)) * 100)} %` : '—'}</strong>
            <span>{signes} signé{signes > 1 ? 's' : ''} · {enAttente} devis en attente</span>
          </div>
        )}
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

      {st && gerant && (
        <>
          <section className="carte">
            <h2>Visites par mois</h2>
            <Barres donnees={depuisPremier(st.visites_par_mois, (x) => x.visites).map((x) => ({ label: moisCourt(x.mois), valeur: x.visites, sous: x.acceptes ? `✓ ${x.acceptes}` : undefined, courant: x.mois === isoJour().slice(0, 7) }))} />
            <p className="aide">✓ = devis signés parmi les visites du mois.</p>
          </section>

          <section className="carte">
            <h2>Devis après visite <span className="sous">6 derniers mois</span></h2>
            <Repartition parts={['Accepté', 'Devis envoyé', 'Devis à faire', 'Refusé', 'Sans suite'].map((n) => ({ nom: n, n: stat(n), classe: STATUTS_RDV.find((x) => x.nom === n)?.classe ?? 'rdv-sanssuite' }))} />
          </section>

          <section className="carte">
            <h2>D'où viennent les clients <span className="sous">12 mois</span></h2>
            <Classement donnees={st.provenances} />
          </section>

          <section className="carte">
            <h2>Types de travaux demandés <span className="sous">12 mois</span></h2>
            <Classement donnees={st.types} />
          </section>
        </>
      )}

      {st && (
        <>
          <section className="carte">
            <h2>Chantiers terminés par mois</h2>
            <Barres donnees={depuisPremier(st.chantiers_par_mois, (x) => x.termines).map((x) => ({ label: moisCourt(x.mois), valeur: x.termines, courant: x.mois === isoJour().slice(0, 7) }))} />
          </section>

          <section className="carte">
            <h2>Heures équipe par semaine</h2>
            <Barres donnees={st.heures_par_semaine.map((x, i) => ({ label: `${Number(x.semaine.slice(8, 10))}/${Number(x.semaine.slice(5, 7))}`, valeur: x.heures, courant: i === st.heures_par_semaine.length - 1 }))} format={(n) => `${Math.round(n)}`} unite=" h" />
            <p className="aide">Semaine commençant le lundi indiqué. Se remplira dès que l'équipe saisit ses heures.</p>
          </section>
        </>
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
