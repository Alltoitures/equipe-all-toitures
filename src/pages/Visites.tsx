import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { STATUTS_RDV, TYPES_TRAVAUX, nbReponses, statutRdv, type Visite } from '../lib/visite'
import { ajouterJours, dateCourte, dateLongue, isoJour, normaliserTel } from '../lib/format'
import { useAuth } from '../lib/auth'

/** « 9h30 », « 14H00 », « 16:30 » -> minutes depuis minuit (null si inconnue). */
export function minutesHeure(h: string | null | undefined): number | null {
  const m = h?.match(/(\d{1,2})\s*[hH:]\s*(\d{2})?/)
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null
}
export function heureAffichee(h: string | null | undefined): string {
  const n = minutesHeure(h)
  return n == null ? '—' : `${Math.floor(n / 60)}h${String(n % 60).padStart(2, '0')}`
}
const ordreRdv = (a: Visite, b: Visite) =>
  (a.date_rdv ?? '9999').localeCompare(b.date_rdv ?? '9999') || (minutesHeure(a.heure) ?? 9999) - (minutesHeure(b.heure) ?? 9999)

export default function Visites() {
  const [liste, setListe] = useState<Visite[]>([])
  const [charge, setCharge] = useState(false)
  const [nouvelle, setNouvelle] = useState(false)
  const [filtre, setFiltre] = useState<string | null>(null)

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
  const comptes = STATUTS_RDV.map((s) => ({ ...s, n: liste.filter((v) => statutRdv(v).nom === s.nom).length })).filter((s) => s.n > 0)
  const visibles = filtre ? liste.filter((v) => statutRdv(v).nom === filtre) : liste
  const aFaire = visibles.filter((v) => v.statut !== 'terminee').sort(ordreRdv)
  const duJour = aFaire.filter((v) => v.date_rdv === auj)
  const aVenir = aFaire.filter((v) => !v.date_rdv || v.date_rdv > auj)
  const enRetard = aFaire.filter((v) => v.date_rdv && v.date_rdv < auj)
  const faites = visibles.filter((v) => v.statut === 'terminee').sort(ordreRdv).reverse()

  const bloc = (titre: string, l: Visite[], accent?: boolean) =>
    l.length > 0 && (
      <section className="groupe">
        <h2>{titre}</h2>
        {l.map((v) => (
          <Link key={v.id} to={`/visites/${v.id}`} className={`ligne-chantier rdv ${statutRdv(v).classe}${accent ? ' accent' : ''}`}>
            <div>
              <strong>{v.client_nom}</strong>
              <span className="sous">{[v.ville, v.type_travaux].filter(Boolean).join(' · ') || '—'}</span>
              {v.statut === 'terminee' && (
                <span className="sous">{v.traitee_note === 'Historique Pilotage' ? 'Reprise du Pilotage' : v.traitee_le ? 'Fiche de visite prête' : 'Fiche de visite en préparation…'}</span>
              )}
            </div>
            <div className="droite">
              <span className={`pastille-rdv ${statutRdv(v).classe}`}>{statutRdv(v).nom}</span>
              <span className="sous">{v.date_rdv ? dateCourte(v.date_rdv) : 'Sans date'}{v.heure ? ` · ${v.heure}` : ''}</span>
              {v.statut === 'en_cours' && <span className="sous">{nbReponses(v.fiche ?? {})} réponses</span>}
            </div>
          </Link>
        ))}
      </section>
    )

  const libelleJour = (d: string | null) => {
    if (!d) return 'Sans date'
    const base = dateLongue(d)
    if (d === auj) return `Aujourd'hui · ${base}`
    if (d === ajouterJours(auj, 1)) return `Demain · ${base}`
    return base
  }

  const agenda = (titre: string, l: Visite[]) => {
    if (!l.length) return null
    const jours: [string | null, Visite[]][] = []
    for (const v of l) {
      const der = jours[jours.length - 1]
      if (der && der[0] === v.date_rdv) der[1].push(v)
      else jours.push([v.date_rdv, [v]])
    }
    return (
      <section className="groupe">
        <h2>{titre}</h2>
        {jours.map(([d, vs]) => (
          <div key={d ?? 'sans'} className={`jour-agenda${d === auj ? ' aujourdhui' : ''}`}>
            <div className="jour-tete"><span>{libelleJour(d)}</span><small>{vs.length} visite{vs.length > 1 ? 's' : ''}</small></div>
            {vs.map((v) => (
              <Link key={v.id} to={`/visites/${v.id}`} className={`rdv-ligne ${statutRdv(v).classe}`}>
                <span className="rdv-heure">{heureAffichee(v.heure)}</span>
                <span className="rdv-info">
                  <strong>{v.client_nom}</strong>
                  <small>{[v.ville, v.type_travaux].filter(Boolean).join(' · ') || '—'}{v.statut === 'en_cours' ? ` · ${nbReponses(v.fiche ?? {})} réponses` : ''}</small>
                </span>
                <span className={`pastille-rdv ${statutRdv(v).classe}`}>{statutRdv(v).nom}</span>
              </Link>
            ))}
          </div>
        ))}
      </section>
    )
  }

  return (
    <div className="page">
      <div className="titre-ligne">
        <h1>Visites</h1>
        <button className="btn pri" onClick={() => setNouvelle(true)}>+ Visite</button>
      </div>
      {comptes.length > 1 && (
        <div className="filtres-rdv">
          {comptes.map((c) => (
            <button key={c.nom} className={`pastille-rdv ${c.classe}`} aria-pressed={filtre === c.nom} onClick={() => setFiltre(filtre === c.nom ? null : c.nom)}>
              {c.nom} · {c.n}
            </button>
          ))}
        </div>
      )}
      {!charge && <p className="sous">Chargement…</p>}
      {charge && liste.length === 0 && (
        <div className="vide">Aucune visite. Les rendez-vous de votre agenda arrivent ici automatiquement depuis le Pilotage, ou créez-en une avec « + Visite ».</div>
      )}
      {agenda('À venir', [...duJour, ...aVenir])}
      {agenda('À compléter (date passée)', enRetard)}
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
