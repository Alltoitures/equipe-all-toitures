import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { nomClient, type Visite } from '../lib/visite'
import { ajouterJours, dateCourte, isoJour } from '../lib/format'

/**
 * Suivi des devis en colonnes : À faire → Envoyé → À relancer → Signé (+ Perdus).
 * Chaque action est enregistrée ici puis recopiée dans le Pilotage par la tâche planifiée (dans l'heure).
 */

type Col = 'afaire' | 'envoye' | 'relancer' | 'signe' | 'perdu'
const COLONNES: { id: Col; titre: string; classe: string }[] = [
  { id: 'afaire', titre: 'À faire', classe: 'rdv-devis' },
  { id: 'envoye', titre: 'Envoyé', classe: 'rdv-envoye' },
  { id: 'relancer', titre: 'À relancer', classe: 'rdv-refuse' },
  { id: 'signe', titre: 'Signé', classe: 'rdv-accepte' },
  { id: 'perdu', titre: 'Perdus', classe: 'rdv-sanssuite' }
]
const DELAI_RELANCE = 10
const euros = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'
const jours = (d: string | null | undefined) => (d ? Math.round((Date.parse(isoJour()) - Date.parse(d.slice(0, 10))) / 864e5) : null)

function colonne(v: Visite, auj: string): Col | null {
  const s = v.rdv_statut ?? 'Devis à faire'
  if (s === 'Devis à faire') return v.devis_envoye_le ? 'envoye' : 'afaire'
  if (s === 'Devis envoyé') return v.relance_prevue && v.relance_prevue <= auj ? 'relancer' : 'envoye'
  const recent = (d: string | null) => !!d && d.slice(0, 10) >= ajouterJours(auj, -90)
  if (s === 'Accepté') return recent(v.accepte_le ?? v.date_rdv) ? 'signe' : null
  if (s === 'Refusé' || s === 'Sans suite') return recent(v.devis_maj_le ?? v.date_rdv) ? 'perdu' : null
  return null
}

export default function Devis() {
  const [liste, setListe] = useState<Visite[] | null>(null)
  const [ouvert, setOuvert] = useState<Visite | null>(null)
  const [voirPerdus, setVoirPerdus] = useState(false)
  const tableau = useRef<HTMLDivElement>(null)

  function charger() {
    supabase
      .from('visites')
      .select('*')
      .eq('statut', 'terminee')
      .order('date_rdv', { ascending: true })
      .then(({ data }) => setListe((data ?? []) as Visite[]))
  }
  useEffect(charger, [])

  const auj = isoJour()
  if (!liste) return <div className="page"><h1>Devis</h1><p className="sous">Chargement…</p></div>

  const par: Record<Col, Visite[]> = { afaire: [], envoye: [], relancer: [], signe: [], perdu: [] }
  for (const v of liste) {
    const c = colonne(v, auj)
    if (c) par[c].push(v)
  }
  par.envoye.sort((a, b) => (a.relance_prevue ?? '9').localeCompare(b.relance_prevue ?? '9'))
  par.relancer.sort((a, b) => (a.relance_prevue ?? '').localeCompare(b.relance_prevue ?? ''))
  par.signe.sort((a, b) => (b.accepte_le ?? b.date_rdv ?? '').localeCompare(a.accepte_le ?? a.date_rdv ?? ''))
  const somme = (l: Visite[]) => l.reduce((t, v) => t + (Number(v.devis_montant) || 0), 0)
  const enAttente = [...par.envoye, ...par.relancer]
  const colonnes = COLONNES.filter((c) => c.id !== 'perdu' || voirPerdus)

  const aller = (i: number) => {
    const el = tableau.current?.children[i] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }

  return (
    <div className="page devis-page">
      <div className="titre-ligne">
        <h1>Devis</h1>
        <button className="lien" onClick={() => setVoirPerdus(!voirPerdus)}>{voirPerdus ? 'Masquer les perdus' : `Perdus (${par.perdu.length})`}</button>
      </div>
      <div className="devis-resume">
        <span><strong>{par.afaire.length}</strong> à faire</span>
        <span><strong>{euros(somme(enAttente))}</strong> HT en attente ({enAttente.length})</span>
        <span><strong>{euros(somme(par.signe))}</strong> HT signés (90 j)</span>
      </div>
      <div className="devis-sauts">
        {colonnes.map((c, i) => (
          <button key={c.id} className={`pastille-rdv ${c.classe}`} onClick={() => aller(i)}>{c.titre} · {par[c.id].length}</button>
        ))}
      </div>

      <div className="kanban" ref={tableau}>
        {colonnes.map((c) => (
          <section key={c.id} className={`kanban-col ${c.classe}`}>
            <header>
              <h2>{c.titre} <span>{par[c.id].length}</span></h2>
              {c.id !== 'afaire' && somme(par[c.id]) > 0 && <small>{euros(somme(par[c.id]))} HT</small>}
            </header>
            {par[c.id].length === 0 && <p className="sous kanban-vide">{c.id === 'relancer' ? 'Aucune relance due.' : 'Rien ici.'}</p>}
            {par[c.id].map((v) => <Carte key={v.id} v={v} col={c.id} ouvrir={() => setOuvert(v)} />)}
          </section>
        ))}
      </div>
      <p className="aide">Touchez une carte pour la faire avancer. Le Pilotage est mis à jour dans l'heure. Relance proposée {DELAI_RELANCE} jours après l'envoi.</p>

      {ouvert && <Actions v={ouvert} col={colonne(ouvert, auj)!} fermer={() => setOuvert(null)} fait={() => { setOuvert(null); charger() }} />}
    </div>
  )
}

