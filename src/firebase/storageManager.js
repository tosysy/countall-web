import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './config'

export function sharedCounterPath(sharedId) {
  return `shared_counter_backgrounds/${sharedId}.jpg`
}

export function folderPath(uid, folderId) {
  return `folder_backgrounds/${uid}/${folderId}.jpg`
}

export async function uploadBackground(path, blob) {
  const sRef = storageRef(storage, path)
  await uploadBytes(sRef, blob, { contentType: 'image/jpeg' })
  return await getDownloadURL(sRef)
}

export async function deleteBackground(path) {
  try {
    await deleteObject(storageRef(storage, path))
  } catch {
    // Not found — ignorar
  }
}

export async function downloadBackgroundUrl(url) {
  // Para imágenes de Firebase Storage, la URL ya es pública/firmada.
  // Las descargamos como blob para mostrarlas localmente.
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return URL.createObjectURL(await res.blob())
  } catch {
    return null
  }
}
