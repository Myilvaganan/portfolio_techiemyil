// Push handling for the installed admin app (imported into the generated service worker).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Myil Admin', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Myil Admin', {
      body: data.body || '',
      tag: data.tag,
      renotify: false,
      icon: '/favicon/web-app-manifest-192x192.png',
      badge: '/favicon/web-app-manifest-192x192.png',
      data: { url: data.url || '/' },
      vibrate: [60, 40, 60],
    }),
  )
})

// Tapping a notification opens (or focuses) the admin app on the right page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', 'https://admin.techiemyil.com').href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith('https://admin.techiemyil.com') && 'focus' in c) {
          c.navigate(target)
          return c.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
