// Notifications ALL TOITURES (chargé par le service worker de l'application).
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'ALL TOITURES', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'ALL TOITURES', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag,
    data: { url: d.url || '/' }
  }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil((async () => {
    const fen = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const f of fen) {
      if ('focus' in f) { await f.focus(); if ('navigate' in f) f.navigate(url); return }
    }
    return self.clients.openWindow(url)
  })())
})
