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
