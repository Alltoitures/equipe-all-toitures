import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ETATS_REAL, type Realisation } from '../lib/realisation'

/** Sur un chantier terminé (gérant) : demander la création d'une réalisation sur alltoitures.com. */
export default function RealisationCarte({ chantierId }: { chantierId: string }) {
  const { membre } = useAuth()
  const [r, setR] = useState<Pick<Realisation, 'id' | 'statut' | 'url'> | null | undefined>(undefined)
  const [ouvert, setOuvert] = useState(false)
  const [note, setNote] = useState('')
  const [temoignage, setTemoignage] = useState('')
  const [temoin, setTemoin] = useState('')
  const [erreur, setErreur] = useState('')
  const [test, setTest] = useState('')
  async function tester() {
    setTest('Test en cours…')
    const { data } = await supabase.functions.invoke('realisation', { body: { action: 'diagnostic' } })
    setTest(data?.identifiants?.startsWith?.('ok') ? `Accès au site OK ${data.identifiants.slice(2)}` : data?.identifiants === 'absents' ? 'Identifiants du site pas encore enregistrés dans Supabase.' : `Accès refusé : ${data?.identifiants ?? data?.erreur ?? 'erreur'}`)
  }

  useEffect(() => {
    supabase.from('realisations').select('id, statut, url').eq('chantier_id', chantierId).maybeSingle().then(({ data }) => setR(data as any))
  }, [chantierId])

  async function demander(e: React.FormEvent) {
    e.preventDefault()
    const vide = (s: string) => s.trim() || null
    const { data, error } = await supabase
      .from('realisations')
      .insert({ chantier_id: chantierId, note: vide(note), temoignage: vide(temoignage), temoin: vide(temoin), created_by: membre?.id })
      .select('id, statut, url')
      .single()
    if (error) return setErreur(erreurLisible(error))
    setR(data as any)
    setOuvert(false)
  }

  if (r === undefined) return null
  return (
    <section className="carte">
      <h2>Réalisation sur le site</h2>
      {!r && (
        <>
          <p className="sous">Je prépare la fiche « Réalisations » d'alltoitures.com (texte + photos du dossier OneDrive). Vous la relisez ici avant toute publication.</p>
          <button className="btn pri large" onClick={() => setOuvert(true)}>Publier en réalisation</button>
          <button type="button" className="lien" onClick={tester}>Tester l'accès au site</button>
          {test && <p className="sous">{test}</p>}
        </>
      )}
      {r && (
        <Link to={`/gestion/realisations/${r.id}`} className="ligne-simple">
          <span>{ETATS_REAL[r.statut]}</span>
          <span>{r.statut === 'brouillon' ? 'Relire ›' : '›'}</span>
        </Link>
      )}
      {r?.url && <a className="lien" href={r.url} target="_blank" rel="noreferrer">Voir la page sur le site</a>}

      {ouvert && (
        <div className="fond-modal" onClick={() => setOuvert(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={demander}>
            <h2>Publier en réalisation</h2>
            <label>
              Points à mettre en avant <small className="sous">(facultatif)</small>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. charpente taillée à l'atelier, délai tenu, tuile Oméga 10…" />
            </label>
            <label>
              Témoignage du client <small className="sous">(facultatif)</small>
              <textarea rows={3} value={temoignage} onChange={(e) => setTemoignage(e.target.value)} />
            </label>
            <label>Signé par<input value={temoin} onChange={(e) => setTemoin(e.target.value)} placeholder="M. et Mme D., Brignais" /></label>
            <p className="aide">Le brouillon arrive dans l'heure dans « À faire ». Rien n'est publié sans votre validation.</p>
            {erreur && <p className="erreur">{erreur}</p>}
            <div className="boutons">
              <button type="button" className="btn" onClick={() => setOuvert(false)}>Annuler</button>
              <button className="btn pri">Demander le brouillon</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
