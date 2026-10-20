import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { TYPES_TRAVAUX, nbReponses, type Visite } from '../lib/visite'
import { dateCourte, isoJour, normaliserTel } from '../lib/format'
import { useAuth } from '../lib/auth'

const STATUT_VISITE = { a_faire: 'À faire', en_cours: 'En cours', terminee: 'Terminée' }

export default function Visites() {
  const [liste, setListe] = useState<Visite[]>([])
  const [charge, setCharge] = useState(false)
  const [nouvelle, setNouvelle] = useState(false)

  useEffect(() => {
    supabase
      .from('visites')
      .select('*')
      .or(`statut.neq.terminee,terminee_le.gte.${isoJour(new Date(Date.now() - 45 * 864e5))}`)
      .order('date_rdv', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        setListe((data ?? []) as Visite[])
        setCharge(true)
      })
  }, [])

  const auj = isoJour()
  const aFaire = liste.filter((v) => v.statut !== 'terminee')
  const duJour = aFaire.filter((v) => v.date_rdv === auj)
  const aVenir = aFaire.filter((v) => !v.date_rdv || v.date_rdv > auj)
  const enRetard = aFaire.filter((v) => v.date_rdv && v.date_rdv < auj)
  const faites = liste.filter((v) => v.statut === 'terminee').reverse()

  const bloc = (titre: string, l: Visite[], accent?: boolean) =>
    l.length > 0 && (
      <section className="groupe">
        <h2>{titre}</h2>
        {l.map((v) => (
          <Link key={v.id} to={`/visites/${v.id}`} className={accent ? 'ligne-chantier accent' : 'ligne-chantier'}>
            <div>
              <strong>{v.client_nom}</strong>
              <span className="sous">{[v.ville, v.type_travaux].filter(Boolean).join(' · ') || '—'}</span>
              {v.statut === 'terminee' && (
                <span className="sous">{v.traitee_le ? 'Fiche de visite prête' : 'Fiche de visite en préparation…'}</span>
              )}
            </div>
            <div className="droite">
              <span className={`pastille ${v.statut === 'terminee' ? 'termine' : v.statut === 'en_cours' ? 'en_cours' : 'a_venir'}`}>{STATUT_VISITE[v.statut]}</span>
              <span className="sous">{v.date_rdv ? dateCourte(v.date_rdv) : 'Sans date'}{v.heure ? ` · ${v.heure}` : ''}</span>
              {v.statut === 'en_cours' && <span className="sous">{nbReponses(v.fiche ?? {})} réponses</span>}
            </div>
          </Link>
        ))}
      </section>
    )

  return (
    <div className="page">
      <div className="titre-ligne">
        <h1>Visites</h1>
        <button className="btn pri" onClick={() => setNouvelle(true)}>+ Visite</button>
      </div>
      {!charge && <p className="sous">Chargement…</p>}
      {charge && liste.length === 0 && (
        <div className="vide">Aucune visite. Les rendez-vous de votre agenda arrivent ici automatiquement depuis le Pilotage, ou créez-en une avec « + Visite ».</div>
      )}
      {bloc("Aujourd'hui", duJour, true)}
      {bloc('À compléter', enRetard)}
      {bloc('À venir', aVenir)}
      {bloc('Terminées (45 derniers jours)', faites)}
      {nouvelle && <NouvelleVisite fermer={() => setNouvelle(false)} />}
    </div>
  )
}

function NouvelleVisite({ fermer }: { fermer: () => void }) {
  const nav = useNavigate()
  const { membre } = useAuth()
  const [f, setF] = useState({ client_nom: '', telephone: '', adresse: '', code_postal: '', ville: '', type_travaux: '', date_rdv: isoJour(), heure: '' })
  const [erreur, setErreur] = useState('')
  const champ = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) })

  async function creer(e: React.FormEvent) {
    e.preventDefault()
    const vide = (s: string) => s.trim() || null
    const { data, error } = await supabase
      .from('visites')
      .insert({
        client_nom: f.client_nom.trim(),
        telephone: f.telephone ? normaliserTel(f.telephone) : null,
        adresse: vide(f.adresse), code_postal: vide(f.code_postal), ville: vide(f.ville),
        type_travaux: vide(f.type_travaux), date_rdv: f.date_rdv || null, heure: vide(f.heure),
        created_by: membre?.id
      })
      .select('id')
      .single()
    if (error) return setErreur(erreurLisible(error))
    nav(`/visites/${data.id}`)
  }

  return (
    <div className="fond-modal" onClick={fermer}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={creer}>
        <h2>Nouvelle visite</h2>
        <label>Client<input {...champ('client_nom')} required placeholder="Mr DUPONT" /></label>
        <label>Téléphone<input type="tel" {...champ('telephone')} /></label>
        <label>Adresse<input {...champ('adresse')} /></label>
        <div className="deux">
          <label>Code postal<input inputMode="numeric" {...champ('code_postal')} /></label>
          <label>Ville<input {...champ('ville')} /></label>
        </div>
        <label>
          Type de travaux
          <select {...champ('type_travaux')}>
            <option value="">—</option>
            {TYPES_TRAVAUX.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <div className="deux">
          <label>Date<input type="date" {...champ('date_rdv')} /></label>
          <label>Heure<input {...champ('heure')} placeholder="14h00" /></label>
        </div>
        <p className="aide">Elle sera ajoutée au Pilotage à la fin de la visite.</p>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="boutons">
          <button type="button" className="btn" onClick={fermer}>Annuler</button>
          <button className="btn pri">Commencer</button>
        </div>
      </form>
    </div>
  )
}
