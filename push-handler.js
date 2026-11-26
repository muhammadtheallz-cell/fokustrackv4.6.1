/* Background push handler for FokusTrack. Pushes are sent by the companion server. */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {}

  const title = typeof payload.title === 'string' ? payload.title : 'Pengingat FokusTrack'
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'Ada kegiatan yang perlu kamu perhatikan.',
    icon: '/icons/fokustrack-192.png',
    badge: '/icons/fokustrack-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : `fokustrack-push-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: Boolean(payload.silent),
    vibrate: payload.silent ? [] : [300, 120, 300, 120, 450],
    timestamp: Date.now(),
    data: {
      url: typeof payload.url === 'string' ? payload.url : '/?tab=calendar',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const rawTarget = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/?tab=calendar'
  const safeTarget = typeof rawTarget === 'string' && rawTarget.startsWith('/') &&
    !rawTarget.startsWith('//') && !rawTarget.includes('\\')
    ? rawTarget
    : '/?tab=calendar'
  const parsedTarget = new URL(safeTarget, self.location.origin)
  const targetUrl = parsedTarget.origin === self.location.origin
    ? parsedTarget.href
    : new URL('/?tab=calendar', self.location.origin).href

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      try {
        await client.navigate(targetUrl)
        await client.focus()
        return
      } catch {
        // Try another open tab or open a fresh window below.
      }
    }
    await self.clients.openWindow(targetUrl)
  })())
})
