import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, STATUTS, type Chantier } from '../lib/supabase'
import { ajouterJours, dateCourte, depuisIso, isoJour } from '../lib/format'
import { estStaff, useAuth } from '../lib/auth'
import { RappelNotifications } from '../components/Notifications'
import { RappelCamions } from '../components/RappelCamions'

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
  const [suivi, setSuivi] = useState<Record<string, Suivi>>({})

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
  const enCours = actifs.filter((c) => c.statut === 'en_cours')
  const jour = actifs.filter((c) => !enCours.includes(c) && c.date_debut && c.date_debut <= auj && (c.date_fin ?? c.date_debut) >= auj)
  const semaine = actifs.filter((c) => !enCours.includes(c) && !jour.includes(c) && c.date_debut && c.date_debut <= finSemaine)
  const plusTard = actifs.filter((c) => !enCours.includes(c) && !jour.includes(c) && !semaine.includes(c))
  // Les chantiers en retard (fin dépassée) remontent en tête.
  enCours.sort((a, b) => Number(estEnRetard(b, auj)) - Number(estEnRetard(a, auj)))

  const idsEnCours = enCours.map((c) => c.id).join(',')
  useEffect(() => {
    if (!idsEnCours) return
    chargerSuivi(idsEnCours.split(',')).then(setSuivi)
  }, [idsEnCours])
  const termines = liste.filter((c) => c.statut === 'termine').reverse()

  return (
    <div className="page">
      <div className="titre-ligne">
        <h1>Mes chantiers</h1>
        {estStaff(membre) ? <Link className="btn pri" to="/gestion/chantiers/nouveau">+ Chantier</Link> : <Link className="btn" to="/outils">🛠 Outils</Link>}
      </div>
      <RappelCamions />

      <RappelNotifications />
      {new Date().getDay() === 5 && !estStaff(membre) && (
        <Link to="/vehicules" className="rappel-notif">🚚 C'est vendredi : pensez au contrôle de votre camion avant de rentrer.</Link>
      )}

      {charge && liste.length === 0 && (
        <div className="vide">Aucun chantier ne vous est affecté pour le moment.</div>
      )}

      {enCours.length > 0 && (
        <section className="groupe">
          <h2>En cours</h2>
          {enCours.map((c) => <CarteEnCours key={c.id} c={c} s={suivi[c.id]} auj={auj} />)}
        </section>
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

type Suivi = {
  faits: number
  total: number
  jours: number
  heures: number
  equipe: string[]
  derniere: string | null
}

async function chargerSuivi(ids: string[]): Promise<Record<string, Suivi>> {
  const [ta, jc, af, ph] = await Promise.all([
    supabase.from('taches').select('chantier_id, fait, fait_le, est_groupe').in('chantier_id', ids).eq('categorie', 'travaux'),
    supabase.from('journee_chantiers').select('chantier_id, heures, journees(jour)').in('chantier_id', ids),
    supabase.from('affectations').select('chantier_id, membres(prenom)').in('chantier_id', ids),
    supabase.from('photos').select('chantier_id, prise_le').in('chantier_id', ids).order('prise_le', { ascending: false }).limit(200)
  ])
  const r: Record<string, Suivi> = {}
  const s = (id: string) => (r[id] ??= { faits: 0, total: 0, jours: 0, heures: 0, equipe: [], derniere: null })
  const plusRecent = (x: Suivi, d: string | null | undefined) => {
    if (d && (!x.derniere || d.slice(0, 10) > x.derniere)) x.derniere = d.slice(0, 10)
  }
  for (const t of (ta.data ?? []) as { chantier_id: string; fait: boolean; fait_le: string | null; est_groupe: boolean | null }[]) {
    if (t.est_groupe) continue
    const x = s(t.chantier_id)
    x.total++
    if (t.fait) x.faits++
    plusRecent(x, t.fait_le)
  }
  const joursVus: Record<string, Set<string>> = {}
  for (const l of (jc.data ?? []) as unknown as { chantier_id: string; heures: number; journees: { jour: string } | null }[]) {
    const x = s(l.chantier_id)
    x.heures += Number(l.heures) || 0
    if (l.journees?.jour) {
      ;(joursVus[l.chantier_id] ??= new Set()).add(l.journees.jour)
      plusRecent(x, l.journees.jour)
    }
  }
  for (const [id, set] of Object.entries(joursVus)) s(id).jours = set.size
  for (const a of (af.data ?? []) as unknown as { chantier_id: string; membres: { prenom: string } | null }[]) {
    if (a.membres?.prenom) s(a.chantier_id).equipe.push(a.membres.prenom)
  }
  for (const p of (ph.data ?? []) as { chantier_id: string; prise_le: string | null }[]) plusRecent(s(p.chantier_id), p.prise_le)
  return r
}

function estEnRetard(c: Chantier, auj: string) {
  return !!c.date_fin && c.date_fin < auj
}

/** Jours ouvrés (lundi à vendredi) entre deux dates incluses. */
function joursOuvres(debut: string, fin: string) {
  let n = 0
  for (let d = depuisIso(debut); isoJour(d) <= fin; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++
  }
  return n
}

function ilYA(d: string, auj: string) {
  const n = Math.round((depuisIso(auj).getTime() - depuisIso(d).getTime()) / 86400000)
  if (n <= 0) return "aujourd'hui"
  if (n === 1) return 'hier'
  return `il y a ${n} j`
}

/** « M. et Mme X (maître d'œuvre : Y) » → titre « M. et Mme X », précision « maître d'œuvre : Y ». */
function decouperNom(nom: string) {
  const m = nom.match(/^(.*?)\s*\((.*)\)\s*$/)
  return m ? { titre: m[1], precision: m[2] } : { titre: nom, precision: null }
}

function CarteEnCours({ c, s, auj }: { c: Chantier; s?: Suivi; auj: string }) {
  const retard = estEnRetard(c, auj)
  const { titre, precision } = decouperNom(c.client_nom)
  const prevus = c.date_debut ? joursOuvres(c.date_debut, c.date_fin ?? c.date_debut) : 0
  const pct = s && s.total ? Math.round((s.faits / s.total) * 100) : 0
  const joursRetard = retard ? Math.round((depuisIso(auj).getTime() - depuisIso(c.date_fin!).getTime()) / 86400000) : 0

  return (
    <Link to={`/chantier/${c.id}`} className={`carte-encours${retard ? ' retard' : ''}`}>
      <div className="ce-tete">
        <div>
          <strong>{titre}</strong>
          <span className="sous">{[c.ville, c.reference].filter(Boolean).join(' · ')}</span>
          {precision && <span className="sous">{precision}</span>}
        </div>
        {retard ? (
          <span className="pastille retard">Fin dépassée</span>
        ) : (
          s && prevus > 0 && <span className="pastille jour">Jour {Math.min(s.jours + 1, prevus)} / {prevus}</span>
        )}
      </div>

      {s && s.total > 0 ? (
        <div className="ce-avance">
          <div className="ce-barre"><span style={{ width: `${pct}%` }} /></div>
          <span className="sous">{s.faits} / {s.total} travaux faits</span>
        </div>
      ) : (
        s && <span className="sous">Aucun travail à cocher sur ce chantier</span>
      )}

      {s && (
        <div className="ce-infos">
          <span>{s.heures > 0 ? `${Math.round(s.heures * 10) / 10} h sur ${s.jours} j` : <em className="ce-alerte">Aucune heure saisie</em>}</span>
          {s.equipe.length > 0 && <span>👷 {s.equipe.join(', ')}</span>}
          <span>{s.derniere ? `Activité ${ilYA(s.derniere, auj)}` : 'Aucune activité'}</span>
        </div>
      )}

      {retard && (
        <div className="ce-retard">
          Fin prévue le {dateCourte(c.date_fin)} ({joursRetard} j de retard) — à clôturer ou à replanifier ?
        </div>
      )}
    </Link>
  )
}
