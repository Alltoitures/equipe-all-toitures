import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, erreurLisible } from '../../lib/supabase'
import { ETATS_REAL, METIERS_SITE, type GroupeIntervention, type PhotoReal, type Realisation as TReal } from '../../lib/realisation'
import { IcoRetour } from '../../components/Icones'

type Candidate = { id: string; nom: string; miniature: string | null; grande: string | null }

export default function Realisation() {
  const { id } = useParams()
  const [r, setR] = useState<TReal | null>(null)
  const [client, setClient] = useState('')
  const [cands, setCands] = useState<Candidate[] | null>(null)
  const [photosErreur, setPhotosErreur] = useState('')
  const [etat, setEtat] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [modifie, setModifie] = useState(false)

  useEffect(() => {
    supabase.from('realisations').select('*, chantiers(client_nom, ville)').eq('id', id).single().then(({ data }) => {
      if (!data) return
      setClient(`${(data as any).chantiers?.client_nom ?? ''} · ${(data as any).chantiers?.ville ?? ''}`)
      setR(data as TReal)
    })
    supabase.functions.invoke('realisation', { body: { action: 'photos', realisation: id } }).then(({ data, error }) => {
      if (error || data?.erreur) setPhotosErreur(data?.erreur ?? 'Photos OneDrive indisponibles.')
      setCands((data?.photos ?? []) as Candidate[])
    })
  }, [id])

  if (!r) return <div className="page"><p className="sous">Chargement…</p></div>

  const maj = (p: Partial<TReal>) => { setR({ ...r, ...p }); setModifie(true) }
  const champ = (k: 'titre' | 'extrait' | 'intro' | 'projet' | 'contraintes' | 'resultat' | 'ville' | 'temoignage' | 'temoin') => ({
    value: r[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => maj({ [k]: e.target.value } as Partial<TReal>)
  })
  const ficheChamp = (k: keyof TReal['fiche']) => ({
    value: r.fiche?.[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => maj({ fiche: { ...r.fiche, [k]: e.target.value } })
  })

  // Photos : celles du brouillon (dans leur ordre) puis le reste du dossier OneDrive.
  const parId = new Map(r.photos.map((p) => [p.id, p]))
  const liste: (Candidate & { p?: PhotoReal })[] = [
    ...r.photos.map((p) => ({ ...(cands?.find((c) => c.id === p.id) ?? { id: p.id, nom: p.nom ?? '', miniature: null, grande: null }), p })),
    ...(cands ?? []).filter((c) => !parId.has(c.id))
  ]
  const retenues = r.photos.filter((p) => p.retenue)
  function basculer(c: Candidate) {
    const ex = parId.get(c.id)
    if (ex) maj({ photos: r!.photos.map((p) => (p.id === c.id ? { ...p, retenue: !p.retenue, principale: p.retenue ? false : p.principale } : p)) })
    else maj({ photos: [...r!.photos, { id: c.id, nom: c.nom, retenue: true, alt: `${r!.titre ?? 'Chantier'} – ${r!.ville ?? ''}`.trim(), sujet: 'chantier' }] })
  }
  const principale = (pid: string) => maj({ photos: r.photos.map((p) => ({ ...p, principale: p.id === pid, retenue: p.id === pid ? true : p.retenue })) })
  const alt = (pid: string, v: string) => maj({ photos: r.photos.map((p) => (p.id === pid ? { ...p, alt: v } : p)) })

  const groupes = r.intervention ?? []
  const majGroupe = (i: number, g: Partial<GroupeIntervention>) => maj({ intervention: groupes.map((x, j) => (j === i ? { ...x, ...g } : x)) })

  async function enregistrer() {
    const { error } = await supabase
      .from('realisations')
      .update({
        titre: r!.titre, extrait: r!.extrait, intro: r!.intro, projet: r!.projet, contraintes: r!.contraintes, resultat: r!.resultat,
        intervention: groupes, fiche: r!.fiche, metiers: r!.metiers, ville: r!.ville, photos: r!.photos,
        temoignage: r!.temoignage, temoin: r!.temoin, updated_at: new Date().toISOString()
      })
      .eq('id', r!.id)
    if (error) throw error
    setModifie(false)
  }

  async function sauver() {
    setOccupe(true); setEtat('')
    try { await enregistrer(); setEtat('Enregistré.') } catch (e) { setEtat(erreurLisible(e)) } finally { setOccupe(false) }
  }

  async function publier() {
    if (!retenues.length) return setEtat('Choisissez au moins une photo.')
    setOccupe(true); setEtat('Publication en cours… (environ une minute)')
    try {
      await enregistrer()
      const { data, error } = await supabase.functions.invoke('realisation', { body: { action: 'publier', realisation: r!.id } })
      if (error || data?.erreur) throw new Error(data?.erreur ?? 'Publication impossible pour le moment.')
      setR({ ...r!, statut: 'publiee', url: data.url, erreur: null })
      setEtat('C\'est en ligne.')
    } catch (e) {
      setR({ ...r!, statut: 'erreur', erreur: erreurLisible(e) })
      setEtat(erreurLisible(e))
    } finally {
      setOccupe(false)
    }
  }

  const pret = r.statut !== 'demandee'

  return (
    <div className="page realisation">
      <Link to={`/chantier/${r.chantier_id}`} className="retour"><IcoRetour /> Chantier</Link>
      <h1>Réalisation site web</h1>
      <p className="sous">{client}</p>
      <p className={`etat-real ${r.statut}`}>{ETATS_REAL[r.statut]}{r.statut === 'erreur' && r.erreur ? ` : ${r.erreur}` : ''}</p>
      {r.url && <a className="lien" href={r.url} target="_blank" rel="noreferrer">Voir la page sur alltoitures.com ›</a>}
      {!pret && <div className="vide">Le brouillon (texte + choix des photos) est en cours de préparation. Il apparaîtra ici et dans « À faire » d'ici une heure.</div>}

      {pret && (
        <>
          <section className="carte">
            <h2>Texte</h2>
            <label>Titre<input {...champ('titre')} /></label>
            <label>Résumé Google <small className="sous">({(r.extrait ?? '').length}/160)</small><textarea rows={2} {...champ('extrait')} /></label>
            <label>Introduction<textarea rows={3} {...champ('intro')} /></label>
            <label>Le projet<textarea rows={4} {...champ('projet')} /></label>
            <label>Les contraintes <small className="sous">(laisser vide pour ne pas afficher)</small><textarea rows={3} {...champ('contraintes')} /></label>
            <div className="q-label">Notre intervention</div>
            {groupes.map((g, i) => (
              <div key={i} className="groupe-inter">
                <div className="groupe-titre">
                  <input value={g.titre} onChange={(e) => majGroupe(i, { titre: e.target.value })} />
                  <button type="button" className="btn" aria-label="Retirer" onClick={() => maj({ intervention: groupes.filter((_, j) => j !== i) })}>✕</button>
                </div>
                <textarea rows={Math.max(2, g.points.length)} value={g.points.join('\n')} onChange={(e) => majGroupe(i, { points: e.target.value.split('\n') })} />
              </div>
            ))}
            <button type="button" className="lien" onClick={() => maj({ intervention: [...groupes, { titre: 'Sur place', points: [] }] })}>+ Ajouter un groupe</button>
            <p className="aide">Un point par ligne.</p>
            <label>Le résultat<textarea rows={3} {...champ('resultat')} /></label>
          </section>

          <section className="carte">
            <h2>Photos <small className="sous">{retenues.length} retenue{retenues.length > 1 ? 's' : ''}</small></h2>
            <p className="aide">Touchez une photo pour la retenir ou la retirer. ★ = photo principale.</p>
            {cands === null && <p className="sous">Chargement des photos OneDrive…</p>}
            {photosErreur && <p className="erreur">{photosErreur}</p>}
            <div className="galerie-real">
              {liste.map((c) => {
                const p = parId.get(c.id)
                return (
                  <div key={c.id} className={`vignette-real${p?.retenue ? ' retenue' : ''}`}>
                    <button type="button" className="vignette" onClick={() => basculer(c)}>
                      {c.miniature ? <img src={c.miniature} alt="" loading="lazy" /> : <span>{c.nom}</span>}
                    </button>
                    {p?.retenue && <button type="button" className={`etoile${p.principale ? ' on' : ''}`} onClick={() => principale(c.id)} aria-label="Photo principale">★</button>}
                  </div>
                )
              })}
            </div>
            {retenues.length > 0 && (
              <details>
                <summary className="lien">Descriptions des photos (référencement)</summary>
                {retenues.map((p) => (
                  <label key={p.id} className="sous">{p.nom}<input value={p.alt ?? ''} onChange={(e) => alt(p.id, e.target.value)} /></label>
                ))}
              </details>
            )}
          </section>

          <section className="carte">
            <h2>Fiche</h2>
            <div className="choix multi">
              {METIERS_SITE.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={r.metiers.includes(k)} onClick={() => maj({ metiers: r.metiers.includes(k) ? r.metiers.filter((m) => m !== k) : [...r.metiers, k] })}>{l}</button>
              ))}
            </div>
            <div className="deux">
              <label>Ville<input {...champ('ville')} /></label>
              <label>Département<input {...ficheChamp('departement')} placeholder="Rhône (69)" /></label>
            </div>
            <label>Lieu (bandeau)<input {...ficheChamp('lieu')} placeholder="Maison individuelle, Brignais (69)" /></label>
            <div className="deux">
              <label>Année<input inputMode="numeric" {...ficheChamp('annee')} /></label>
              <label>
                Client
                <select {...ficheChamp('type_client')}>
                  <option>Particulier</option><option>Professionnel</option><option>Collectivité</option>
                </select>
              </label>
            </div>
            <label>Matériau<input {...ficheChamp('materiau')} /></label>
            <label>Chiffre clé<input {...ficheChamp('surface')} placeholder="120 m² de couverture" /></label>
            <label>Particularité<input {...ficheChamp('particularite')} /></label>
          </section>

          <section className="carte">
            <h2>Témoignage <small className="sous">(facultatif)</small></h2>
            <textarea rows={3} {...champ('temoignage')} />
            <label>Signé par<input {...champ('temoin')} /></label>
          </section>

          {etat && <p className={r.statut === 'erreur' ? 'erreur' : 'sous'}>{etat}</p>}
          <div className="boutons barre-real">
            <button className="btn" disabled={occupe || !modifie} onClick={sauver}>Enregistrer</button>
            <button className="btn go" disabled={occupe || r.statut === 'publication'} onClick={publier}>
              {r.statut === 'publiee' ? 'Mettre à jour le site' : 'Valider et publier'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
