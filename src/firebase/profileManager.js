/**
 * profileManager.js — perfiles públicos, foto de perfil y contadores públicos.
 * Espejo de AuthManager/SyncManager (Android):
 *
 * - users/{uid}: username, photoUrl, fullName, gender, birthDate,
 *   birthDateVisible, instagram, instagramVerified   (solo legible por uno mismo)
 * - publicProfiles/{uid}: username, photoUrl, fullName, gender,
 *   birthDate (solo si visible), instagram, instagramVerified, friendCount,
 *   publicCounters/{id}, publicFolders/{id}           (legible por autenticados)
 * - Storage profilePhotos/{uid}.jpg
 */
import { ref, get, set, update, onValue, off } from 'firebase/database'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage, auth } from './config'

function uid() { return auth.currentUser?.uid ?? null }

// ─── Lectura de perfiles ──────────────────────────────────────────────────────

function parseCounter(c) {
  const logEntries = []
  c.child('logEntries').forEach(e => {
    logEntries.push({
      label: e.child('label').val() ?? '', text: e.child('text').val() ?? '',
      date: e.child('date').val() ?? 0, author: e.child('author').val() ?? null,
    })
  })
  const counter = {
    id: c.key,
    name: c.child('name').val() ?? '',
    value: c.child('value').val() ?? 0,
    increment: c.child('increment').val() ?? 1,
    target: c.child('target').val() ?? null,
    color: c.child('color').val() ?? null,
    backgroundImageUrl: c.child('backgroundImageUrl').val() ?? null,
    folderId: c.child('folderId').val() ?? null,
    isShared: c.child('isShared').val() ?? false,
    sharedId: c.child('sharedId').val() ?? null,
    isCompetitive: c.child('isCompetitive').val() ?? false,
    logEntries,
  }
  if (counter.isCompetitive) {
    const scores = {}, usernames = {}, targets = {}, userColors = {}, competitorLogEntries = {}
    c.child('competitorScores').forEach(s => { if (s.key) scores[s.key] = s.val() ?? 0 })
    c.child('competitorUsernames').forEach(s => { if (s.key) usernames[s.key] = s.val() ?? '' })
    c.child('competitorTargets').forEach(s => { if (s.key && s.val() != null) targets[s.key] = s.val() })
    c.child('userColors').forEach(s => { if (s.key && s.val()) userColors[s.key] = s.val() })
    c.child('competitorLogs').forEach(u => {
      if (!u.key) return
      const logs = []
      u.forEach(e => logs.push({ label: e.child('label').val() ?? '', text: e.child('text').val() ?? '', date: e.child('date').val() ?? 0 }))
      if (logs.length) competitorLogEntries[u.key] = logs
    })
    counter.competitorScores = scores
    counter.competitorUsernames = usernames
    counter.competitorTargets = targets
    counter.userColors = userColors
    counter.competitorLogEntries = competitorLogEntries
  }
  return counter
}

export async function getPublicProfile(targetUid) {
  const snap = await get(ref(db, `publicProfiles/${targetUid}`))
  if (!snap.exists()) return null
  const counters = []
  snap.child('publicCounters').forEach(c => { counters.push(parseCounter(c)) })
  const folders = []
  snap.child('publicFolders').forEach(f => {
    folders.push({
      id: f.key, name: f.child('name').val() ?? '',
      color: f.child('color').val() ?? null,
      backgroundImageUrl: f.child('backgroundImageUrl').val() ?? null,
      parentFolderId: f.child('parentFolderId').val() ?? null,
      isShared: f.child('isShared').val() ?? false,
    })
  })
  return {
    uid: targetUid,
    username: snap.child('username').val() ?? '',
    fullName: snap.child('fullName').val() ?? '',
    photoUrl: snap.child('photoUrl').val() ?? null,
    gender: snap.child('gender').val() ?? null,
    // Solo presente si el usuario la marcó como visible (igual que Android)
    birthDate: snap.child('birthDate').val() ?? 0,
    instagram: snap.child('instagram').val() ?? null,
    instagramVerified: snap.child('instagramVerified').val() ?? false,
    friendCount: snap.child('friendCount').val() ?? 0,
    publicCounters: counters,
    publicFolders: folders,
  }
}

/** Devuelve { uid: {photoUrl, fullName, username} } para enriquecer listas de amigos. */
export async function getProfilesLite(uids) {
  const result = {}
  await Promise.all(uids.map(async (u) => {
    try {
      const snap = await get(ref(db, `publicProfiles/${u}`))
      if (snap.exists()) {
        result[u] = {
          photoUrl: snap.child('photoUrl').val() ?? null,
          fullName: snap.child('fullName').val() ?? '',
          username: snap.child('username').val() ?? '',
        }
      }
    } catch { /* ignorar */ }
  }))
  return result
}

// ─── Escritura del propio perfil ─────────────────────────────────────────────

/**
 * Guarda los campos del perfil en users/{uid} y refleja en publicProfiles los
 * públicos (fullName, gender; birthDate solo si birthDateVisible).
 */
export async function saveProfileFields({ fullName, gender, birthDate, birthDateVisible, instagram }) {
  const me = uid(); if (!me) return
  const priv = {}
  const pub = {}
  if (fullName !== undefined) { priv.fullName = fullName; pub.fullName = fullName }
  if (gender !== undefined) { priv.gender = gender; pub.gender = gender }
  if (birthDate !== undefined) priv.birthDate = birthDate
  if (birthDateVisible !== undefined) priv.birthDateVisible = birthDateVisible
  if (birthDate !== undefined || birthDateVisible !== undefined) {
    pub.birthDate = birthDateVisible ? (birthDate ?? 0) : null
  }
  if (instagram !== undefined) {
    const clean = (instagram ?? '').replace(/^@/, '').trim()
    priv.instagram = clean || null
    priv.instagramVerified = false
    pub.instagram = clean || null
    pub.instagramVerified = false
  }
  await update(ref(db, `users/${me}`), priv)
  await update(ref(db, `publicProfiles/${me}`), pub)
}

