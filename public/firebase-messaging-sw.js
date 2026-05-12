// Service Worker para FCM (Firebase Cloud Messaging)
// Maneja notificaciones push cuando la app está en background o cerrada.
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyAWdd6rEj-dj1SQ30mfxutgGqI3S-_CG90',
  authDomain: 'contadorapp-e8d35.firebaseapp.com',
  databaseURL: 'https://contadorapp-e8d35-default-rtdb.firebaseio.com',
  projectId: 'contadorapp-e8d35',
  storageBucket: 'contadorapp-e8d35.firebasestorage.app',
  messagingSenderId: '929445180556',
  appId: '1:929445180556:web:f9f733e04f6f456e3977a9',
})

const messaging = firebase.messaging()

// Notificación cuando la app está en segundo plano / cerrada
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'CountAll'
  const body  = payload.notification?.body  ?? ''
  const sharedId = payload.data?.sharedId ?? ''

  self.registration.showNotification(title, {
    body,
    icon:     'https://raw.githubusercontent.com/tosysy/CountAll/main/icon-192.png',
    badge:    'https://raw.githubusercontent.com/tosysy/CountAll/main/icon-192.png',
    tag:      sharedId ? `counter-${sharedId}` : 'countall',
    renotify: true,
    data:     payload.data ?? {},
  })
})

// Al hacer clic en la notificación → abrir/enfocar la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const appUrl = 'https://tosysy.github.io/countall-web/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find(c => c.url.startsWith(appUrl))
      if (existing) return existing.focus()
      return clients.openWindow(appUrl)
    })
  )
})
