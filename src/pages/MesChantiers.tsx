import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, erreurLisible, type Chantier } from '../lib/supabase'
import { ajouterJours, dateCourte, isoJour, lundi } from '../lib/format'
import { estGerant, estStaff, useAuth } from '../lib/auth'
import { eur } from '../lib/finances'
import { RappelNotifications } from '../components/Notifications'
import { RappelCamions } from '../components/RappelCamions'

type Ch = Chantier & { affectations?: { membres: { prenom: string; nom: string | null } | null }[] }
type Etat = 'cloturer' | 'cours' | 'venir' | 'planifier'
const ETATS: Record<Etat, { lib: string; cls: string }> = {
  cloturer: { lib: 'À clôturer', cls: 'c-clo' },
  cours: { lib: 'En cours', cls: 'c-cours' },
  venir: { lib: 'À venir', cls: 'c-ven' },
  planifier: { lib: 'À planifier', cls: 'c-pla' }
}
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Un chantier dont la date de fin est passée mais qui n'est pas terminé : à clôturer (ou à prolonger). */
function etat(c: Ch, auj: string): Etat {
  const fin = c.date_fin ?? c.date_debut
  if (fin && fin < auj) return 'cloturer'
  if (!c.date_debut) return c.statut === 'en_cours' ? 'cours' : 'planifier'
  if (c.statut === 'en_cours' || c.date_debut <= auj) return 'cours'
  return 'venir'
}