function Carte({ v, col, ouvrir }: { v: Visite; col: Col; ouvrir: () => void }) {
  const age = jours(v.date_rdv)
  const retard = jours(v.relance_prevue)
  let ligne: React.ReactNode = null
  if (col === 'afaire') ligne = <span className={age != null && age > 7 ? 'tard' : ''}>Visite {dateCourte(v.date_rdv)}{age != null ? ` · ${age === 0 ? "aujourd'hui" : `il y a ${age} j`}` : ''}</span>
  if (col === 'envoye') ligne = <span>Envoyé {dateCourte(v.devis_envoye_le?.slice(0, 10))}{v.relance_prevue ? ` · relance ${dateCourte(v.relance_prevue)}` : ''}</span>
  if (col === 'relancer') ligne = <span className="tard">Relance prévue {dateCourte(v.relance_prevue)}{retard ? ` · +${retard} j` : ''}</span>
  if (col === 'signe') ligne = <span>Signé {v.accepte_le ? dateCourte(v.accepte_le) : ''}</span>
  if (col === 'perdu') ligne = <span>{v.rdv_statut}{v.motif_perte ? ` · ${v.motif_perte}` : ''}</span>
  return (
    <button className="kanban-carte" onClick={ouvrir}>
      <strong>{nomClient(v)}</strong>
      <small>{[v.type_travaux, v.ville].filter(Boolean).join(' · ') || '—'}</small>
      {(v.devis_ref || v.devis_montant) && col !== 'afaire' && (
        <small className="montant">{[v.devis_ref, v.devis_montant ? `${euros(Number(v.devis_montant))} HT` : null].filter(Boolean).join(' · ')}</small>
      )}
      <small>{ligne}</small>
    </button>
  )
}

