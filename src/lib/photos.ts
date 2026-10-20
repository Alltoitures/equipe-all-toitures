import { createStore, del, entries, set } from 'idb-keyval'
import { supabase, type Phase } from './supabase'

/**
 * File d'attente des photos : chaque photo est d'abord gardée dans l'application
 * (IndexedDB, jamais dans la galerie du téléphone), puis envoyée dès que le réseau
 * est disponible. La copie locale est effacée une fois l'envoi confirmé.
 */

const store = createStore('at-equipe', 'photos-en-attente')

export interface PhotoEnAttente {
  id: string
  chantier_id: string
  membre_id: string
  phase: Phase
  prise_le: string
  blob: Blob
  imprevu_texte?: string
}

/** Photo de visite (gérant) : rangée dans « Visite - AO / AAAA / MM_NOM / Photos visite ». */
export interface PhotoVisiteEnAttente {
  type: 'visite'
  id: string
  visite_id: string
  legende?: string
  prise_le: string
  blob: Blob
}

type Ecouteur = (n: number) => void
const ecouteurs = new Set<Ecouteur>()

export function surAttente(f: Ecouteur): () => void {
  ecouteurs.add(f)
  compterAttente().then(f)
  return () => ecouteurs.delete(f)
}

async function notifier() {
  const n = await compterAttente()
  ecouteurs.forEach((f) => f(n))
}

export async function compterAttente(): Promise<number> {
  try {
    return (await entries(store)).length
  } catch {
    return 0
  }
}

/** Réduit la photo (2000 px max, JPEG) pour limiter les données mobiles. */
export async function compresser(fichier: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
    const max = 2000
    const r = Math.min(1, max / Math.max(img.width, img.height))
    const w = Math.round(img.width * r)
    const h = Math.round(img.height * r)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    img.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82))
    return blob ?? fichier
  } catch {
    return fichier
  }
}

export async function ajouterPhotoVisite(p: { visite_id: string; legende?: string; blob: Blob }): Promise<string> {
  const id = crypto.randomUUID()
  await set(id, { ...p, type: 'visite', id, prise_le: new Date().toISOString() }, store)
  await notifier()
  envoyerAttente()
  return id
}

async function envoyerVisite(p: PhotoVisiteEnAttente) {
  const chemin = `visites/${p.visite_id}/${p.id}.jpg`
  const up = await supabase.storage.from('photos').upload(chemin, p.blob, { contentType: p.blob.type || 'image/jpeg', upsert: false })
  if (up.error && !/exists|Duplicate/i.test(up.error.message)) throw up.error
  const ins = await supabase.from('photos_visite').insert({
    id: p.id,
    visite_id: p.visite_id,
    legende: p.legende || null,
    storage_path: chemin,
    nom_fichier: `${p.prise_le.slice(0, 10)}_visite`,
    taille: p.blob.size,
    prise_le: p.prise_le
  })
  if (ins.error && ins.error.code !== '23505') throw ins.error
}

export async function ajouterPhoto(p: Omit<PhotoEnAttente, 'id' | 'prise_le'>): Promise<string> {
  const id = crypto.randomUUID()
  await set(id, { ...p, id, prise_le: new Date().toISOString() }, store)
  await notifier()
  envoyerAttente()
  return id
}

let enCours = false

/** Envoie toutes les photos en attente. Sans réseau, elles restent pour plus tard. */
export async function envoyerAttente(): Promise<void> {
  if (enCours || !navigator.onLine) return
  enCours = true
  try {
    const liste = (await entries(store)) as [string, PhotoEnAttente | PhotoVisiteEnAttente][]
    for (const [cle, el] of liste) {
      if ('type' in el && el.type === 'visite') {
        await envoyerVisite(el)
        await del(cle, store)
        await notifier()
        continue
      }
      const p = el as PhotoEnAttente
      const chemin = `${p.chantier_id}/${p.id}.jpg`
      const up = await supabase.storage.from('photos').upload(chemin, p.blob, {
        contentType: p.blob.type || 'image/jpeg',
        upsert: false
      })
      if (up.error && !/exists|Duplicate/i.test(up.error.message)) throw up.error

      const ins = await supabase.from('photos').insert({
        id: p.id,
        chantier_id: p.chantier_id,
        membre_id: p.membre_id,
        phase: p.phase,
        storage_path: chemin,
        nom_fichier: `${p.prise_le.slice(0, 10)}_${p.phase}`,
        taille: p.blob.size,
        prise_le: p.prise_le
      })
      if (ins.error && ins.error.code !== '23505') throw ins.error

      if (p.imprevu_texte) {
        const imp = await supabase.from('imprevus').insert({
          chantier_id: p.chantier_id,
          membre_id: p.membre_id,
          texte: p.imprevu_texte,
          photo_id: p.id
        })
        if (imp.error) throw imp.error
      }
      await del(cle, store)
      await notifier()
    }
  } catch (e) {
    console.warn('[photos] envoi reporté', e)
  } finally {
    enCours = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => envoyerAttente())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') envoyerAttente()
  })
  setInterval(() => envoyerAttente(), 60_000)
}
