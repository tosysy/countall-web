// Service Worker para FCM (Firebase Cloud Messaging)
// Las Cloud Functions envían mensajes DATA-only (igual que para Android):
// { type, title, body, sharedId?, fromUid?, fromUsername?, dataVersion? }
// Este SW construye la notificación a partir de esos datos.
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

const APP_URL = 'https://tosysy.github.io/countall-web/'
const ICON = '/countall-web/icon-192.png'

// Notificación cuando la app está en segundo plano / cerrada
messaging.onBackgroundMessage((payload) => {
  const data = payload.data ?? {}
  const type = data.type ?? ''

  // Push silencioso de sincronización personal — no mostrar nada
  if (type === 'PERSONAL_SYNC') return

  const title = data.title ?? payload.notification?.title ?? 'CountAll'
  const body  = data.body  ?? payload.notification?.body  ?? ''
  const sharedId = data.sharedId ?? ''

  const tag =
    type === 'counter_change' && sharedId ? `counter-${sharedId}` :
    type === 'friend_request' || type === 'friend_accepted' ? `friend-${data.fromUid ?? ''}` :
    'countall'

  self.registration.showNotification(title, {
    body,
    icon:     ICON,
    badge:    ICON,
    tag,
    renotify: true,
    data,
  })
})

// Al hacer clic en la notificación → abrir/enfocar la app en la sección adecuada
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const type = event.notification.data?.type ?? ''
  const target =
    type === 'friend_request' ? APP_URL + 'friends' :
    type === 'friend_accepted' ? APP_URL + 'friends' :
    APP_URL
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find(c => c.url.startsWith(APP_URL))
      if (existing) {
        existing.focus()
        if (target !== APP_URL) existing.navigate?.(target)
        return
      }
      return clients.openWindow(target)
    })
  )
})
