/**
 * messagingManager.js
 * Gestiona permisos y tokens FCM para notificaciones push.
 *
 * CONFIGURACIÓN REQUERIDA (una sola vez):
 *   1. Firebase Console → Project settings → Cloud Messaging
 *   2. Sección "Web Push certificates" → Generate key pair
 *   3. Copia la clave pública (VAPID key) y pégala en VAPID_KEY
 */
import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging'
import { ref, set, remove } from 'firebase/database'
import app from './config'
import { db, auth } from './config'

// Clave pública VAPID (Firebase Console → Project settings → Cloud Messaging →
// Web Push certificates). No es secreta; puede ir en el código o en
// VITE_FCM_VAPID_KEY. Sin ella, las notificaciones push quedan desactivadas.
const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY ?? 'REEMPLAZA_CON_TU_VAPID_KEY'
const VAPID_OK = VAPID_KEY && !VAPID_KEY.startsWith('REEMPLAZA')

const SW_URL   = '/countall-web/firebase-messaging-sw.js'
const SW_SCOPE = '/countall-web/'

let _messaging = null
function getMsg() {
  if (!_messaging) _messaging = getMessaging(app)
  return _messaging
}

// Codifica el token como clave RTDB válida (sin caracteres especiales)
function encodeToken(token) {
  return btoa(token).replace(/[+/=]/g, '_').slice(0, 60)
}

// ─── Solicitar permiso + registrar token ─────────────────────────────────────

export async function requestAndRegisterFcm() {
  if (!VAPID_OK) return null
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return null
  if (Notification.permission === 'denied') return null

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null
    return await registerFcmToken()
  } catch (e) {
    console.warn('[FCM] Error al pedir permiso:', e)
    return null
  }
}

export async function registerFcmToken() {
  const me = auth.currentUser?.uid
  if (!me) return null

  try {
    // Registrar el SW con el scope correcto para GitHub Pages
    const swReg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })

    const token = await getToken(getMsg(), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    })
    if (!token) return null

    // Guardar token en RTDB para que la Cloud Function lo use
    const key = encodeToken(token)
    await set(ref(db, `users/${me}/fcmTokens/${key}`), token)

    localStorage.setItem('fcmToken',    token)
    localStorage.setItem('fcmTokenKey', key)
    return token
  } catch (e) {
    console.warn('[FCM] Error al registrar token:', e)
    return null
  }
}

// ─── Eliminar token al cerrar sesión ─────────────────────────────────────────

export async function unregisterFcmToken() {
  const me = auth.currentUser?.uid
  const token = localStorage.getItem('fcmToken')
  const key   = localStorage.getItem('fcmTokenKey')

  if (token || key) {
    try {
      await deleteToken(getMsg()).catch(() => {})
      if (me && key) await remove(ref(db, `users/${me}/fcmTokens/${key}`)).catch(() => {})
    } catch { /* ignore */ }
    localStorage.removeItem('fcmToken')
    localStorage.removeItem('fcmTokenKey')
  }
}

// ─── Handler de mensajes en primer plano ─────────────────────────────────────
// Devuelve la función de unsubscribe.

export function onForegroundMessage(callback) {
  try {
    return onMessage(getMsg(), callback)
  } catch {
    return () => {}
  }
}
