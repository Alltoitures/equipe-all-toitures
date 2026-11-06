import { useEffect, useMemo, useState } from 'react'
import { supabase, erreurLisible, MOTIFS, MOTIF_PAYE, type Chantier, type Journee, type Motif } from '../lib/supabase'
import { ajouterJours, dateLongue, heureMaintenant, heuresJournee, hFormat, hhmm, isoJour, jourCourt, lundi, moisAnnee } from '../lib/format'
import { useAuth } from '../lib/auth'
import MesConges from '../components/MesConges'

type ChPointage = Pick<Chantier, 'id' | 'client_nom' | 'ville' | 'statut' | 'date_debut' | 'date_fin'> & { affecte: boolean }

function premierDuMois(s: string) { return s.slice(0, 8) + '01' }
function moisSuivant(s: string, n: number) {
  const [y, m] = s.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function Heures() {
  const { membre } = useAuth()
  const [jour, setJour] = useState(isoJour())
  const [semaine, setSemaine] = useState<Journee[]>([])
  const [chantiers, setChantiers] = useState<ChPointage[]>([])
  const [vue, setVue] = useState<'semaine' | 'mois'>('semaine')
  const [mois, setMois] = useState(premierDuMois(isoJour()))
  const [duMois, setDuMois] = useState<Journee[]>([])
  const [motif, setMotif] = useState<Motif>('chantier')
  const [depart, setDepart] = useState('')
  const [retour, setRetour] = useState('')
  const [pause, setPause] = useState(60)
  const [matin, setMatin] = useState('')
  const [aprem, setAprem] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [valide, setValide] = useState(false)
  const [msg, setMsg] = useState('')
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)

  const debut = lundi(jour)

  async function chargerSemaine() {
    if (!membre) return
    const { data } = await supabase
      .from('journees')
      .select('*, journee_chantiers(chantier_id, heures, periode)')
      .eq('membre_id', membre.id)
      .gte('jour', debut)
      .lte('jour', ajouterJours(debut, 6))
    setSemaine((data ?? []) as Journee[])
  }

  useEffect(() => {
    chargerSemaine()
  }, [debut, membre?.id])

  useEffect(() => {
    // Tous les chantiers ouverts (et terminés récemment), même sans affectation.
    supabase.rpc('chantiers_pointage').then(({ data }) => setChantiers((data ?? []) as ChPointage[]))
  }, [])

  async function chargerMois() {
    if (!membre) return
    const { data } = await supabase
      .from('journees')
      .select('*, journee_chantiers(chantier_id, heures)')
      .eq('membre_id', membre.id)
      .gte('jour', mois)
      .lt('jour', moisSuivant(mois, 1))
      .order('jour')
    setDuMois((data ?? []) as Journee[])
  }

  useEffect(() => {
    if (vue === 'mois') chargerMois()
  }, [vue, mois, membre?.id])

  // Remplit le formulaire avec la journée enregistrée.
  useEffect(() => {
    const j = semaine.find((x) => x.jour === jour)
    setMsg('')
    setErreur('')
    if (j) {
      setMotif(j.motif)
      setDepart(hhmm(j.depart) === '—' ? '' : hhmm(j.depart))
      setRetour(hhmm(j.retour) === '—' ? '' : hhmm(j.retour))
      setPause(j.pause_min)
      setCommentaire(j.commentaire ?? '')
      setValide(j.valide)
      const lignes = j.journee_chantiers ?? []
      const m = lignes.find((r) => r.periode === 'matin' || r.periode === 'journee') ?? lignes[0]
      const a = lignes.find((r) => r.periode === 'apres_midi' || r.periode === 'journee') ?? lignes[1] ?? m
      setMatin(m?.chantier_id ?? '')
      setAprem(a?.chantier_id ?? '')
    } else {
      setMotif('chantier')
      setDepart('')
      setRetour('')
      setPause(60)
      setCommentaire('')
      setValide(false)
      const duJour = chantiers.filter((c) => c.affecte && c.date_debut && c.date_debut <= jour && (c.date_fin ?? c.date_debut) >= jour)
      const defaut = duJour.length === 1 ? duJour[0].id : ''
      setMatin(defaut)
      setAprem(defaut)
    }
  }, [jour, semaine, chantiers])

  const total = heuresJournee(depart || null, retour || null, pause)
  // Matin = départ du dépôt → 12 h ; après-midi = le reste (pause déduite).
  const hMatin = depart ? Math.min(total, Math.max(0, 12 - hDecimal(depart))) : total / 2
  const hAprem = Math.max(0, total - hMatin)
  const deuxChantiers = !!matin && !!aprem && matin !== aprem
  const avecHoraires = MOTIF_PAYE[motif] && motif !== 'ecole' && motif !== 'intemperies_annulee'

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    if (!membre) return
    setErreur('')
    setMsg('')
    if (avecHoraires && (!depart || !retour)) return setErreur('Indiquez l\'heure de départ et de retour au dépôt.')
    if (motif === 'chantier' && !matin && !aprem) return setErreur('Indiquez sur quel chantier vous étiez le matin et l\'après-midi.')
    setOccupe(true)
    try {
      const { data, error } = await supabase
        .from('journees')
        .upsert(
          {
            membre_id: membre.id,
            jour,
            motif,
            depart: avecHoraires ? depart : null,
            retour: avecHoraires ? retour : null,
            pause_min: avecHoraires ? pause : 0,
            commentaire: commentaire || null
          },
          { onConflict: 'membre_id,jour' }
        )
        .select()
        .single()
      if (error) throw error
      await supabase.from('journee_chantiers').delete().eq('journee_id', data.id)
      const arrondi = (n: number) => Math.round(n * 100) / 100
      const lignes = !avecHoraires ? [] : matin && matin === aprem
        ? [{ journee_id: data.id, chantier_id: matin, heures: arrondi(total), periode: 'journee' }]
        : [
            ...(matin ? [{ journee_id: data.id, chantier_id: matin, heures: arrondi(aprem ? hMatin : total), periode: 'matin' }] : []),
            ...(aprem ? [{ journee_id: data.id, chantier_id: aprem, heures: arrondi(matin ? hAprem : total), periode: 'apres_midi' }] : [])
          ].filter((l) => l.heures > 0)
      if (lignes.length) {
        const r2 = await supabase.from('journee_chantiers').insert(lignes)
        if (r2.error) throw r2.error
      }
      setMsg('Journée enregistrée.')
      await chargerSemaine()
      if (vue === 'mois') await chargerMois()
    } catch (e) {
      setErreur(erreurLisible(e))
    } finally {
      setOccupe(false)
    }
  }

  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i)), [debut])
  const totalSemaine = semaine.reduce((s, j) => s + heuresJournee(j.depart, j.retour, j.pause_min), 0)
  const paniers = semaine.filter((j) => j.panier).length
  const nomChantier = (id: string) => chantiers.find((c) => c.id === id)?.client_nom ?? 'Chantier'

  return (
    <div className="page">
      <h1>Mes heures</h1>

      <div className="nav-jour">
        <button className="btn" onClick={() => setJour(ajouterJours(jour, -1))} aria-label="Jour précédent">‹</button>
        <strong>{dateLongue(jour)}</strong>
        <button className="btn" onClick={() => setJour(ajouterJours(jour, 1))} disabled={jour >= isoJour()} aria-label="Jour suivant">›</button>
      </div>

      <form className="carte" onSubmit={enregistrer}>
        {valide && <p className="ok">Journée validée par le gérant. Elle n'est plus modifiable.</p>}
        <fieldset disabled={valide} className="champs">
          <label>
            Type de journée
            <select value={motif} onChange={(e) => setMotif(e.target.value as Motif)}>
              {(Object.keys(MOTIFS) as Motif[])
                .filter((m) => m !== 'ecole' || membre?.role === 'apprenti')
                .map((m) => <option key={m} value={m}>{MOTIFS[m]}</option>)}
            </select>
          </label>

          {avecHoraires && (
            <>
              <div className="deux">
                <label>
                  Départ du dépôt
                  <input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} />
                  <button type="button" className="lien" onClick={() => setDepart(heureMaintenant())}>Maintenant</button>
                </label>
                <label>
                  Retour au dépôt
                  <input type="time" value={retour} onChange={(e) => setRetour(e.target.value)} />
                  <button type="button" className="lien" onClick={() => setRetour(heureMaintenant())}>Maintenant</button>
                </label>
              </div>
              <label>
                Pause déjeuner
                <select value={pause} onChange={(e) => setPause(Number(e.target.value))}>
                  {[0, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m === 0 ? 'Aucune' : `${m} min`}</option>)}
                </select>
              </label>
              <div className="total-jour"><span className="sous">Total de la journée</span><strong>{hFormat(total)}</strong></div>

              <h3>Où étiez-vous ?</h3>
              <div className="demi">
                <span className="lb">Matin{deuxChantiers && <small>{hFormat(hMatin)}</small>}</span>
                <ChoixChantier valeur={matin} chantiers={chantiers} nom={nomChantier} changer={(v) => { if (!aprem || aprem === matin) setAprem(v); setMatin(v) }} />
              </div>
              <div className="demi">
                <span className="lb">Après-midi{deuxChantiers && <small>{hFormat(hAprem)}</small>}</span>
                <ChoixChantier valeur={aprem} chantiers={chantiers} nom={nomChantier} changer={setAprem} />
              </div>
              {matin && matin === aprem && <p className="sous">Toute la journée sur {nomChantier(matin)}.</p>}
              <p className="aide">Chantier absent de la liste (dépannage, petit SAV) : choisissez le type « Dépôt » et précisez le lieu dans le commentaire.</p>
            </>
          )}

          <label>
            Commentaire (facultatif)
            <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
          </label>
        </fieldset>
        {erreur && <p className="erreur">{erreur}</p>}
        {msg && <p className="ok">{msg}</p>}
        {!valide && <button className="btn pri large" disabled={occupe}>{occupe ? 'Enregistrement…' : 'Enregistrer la journée'}</button>}
      </form>

      <nav className="onglets-fiche" role="tablist">
        <button role="tab" aria-selected={vue === 'semaine'} onClick={() => setVue('semaine')}>Semaine</button>
        <button role="tab" aria-selected={vue === 'mois'} onClick={() => { setMois(premierDuMois(jour)); setVue('mois') }}>Mois</button>
      </nav>

      {vue === 'semaine' && (
        <section className="carte">
          <div className="nav-jour">
            <button className="btn" onClick={() => setJour(ajouterJours(debut, -7))} aria-label="Semaine précédente">‹</button>
            <h2>Semaine du {jourCourt(debut)}</h2>
            <button className="btn" onClick={() => { const n = ajouterJours(debut, 7); setJour(n > isoJour() ? isoJour() : n) }} disabled={ajouterJours(debut, 7) > isoJour()} aria-label="Semaine suivante">›</button>
          </div>
          <table className="tableau">
            <thead><tr><th>Jour</th><th>Type</th><th className="d">Heures</th><th>Panier</th><th></th></tr></thead>
            <tbody>
              {jours.map((d) => {
                const j = semaine.find((x) => x.jour === d)
                return (
                  <tr key={d} className={d === jour ? 'actif' : ''} onClick={() => d <= isoJour() && setJour(d)}>
                    <td>{jourCourt(d)}</td>
                    <td>{j ? MOTIFS[j.motif].split(' (')[0] : <span className="sous">—</span>}</td>
                    <td className="d">{j ? hFormat(heuresJournee(j.depart, j.retour, j.pause_min)) : ''}</td>
                    <td>{j?.panier ? 'Oui' : ''}</td>
                    <td>{j?.valide ? '✓' : ''}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr><td colSpan={2}>Total</td><td className="d">{hFormat(totalSemaine)}</td><td>{paniers}</td><td></td></tr></tfoot>
          </table>
          <p className="aide">Touchez un jour pour le saisir ou le corriger. ✓ = validé.</p>
        </section>
      )}

      {vue === 'mois' && <VueMois mois={mois} journees={duMois} nomChantier={nomChantier}
        changerMois={(n) => setMois(moisSuivant(mois, n))}
        ouvrirSemaine={(l) => { setJour(l < mois ? mois : l); setVue('semaine') }} />}

      <MesConges />
    </div>
  )
}

function hDecimal(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h + (m || 0) / 60
}

function ChoixChantier({ valeur, chantiers, nom, changer }: { valeur: string; chantiers: ChPointage[]; nom: (id: string) => string; changer: (v: string) => void }) {
  const mes = chantiers.filter((c) => c.affecte)
  const autres = chantiers.filter((c) => !c.affecte)
  return (
    <select value={valeur} onChange={(e) => changer(e.target.value)}>
      <option value="">Choisir le chantier…</option>
      {mes.length > 0 && (
        <optgroup label="Mes chantiers">
          {mes.map((c) => <option key={c.id} value={c.id}>{c.client_nom}{c.ville ? ` (${c.ville})` : ''}</option>)}
        </optgroup>
      )}
      <optgroup label={mes.length ? 'Autres chantiers' : 'Chantiers'}>
        {autres.map((c) => <option key={c.id} value={c.id}>{c.client_nom}{c.ville ? ` (${c.ville})` : ''}</option>)}
      </optgroup>
      {valeur && !chantiers.some((c) => c.id === valeur) && <option value={valeur}>{nom(valeur)}</option>}
    </select>
  )
}

function VueMois({ mois, journees, nomChantier, changerMois, ouvrirSemaine }: {
  mois: string
  journees: Journee[]
  nomChantier: (id: string) => string
  changerMois: (n: number) => void
  ouvrirSemaine: (lundi: string) => void
}) {
  const h = (j: Journee) => heuresJournee(j.depart, j.retour, j.pause_min)
  const semaines = new Map<string, Journee[]>()
  for (const j of journees) {
    const l = lundi(j.jour)
    semaines.set(l, [...(semaines.get(l) ?? []), j])
  }
  const parChantier = new Map<string, number>()
  for (const j of journees) for (const r of j.journee_chantiers ?? []) parChantier.set(r.chantier_id, (parChantier.get(r.chantier_id) ?? 0) + Number(r.heures))
  const parMotif = new Map<Motif, number>()
  for (const j of journees) parMotif.set(j.motif, (parMotif.get(j.motif) ?? 0) + 1)
  const total = journees.reduce((s, j) => s + h(j), 0)
  const paniers = journees.filter((j) => j.panier).length
  const aValider = journees.filter((j) => !j.valide).length
  const actuel = mois >= isoJour().slice(0, 8) + '01'

  return (
    <>
      <section className="carte">
        <div className="nav-jour">
          <button className="btn" onClick={() => changerMois(-1)} aria-label="Mois précédent">‹</button>
          <h2>{moisAnnee(mois)}</h2>
          <button className="btn" onClick={() => changerMois(1)} disabled={actuel} aria-label="Mois suivant">›</button>
        </div>
        <div className="chiffres">
          <div><strong>{hFormat(total)}</strong><small>heures</small></div>
          <div><strong>{journees.filter((j) => MOTIF_PAYE[j.motif]).length}</strong><small>jours</small></div>
          <div><strong>{paniers}</strong><small>paniers</small></div>
        </div>
        {aValider > 0 && <p className="aide">{aValider} jour{aValider > 1 ? 's' : ''} pas encore validé{aValider > 1 ? 's' : ''} par le bureau.</p>}
      </section>

      <section className="carte">
        <h2>Par semaine</h2>
        {semaines.size === 0 && <p className="sous">Aucune journée saisie ce mois-ci.</p>}
        <table className="tableau">
          {semaines.size > 0 && <thead><tr><th>Semaine</th><th className="d">Jours</th><th className="d">Heures</th><th className="d">Paniers</th></tr></thead>}
          <tbody>
            {[...semaines.entries()].map(([l, js]) => (
              <tr key={l} onClick={() => ouvrirSemaine(l)}>
                <td>Sem. du {jourCourt(l)}</td>
                <td className="d">{js.length}</td>
                <td className="d">{hFormat(js.reduce((s, j) => s + h(j), 0))}</td>
                <td className="d">{js.filter((j) => j.panier).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {parChantier.size > 0 && (
        <section className="carte">
          <h2>Par chantier</h2>
          <table className="tableau">
            <tbody>
              {[...parChantier.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                <tr key={id}><td>{nomChantier(id)}</td><td className="d">{hFormat(n)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {parMotif.size > 0 && (
        <section className="carte">
          <h2>Par type de journée</h2>
          <table className="tableau">
            <tbody>
              {[...parMotif.entries()].map(([m, n]) => (
                <tr key={m}><td>{MOTIFS[m].split(' (')[0]}</td><td className="d">{n} jour{n > 1 ? 's' : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
