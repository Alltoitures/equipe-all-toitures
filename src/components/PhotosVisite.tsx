import { useEffect, useRef, useState } from 'react'
import { supabase, erreurLisible } from '../lib/supabase'
import { LEGENDES_PHOTO } from '../lib/visite'
import { dateCourte } from '../lib/format'

export interface PhotoV { id: string; legende: string | null; commentaire: string | null; prise_le: string; miniature: string | null; grande: string | null; locale?: boolean }

/** Photos de la visite déjà prises : on les revoit, on change la légende, on écrit un commentaire dessous. */
export function usePhotosVisite(visite: string, recentes: PhotoV[]) {
  const [photos, setPhotos] = useState<PhotoV[] | null>(null)
  const [erreur, setErreur] = useState('')
  async function charger() {
    const { data, error } = await supabase.functions.invoke('photos-chantier', { body: { visite, action: 'visite-photos' } })
    if (error || !data?.photos) { setErreur(navigator.onLine ? 'Photos indisponibles pour le moment.' : 'Pas de réseau : seules les photos de cette session sont visibles.'); setPhotos([]); return }
    setErreur('')
    setPhotos(data.photos as PhotoV[])
  }
  useEffect(() => { charger() }, [visite])
  // Les photos encore en route (prises à l'instant) s'affichent depuis le téléphone.
  const connues = new Set((photos ?? []).map((p) => p.id))
  const toutes = [...(photos ?? []), ...recentes.filter((r) => !connues.has(r.id))]
  return { photos: photos ? toutes : recentes.length ? recentes : null, erreur, recharger: charger, maj: (id: string, champs: Partial<PhotoV>) => setPhotos((x) => x?.map((p) => (p.id === id ? { ...p, ...champs } : p)) ?? x) }
}

export default function GaleriePhotos({ photos, erreur, filtre, vide, maj, lecture }: {
  photos: PhotoV[] | null
  erreur: string
  filtre?: (p: PhotoV) => boolean
  vide: string
  maj: (id: string, champs: Partial<PhotoV>) => void
  lecture?: boolean
}) {
  const [ouverte, setOuverte] = useState<number | null>(null)
  const liste = (photos ?? []).filter(filtre ?? (() => true))
  if (!photos) return <div className="pv-charge"><span className="roue" />Chargement des photos…</div>
  return (
    <>
      {erreur && <p className="aide">{erreur}</p>}
      {liste.length === 0 ? (
        <div className="vide">{vide}</div>
      ) : (
        <div className="galerie-v">
          {liste.map((p, i) => (
            <button type="button" key={p.id} className="vignette-v" onClick={() => setOuverte(i)}>
              {p.miniature ? <img src={p.miniature} alt="" loading="lazy" /> : <span className="sans-img">…</span>}
              {p.locale && <span className="envoi">Envoi…</span>}
              <span className="leg">{p.legende || 'Sans légende'}</span>
              {p.commentaire && <span className="bulle" aria-label="Commentaire">💬</span>}
            </button>
          ))}
        </div>
      )}
      {ouverte !== null && liste[ouverte] && (
        <DetailPhoto
          photos={liste}
          index={ouverte}
          changer={setOuverte}
          fermer={() => setOuverte(null)}
          maj={maj}
          lecture={lecture}
        />
      )}
    </>
  )
}

function DetailPhoto({ photos, index, changer, fermer, maj, lecture }: {
  photos: PhotoV[]; index: number; changer: (i: number) => void; fermer: () => void; maj: (id: string, c: Partial<PhotoV>) => void; lecture?: boolean
}) {
  const p = photos[index]
  const [ouvrage, precision] = (p.legende ?? '').split(' – ')
  const [o, setO] = useState(ouvrage ?? '')
  const [pr, setPr] = useState(precision ?? '')
  const [com, setCom] = useState(p.commentaire ?? '')
  const [etat, setEtat] = useState('')
  const depart = useRef<number | null>(null)
  useEffect(() => {
    const [a, b] = (p.legende ?? '').split(' – ')
    setO(a ?? ''); setPr(b ?? ''); setCom(p.commentaire ?? ''); setEtat('')
  }, [p.id])
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const modifie = o !== (ouvrage ?? '') || pr !== (precision ?? '') || com !== (p.commentaire ?? '')
  async function enregistrer() {
    const legende = [o, pr.trim()].filter(Boolean).join(' – ') || null
    setEtat('Enregistrement…')
    const { error } = await supabase.from('photos_visite').update({ legende, commentaire: com.trim() || null }).eq('id', p.id)
    if (error) return setEtat(erreurLisible(error))
    maj(p.id, { legende, commentaire: com.trim() || null })
    setEtat('Enregistré')
  }

  return (
    <div className="detail-photo" role="dialog">
      <div className="vis-haut">
        <span>{dateCourte(p.prise_le)}<small>{index + 1} / {photos.length}</small></span>
        <button onClick={fermer} aria-label="Fermer">✕</button>
      </div>
      <div
        className="detail-img"
        onTouchStart={(e) => { depart.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (depart.current === null) return
          const dx = e.changedTouches[0].clientX - depart.current
          depart.current = null
          if (Math.abs(dx) > 60) changer((index + (dx > 0 ? -1 : 1) + photos.length) % photos.length)
        }}
      >
        <img src={p.grande ?? p.miniature ?? ''} alt="" />
      </div>
      <div className="detail-bas">
        <fieldset disabled={lecture || p.locale} className="champs">
          <div className="choix">
            {LEGENDES_PHOTO.map((x) => <button type="button" key={x} aria-pressed={o === x} onClick={() => setO(o === x ? '' : x)}>{x}</button>)}
          </div>
          <input value={pr} onChange={(e) => setPr(e.target.value)} placeholder="Précision : versant nord, tuile cassée…" />
          <textarea rows={3} value={com} onChange={(e) => setCom(e.target.value)} placeholder="Commentaire sous la photo (repris dans le rapport)" />
        </fieldset>
        {p.locale && <p className="aide">Photo en cours d'envoi : modifiable dans un instant.</p>}
        <div className="boutons">
          {photos.length > 1 && <button type="button" className="btn" onClick={() => changer((index - 1 + photos.length) % photos.length)}>‹</button>}
          {!lecture && <button type="button" className="btn pri" style={{ flex: 1 }} disabled={!modifie || !!p.locale} onClick={enregistrer}>{etat || 'Enregistrer'}</button>}
          {photos.length > 1 && <button type="button" className="btn" onClick={() => changer((index + 1) % photos.length)}>›</button>}
        </div>
      </div>
    </div>
  )
}
