import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { IcoRetour } from '../../components/Icones'

interface Ligne { personnes: number; heures: number; taches: { libelle: string; unite: string | null; quantite: number | null } | null; chantiers: { client_nom: string } | null }
interface Groupe { libelle: string; unite: string; hh: number; hhQte: number; qte: number; nb: number; chantiers: Set<string>; sansQte: number }

const nf = (n: number, d = 2) => n.toLocaleString('fr-FR', { maximumFractionDigits: d })
// « Fourniture et pose tuiles terre cuite » et « Fourniture et pose de tuiles terre-cuite » finissent ensemble.
const cle = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(de|des|du|la|le|les|en|et|a|d|l)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

/** Temps moyens par ouvrage, à partir des temps saisis par l'équipe en cochant le bordereau. */
export default function TempsMoyens() {
  const [lignes, setLignes] = useState<Ligne[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    supabase.from('temps_taches').select('personnes, heures, taches(libelle, unite, quantite), chantiers(client_nom)').then(({ data }) => setLignes((data ?? []) as unknown as Ligne[]))
  }, [])

  const groupes = useMemo(() => {
    const m = new Map<string, Groupe>()
    for (const l of lignes ?? []) {
      if (!l.taches) continue
      const u = l.taches.unite ?? 'u'
      const k = `${cle(l.taches.libelle)}|${u}`
      const g = m.get(k) ?? { libelle: l.taches.libelle, unite: u, hh: 0, hhQte: 0, qte: 0, nb: 0, chantiers: new Set<string>(), sansQte: 0 }
      g.hh += l.personnes * Number(l.heures)
      g.nb++
      // Le ratio h / unité ne compte que les saisies qui ont une quantité.
      if (l.taches.quantite) { g.qte += Number(l.taches.quantite); g.hhQte += l.personnes * Number(l.heures) }
      else g.sansQte++
      if (l.chantiers) g.chantiers.add(l.chantiers.client_nom)
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => b.nb - a.nb || a.libelle.localeCompare(b.libelle))
  }, [lignes])

  const visibles = groupes.filter((g) => !q || cle(g.libelle).includes(cle(q)))

  return (
    <div className="page">
      <Link className="retour" to="/gestion"><IcoRetour /> Gestion</Link>
      <h1>Temps moyens</h1>
      <p className="aide">Calculés à partir des temps saisis par l'équipe quand elle coche le bordereau : nombre de personnes × durée, divisé par la quantité. Plus il y a de chantiers, plus le chiffre est fiable.</p>
      <input placeholder="Rechercher un ouvrage (tuiles, gouttière, écran…)" value={q} onChange={(e) => setQ(e.target.value)} />
      {!lignes && <p className="sous">Chargement…</p>}
      {lignes && groupes.length === 0 && <div className="vide">Pas encore de temps saisis. Ils arrivent quand l'équipe coche une ligne du bordereau et indique le temps passé.</div>}
      <div className="liste">
        {visibles.map((g) => {
          const parUnite = g.qte > 0 ? g.hhQte / g.qte : null
          const fiable = g.chantiers.size >= 3 ? 'v' : g.chantiers.size === 2 ? 'o' : 'r'
          return (
            <section key={g.libelle + g.unite} className="carte temps-moyen">
              <div className="titre-ligne">
                <strong>{g.libelle}</strong>
                <span className={`fiab ${fiable}`}>{g.chantiers.size} chantier{g.chantiers.size > 1 ? 's' : ''}</span>
              </div>
              <div className="recap-semaine">
                <div><strong>{parUnite != null ? nf(parUnite) : '—'}</strong><small>h / {g.unite}</small></div>
                <div><strong>{parUnite != null && parUnite > 0 ? nf(8 / parUnite, 1) : '—'}</strong><small>{g.unite} / jour / pers.</small></div>
                <div><strong>{nf(g.hh, 1)}</strong><small>h au total</small></div>
              </div>
              <p className="sous">{g.qte > 0 ? `${nf(g.qte, 1)} ${g.unite} réalisés` : 'Quantités non renseignées'}{g.sansQte && g.qte > 0 ? ` · ${g.sansQte} saisie${g.sansQte > 1 ? 's' : ''} sans quantité` : ''} · {[...g.chantiers].slice(0, 3).join(', ')}{g.chantiers.size > 3 ? '…' : ''}</p>
            </section>
          )
        })}
      </div>
    </div>
  )
}
