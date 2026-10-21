import { useEffect, useState } from 'react'
import { supabase, erreurLisible } from '../lib/supabase'
import { dateCourte, isoJour } from '../lib/format'
import { useAuth } from '../lib/auth'

interface C { id: string; du: string; au: string; motif: string; statut: string }
const MOTIFS = ['Congés payés', 'Récupération', 'Sans solde', 'Autre absence']
const ST: Record<string, string> = { demande: 'En attente', accepte: 'Accepté', refuse: 'Refusé' }

export default function MesConges() {
  const { membre } = useAuth()
  const [liste, setListe] = useState<C[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [f, setF] = useState({ du: '', au: '', motif: MOTIFS[0], commentaire: '' })
  const [erreur, setErreur] = useState('')
  const charger = () => membre && supabase.from('conges').select('id, du, au, motif, statut').eq('membre_id', membre.id).gte('au', isoJour(new Date(Date.now() - 90 * 864e5))).order('du', { ascending: false })
    .then(({ data }) => setListe((data ?? []) as C[]))
  useEffect(() => { charger() }, [membre?.id])

  async function demander(e: React.FormEvent) {
    e.preventDefault()
    if (!membre) return
    if (f.au < f.du) return setErreur('La date de fin est avant la date de début.')
    const { error } = await supabase.from('conges').insert({ membre_id: membre.id, du: f.du, au: f.au, motif: f.motif, commentaire: f.commentaire || null })
    if (error) return setErreur(erreurLisible(error))
    setOuvert(false)
    setF({ du: '', au: '', motif: MOTIFS[0], commentaire: '' })
    charger()
  }

  return (
    <section className="carte">
      <div className="titre-ligne"><h2>Mes congés</h2><button className="btn" onClick={() => setOuvert(!ouvert)}>{ouvert ? 'Fermer' : 'Demander un congé'}</button></div>
      {ouvert && (
        <form onSubmit={demander} className="pile">
          <div className="deux">
            <label>Du<input type="date" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value, au: f.au || e.target.value })} required /></label>
            <label>Au (inclus)<input type="date" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} required /></label>
          </div>
          <div className="choix">{MOTIFS.map((m) => <button type="button" key={m} aria-pressed={f.motif === m} onClick={() => setF({ ...f, motif: m })}>{m}</button>)}</div>
          <label>Commentaire (facultatif)<input value={f.commentaire} onChange={(e) => setF({ ...f, commentaire: e.target.value })} /></label>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="btn pri">Envoyer la demande</button>
        </form>
      )}
      {liste.length === 0 && !ouvert && <p className="sous">Aucun congé demandé.</p>}
      <ul className="liste-simple">
        {liste.map((c) => (
          <li key={c.id}>
            <span>{c.motif}<small>du {dateCourte(c.du)} au {dateCourte(c.au)}</small></span>
            <span className={`statut-demande ${c.statut === 'accepte' ? 'livree' : c.statut === 'refuse' ? 'annulee' : 'ouverte'}`}>{ST[c.statut]}</span>
            {c.statut === 'demande' && <button className="lien" onClick={async () => { await supabase.from('conges').delete().eq('id', c.id); charger() }}>Annuler</button>}
          </li>
        ))}
      </ul>
    </section>
  )
}
