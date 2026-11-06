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
  fins_a_facturer: { id: string; client: string; le: string; note: string | null }[]
  devis_a_envoyer?: { id: string; client: string; ville: string | null; type: string | null; visite: string | null }[]
  demandes_ouvertes: number
  demandes_urgentes: number
  conges_a_valider: number
  absents_aujourdhui: string[]
  anomalies_vehicules: number
  vehicules_alertes: { nom: string; motif: string }[]
  controles_vehicules_semaine: number
  niveaux_vehicules_mois: number
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

  const [recharge, setRecharge] = useState(0)
  useEffect(() => {
    supabase.rpc('tableau_bord', { d: jour }).then(({ data, error }) => {
      if (error) setErreur('Tableau de bord indisponible pour le moment.')
      else setTb(data as TB)
    })
  }, [jour, recharge])

  async function marquerEnvoye(genre: 'devis' | 'facture', id: string, client: string) {
    const quoi = genre === 'devis' ? 'le devis' : 'la facture et le rapport'
    if (!confirm(`Confirmer : ${quoi} de ${client} ${genre === 'devis' ? 'a été envoyé' : 'ont été envoyés'} par mail ?`)) return
    const maintenant = new Date().toISOString()
    const { error } = genre === 'devis'
      ? await supabase.from('visites').update({ devis_envoye_le: maintenant, rdv_statut: 'Devis envoyé' }).eq('id', id)
      : await supabase.from('chantiers').update({ facture_envoyee_le: maintenant }).eq('id', id)
    if (error) alert("Impossible d'enregistrer pour le moment. Réessayez.")
    else setRecharge((n) => n + 1)
  }

  const courant = jour.slice(0, 7) === isoJour().slice(0, 7)
  const gerant = estGerant(membre)

  if (!tb) return <div className="page"><h1>Bonjour {membre?.prenom}</h1><p className="sous">{erreur || 'Chargement…'}</p></div>

  const alertes: { texte: string; lien: string; niveau: 'rouge' | 'orange' | 'bleu' }[] = []
  if (tb.demandes_ouvertes) alertes.push({ texte: `${tb.demandes_ouvertes} demande${tb.demandes_ouvertes > 1 ? 's' : ''} de matériel${tb.demandes_urgentes ? ` dont ${tb.demandes_urgentes} urgente${tb.demandes_urgentes > 1 ? 's' : ''}` : ''}`, lien: '/gestion/demandes', niveau: tb.demandes_urgentes ? 'rouge' : 'orange' })
  if (tb.conges_a_valider) alertes.push({ texte: `${tb.conges_a_valider} demande${tb.conges_a_valider > 1 ? 's' : ''} de congé à valider`, lien: '/gestion/conges', niveau: 'orange' })
  if (tb.anomalies_vehicules) alertes.push({ texte: `${tb.anomalies_vehicules} anomalie${tb.anomalies_vehicules > 1 ? 's' : ''} véhicule signalée${tb.anomalies_vehicules > 1 ? 's' : ''}`, lien: '/gestion/vehicules', niveau: 'rouge' })
  for (const v of tb.vehicules_alertes ?? []) alertes.push({ texte: `${v.nom} : ${v.motif}`, lien: '/gestion/vehicules', niveau: 'orange' })
  if (new Date().getDay() === 5 && tb.vehicules_actifs > tb.controles_vehicules_semaine) alertes.push({ texte: `Contrôle du vendredi : ${tb.vehicules_actifs - tb.controles_vehicules_semaine} véhicule${tb.vehicules_actifs - tb.controles_vehicules_semaine > 1 ? 's' : ''} pas encore contrôlé${tb.vehicules_actifs - tb.controles_vehicules_semaine > 1 ? 's' : ''}`, lien: '/gestion/vehicules', niveau: 'bleu' })
  if (tb.niveaux_vehicules_mois != null && tb.vehicules_actifs > tb.niveaux_vehicules_mois) { const n = tb.vehicules_actifs - tb.niveaux_vehicules_mois; alertes.push({ texte: `Niveaux et usure : ${n} camion${n > 1 ? 's' : ''} à vérifier (plus de 30 jours)`, lien: '/gestion/vehicules', niveau: 'orange' }) }
  if (new Date().getHours() >= 10 && tb.securite_manquante?.length) alertes.push({ texte: `Point sécurité non fait : ${tb.securite_manquante.join(', ')}`, lien: '/gestion/planning', niveau: 'orange' })
  if (tb.imprevus_ouverts) alertes.push({ texte: `${tb.imprevus_ouverts} imprévu${tb.imprevus_ouverts > 1 ? 's' : ''} à traiter`, lien: '/gestion', niveau: 'rouge' })
  if (tb.jours_a_valider) alertes.push({ texte: `${tb.jours_a_valider} journée${tb.jours_a_valider > 1 ? 's' : ''} d'heures à valider`, lien: '/gestion/heures', niveau: 'orange' })
  if (tb.sans_bon) alertes.push({ texte: `${tb.sans_bon} chantier${tb.sans_bon > 1 ? 's' : ''} sans bon d'intervention`, lien: '/gestion/chantiers', niveau: 'bleu' })
  if (tb.photos_en_erreur) alertes.push({ texte: `${tb.photos_en_erreur} photo${tb.photos_en_erreur > 1 ? 's' : ''} bloquée${tb.photos_en_erreur > 1 ? 's' : ''} avant OneDrive`, lien: '/gestion', niveau: 'rouge' })
  for (const x of reals) alertes.push({ texte: x.statut === 'erreur' ? `Réalisation site web à republier (${x.chantiers?.client_nom ?? ''})` : `Réalisation site web à valider (${x.chantiers?.client_nom ?? ''})`, lien: `/gestion/realisations/${x.id}`, niveau: x.statut === 'erreur' ? 'rouge' : 'orange' })
  for (const x of relances) alertes.push({ texte: `Avis Google à relancer : ${x.chantiers?.client_nom ?? ''} (demandé il y a plus de 7 jours)`, lien: `/chantier/${x.chantier_id}?onglet=travaux`, niveau: 'bleu' })
  if (tb.visites_fiche_en_cours) alertes.push({ texte: `${tb.visites_fiche_en_cours} fiche${tb.visites_fiche_en_cours > 1 ? 's' : ''} de visite en préparation`, lien: '/visites', niveau: 'bleu' })

  const envois: { genre: 'devis' | 'facture'; id: string; client: string; detail: string; lien: string }[] = [
    ...(tb.devis_a_envoyer ?? []).map((v) => ({ genre: 'devis' as const, id: v.id, client: v.client, detail: ['Devis', v.type, v.ville, v.visite ? `visite du ${dateCourte(v.visite)}` : null].filter(Boolean).join(' · '), lien: `/visites/${v.id}` })),
    ...tb.fins_a_facturer.map((f) => ({ genre: 'facture' as const, id: f.id, client: f.client, detail: `Facture + rapport · brouillon du mail prêt dans Outlook${f.le ? ` depuis le ${dateCourte(f.le.slice(0, 10))}` : ''}`, lien: `/chantier/${f.id}` }))
  ]

  const stat = (n: string) => st?.statuts?.[n] ?? 0
  const signes = stat('Accepté')
  const perdus = stat('Refusé') + stat('Sans suite')
  const enAttente = stat('Devis envoyé')

  const urgents = alertes.filter((a) => a.niveau === 'rouge')
  const aPrevoir = alertes.filter((a) => a.niveau === 'orange')
  const pourInfo = alertes.filter((a) => a.niveau === 'bleu')
  const visitesJour = [...tb.prochaines_visites].filter((v) => v.date === isoJour()).sort((a, b) => (minutesHeure(a.heure) ?? 9999) - (minutesHeure(b.heure) ?? 9999))
  const visitesSuite = [...tb.prochaines_visites].filter((v) => v.date > isoJour()).sort((a, b) => a.date.localeCompare(b.date) || (minutesHeure(a.heure) ?? 9999) - (minutesHeure(b.heure) ?? 9999))
  const enCours = tb.semaine.filter((c) => c.statut === 'en_cours' || (c.debut && c.debut <= isoJour() && (!c.fin || c.fin >= isoJour())))
  const dateDuJour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="page accueil">
      <div className="acc-tete">
        <span className="sous">{dateDuJour}</span>
        <h1>Bonjour {membre?.prenom}</h1>
        <p className="acc-resume">
          {urgents.length ? <b className="r">{urgents.length} urgent{urgents.length > 1 ? 's' : ''}</b> : <b className="v">Rien d'urgent</b>}
          {' · '}{visitesJour.length} visite{visitesJour.length > 1 ? 's' : ''} aujourd'hui · {enCours.length} chantier{enCours.length > 1 ? 's' : ''} en cours
        </p>
      </div>

      <RappelNotifications />

      {/* 1. Ce qui ne peut pas attendre */}
      {urgents.length > 0 && (
        <section className="carte acc-urgent">
          <h2>🔴 Urgent</h2>
          <ul className="alertes">
            {urgents.map((a, i) => <li key={i}><Link to={a.lien} className="alerte rouge">{a.texte}<span>›</span></Link></li>)}
          </ul>
        </section>
      )}

      {/* 2. Aujourd'hui : visites et équipes */}
      <section className="carte">
        <div className="titre-ligne"><h2>Aujourd'hui</h2>{gerant && <Link className="lien" to="/visites">Visites</Link>}</div>
        {gerant && visitesJour.map((v) => (
          <Link key={v.id} to={`/visites/${v.id}`} className="acc-ligne">
            <span className="acc-heure">{heureAffichee(v.heure)}</span>
            <span><strong>Visite · {v.client}</strong><small>{[v.ville, v.type].filter(Boolean).join(' · ')}</small></span>
          </Link>
        ))}
        {enCours.map((c) => (
          <Link key={c.id} to={`/chantier/${c.id}`} className="acc-ligne">
            <span className="acc-anneau" style={{ ['--p' as string]: `${c.avancement ?? 0}` }}><b>{c.avancement ?? 0}</b></span>
            <span><strong>{c.client}</strong><small>{[c.equipe || 'équipe à affecter', c.ville].filter(Boolean).join(' · ')}</small></span>
          </Link>
        ))}
        {(!gerant || visitesJour.length === 0) && enCours.length === 0 && <p className="sous">Pas de visite ni de chantier en cours aujourd'hui.</p>}
        {tb.absents_aujourdhui?.length ? <p className="aide">Absent{tb.absents_aujourdhui.length > 1 ? 's' : ''} : {tb.absents_aujourdhui.join(', ')}</p> : null}
      </section>

      {/* 3. À envoyer */}
      {envois.length > 0 && (
        <section className="carte">
          <h2>À envoyer <span className="sous">{envois.length}</span></h2>
          <ul className="envois">
            {envois.map((e) => (
              <li key={e.genre + e.id}>
                <Link to={e.lien}><strong>{e.client}</strong><small>{e.detail}</small></Link>
                <button className="btn" onClick={() => marquerEnvoye(e.genre, e.id, e.client)}>Envoyé ✓</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4. À prévoir, puis pour info (repliable) */}
      {aPrevoir.length > 0 && (
        <section className="carte">
          <h2>🟠 À prévoir <span className="sous">{aPrevoir.length}</span></h2>
          <ul className="alertes">
            {aPrevoir.map((a, i) => <li key={i}><Link to={a.lien} className="alerte orange">{a.texte}<span>›</span></Link></li>)}
          </ul>
        </section>
      )}
      {pourInfo.length > 0 && (
        <details className="carte acc-replie">
          <summary><h2>ℹ️ Pour info <span className="sous">{pourInfo.length}</span></h2></summary>
          <ul className="alertes">
            {pourInfo.map((a, i) => <li key={i}><Link to={a.lien} className="alerte bleu">{a.texte}<span>›</span></Link></li>)}
          </ul>
        </details>
      )}

      {gerant && visitesSuite.length > 0 && (
        <section className="carte">
          <h2>Prochaines visites</h2>
          {visitesSuite.map((v) => (
            <Link key={v.id} to={`/visites/${v.id}`} className="ligne-simple">
              <span><strong>{v.client}</strong><small>{[v.ville, v.type].filter(Boolean).join(' · ')}</small></span>
              <span className="d">{dateCourte(v.date)} · <strong>{heureAffichee(v.heure)}</strong></span>
            </Link>
          ))}
        </section>
      )}

      {/* 5. Le mois en chiffres */}
      <div className="nav-jour acc-mois">
        <button className="btn mini" onClick={() => setJour(moisDecale(jour, -1))} aria-label="Mois précédent">‹</button>
        <h2>{moisAnnee(tb.mois)}</h2>
        <button className="btn mini" disabled={courant} onClick={() => { const n = moisDecale(jour, 1); setJour(n.slice(0, 7) === isoJour().slice(0, 7) ? isoJour() : n) }} aria-label="Mois suivant">›</button>
      </div>
      <div className="kpis">
        {gerant && (
          <Link to="/visites" className="kpi">
            <small>Visites</small>
            <strong>{tb.visites_mois}</strong>
            <span>{tb.visites_faites} faite{tb.visites_faites > 1 ? 's' : ''}{courant ? ` · ${tb.visites_a_venir} à venir` : ''}</span>
          </Link>
        )}
        {gerant && (
          <div className="kpi accent">
            <small>Signature</small>
            <strong>{signes + perdus ? `${Math.round((signes / (signes + perdus)) * 100)} %` : '—'}</strong>
            <span>{signes} signé{signes > 1 ? 's' : ''} · {enAttente} en attente</span>
          </div>
        )}
        <Link to="/chantiers" className="kpi">
          <small>Chantiers terminés</small>
          <strong>{tb.chantiers_termines_mois}</strong>
          <span>{tb.chantiers_en_cours} en cours · {tb.chantiers_a_venir} à venir</span>
        </Link>
        <Link to="/gestion/heures" className="kpi">
          <small>Heures équipe</small>
          <strong>{hFormat(tb.heures_mois)}</strong>
          <span>{tb.paniers_mois} panier{tb.paniers_mois > 1 ? 's' : ''}</span>
        </Link>
      </div>

      <details className="acc-stats">
        <summary className="btn large">📊 Statistiques détaillées</summary>
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
      </details>
    </div>
  )
}