function Actions({ v, col, fermer, fait }: { v: Visite; col: Col; fermer: () => void; fait: () => void }) {
  const auj = isoJour()
  const [ref, setRef] = useState(v.devis_ref ?? 'DE-000')
  const [montant, setMontant] = useState(v.devis_montant != null ? String(v.devis_montant) : '')
  const [envoi, setEnvoi] = useState(v.devis_envoye_le?.slice(0, 10) ?? auj)
  const [relance, setRelance] = useState(v.relance_prevue ?? ajouterJours(v.devis_envoye_le?.slice(0, 10) ?? auj, DELAI_RELANCE))
  const [perte, setPerte] = useState<'' | 'Refusé' | 'Sans suite'>('')
  const [motif, setMotif] = useState(v.motif_perte ?? '')
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)

  const montantNum = () => {
    const n = Number(montant.replace(/\s/g, '').replace(',', '.'))
    return montant.trim() && !isNaN(n) ? n : null
  }
  const refPropre = () => (ref.trim() && ref.trim() !== 'DE-000' ? ref.trim().toUpperCase() : null)

  async function maj(champs: Partial<Visite>) {
    setOccupe(true)
    const { error } = await supabase.from('visites').update({ ...champs, devis_maj_le: new Date().toISOString() }).eq('id', v.id)
    setOccupe(false)
    if (error) setErreur(erreurLisible(error))
    else fait()
  }

  const envoyer = () => maj({ rdv_statut: 'Devis envoyé', devis_ref: refPropre(), devis_montant: montantNum(), devis_envoye_le: new Date(envoi + 'T12:00:00').toISOString(), relance_prevue: relance || null })
  const relancee = () => maj({ relance_prevue: ajouterJours(auj, DELAI_RELANCE) })
  const signe = () => maj({ rdv_statut: 'Accepté', accepte_le: auj, devis_ref: refPropre(), devis_montant: montantNum() })
  const perdu = () => maj({ rdv_statut: perte || 'Sans suite', motif_perte: motif.trim() || null })
  const corriger = () => maj({ devis_ref: refPropre(), devis_montant: montantNum(), relance_prevue: relance || null })
  const rouvrir = () => maj({ rdv_statut: v.devis_envoye_le ? 'Devis envoyé' : 'Devis à faire', accepte_le: null, motif_perte: null })

  const champsDevis = (
    <div className="deux">
      <label>N° de devis<input value={ref} onChange={(e) => setRef(e.target.value)} /></label>
      <label>Montant HT (€)<input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="ex. 4 850" /></label>
    </div>
  )

  return (
    <div className="fond-modal" onClick={fermer}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="titre-ligne">
          <h2>{nomClient(v)}</h2>
          <Link className="lien" to={`/visites/${v.id}`}>Fiche de visite</Link>
        </div>
        <p className="sous">
          {[v.type_travaux, v.ville, v.date_rdv ? `visite du ${dateCourte(v.date_rdv)}` : null].filter(Boolean).join(' · ')}
          {v.telephone && <> · <a href={`tel:${v.telephone}`}>{v.telephone}</a></>}
          {v.email && <> · <a href={`mailto:${v.email}`}>{v.email}</a></>}
        </p>

        {perte ? (
          <>
            <div className="choix">
              {(['Refusé', 'Sans suite'] as const).map((p) => <button key={p} type="button" aria-pressed={perte === p} onClick={() => setPerte(p)}>{p}</button>)}
            </div>
            <label>Motif (facultatif)<input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Prix, concurrent retenu, projet reporté…" /></label>
            <div className="boutons">
              <button className="btn" onClick={() => setPerte('')}>Retour</button>
              <button className="btn danger" disabled={occupe} onClick={perdu}>Classer {perte.toLowerCase()}</button>
            </div>
          </>
        ) : col === 'afaire' ? (
          <>
            {champsDevis}
            <div className="deux">
              <label>Envoyé le<input type="date" value={envoi} onChange={(e) => { setEnvoi(e.target.value); setRelance(ajouterJours(e.target.value, DELAI_RELANCE)) }} /></label>
              <label>Relance prévue<input type="date" value={relance} onChange={(e) => setRelance(e.target.value)} /></label>
            </div>
            <div className="boutons">
              <button className="btn" onClick={() => setPerte('Sans suite')}>Sans suite</button>
              <button className="btn go" disabled={occupe} onClick={envoyer}>Devis envoyé ✓</button>
            </div>
          </>
        ) : col === 'envoye' || col === 'relancer' ? (
          <>
            {champsDevis}
            <label>Relance prévue<input type="date" value={relance} onChange={(e) => setRelance(e.target.value)} /></label>
            <div className="boutons colonne">
              <button className="btn go" disabled={occupe} onClick={signe}>Signé ✓</button>
              <button className={`btn ${col === 'relancer' ? 'pri' : ''}`} disabled={occupe} onClick={relancee}>Relance faite (prochaine dans {DELAI_RELANCE} j)</button>
              <div className="deux">
                <button className="btn" disabled={occupe} onClick={corriger}>Enregistrer</button>
                <button className="btn danger" onClick={() => setPerte('Refusé')}>Perdu…</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p>{v.rdv_statut}{v.accepte_le ? ` le ${dateCourte(v.accepte_le)}` : ''}{v.motif_perte ? ` · ${v.motif_perte}` : ''}</p>
            {champsDevis}
            <div className="boutons">
              <button className="btn" disabled={occupe} onClick={rouvrir}>Remettre en attente</button>
              <button className="btn pri" disabled={occupe} onClick={corriger}>Enregistrer</button>
            </div>
          </>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
        <button className="lien" onClick={fermer}>Fermer</button>
      </div>
    </div>
  )
}
