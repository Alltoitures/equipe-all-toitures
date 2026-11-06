import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, erreurLisible, MOTIFS, type Journee, type Membre, type Motif } from '../../lib/supabase'
import { ajouterJours, depuisIso, heuresJournee, hFormat, hhmm, isoJour, jourCourt, lundi } from '../../lib/format'
import { useAuth } from '../../lib/auth'

const COURT: Record<Motif, string> = {
  chantier: 'Chantier', depot: 'Dépôt', intemperies_commencee: 'Intempéries', intemperies_annulee: 'Intemp. annulée', ecole: 'École', absence: 'Absence'
}
type Ligne = NonNullable<Journee['journee_chantiers']>[number]
interface Conge { membre_id: string; du: string; au: string }

const nomCh = (r?: Ligne) => (r?.chantiers ? `${r.chantiers.client_nom}${r.chantiers.ville ? ` · ${r.chantiers.ville}` : ''}` : '')

// Matin / après-midi d'une journée, y compris les anciennes saisies sans demi-journée.
function demiJournees(j: Journee): { matin: string; aprem: string } {
  const l = j.journee_chantiers ?? []
  if (!l.length) return { matin: COURT[j.motif], aprem: COURT[j.motif] }
  const m = l.find((r) => r.periode === 'matin' || r.periode === 'journee') ?? l[0]
  const a = l.find((r) => r.periode === 'apres_midi' || r.periode === 'journee') ?? l[1] ?? m
  return { matin: nomCh(m), aprem: nomCh(a) }
}

