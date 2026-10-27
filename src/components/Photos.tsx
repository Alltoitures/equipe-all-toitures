import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dateCourte } from '../lib/format'

export interface PhotoChantier {
  id: string
  phase: string
  prise_le: string
  prenom: string | null
  miniature: string | null
  grande: string | null
  attente: boolean
}

export const NOMS_PHASE: Record<string, string> = { avant: 'Avant', pendant: 'Pendant', apres: 'Après', imprevu: 'Imprévus' }
const ORDRE = ['avant', 'pendant', 'apres', 'imprevu']

/** Photos du chantier, avec miniatures OneDrive (fonction photos-chantier). */
export function usePhotosChantier(chantierId: string) {
  const [photos, setPhotos] = useState<PhotoChantier[] | null>(null)
  const [erreur, setErreur] = useState('')
  const charger = useCallback(async () => {
    setErreur('')
    const { data, error } = await supabase.functions.invoke('photos-chantier', { body: { chantier: chantierId, action: 'liste' } })
    if (error || data?.erreur) {
      setErreur(navigator.onLine ? 'Photos indisponibles pour le moment.' : 'Pas de réseau : les photos s\'affichent avec une connexion.')
      setPhotos([])
    } else setPhotos(data.photos as PhotoChantier[])
  }, [chantierId])
  useEffect(() => { charger() }, [charger])
  return { photos, erreur, recharger: charger }
}

/** Photos retenues pour l'annexe du PV : après, puis avant, puis pendant (24 au plus). */
export function photosAnnexe(photos: PhotoChantier[]): PhotoChantier[] {
  const prio = ['apres', 'avant', 'pendant']
  const ids = new Set<string>()
  for (const ph of prio) for (const p of photos.filter((x) => x.phase === ph)) if (ids.size < 24) ids.add(p.id)
  return photos.filter((p) => ids.has(p.id)).sort((a, b) => ORDRE.indexOf(a.phase) - ORDRE.indexOf(b.phase) || a.prise_le.localeCompare(b.prise_le))
}

/** Onglet Photos de la fiche chantier : vignettes par phase, ouverture en plein écran. */
export function PhotosChantier({ chantierId }: { chantierId: string }) {
  const { photos, erreur, recharger } = usePhotosChantier(chantierId)
  const [filtre, setFiltre] = useState<string>('tout')
  const [ouverte, setOuverte] = useState<number | null>(null)

  if (!photos) return <div className="vide">Chargement des photos…</div>
  const phases = ORDRE.filter((p) => photos.some((x) => x.phase === p))
  const visibles = photos.filter((p) => filtre === 'tout' || p.phase === filtre)
  const groupes = ORDRE.filter((ph) => visibles.some((p) => p.phase === ph))

  return (
    <>
      {erreur && <p className="erreur">{erreur} <button className="lien" onClick={recharger}>Réessayer</button></p>}
      {photos.length === 0 && !erreur && <div className="vide">Aucune photo pour l'instant. Les photos prises avec les boutons Avant / Pendant / Après apparaissent ici.</div>}
      {phases.length > 1 && (
        <div className="choix ph-filtres">
          <button aria-pressed={filtre === 'tout'} onClick={() => setFiltre('tout')}>Toutes <span>{photos.length}</span></button>
          {phases.map((p) => (
            <button key={p} aria-pressed={filtre === p} onClick={() => setFiltre(p)}>{NOMS_PHASE[p]} <span>{photos.filter((x) => x.phase === p).length}</span></button>
          ))}
        </div>
      )}
      {groupes.map((ph) => (
        <section key={ph} className="ph-groupe">
          <h3>{NOMS_PHASE[ph]}</h3>
          <div className="ph-grille">
            {visibles.filter((p) => p.phase === ph).map((p) => (
              <button key={p.id} className="ph-vignette" onClick={() => setOuverte(visibles.indexOf(p))}>
                <img src={p.miniature ?? p.grande ?? ''} alt={`${NOMS_PHASE[p.phase]} ${dateCourte(p.prise_le)}`} loading="lazy" />
                <span>{dateCourte(p.prise_le)}{p.prenom ? ` · ${p.prenom}` : ''}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {ouverte !== null && visibles[ouverte] && <Visionneuse photos={visibles} index={ouverte} changer={setOuverte} fermer={() => setOuverte(null)} />}
    </>
  )
}

/** Plein écran : flèches, glisser à gauche / à droite, Échap pour fermer. */
export function Visionneuse({ photos, index, changer, fermer }: { photos: PhotoChantier[]; index: number; changer: (i: number) => void; fermer: () => void }) {
  const p = photos[index]
  const depart = useRef<number | null>(null)
  const prec = () => changer((index - 1 + photos.length) % photos.length)
  const suiv = () => changer((index + 1) % photos.length)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); if (e.key === 'ArrowLeft') prec(); if (e.key === 'ArrowRight') suiv() }
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  })
  return (
    <div
      className="visionneuse"
      onTouchStart={(e) => { depart.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (depart.current === null) return
        const dx = e.changedTouches[0].clientX - depart.current
        depart.current = null
        if (Math.abs(dx) > 50) (dx > 0 ? prec : suiv)()
      }}
    >
      <div className="vis-haut">
        <span>{NOMS_PHASE[p.phase]} · {dateCourte(p.prise_le)}{p.prenom ? ` · ${p.prenom}` : ''}<small>{index + 1} / {photos.length}</small></span>
        <button onClick={fermer} aria-label="Fermer">✕</button>
      </div>
      <img src={p.grande ?? p.miniature ?? ''} alt="" />
      {photos.length > 1 && (
        <>
          <button className="vis-fleche g" onClick={prec} aria-label="Photo précédente">‹</button>
          <button className="vis-fleche d" onClick={suiv} aria-label="Photo suivante">›</button>
        </>
      )}
    </div>
  )
}
