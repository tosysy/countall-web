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
 * Inicia sesión con Google usando redirect (compatible con GitHub Pages / COOP).
 * El resultado llega en handleRedirectResult al volver de Google.
 */
/**
 * Inicia sesión con Google usando popup.
 * Fallback a redirect en iOS/Safari donde los popups están bloqueados.
 */
export async function signInWithGoogle() {
  const provider = buildGoogleProvider()
  try {
    const result = await signInWithPopup(auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    return { user: result.user, accessToken: credential?.accessToken ?? null }
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      await signInWithRedirect(auth, provider)
      return null
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
    sessionStorage.removeItem('drive_refresh_attempted')
    const credential = GoogleAuthProvider.credentialFromResult(result)
    return { user: result.user, accessToken: credential?.accessToken ?? null }
  } catch {
    return null
  }
}

/**
 * Obtiene un nuevo access token de Drive con popup silencioso.
 */
export async function refreshDriveToken() {
  const provider = buildGoogleProvider()
  provider.setCustomParameters({ prompt: 'none' })
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