export async function getOwnProfile() {
  const me = uid(); if (!me) return null
  const snap = await get(ref(db, `users/${me}`))
  return {
    username: snap.child('username').val() ?? null,
    fullName: snap.child('fullName').val() ?? '',
    photoUrl: snap.child('photoUrl').val() ?? null,
    gender: snap.child('gender').val() ?? null,
    birthDate: snap.child('birthDate').val() ?? 0,
    birthDateVisible: snap.child('birthDateVisible').val() ?? false,
    instagram: snap.child('instagram').val() ?? null,
    instagramVerified: snap.child('instagramVerified').val() ?? false,
  }
}

// ─── Foto de perfil ───────────────────────────────────────────────────────────

/**
 * Recorta la imagen a un cuadrado centrado de 512px y la sube a
 * profilePhotos/{uid}.jpg. Actualiza users y publicProfiles.
 */
export async function uploadProfilePhoto(file) {
  const me = uid(); if (!me) return null
  const blob = await centerCropSquare(file, 512)
  const sRef = storageRef(storage, `profilePhotos/${me}.jpg`)
  await uploadBytes(sRef, blob, { contentType: 'image/jpeg' })
  const url = await getDownloadURL(sRef)
  await set(ref(db, `users/${me}/photoUrl`), url)
  await set(ref(db, `publicProfiles/${me}/photoUrl`), url)
  return url
}

export async function removeProfilePhoto() {
  const me = uid(); if (!me) return
  await deleteObject(storageRef(storage, `profilePhotos/${me}.jpg`)).catch(() => {})
  await set(ref(db, `users/${me}/photoUrl`), null)
  await set(ref(db, `publicProfiles/${me}/photoUrl`), null)
}

function centerCropSquare(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('crop failed')), 'image/jpeg', 0.85)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// ─── Contadores públicos (showOnProfile) ─────────────────────────────────────

/**
 * Publica en publicProfiles/{uid}/publicCounters|publicFolders los contadores
 * marcados showOnProfile o dentro de carpetas públicas (mismo criterio que
 * Android syncPublicCounters, incluidos los ancestros).
 */
export async function syncPublicCounters(counters, folders) {
  const me = uid(); if (!me) return
  const foldersMap = Object.fromEntries(folders.map(f => [f.id, f]))

  const isFolderPublic = (folder) => {
    let f = folder
    const seen = new Set()
    while (f && !seen.has(f.id)) {
      if (f.showOnProfile) return true
      seen.add(f.id)
      f = f.parentFolderId ? foldersMap[f.parentFolderId] : null
    }
    return false
  }

  const isCounterPublic = (c) => {
    if (c.showOnProfile) return true
    const folder = c.folderId ? foldersMap[c.folderId] : null
    return folder ? isFolderPublic(folder) : false
  }

  const publicCounters = counters.filter(isCounterPublic)
  const publicFolders = folders.filter(isFolderPublic)

  const countersMap = {}
  for (const c of publicCounters) {
    const m = {
      id: c.id, name: c.name, value: c.value, increment: c.increment,
      target: c.target ?? null, color: c.color ?? null,
      backgroundImageUrl: c.backgroundImageUrl ?? null,
      folderId: c.folderId ?? null,
      isShared: c.isShared ?? false, sharedId: c.sharedId ?? null,
      ownerId: c.ownerId ?? null, ownerUsername: c.ownerUsername ?? null,
      role: c.role ?? 'owner',
      logEntries: (c.logEntries ?? []).map(e => ({ label: e.label ?? null, text: e.text ?? '', date: e.date ?? 0, author: e.author ?? null })),
      isCompetitive: c.isCompetitive ?? false,
    }
    if (c.isCompetitive) {
      m.competitorScores = c.competitorScores ?? {}
      m.competitorUsernames = c.competitorUsernames ?? {}
      m.competitorTargets = c.competitorTargets ?? {}
      m.userColors = c.userColors ?? {}
      const logsByUid = {}
      for (const [u, entries] of Object.entries(c.competitorLogEntries ?? {})) {
        logsByUid[u] = entries.map(e => ({ label: e.label ?? null, text: e.text ?? '', date: e.date ?? 0 }))
      }
      logsByUid[me] = (c.logEntries ?? []).map(e => ({ label: e.label ?? null, text: e.text ?? '', date: e.date ?? 0 }))
      m.competitorLogs = logsByUid
    }
    countersMap[c.id] = m
  }

  const foldersOut = {}
  for (const f of publicFolders) {
    foldersOut[f.id] = {
      id: f.id, name: f.name, color: f.color ?? null,
      backgroundImageUrl: f.backgroundImageUrl ?? null,
      parentFolderId: f.parentFolderId ?? null,
      isShared: f.isShared ?? false,
    }
  }

  await update(ref(db), {
    [`publicProfiles/${me}/publicCounters`]: countersMap,
    [`publicProfiles/${me}/publicFolders`]: foldersOut,
  })
}

// ─── Listener en tiempo real de un perfil ────────────────────────────────────

export function listenPublicProfile(targetUid, onUpdate) {
  const r = ref(db, `publicProfiles/${targetUid}`)
  const handler = onValue(r, snap => {
    if (!snap.exists()) { onUpdate(null); return }
    getPublicProfile(targetUid).then(onUpdate).catch(() => {})
  })
  return () => off(r, 'value', handler)
}
