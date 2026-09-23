const CACHE_NAME = 'relay-v2'
const STATIC_ASSETS = []

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  // Cache-safe GET requests only.
  if (event.request.method !== 'GET') return

  // Never intercept navigation requests. Auth and redirects must stay network-first.
  if (event.request.mode === 'navigate') return

  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/')) return
  // Never cache Next.js build artifacts in SW. After a deploy, stale chunk
  // caches can serve missing build files and trigger MIME/nosniff boot errors.
  if (url.pathname.startsWith('/_next/static/')) return
})

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'Relay'
  const options = {
    body: data.body ?? 'Something needs your attention.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag ?? 'relay',
    renotify: true,
    data: data.payload ?? {},
  }
  event.waitUntil(
    self.registration.showNotification(title, options),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const payload = event.notification.data
  const url = payload?.url ?? (payload?.leadId ? `/leads/${payload.leadId}` : '/')
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})
