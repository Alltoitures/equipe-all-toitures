import { useEffect, useState } from 'react'
import { supabase, erreurLisible, MOTIFS, type Journee, type Membre, type Motif } from '../../lib/supabase'
import { ajouterJours, heuresJournee, hFormat, hhmm, isoJour, jourCourt, lundi } from '../../lib/format'
import { useAuth } from '../../lib/auth'

const COURT: Record<Motif, string> = {
  chantier: 'Chantier', depot: 'Dépôt', intemperies_commencee: 'Intempéries', intemperies_annulee: 'Intemp. annulée', ecole: 'École', absence: 'Absence'
}

export default function ValidationHeures() {
  const { membre: moi } = useAuth()
  const [debut, setDebut] = useState(lundi(ajouterJours(isoJour(), -7)))
  const [membres, setMembres] = useState<Membre[]>([])
  const [journees, setJournees] = useState<Journee[]>([])
  const [edition, setEdition] = useState<{ m: Membre; jour: string; j?: Journee } | null>(null)
  const [msg, setMsg] = useState('')

  const jours = Array.from({ length: 6 }, (_, i) => ajouterJours(debut, i))

  async function charger() {
    const [m, j] = await Promise.all([
      supabase.from('membres').select('*').eq('actif', true).neq('role', 'gerant').order('prenom'),
      supabase.from('journees').select('*, journee_chantiers(heures, chantiers(client_nom))').gte('jour', debut).lte('jour', ajouterJours(debut, 6))
    ])
    setMembres((m.data ?? []) as Membre[])
    setJournees((j.data ?? []) as never)
  }
  useEffect(() => {
    charger()
  }, [debut])

  async function valider(ids: string[]) {
    if (!ids.length || !moi) return
    const { error } = await supabase.from('journees').update({ valide: true, valide_par: moi.id, valide_le: new Date().toISOString() }).in('id', ids)
    setMsg(error ? erreurLisible(error) : `${ids.length} journée${ids.length > 1 ? 's' : ''} validée${ids.length > 1 ? 's' : ''}.`)
    charger()
  }

  const nonValidees = journees.filter((j) => !j.valide).map((j) => j.id)

  return (
    <div className="page">
      <h1>Validation des heures</h1>
      <div className="nav-jour">
        <button className="btn" onClick={() => setDebut(ajouterJours(debut, -7))}>‹</button>
        <strong>Semaine du {jourCourt(debut)}</strong>
        <button className="btn" onClick={() => setDebut(ajouterJours(debut, 7))} disabled={debut >= lundi()}>›</button>
      </div>
      {msg && <p className="ok">{msg}</p>}
      <button className="btn pri large" disabled={!nonValidees.length} onClick={() => valider(nonValidees)}>
        {nonValidees.length ? `Valider toute la semaine (${nonValidees.length} journées)` : 'Semaine entièrement validée'}
      </button>

      {membres.map((m) => {
        const sienne = journees.filter((j) => j.membre_id === m.id)
        const total = sienne.reduce((s, j) => s + heuresJournee(j.depart, j.retour, j.pause_min), 0)
        const paniers = sienne.filter((j) => j.panier).length
        const aValider = sienne.filter((j) => !j.valide).map((j) => j.id)
        return (
          <section key={m.id} className="carte">
            <div className="titre-ligne">
              <h2>{m.prenom} {m.nom}</h2>
              <span className="sous">{hFormat(total)} · {paniers} panier{paniers > 1 ? 's' : ''}</span>
            </div>
            <table className="tableau">
              <tbody>
                {jours.map((d) => {
                  const j = sienne.find((x) => x.jour === d)
                  const manquant = !j && d < isoJour() && d !== ajouterJours(debut, 5)
                  return (
                    <tr key={d} onClick={() => setEdition({ m, jour: d, j })} className={manquant ? 'manquant' : ''}>
                      <td>{jourCourt(d)}</td>
                      <td>
                        {j ? COURT[j.motif] : manquant ? 'Non saisi' : '—'}
                        {j?.journee_chantiers?.length ? <small className="sous"> {j.journee_chantiers.map((r) => `${r.chantiers?.client_nom} ${r.heures} h`).join(', ')}</small> : null}
                      </td>
                      <td className="d">{j ? `${hhmm(j.depart)}–${hhmm(j.retour)}` : ''}</td>
                      <td className="d">{j ? hFormat(heuresJournee(j.depart, j.retour, j.pause_min)) : ''}</td>
                      <td>{j?.panier ? 'P' : ''}</td>
                      <td>{j?.valide ? '✓' : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {aValider.length > 0 && <button className="btn" onClick={() => valider(aValider)}>Valider pour {m.prenom}</button>}
          </section>
        )
      })}

      {edition && <EditionJour {...edition} fermer={() => { setEdition(null); charger() }} />}
    </div>
  )
}

function EditionJour({ m, jour, j, fermer }: { m: Membre; jour: string; j?: Journee; fermer: () => void }) {
  const [motif, setMotif] = useState<Motif>(j?.motif ?? 'chantier')
  const [depart, setDepart] = useState(j?.depart?.slice(0, 5) ?? '07:00')
  const [retour, setRetour] = useState(j?.retour?.slice(0, 5) ?? '17:00')
  const [pause, setPause] = useState(j?.pause_min ?? 60)
  const [panier, setPanier] = useState<'auto' | 'oui' | 'non'>(j?.panier_manuel ? (j.panier ? 'oui' : 'non') : 'auto')
  const [erreur, setErreur] = useState('')

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    const sansHoraires = motif === 'absence' || motif === 'ecole' || motif === 'intemperies_annulee'
    const ligne = {
      membre_id: m.id, jour, motif,
      depart: sansHoraires ? null : depart, retour: sansHoraires ? null : retour, pause_min: sansHoraires ? 0 : pause,
      panier_manuel: panier !== 'auto', panier: panier === 'oui'
    }
    const { error } = await supabase.from('journees').upsert(ligne, { onConflict: 'membre_id,jour' })
    if (error) return setErreur(erreurLisible(error))
    fermer()
  }

  async function supprimer() {
    if (!j || !confirm('Supprimer cette journée ?')) return
    await supabase.from('journees').delete().eq('id', j.id)
    fermer()
  }

  return (
    <div className="fond-modal" onClick={fermer}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
        <h2>{m.prenom} · {jourCourt(jour)}</h2>
        <label>
          Type
          <select value={motif} onChange={(e) => setMotif(e.target.value as Motif)}>
            {(Object.keys(MOTIFS) as Motif[]).map((x) => <option key={x} value={x}>{MOTIFS[x]}</option>)}
          </select>
        </label>
        <div className="deux">
          <label>Départ<input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} /></label>
          <label>Retour<input type="time" value={retour} onChange={(e) => setRetour(e.target.value)} /></label>
        </div>
        <label>Pause (min)<input inputMode="numeric" value={pause} onChange={(e) => setPause(Number(e.target.value) || 0)} /></label>
        <label>
          Panier repas
          <select value={panier} onChange={(e) => setPanier(e.target.value as never)}>
            <option value="auto">Automatique (selon le type)</option>
            <option value="oui">Forcer : oui</option>
            <option value="non">Forcer : non</option>
          </select>
        </label>
        {j?.commentaire && <p className="sous">Commentaire : {j.commentaire}</p>}
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="boutons">
          {j && <button type="button" className="btn danger" onClick={supprimer}>Supprimer</button>}
          <button type="button" className="btn" onClick={fermer}>Annuler</button>
          <button className="btn pri">Enregistrer</button>
        </div>
      </form>
    </div>
  )
}
