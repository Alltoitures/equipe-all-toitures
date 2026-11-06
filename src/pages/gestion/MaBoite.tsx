import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { calculer, chargerFinances, enregistrerObjectif, eur, type Piece } from '../../lib/finances'
import { dateCourte } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'

const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']
const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)} %`)

/** Le bloc du haut, repris sur l'accueil. */
export function HeroBoite({ k, lien }: { k: ReturnType<typeof calculer>; lien?: boolean }) {
  const contenu = (
    <>
      <div>
        <small>Chiffre d'affaires {k.an} (HT)</small>
        <div className="gros-chiffre">{eur(k.caAnnee)}<em>{k.premier && k.premier > `${k.an}-01` ? `depuis ${new Date(k.premier + '-01T12:00').toLocaleDateString('fr-FR', { month: 'long' })}` : 'facturé'}</em></div>
        {k.premier && k.premier > `${k.an}-01` && <span className="avert-hist">⚠ Factures d'avant {new Date(k.premier + '-01T12:00').toLocaleDateString('fr-FR', { month: 'long' })} dans Batigest : pas encore reprises</span>}
        {k.evolution != null && <span className={`evol ${k.evolution < 0 ? 'baisse' : ''}`}>{k.evolution >= 0 ? '▲' : '▼'} {k.evolution >= 0 ? '+' : ''}{Math.round(k.evolution * 100)} % vs {Number(k.an) - 1} à la même date</span>}
      </div>
      {k.objectif ? (
        <div className="obj">
          <div className="obj-l"><span>Objectif {k.an} : {eur(k.objectif)}</span><b>{pct(k.avancement)}</b></div>
          <div className="jauge"><i style={{ width: `${Math.min(100, (k.avancement ?? 0) * 100)}%` }} />{k.rythme != null && <b style={{ left: `${Math.min(100, k.rythme * 100)}%` }} />}</div>
          <div className="obj-l"><span>Reste {eur(Math.max(0, k.objectif - k.caAnnee))} en {k.semainesRestantes} semaines</span><span>| = rythme attendu</span></div>
        </div>
      ) : null}
      <div className="mini3">
        <div><strong>{eur(k.caMois)}</strong><span>facturé ce mois</span></div>
        <div><strong>{k.retard.length ? eur(k.retard.reduce((t, x) => t + x.reste, 0)) : '0 €'}</strong><span>impayés en retard</span></div>
        <div><strong>{eur(k.carnet)}</strong><span>carnet de commandes</span></div>
      </div>
    </>
  )
  return lien ? <Link to="/gestion/boite" className="boite-hero">{contenu}<span className="boite-plus">Voir le détail ›</span></Link> : <section className="boite-hero">{contenu}</section>
}

export default function MaBoite() {
  const [d, setD] = useState<{ pieces: Piece[]; objectif: number | null; erreur: string | null } | null>(null)
  const [editObj, setEditObj] = useState(false)
  const [obj, setObj] = useState('')
  const charger = () => chargerFinances().then(setD)
  useEffect(() => { charger() }, [])
  if (!d) return <div className="page"><p className="sous">Chargement…</p></div>
  const k = calculer(d.pieces, d.objectif)
  const max = Math.max(1, ...k.barres.map((b) => Math.max(b.ca, b.n1)))
  const aEnc = k.aEncaisser.reduce((t, x) => t + x.reste, 0)
  const enRetard = k.retard.reduce((t, x) => t + x.reste, 0)
  const attenteEur = k.attente.reduce((t, x) => t + Number(x.total_ht), 0)
  const largeur = (n: number) => `${Math.max(3, Math.min(100, (n / Math.max(1, k.carnet, attenteEur)) * 100))}%`

  return (
    <div className="page">
      <Link className="retour" to="/"><IcoRetour /> Accueil</Link>
      <div className="titre-ligne">
        <h1>Ma boîte</h1>
        <button className="lien" onClick={() => { setObj(d.objectif ? String(d.objectif) : ''); setEditObj(true) }}>{d.objectif ? 'Objectif' : '+ Objectif'}</button>
      </div>
      {d.erreur && <p className="erreur">{d.erreur}</p>}
      {d.pieces.length === 0 && <div className="vide">Les chiffres arrivent depuis le Pilotage à la prochaine synchronisation (chaque nuit).</div>}

      <HeroBoite k={k} />
      {!d.objectif && <button className="btn" onClick={() => { setObj(''); setEditObj(true) }}>🎯 Fixer l'objectif de CA {k.an}</button>}

      <section className="carte">
        <div className="titre-ligne"><h2>CA par mois</h2><span className="sous">12 mois glissants · HT</span></div>
        <div className="barz">
          {k.barres.map((b) => (
            <div className="bz" key={b.mois} title={`${eur(b.ca)}${b.n1 ? ` · N-1 : ${eur(b.n1)}` : ''}`}>
              <div className="bz-col">
                {b.n1 > 0 && <i className="n1" style={{ height: `${(b.n1 / max) * 100}%` }} />}
                <i className={b.courant ? 'cur' : ''} style={{ height: `${(b.ca / max) * 100}%` }} />
              </div>
              <span>{MOIS[Number(b.mois.slice(5, 7)) - 1]}</span>
            </div>
          ))}
        </div>
        <div className="leg"><span><i style={{ background: 'var(--accent-ink)' }} />{k.an}</span><span><i style={{ background: '#e3e9ef' }} />année précédente</span></div>
        {k.premier && <p className="aide">Historique à partir de {MOIS[Number(k.premier.slice(5, 7)) - 1]} {k.premier.slice(0, 4)} (début des factures dans le Pilotage).</p>}
      </section>

      <section className="carte">
        <h2>Trésorerie clients <span className="sous">TTC</span></h2>
        <div className="argent">
          <div><small>Encaissé ce mois</small><strong>{eur(k.encaisseMois)}</strong><span>{k.nbPaiementsMois} facture{k.nbPaiementsMois > 1 ? 's' : ''} réglée{k.nbPaiementsMois > 1 ? 's' : ''}</span></div>
          <div><small>À encaisser</small><strong>{eur(aEnc)}</strong><span>{k.aEncaisser.length} facture{k.aEncaisser.length > 1 ? 's' : ''} non échue{k.aEncaisser.length > 1 ? 's' : ''}</span></div>
          <div className={`large ${k.retard.length ? 'rouge' : 'vert'}`}>
            <small>Impayés en retard</small>
            <strong>{eur(enRetard)}</strong>
            <span>{k.retard.length ? `${k.retard.length} facture${k.retard.length > 1 ? 's' : ''} · la plus ancienne : ${k.retard[0].jours} jours` : 'Aucun retard ✓'}</span>
          </div>
        </div>
        {k.retard.length > 0 && (
          <>
            <ul className="imp">
              {k.retard.map((x) => (
                <li key={x.f.id}><span>{x.f.client} · {x.f.num}<small> · échue le {dateCourte(x.f.echeance)}</small></span><b>{Math.round(x.reste).toLocaleString('fr-FR')} € · {x.jours} j</b></li>
              ))}
            </ul>
            <p className="aide">Pour relancer : écris « Relance {k.retard[0].f.num} » à Claude, il prépare le brouillon (relance 1, 2 ou mise en demeure).</p>
          </>
        )}
      </section>

      <section className="carte">
        <h2>Devant nous <span className="sous">HT</span></h2>
        <div className="pipe">
          <div className="etape"><div className="et-l"><span>Carnet de commandes</span><strong>{eur(k.carnet)}</strong></div><div className="et-b"><i style={{ background: '#2e9e5b', width: largeur(k.carnet) }} /></div>
            <small>Devis signés pas encore facturés{k.semaines && k.moisHistorique >= 3 ? ` · ≈ ${Math.round(k.semaines)} semaine${Math.round(k.semaines) > 1 ? 's' : ''} de travail` : ''}</small></div>
          <div className="etape"><div className="et-l"><span>Devis en attente</span><strong>{eur(attenteEur)}</strong></div><div className="et-b"><i style={{ background: '#01a9e1', width: largeur(attenteEur) }} /></div>
            <small>{k.attente.length} devis envoyé{k.attente.length > 1 ? 's' : ''}{k.attenteVieux.length ? ` · ${k.attenteVieux.length} de plus de 30 jours à relancer` : ''}{k.plusGrosAttente && k.plusGrosAttente.total_ht > attenteEur * 0.4 ? ` · dont ${k.plusGrosAttente.num} : ${eur(Number(k.plusGrosAttente.total_ht))}` : ''}</small></div>
          {k.brouillons.length > 0 && (
            <div className="etape"><div className="et-l"><span>Devis en cours de rédaction</span><strong>{k.brouillons.length}</strong></div>
              <small>commencés, pas encore envoyés · {eur(k.brouillons.reduce((t, x) => t + Number(x.total_ht), 0))}</small></div>
          )}
        </div>
      </section>

      <section className="carte">
        <h2>Signature <span className="sous">6 derniers mois</span></h2>
        <div className="argent">
          <div><small>En montant</small><strong>{pct(k.tauxEur)}</strong><span>des € devisés</span></div>
          <div><small>En nombre</small><strong>{pct(k.tauxNb)}</strong><span>{k.nbTranches} devis tranchés</span></div>
        </div>
        {k.tauxEur != null && k.tauxNb != null && k.tauxEur < k.tauxNb - 0.15 && <p className="aide">Tu signes plus souvent les petits chantiers que les gros.</p>}
      </section>

      <section className="carte attenue">
        <h2>Marge par chantier <span className="sous">bientôt</span></h2>
        <p className="sous">Prix vendu − (heures réelles × coût horaire + matériaux). Il manque ton coût horaire chargé.</p>
      </section>
      {k.derniereSynchro && <p className="aide">Chiffres du Pilotage, mis à jour le {new Date(k.derniereSynchro).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Visible par toi seul.</p>}

      {editObj && (
        <div className="fond-modal" onClick={() => setEditObj(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Objectif de CA {k.an}</h2>
            <label>Montant HT (€)<input inputMode="numeric" value={obj} onChange={(e) => setObj(e.target.value.replace(/\D/g, ''))} placeholder="ex. 900000" /></label>
            <div className="boutons">
              <button className="btn" onClick={() => setEditObj(false)}>Annuler</button>
              <button className="btn pri" disabled={!obj} onClick={async () => { await enregistrerObjectif(Number(obj)); setEditObj(false); charger() }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