export default function ValidationHeures() {
  const { membre: moi } = useAuth()
  const [params, setParams] = useSearchParams()
  const debut = lundi(params.get('s') ?? ajouterJours(isoJour(), -7))
  const [membres, setMembres] = useState<Membre[]>([])
  const [journees, setJournees] = useState<Journee[]>([])
  const [conges, setConges] = useState<Conge[]>([])
  const [edition, setEdition] = useState<{ m: Membre; jour: string; j?: Journee } | null>(null)
  const [msg, setMsg] = useState('')
  const [occupe, setOccupe] = useState(false)

  const fin = ajouterJours(debut, 6)
  const jours = Array.from({ length: 6 }, (_, i) => ajouterJours(debut, i))

  async function charger() {
    const [m, j, c] = await Promise.all([
      supabase.from('membres').select('*').eq('actif', true).neq('role', 'gerant').order('prenom'),
      supabase.from('journees').select('*, journee_chantiers(heures, periode, chantiers(client_nom, ville))').gte('jour', debut).lte('jour', fin),
      supabase.from('conges').select('membre_id, du, au').eq('statut', 'accepte').lte('du', fin).gte('au', debut)
    ])
    setMembres((m.data ?? []) as Membre[])
    setJournees((j.data ?? []) as never)
    setConges((c.data ?? []) as Conge[])
  }
  useEffect(() => { charger() }, [debut])

  const enConge = (mid: string, d: string) => conges.some((c) => c.membre_id === mid && c.du <= d && c.au >= d)
  const manquants = (mid: string) =>
    jours.filter((d) => d < isoJour() && depuisIso(d).getDay() !== 6 && !enConge(mid, d) && !journees.some((j) => j.membre_id === mid && j.jour === d))
  const etat = (mid: string): 'manque' | 'a-valider' | 'valide' | 'rien' => {
    const siennes = journees.filter((j) => j.membre_id === mid)
    if (manquants(mid).length) return 'manque'
    if (siennes.some((j) => !j.valide)) return 'a-valider'
    return siennes.length ? 'valide' : 'rien'
  }

  // Collaborateur affiché : celui de l'URL (notification), sinon le premier à valider.
  const choisi = useMemo(() => {
    const id = params.get('m')
    return membres.find((m) => m.id === id) ?? membres.find((m) => etat(m.id) === 'a-valider') ?? membres.find((m) => etat(m.id) === 'manque') ?? membres[0]
  }, [membres, journees, params])

  function aller(o: { s?: string; m?: string }) {
    const p = new URLSearchParams(params)
    if (o.s) p.set('s', o.s)
    if (o.m) p.set('m', o.m)
    setParams(p, { replace: true })
    setMsg('')
  }

  async function valider(ids: string[], suivant = false) {
    if (!ids.length || !moi) return
    setOccupe(true)
    const { error } = await supabase.from('journees').update({ valide: true, valide_par: moi.id, valide_le: new Date().toISOString() }).in('id', ids)
    setOccupe(false)
    if (error) return setMsg(erreurLisible(error))
    setMsg(`${ids.length} journée${ids.length > 1 ? 's' : ''} validée${ids.length > 1 ? 's' : ''}.`)
    await charger()
    if (suivant && choisi) {
      const prochain = membres.find((m) => m.id !== choisi.id && journees.some((j) => j.membre_id === m.id && !j.valide))
      if (prochain) aller({ m: prochain.id })
    }
  }

  const siennes = choisi ? journees.filter((j) => j.membre_id === choisi.id) : []
  const total = siennes.reduce((s, j) => s + heuresJournee(j.depart, j.retour, j.pause_min), 0)
  const paniers = siennes.filter((j) => j.panier).length
  const aValider = siennes.filter((j) => !j.valide).map((j) => j.id)
  const toutes = journees.filter((j) => !j.valide).map((j) => j.id)

  return (
    <div className="page">
      <div className="entete-page">
        <div>
          <h1>Heures à valider</h1>
          <span className="sous">Semaine du {jourCourt(debut)} au {jourCourt(ajouterJours(debut, 5))}</span>
        </div>
        <div className="boutons">
          <button className="btn mini" onClick={() => aller({ s: ajouterJours(debut, -7) })} aria-label="Semaine précédente">‹</button>
          <button className="btn mini" onClick={() => aller({ s: ajouterJours(debut, 7) })} disabled={debut >= lundi()} aria-label="Semaine suivante">›</button>
        </div>
      </div>

      <div className="collabs" role="list">
        {membres.map((m) => {
          const e = etat(m.id)
          return (
            <button key={m.id} className="collab" aria-pressed={choisi?.id === m.id} onClick={() => aller({ m: m.id })}>
              {e !== 'rien' && <i className={`point ${e}`} />}
              <b className="av">{m.prenom[0]}{m.nom?.[0] ?? ''}</b>
              <span>{m.prenom}</span>
            </button>
          )
        })}
      </div>
      <p className="aide">Point orange : à valider · rouge : jour non saisi · vert : semaine validée.</p>

      {msg && <p className="ok">{msg}</p>}

      {choisi && (
        <>
          <section className="carte">
            <div className="titre-ligne">
              <h2>{choisi.prenom} {choisi.nom}</h2>
              {aValider.length === 0 && siennes.length > 0 && <span className="etat-val v">Semaine validée</span>}
            </div>
            <div className="recap-semaine">
              <div><strong>{hFormat(total)}</strong><small>Heures</small></div>
              <div><strong>{siennes.filter((j) => j.motif !== 'absence').length}</strong><small>Jours</small></div>
              <div><strong>{paniers}</strong><small>Paniers</small></div>
            </div>
          </section>

          <div className="jours-val">
            {jours.map((d) => {
              const j = siennes.find((x) => x.jour === d)
              const date = depuisIso(d)
              const conge = enConge(choisi.id, d)
              const manque = !j && manquants(choisi.id).includes(d)
              if (!j && !manque && !conge && date.getDay() === 6) return null
              const dj = j ? demiJournees(j) : null
              return (
                <button key={d} className={`jour-val${manque ? ' manque' : ''}${j?.valide ? ' ok-val' : ''}`} onClick={() => setEdition({ m: choisi, jour: d, j })}>
                  <span className="date"><small>{date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</small><b>{date.getDate()}</b></span>
                  <span className="ou">
                    {j && dj ? (
                      dj.matin === dj.aprem ? (
                        <span className="l"><em>JOUR</em><span>{dj.matin}</span></span>
                      ) : (
                        <>
                          <span className="l"><em>MAT</em><span>{dj.matin || '—'}</span></span>
                          <span className="l"><em>AM</em><span>{dj.aprem || '—'}</span></span>
                        </>
                      )
                    ) : (
                      <span className="l"><span>{manque ? 'Non saisi' : conge ? 'Congé' : '—'}</span></span>
                    )}
                    {j && j.depart && <span className="h">{hhmm(j.depart)} → {hhmm(j.retour)}{j.pause_min ? ` · pause ${j.pause_min} min` : ''}{j.panier ? ' · panier' : ''}</span>}
                    {j?.commentaire && <span className="h">« {j.commentaire} »</span>}
                  </span>
                  <span className="fin">
                    <strong>{j ? hFormat(heuresJournee(j.depart, j.retour, j.pause_min)) : ''}</strong>
                    {j && <span className={`etat-val ${j.valide ? 'v' : 'a'}`}>{j.valide ? 'Validé' : 'À valider'}</span>}
                  </span>
                </button>
              )
            })}
          </div>

          {aValider.length > 0 && (
            <div className="barre-valider">
              <button className="btn go large" disabled={occupe} onClick={() => valider(aValider, true)}>
                {occupe ? 'Validation…' : `Valider la semaine de ${choisi.prenom} (${aValider.length} j)`}
              </button>
            </div>
          )}
        </>
      )}

      {toutes.length > aValider.length && (
        <button className="lien" onClick={() => confirm(`Valider les ${toutes.length} journées de toute l'équipe ?`) && valider(toutes)}>
          Tout valider pour l'équipe ({toutes.length} journées)
        </button>
      )}

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
