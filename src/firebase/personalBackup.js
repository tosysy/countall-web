/**
 * Copia de seguridad de datos personales — espejo del StorageBackupManager de Android
 * para que web y app nativa compartan los mismos datos personales:
 *
 * - Bundle JSON: RTDB `users/{uid}/syncBundle` (string JSON)
 *   (fallback de lectura: Firebase Storage `personal/{uid}/sync_data.json`, backups antiguos)
 * - Fondos:      Firebase Storage `personal/{uid}/backgrounds/bg_{counterId}.jpg`
 *
 * La señal de cambio sigue siendo `users/{uid}/dataVersion` / `bgVersion` (syncManager).
 */
import { ref as dbRef, set, get, remove } from 'firebase/database'
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject, listAll,
} from 'firebase/storage'
import { db, storage, auth } from './config'

function uid() { return auth.currentUser?.uid ?? null }
function bundleRef(u) { return storageRef(storage, `personal/${u}/sync_data.json`) }
function bgRef(u, counterId) { return storageRef(storage, `personal/${u}/backgrounds/bg_${counterId}.jpg`) }
function bgFolder(u) { return storageRef(storage, `personal/${u}/backgrounds`) }

// ─── Bundle JSON ──────────────────────────────────────────────────────────────

export async function uploadSyncBundle(json) {
  const me = uid(); if (!me) return false
  try {
    await set(dbRef(db, `users/${me}/syncBundle`), json)
    return true
  } catch { return false }
}

export async function downloadSyncBundle() {
  const me = uid(); if (!me) return null
  try {
    const snap = await get(dbRef(db, `users/${me}/syncBundle`))
    const fromRtdb = snap.val()
    if (typeof fromRtdb === 'string' && fromRtdb) return fromRtdb
  } catch { /* seguir con el fallback */ }
  // Fallback a Firebase Storage (backups previos a la migración, igual que Android)
  try {
    const url = await getDownloadURL(bundleRef(me))
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

export async function hasSyncData() {
  return (await downloadSyncBundle()) != null
}

export async function deleteSyncBundle() {
  const me = uid(); if (!me) return
  await remove(dbRef(db, `users/${me}/syncBundle`)).catch(() => {})
  await deleteObject(bundleRef(me)).catch(() => {})
}

// ─── Fondos de contadores personales ─────────────────────────────────────────

export async function uploadBackground(counterId, blob) {
  const me = uid(); if (!me) return false
  try {
    await uploadBytes(bgRef(me, counterId), blob, { contentType: 'image/jpeg' })
    return true
  } catch { return false }
}

/** Devuelve { counterId: blobUrl } con todos los fondos personales, o null si falla el listado. */
export async function downloadAllBackgrounds() {
  const me = uid(); if (!me) return null
  try {
    const list = await listAll(bgFolder(me))
    const result = {}
    for (const item of list.items) {
      const name = item.name
      if (!name.startsWith('bg_') || !name.endsWith('.jpg')) continue
      const counterId = name.slice(3, -4)
      try {
        const url = await getDownloadURL(item)
        const res = await fetch(url)
        if (res.ok) result[counterId] = URL.createObjectURL(await res.blob())
      } catch { /* existe pero no se pudo descargar — no borrar en local */ }
    }
    return result
  } catch { return null }
}

export async function deleteBackground(counterId) {
  const me = uid(); if (!me) return
  await deleteObject(bgRef(me, counterId)).catch(() => {})
}

/** Borra TODO lo personal (bundle + fondos). Para borrado de cuenta. */
export async function deleteAllPersonal() {
  const me = uid(); if (!me) return
  await deleteSyncBundle()
  try {
    const list = await listAll(bgFolder(me))
    await Promise.allSettled(list.items.map(i => deleteObject(i)))
  } catch { /* ignorar */ }
}