function joursOuvres(a: string, b: string) {
  let n = 0
  for (let d = new Date(a + 'T12:00'); d <= new Date(b + 'T12:00'); d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) n++
  return n
}
const jours = (a: string, b: string) => Math.round((new Date(b + 'T12:00').getTime() - new Date(a + 'T12:00').getTime()) / 864e5)
const nomCourt = (s: string) => s.replace(/\s*\((maître|maitre)[^)]*\)\s*/i, ' ').trim()
const jourCourt = (d: string) => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
// Nom de famille (le mot en majuscules le plus long) pour retrouver le devis signé du client.
const patronyme = (s: string) => (s.match(/\b[A-ZÀ-Ý][A-ZÀ-Ý'-]{3,}\b/g) ?? []).filter((m) => !/^(MME|MLLE|SARL|SAS|SCI|SDC|COPRO|MAITRE|ACCESS|TRAVAUX)$/.test(m)).sort((a, b) => b.length - a.length)[0] ?? null

export default function MesChantiers() {
  const { membre } = useAuth()
  const staff = estStaff(membre)
  const gerant = estGerant(membre)
  const [liste, setListe] = useState<Ch[]>(() => {
    try { return JSON.parse(localStorage.getItem('at-chantiers') ?? '[]') } catch { return [] }
  })
  const [charge, setCharge] = useState(false)
  const [vue, setVue] = useState<'liste' | 'planning'>(() => {
    try { return (localStorage.getItem('at-vue-chantiers') as 'liste' | 'planning') || 'liste' } catch { return 'liste' }
  })
  const [montants, setMontants] = useState<{ client: string | null; objet: string | null; num: string | null; total_ht: number; statut: string | null }[]>([])
  const [erreur, setErreur] = useState('')

  async function charger() {
    const { data } = await supabase.from('chantiers').select('*, affectations(membres(prenom, nom))').order('date_debut', { ascending: true, nullsFirst: false })
    setCharge(true)
    if (data) {
      const l = (data as Ch[]).filter((c) => !c.client_nom.startsWith('[TEST]'))
      setListe(l)
      try { localStorage.setItem('at-chantiers', JSON.stringify(l)) } catch { /* stockage plein */ }
    }
  }
  useEffect(() => { charger() }, [])
  useEffect(() => {
    if (gerant) supabase.from('finances_pieces').select('client, objet, num, total_ht, statut').eq('genre', 'devis').then(({ data }) => setMontants((data ?? []) as never))
  }, [gerant])
  useEffect(() => { try { localStorage.setItem('at-vue-chantiers', vue) } catch { /* rien */ } }, [vue])

  // Montant HT des devis signés du client (gérant seulement).
  const montant = (c: Ch): number | null => {
    if (!gerant || !montants.length) return null
    const signes = montants.filter((m) => /sign|accept/i.test(m.statut ?? ''))
    const parNum = c.bon?.devis ? signes.filter((m) => m.num === c.bon!.devis) : []
    const p = patronyme(c.client_nom)
    const l = parNum.length ? parNum : p ? signes.filter((m) => `${m.client ?? ''} ${m.objet ?? ''}`.toUpperCase().includes(p)) : []
    return l.length ? l.reduce((t, m) => t + Number(m.total_ht), 0) : null
  }

  async function terminer(c: Ch) {
    const { error } = await supabase.from('chantiers').update({ statut: 'termine', termine_le: new Date().toISOString() }).eq('id', c.id)
    if (error) return setErreur(erreurLisible(error))
    charger()
  }

  const auj = isoJour()
  const actifs = liste.filter((c) => c.statut !== 'termine')
  const avecEtat = actifs.map((c) => ({ c, e: etat(c, auj) }))
  const nb = (e: Etat) => avecEtat.filter((x) => x.e === e).length
  const termines = liste.filter((c) => c.statut === 'termine').sort((a, b) => (b.date_fin ?? b.date_debut ?? '').localeCompare(a.date_fin ?? a.date_debut ?? ''))

  // Un bloc par mois, du mois en cours jusqu'au dernier mois prévu (les mois vides se voient).
  const groupes = useMemo(() => {
    const dates = avecEtat.filter((x) => x.e === 'cours' || x.e === 'venir')
    const cle = (x: { c: Ch; e: Etat }) => (x.e === 'cours' ? auj : x.c.date_debut!).slice(0, 7)
    const derniers = dates.map(cle).sort()
    const fin = derniers[derniers.length - 1] ?? auj.slice(0, 7)
    const res: { mois: string; items: { c: Ch; e: Etat }[] }[] = []
    for (let d = new Date(Number(auj.slice(0, 4)), Number(auj.slice(5, 7)) - 1, 1); ; d.setMonth(d.getMonth() + 1)) {
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (m > fin) break
      res.push({ mois: m, items: dates.filter((x) => cle(x) === m).sort((a, b) => (a.c.date_debut ?? '').localeCompare(b.c.date_debut ?? '')) })
    }
    return res
  }, [liste])

  const carte = (c: Ch, e: Etat) => <Carte key={c.id} c={c} e={e} auj={auj} montant={montant(c)} staff={staff} terminer={() => terminer(c)} />

  return (
    <div className="page">
      <div className="titre-ligne">
        <h1>{staff ? 'Chantiers' : 'Mes chantiers'}</h1>
        {staff ? <Link className="btn pri" to="/gestion/chantiers/nouveau">+ Chantier</Link> : <Link className="btn" to="/outils">🛠 Outils</Link>}
      </div>
      <RappelCamions />
      <RappelNotifications />
      {new Date().getDay() === 5 && !staff && (
        <Link to="/vehicules" className="rappel-notif">🚚 C'est vendredi : pensez au contrôle de votre camion avant de rentrer.</Link>
      )}

      {charge && liste.length === 0 && <div className="vide">Aucun chantier ne vous est affecté pour le moment.</div>}
      {erreur && <p className="erreur">{erreur}</p>}

      {actifs.length > 0 && (
        <>
          <div className="resume-ch">
            {(['cloturer', 'cours', 'venir', 'planifier'] as Etat[]).filter((e) => staff || e !== 'cloturer').map((e) => (
              <div key={e} className={`r-${e}`}><b>{nb(e)}</b><span>{ETATS[e].lib}</span></div>
            ))}
          </div>
          <div className="vue-ch" role="tablist">
            <button role="tab" aria-selected={vue === 'liste'} onClick={() => setVue('liste')}>☰ Liste</button>
            <button role="tab" aria-selected={vue === 'planning'} onClick={() => setVue('planning')}>▤ Planning</button>
          </div>
        </>
      )}

      {vue === 'planning' && actifs.length > 0 && <Planning items={avecEtat} auj={auj} />}

      {vue === 'liste' && (
        <>
          {nb('cloturer') > 0 && (
            <Bloc cls="m-alerte" titre={staff ? 'À clôturer' : 'Date de fin dépassée'} sous="la date de fin est passée" pts={Array(nb('cloturer')).fill('#d64545')} n={nb('cloturer')} ouvert={staff}>
              {avecEtat.filter((x) => x.e === 'cloturer').map((x) => carte(x.c, x.e))}
            </Bloc>
          )}
          {groupes.map((g, i) => {
            const [a, m] = g.mois.split('-').map(Number)
            const total = g.items.reduce((t, x) => t + (montant(x.c) ?? 0), 0)
            const sansEquipe = g.items.filter((x) => !x.c.affectations?.length).length
            const sous = g.items.length
              ? [`${g.items.length} chantier${g.items.length > 1 ? 's' : ''}`, gerant && total ? eur(total) : null, staff && sansEquipe ? `${sansEquipe} sans équipe` : null].filter(Boolean).join(' · ')
              : 'aucun chantier daté'
            return (
              <Bloc key={g.mois} cls={g.items.length ? '' : 'm-vide'} titre={`${MOIS[m - 1]} ${a}`} sous={sous} pts={g.items.map((x) => (x.e === 'cours' ? '#2e9e5b' : '#00729a'))} n={g.items.length} ouvert={i === 0 || (i === 1 && !groupes[0].items.length)}>
                {g.items.length ? g.items.map((x) => carte(x.c, x.e)) : <div className="vide-mois">⚠ Aucun chantier prévu ce mois-ci.{staff && nb('planifier') ? ` ${nb('planifier')} chantier${nb('planifier') > 1 ? 's' : ''} à planifier.` : ''}</div>}
              </Bloc>
            )
          })}
          {nb('planifier') > 0 && (
            <Bloc cls="m-gris" titre="À planifier" sous="sans date" pts={Array(nb('planifier')).fill('#6b7a88')} n={nb('planifier')}>
              {avecEtat.filter((x) => x.e === 'planifier').map((x) => carte(x.c, x.e))}
            </Bloc>
          )}
          {termines.length > 0 && (
            <Bloc cls="m-gris" titre="Terminés" sous={termines[0].date_fin ? `dernier : ${nomCourt(termines[0].client_nom)}` : ''} pts={[]} n={termines.length}>
              {termines.slice(0, 30).map((c) => (
                <Link key={c.id} to={`/chantier/${c.id}`} className="ligne-termine">
                  <strong>{nomCourt(c.client_nom)}</strong>
                  <span>{[c.ville, c.reference, c.date_fin ? dateCourte(c.date_fin) : null].filter(Boolean).join(' · ')}</span>
                </Link>
              ))}
            </Bloc>
          )}
        </>
      )}
    </div>
  )
}

function Bloc({ cls, titre, sous, pts, n, ouvert, children }: { cls: string; titre: string; sous: string; pts: string[]; n: number; ouvert?: boolean; children: React.ReactNode }) {
  return (
    <details className={`mois-ch ${cls}`} open={ouvert}>
      <summary>
        <span className="mt-t"><strong>{titre}</strong><small>{sous}</small></span>
        <span className="pts">{pts.slice(0, 6).map((c, i) => <i key={i} style={{ background: c }} />)}</span>
        <span className="nb">{n}</span>
        <span className="fl" aria-hidden>⌄</span>
      </summary>
      <div className="corps">{children}</div>
    </details>
  )
}

function Carte({ c, e, auj, montant, staff, terminer }: { c: Ch; e: Etat; auj: string; montant: number | null; staff: boolean; terminer: () => void }) {
  const fin = c.date_fin ?? c.date_debut
  // Durée prévue (jours de travail) ; sinon jours ouvrés entre les deux dates.
  const duree = c.duree_jours ?? (c.date_debut && c.date_fin ? joursOuvres(c.date_debut, c.date_fin) : null)
  const st = e === 'cloturer' ? `Fini le ${dateCourte(fin)}` : e === 'planifier' ? 'Sans date' : e === 'cours' ? (fin && fin !== auj ? `jusqu'au ${dateCourte(fin)}` : 'En cours')
    : c.date_fin && c.date_fin !== c.date_debut ? `${dateCourte(c.date_debut)} → ${dateCourte(c.date_fin)}` : jourCourt(c.date_debut!)
  const equipe = (c.affectations ?? []).map((a) => a.membres).filter(Boolean) as { prenom: string; nom: string | null }[]
  const moe = c.client_nom.match(/\((?:maître|maitre) d'(?:œ|oe)uvre\s*:\s*([^)]+)\)/i)?.[1]
  return (
    <div className={`cc ${ETATS[e].cls}`}>
      <Link to={`/chantier/${c.id}`} className="cc-lien">
        <div className="l1"><strong>{nomCourt(c.client_nom)}</strong><span className="st">{st}</span></div>
        <div className="l2">
          <span>{[c.ville, c.reference].filter(Boolean).join(' · ')}</span>
          {moe && <span>MOE : {moe}</span>}
          {c.bon?.objet && <span>{c.bon.objet}</span>}
          {duree ? <span><b>{duree === 0.5 ? '½ journée' : `${String(duree).replace('.', ',')} j`}</b></span> : e === 'venir' ? <span><b>durée ?</b></span> : null}
          {staff && c.heures_prevues ? <span>{c.heures_prevues} h prévues</span> : null}
        </div>
        {(equipe.length > 0 || staff || montant != null) && <div className="l3">
          <div className="eq">
            {equipe.length ? equipe.slice(0, 5).map((m, i) => <b key={i} title={m.prenom}>{m.prenom[0]}{m.nom?.[0] ?? ''}</b>) : staff ? <em>⚠ Équipe à affecter</em> : null}
          </div>
          {montant != null && <span className="mt">{eur(montant)}</span>}
        </div>}
      </Link>
      {staff && e === 'cloturer' && (
        <div className="act">
          <button onClick={terminer}>✓ Marquer terminé</button>
          <Link to={`/gestion/chantiers/${c.id}`}>Prolonger</Link>
        </div>
      )}
    </div>
  )
}

/** Frise sur 3 mois : une barre par chantier, la ligne d'aujourd'hui, et la charge de l'équipe par semaine. */
function Planning({ items, auj }: { items: { c: Ch; e: Etat }[]; auj: string }) {
  const debut = `${auj.slice(0, 7)}-01`
  const d0 = new Date(debut + 'T12:00')
  const finP = new Date(d0.getFullYear(), d0.getMonth() + 3, 0)
  const total = jours(debut, isoJour(finP)) + 1
  const pos = (d: string) => Math.max(0, Math.min(100, (jours(debut, d) / total) * 100))
  const mois = [0, 1, 2].map((i) => new Date(d0.getFullYear(), d0.getMonth() + i, 1))
  const dates = items.filter((x) => x.c.date_debut).sort((a, b) => a.c.date_debut!.localeCompare(b.c.date_debut!))
  const sansDate = items.filter((x) => !x.c.date_debut)

  // Charge : nombre de chantiers actifs chaque semaine (lundi → samedi).
  const semaines: { lundi: string; n: number }[] = []
  for (let l = lundi(debut); l <= isoJour(finP); l = ajouterJours(l, 7)) {
    const sam = ajouterJours(l, 5)
    semaines.push({ lundi: l, n: items.filter((x) => x.e !== 'cloturer' && x.c.date_debut && x.c.date_debut <= sam && (x.c.date_fin ?? x.c.date_debut) >= l).length })
  }
  const max = Math.max(1, ...semaines.map((s) => s.n))
  const trous: string[] = []
  let i = 0
  while (i < semaines.length) {
    if (semaines[i].n === 0 && semaines[i].lundi >= lundi(auj)) {
      let j = i
      while (j + 1 < semaines.length && semaines[j + 1].n === 0) j++
      if (j - i + 1 >= 2) trous.push(`Du ${dateCourte(semaines[i].lundi)} au ${dateCourte(ajouterJours(semaines[j].lundi, 5))} : aucun chantier (${j - i + 1} semaines)`)
      i = j + 1
    } else i++
  }

  return (
    <>
      <div className="pl">
        <div className="pl-mois"><span />{mois.map((m) => <span key={m.getMonth()}>{COURT[m.getMonth()]}</span>)}</div>
        {dates.map(({ c, e }) => {
          const a = c.date_debut!, b = c.date_fin ?? c.date_debut!
          const avant = b < debut
          const couleur = e === 'cloturer' ? '#d64545' : e === 'cours' ? '#2e9e5b' : '#00729a'
          return (
            <Link key={c.id} to={`/chantier/${c.id}`} className="pl-l">
              <span className="n">{patronyme(c.client_nom) ?? nomCourt(c.client_nom)}<small>{e === 'cloturer' ? 'à clôturer' : c.reference}</small></span>
              <span className="pl-t">
                <span className="auj" style={{ left: `${pos(auj)}%` }} />
                {avant
                  ? <><i style={{ left: 0, width: '5%', background: couleur }} /><em style={{ left: '6%' }}>◀ fini le {dateCourte(b)}</em></>
                  : a > isoJour(finP) ? <em style={{ right: 0 }}>{dateCourte(a)} ▶</em>
                  : <i style={{ left: `${pos(a)}%`, width: `${Math.max(1.2, pos(b) - pos(a) + 100 / total)}%`, background: couleur }} />}
              </span>
            </Link>
          )
        })}
        {sansDate.map(({ c }) => (
          <Link key={c.id} to={`/chantier/${c.id}`} className="pl-l">
            <span className="n">{patronyme(c.client_nom) ?? nomCourt(c.client_nom)}<small>à planifier</small></span>
            <span className="pl-t pl-sans">⚪ sans date</span>
          </Link>
        ))}
        <div className="pl-charge">
          <span className="n">Charge équipe<small>chantiers / semaine</small></span>
          <span className="chg">{semaines.map((s) => <i key={s.lundi} className={s.n ? '' : 'zero'} title={`Semaine du ${dateCourte(s.lundi)} : ${s.n}`} style={{ height: `${s.n ? Math.max(15, (s.n / max) * 100) : 10}%` }} />)}</span>
        </div>
      </div>
      <div className="leg-ch">
        <span><i style={{ background: '#2e9e5b' }} />en cours</span>
        <span><i style={{ background: '#00729a' }} />à venir</span>
        <span><i style={{ background: '#d64545' }} />à clôturer · aujourd'hui</span>
        <span><i style={{ background: '#f5c9c9' }} />semaine sans chantier</span>
      </div>
      {(trous.length > 0 || sansDate.length > 0) && (
        <section className="carte">
          <h2>⚠ À voir</h2>
          <ul className="puces">
            {trous.map((t) => <li key={t}>{t}</li>)}
            {sansDate.length > 0 && <li>{sansDate.length} chantier{sansDate.length > 1 ? 's' : ''} sans date : {sansDate.map((x) => patronyme(x.c.client_nom) ?? nomCourt(x.c.client_nom)).join(', ')}</li>}
          </ul>
        </section>
      )}
    </>
  )
}
