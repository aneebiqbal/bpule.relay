/// <reference lib="webworker" />

const CACHE_NAME = 'relay-v1'
const STATIC_ASSETS = ['/', '/login', '/onboarding']

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  )
  ;(self as unknown as ServiceWorkerGlobalScope).skipWaiting()
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  )
  ;(self as unknown as ServiceWorkerGlobalScope).clients.claim()
})

self.addEventListener('fetch', (event: FetchEvent) => {
  // Only cache GET requests for static assets and navigation.
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          return response
        })
      }),
    )
    return
  }
  // Navigation fallback to cache, then network.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return (
          cached ??
          fetch(event.request).catch(() => caches.match('/'))
        )
      }),
    )
  }
})

self.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'Relay'
  const options: NotificationOptions = {
    body: data.body ?? 'Something needs your attention.',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.tag ?? 'relay',
    renotify: true,
    data: data.payload ?? {},
  }
  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).registration.showNotification(
      title,
      options,
    ),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const payload = event.notification.data as { leadId?: string; url?: string }
  const url = payload.url ?? (payload.leadId ? `/leads/${payload.leadId}` : '/')
  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return (client as WindowClient).focus()
          }
        }
        return (self as unknown as ServiceWorkerGlobalScope).clients.openWindow(url)
      }),
  )
})
