import { supabase } from './supabase'

export type EtatPush = 'non_supporte' | 'installer' | 'refuse' | 'inactif' | 'actif'

const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const installee = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

function versUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function etatPush(): Promise<EtatPush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return ios() && !installee() ? 'installer' : 'non_supporte'
  }
  if (Notification.permission === 'denied') return 'refuse'
  const reg = await navigator.serviceWorker.ready
  const abo = await reg.pushManager.getSubscription()
  return abo && Notification.permission === 'granted' ? 'actif' : 'inactif'
}

export async function activerPush(membreId: string): Promise<void> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications refusées. Autorisez-les dans les réglages du téléphone.')
  const { data: cle, error } = await supabase.rpc('vapid_publique')
  if (error || !cle) throw new Error('Notifications indisponibles pour le moment.')
  const reg = await navigator.serviceWorker.ready
  let abo = await reg.pushManager.getSubscription()
  if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versUint8(cle as string) })
  const j = abo.toJSON()
  const r = await supabase.from('push_abonnements').upsert(
    { membre_id: membreId, endpoint: j.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth },
    { onConflict: 'endpoint' }
  )
  if (r.error) throw r.error
}

export async function desactiverPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const abo = await reg.pushManager.getSubscription()
  if (abo) {
    await supabase.from('push_abonnements').delete().eq('endpoint', abo.endpoint)
    await abo.unsubscribe()
  }
}
