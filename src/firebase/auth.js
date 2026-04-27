import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { ref, set, get, remove } from 'firebase/database'
import { auth, db } from './config'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'

export function buildGoogleProvider() {
  const provider = new GoogleAuthProvider()
  provider.addScope(DRIVE_SCOPE)
  // Forzar selección de cuenta para poder elegir en re-auth
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}

/**
 * Inicia sesión con Google.
 * En iOS la ventana emergente falla, así que se usa redirect como fallback.
 * Devuelve { user, accessToken } donde accessToken sirve para Drive API.
 */
export async function signInWithGoogle() {
  const provider = buildGoogleProvider()
  try {
    const result = await signInWithPopup(auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    return { user: result.user, accessToken: credential?.accessToken ?? null }
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      // Fallback a redirect (iOS, Safari estricto)
      await signInWithRedirect(auth, provider)
      return null // Se redirige; el resultado llega en handleRedirectResult
    }
    throw err
  }
}

/**
 * Recoge el resultado tras un signInWithRedirect.
 * Llamar en el primer render de la app.
 */
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth)
    if (!result) return null
    const credential = GoogleAuthProvider.credentialFromResult(result)
    return { user: result.user, accessToken: credential?.accessToken ?? null }
  } catch {
    return null
  }
}

/**
 * Obtiene un access token nuevo haciendo popup silencioso
 * (el usuario ya tiene sesión activa en el navegador).
 */
export async function refreshDriveToken() {
  const provider = buildGoogleProvider()
  provider.setCustomParameters({ prompt: 'none' }) // sin UI si ya hay sesión
  try {
    const result = await signInWithPopup(auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    return credential?.accessToken ?? null
  } catch {
    return null
  }
}

export async function signOut() {
  await firebaseSignOut(auth)
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}

// ─── Username helpers ─────────────────────────────────────────────────────────

export async function isUsernameAvailable(name) {
  const key = name.toLowerCase().trim()
  const snap = await get(ref(db, `usernames/${key}`))
  if (!snap.exists()) return true
  return snap.val() === auth.currentUser?.uid
}

export async function setUsername(name) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('No autenticado')
  const key = name.toLowerCase().trim()

  // Comprobar disponibilidad
  const snap = await get(ref(db, `usernames/${key}`))
  if (snap.exists() && snap.val() !== uid) throw new Error('Nombre no disponible')

  // Liberar nombre anterior
  const oldSnap = await get(ref(db, `users/${uid}/username`))
  const oldName = oldSnap.val()
  if (oldName && oldName.toLowerCase() !== key) {
    await remove(ref(db, `usernames/${oldName.toLowerCase()}`)).catch(() => {})
  }

  await set(ref(db, `usernames/${key}`), uid)
  await set(ref(db, `users/${uid}/username`), name)
}

export async function getUsername(uid) {
  const snap = await get(ref(db, `users/${uid}/username`))
  return snap.val()
}
