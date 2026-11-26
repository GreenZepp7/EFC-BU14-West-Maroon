self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification('New team message', {
    body: 'A new message was posted in Team messages.',
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: `team-message-${Date.now()}`,
    data: { url: '/?view=messages' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL(event.notification.data?.url ?? '/?view=messages', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url === destination)
    if (existing) return existing.focus()
    return self.clients.openWindow(destination)
  }))
})
