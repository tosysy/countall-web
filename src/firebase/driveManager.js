/**
 * Google Drive App Data folder manager.
 * Almacena el bundle de datos personales (sync_data.json) y
 * las imágenes de fondo (bg_{counterId}.jpg) en la carpeta appDataFolder.
 *
 * Todos los métodos son async y requieren un accessToken válido.
 * Cuando el token expira (401), lanzar Error con code 'token_expired'.
 */

const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const BUNDLE_NAME = 'sync_data.json'

// Cache en memoria de fileId → para evitar listFiles en cada operación
const fileIdCache = {}

async function apiFetch(url, options, token) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options?.headers ?? {}) },
  })
  if (res.status === 401) {
    const err = new Error('Drive token expired')
    err.code = 'token_expired'
    throw err
  }
  return res
}

async function listFiles(token) {
  const res = await apiFetch(
    `${FILES_URL}?spaces=appDataFolder&fields=files(id,name)&pageSize=500`,
    {},
    token
  )
  if (!res.ok) throw new Error(`listFiles HTTP ${res.status}`)
  const data = await res.json()
  const map = {}
  for (const f of data.files ?? []) map[f.name] = f.id
  return map
}

async function getFileId(name, token) {
  if (fileIdCache[name]) return fileIdCache[name]
  const all = await listFiles(token)
  for (const [n, id] of Object.entries(all)) fileIdCache[n] = id
  return fileIdCache[name] ?? null
}

// ─── Bundle JSON ──────────────────────────────────────────────────────────────

export async function uploadBundle(bundle, token) {
  const existing = await getFileId(BUNDLE_NAME, token)
  const meta = JSON.stringify({ name: BUNDLE_NAME, parents: ['appDataFolder'] })
  const boundary = 'CountAllBoundary'
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${bundle}\r\n--${boundary}--`

  if (existing) {
    // PATCH update
    const res = await apiFetch(
      `${UPLOAD_URL}/${existing}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      },
      token
    )
    if (!res.ok) throw new Error(`uploadBundle PATCH HTTP ${res.status}`)
  } else {
    // POST create
    const res = await apiFetch(
      `${UPLOAD_URL}?uploadType=multipart`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart,
      },
      token
    )
    if (!res.ok) throw new Error(`uploadBundle POST HTTP ${res.status}`)
    const data = await res.json()
    fileIdCache[BUNDLE_NAME] = data.id
  }
}

export async function downloadBundle(token) {
  const id = await getFileId(BUNDLE_NAME, token)
  if (!id) return null
  const res = await apiFetch(`${FILES_URL}/${id}?alt=media`, {}, token)
  if (!res.ok) return null
  return await res.text()
}

export async function hasBundleData(token) {
  const id = await getFileId(BUNDLE_NAME, token)
  return !!id
}

// ─── Background images ────────────────────────────────────────────────────────

export async function uploadBackground(counterId, blob, token) {
  const name = `bg_${counterId}.jpg`
  const existing = await getFileId(name, token)
  const boundary = 'CountAllBgBoundary'
  const meta = JSON.stringify({ name, parents: existing ? undefined : ['appDataFolder'] })

  // Build multipart body manually
  const metaBytes = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`
  )
  const trailBytes = new TextEncoder().encode(`\r\n--${boundary}--`)
  const imgBytes = new Uint8Array(await blob.arrayBuffer())
  const combined = new Uint8Array(metaBytes.length + imgBytes.length + trailBytes.length)
  combined.set(metaBytes, 0)
  combined.set(imgBytes, metaBytes.length)
  combined.set(trailBytes, metaBytes.length + imgBytes.length)

  if (existing) {
    const res = await apiFetch(
      `${UPLOAD_URL}/${existing}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: combined,
      },
      token
    )
    if (!res.ok) throw new Error(`uploadBackground PATCH ${res.status}`)
  } else {
    const res = await apiFetch(
      `${UPLOAD_URL}?uploadType=multipart`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: combined,
      },
      token
    )
    if (!res.ok) throw new Error(`uploadBackground POST ${res.status}`)
    const data = await res.json()
    fileIdCache[name] = data.id
  }
}

export async function downloadBackground(counterId, token) {
  const name = `bg_${counterId}.jpg`
  const id = await getFileId(name, token)
  if (!id) return null
  const res = await apiFetch(`${FILES_URL}/${id}?alt=media`, {}, token)
  if (!res.ok) return null
  return await res.blob()
}

export async function downloadAllBackgrounds(token) {
  const all = await listFiles(token)
  const result = {}
  for (const [name, id] of Object.entries(all)) {
    if (!name.startsWith('bg_') || !name.endsWith('.jpg')) continue
    const counterId = name.slice(3, -4) // remove "bg_" and ".jpg"
    const res = await apiFetch(`${FILES_URL}/${id}?alt=media`, {}, token)
    if (res.ok) {
      result[counterId] = URL.createObjectURL(await res.blob())
    }
  }
  return result
}

export async function deleteBackground(counterId, token) {
  const name = `bg_${counterId}.jpg`
  const id = await getFileId(name, token)
  if (!id) return
  await apiFetch(`${FILES_URL}/${id}`, { method: 'DELETE' }, token)
  delete fileIdCache[name]
}

export async function deleteAllAppData(token) {
  const all = await listFiles(token)
  for (const id of Object.values(all)) {
    await apiFetch(`${FILES_URL}/${id}`, { method: 'DELETE' }, token).catch(() => {})
  }
  Object.keys(fileIdCache).forEach(k => delete fileIdCache[k])
}

export function clearFileIdCache() {
  Object.keys(fileIdCache).forEach(k => delete fileIdCache[k])
}
