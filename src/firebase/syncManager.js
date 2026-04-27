/**
 * SyncManager — lógica de sincronización con Firebase RTDB y Google Drive.
 * Funciona de forma similar a SyncManager.kt del proyecto Android.
 */
import {
  ref, set, get, push, remove, update, onValue, off, serverTimestamp,
  query as dbQuery, orderByKey, startAt, endAt, limitToFirst,
} from 'firebase/database'
import { db, auth } from './config'
import {
  uploadBundle, downloadBundle, hasBundleData,
  uploadBackground as driveUploadBg, downloadBackground as driveDownloadBg,
  downloadAllBackgrounds, deleteBackground as driveDeleteBg, deleteAllAppData,
} from './driveManager'
import {
  sharedCounterPath, folderPath, uploadBackground as storageUpload,
  deleteBackground as storageDelete, downloadBackgroundUrl,
} from './storageManager'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return auth.currentUser?.uid ?? null }

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ─── Contadores compartidos: push ─────────────────────────────────────────────

export async function pushCounterUpdate(counter) {
  if (!counter.isShared || !counter.sharedId) return
  if (counter.role === 'viewer') return
  const me = uid(); if (!me) return

  const base = {
    name: counter.name, increment: counter.increment,
    target: counter.target ?? null, color: counter.color ?? null,
    lastModifiedBy: me, lastModifiedDeviceId: 'web',
    lastModifiedUsername: auth.currentUser?.displayName ?? '',
    lastModifiedTimestamp: serverTimestamp(),
  }

  if (counter.isCompetitive) {
    await update(ref(db, `sharedCounters/${counter.sharedId}/data`), base)
    await set(ref(db, `sharedCounters/${counter.sharedId}/scores/${me}`), {
      value: counter.value,
      logEntries: counter.logEntries.map(e => ({ label: e.label ?? null, text: e.text, date: e.date })),
      deviceId: 'web',
    })
    // Per-user color and target
    if (counter.userColors?.[me] !== undefined) {
      const colorVal = counter.userColors[me]
      if (colorVal) await set(ref(db, `sharedCounters/${counter.sharedId}/userColors/${me}`), colorVal)
      else await set(ref(db, `sharedCounters/${counter.sharedId}/userColors/${me}`), null)
    }
    if (counter.competitorTargets?.[me] !== undefined) {
      const tgtVal = counter.competitorTargets[me]
      if (tgtVal != null) await set(ref(db, `sharedCounters/${counter.sharedId}/competitorTargets/${me}`), tgtVal)
      else await set(ref(db, `sharedCounters/${counter.sharedId}/competitorTargets/${me}`), null)
    }
  } else {
    await update(ref(db, `sharedCounters/${counter.sharedId}/data`), {
      ...base,
      value: counter.value,
      logEntries: counter.logEntries.map(e => ({ label: e.label ?? null, text: e.text, date: e.date })),
    })
  }
}

// ─── Contadores compartidos: listen ──────────────────────────────────────────

/**
 * Escucha cambios remotos en un sharedCounter.
 * onUpdate(updatedFields) — campos que cambiaron.
 */
export function listenSharedCounter(sharedId, localId, onUpdate, onDeleted) {
  const r = ref(db, `sharedCounters/${sharedId}`)
  const handler = (snap) => {
    if (!snap.exists()) { onDeleted?.(localId); return }
    const data = snap.child('data')
    if (!data.exists()) return
    const me = uid()
    const member = snap.child(`members/${me}`)
    if (!member.exists()) { onDeleted?.(localId); return }

    const lastDeviceId = data.child('lastModifiedDeviceId').val() ?? ''
    const isComp = data.child('mode').val() === 'competitive'

    const upd = {
      localId,
      sharedId,
      name: data.child('name').val(),
      increment: data.child('increment').val() ?? 1,
      target: data.child('target').val() ?? null,
      color: data.child('color').val() ?? null,
      backgroundImageUrl: data.child('backgroundImageUrl').val() ?? null,
      role: member.child('role').val() ?? 'viewer',
      isCompetitive: isComp,
      fromRemote: lastDeviceId !== 'web',
      lastModifiedBy: data.child('lastModifiedBy').val() ?? '',
      lastModifiedUsername: data.child('lastModifiedUsername').val() ?? '',
    }

    if (isComp) {
      const scores = {}; const usernames = {}; const userColors = {}; const competitorTargets = {}
      const competitorLogEntries = {}
      snap.child('members').forEach(m => { if (m.key) usernames[m.key] = m.child('username').val() })
      snap.child('scores').forEach(s => {
        if (!s.key) return
        scores[s.key] = s.child('value').val() ?? 0
        const logs = []
        s.child('logEntries').forEach(e => {
          logs.push({ label: e.child('label').val() ?? '', text: e.child('text').val() ?? '', date: e.child('date').val() ?? 0 })
        })
        if (logs.length > 0) competitorLogEntries[s.key] = logs
      })
      snap.child('userColors').forEach(c => { if (c.key && c.val()) userColors[c.key] = c.val() })
      snap.child('competitorTargets').forEach(t => { if (t.key && t.val() != null) competitorTargets[t.key] = t.val() })
      upd.competitorScores = scores
      upd.competitorUsernames = usernames
      upd.userColors = userColors
      upd.competitorTargets = competitorTargets
      upd.competitorLogEntries = competitorLogEntries
      const myScore = snap.child(`scores/${me}`)
      if (myScore.exists() && myScore.child('deviceId').val() !== 'web') {
        upd.myValue = myScore.child('value').val() ?? 0
        upd.myLogEntries = []
        myScore.child('logEntries').forEach(e => {
          upd.myLogEntries.push({ label: e.child('label').val() ?? '', text: e.child('text').val() ?? '', date: e.child('date').val() ?? 0 })
        })
      }
    } else if (lastDeviceId !== 'web') {
      upd.value = data.child('value').val() ?? 0
      upd.logEntries = []
      data.child('logEntries').forEach(e => {
        upd.logEntries.push({ label: e.child('label').val() ?? '', text: e.child('text').val() ?? '', date: e.child('date').val() ?? 0 })
      })
    }

    onUpdate(upd)
  }
  onValue(r, handler)
  return () => off(r, 'value', handler)
}

// ─── Compartir contador ───────────────────────────────────────────────────────

export async function shareCounter(counter, competitive = false) {
  const me = uid(); if (!me) throw new Error('No autenticado')
  const username = auth.currentUser?.displayName ?? ''

  const sharedRef = push(ref(db, 'sharedCounters'))
  const sharedId = sharedRef.key
  const inviteCode = newId().slice(0, 12)

  await set(ref(db, `sharedCounters/${sharedId}/members/${me}`), {
    username, role: 'owner', joinedAt: serverTimestamp(),
  })

  const baseData = {
    name: counter.name, increment: counter.increment,
    target: counter.target ?? null, color: counter.color ?? null,
    backgroundImageUrl: counter.backgroundImageUrl ?? null,
    localId: counter.id, lastModifiedBy: me, lastModifiedDeviceId: 'web',
    lastModifiedUsername: username, lastModifiedTimestamp: serverTimestamp(),
  }

  if (competitive) {
    baseData.mode = 'competitive'
    await set(ref(db, `sharedCounters/${sharedId}/data`), baseData)
    await set(ref(db, `sharedCounters/${sharedId}/scores/${me}`), {
      value: counter.value,
      logEntries: counter.logEntries.map(e => ({ label: e.label ?? null, text: e.text, date: e.date })),
      deviceId: 'web',
    })
  } else {
    baseData.value = counter.value
    baseData.logEntries = counter.logEntries.map(e => ({ label: e.label ?? null, text: e.text, date: e.date }))
    await set(ref(db, `sharedCounters/${sharedId}/data`), baseData)
  }

  await set(ref(db, `sharedCounters/${sharedId}/inviteCode`), inviteCode)
  await set(ref(db, `invites/${inviteCode}`), { sharedId, createdBy: me, createdAt: serverTimestamp() })
  await set(ref(db, `users/${me}/linkedCounters/${sharedId}`), true)

  return { sharedId, inviteCode }
}

export async function getInviteCode(sharedId) {
  const snap = await get(ref(db, `sharedCounters/${sharedId}/inviteCode`))
  return snap.val()
}

// ─── Unirse a contador compartido ─────────────────────────────────────────────

export async function getPreviewByCode(code) {
  const me = uid()
  const inviteSnap = await get(ref(db, `invites/${code}`))
  if (!inviteSnap.exists()) return null
  if (inviteSnap.child('createdBy').val() === me) return null
  const sharedId = inviteSnap.child('sharedId').val()
  if (!sharedId) return null
  const isFolder = inviteSnap.child('isFolder').val() ?? false
  const dataSnap = await get(ref(db, `${isFolder ? 'sharedFolders' : 'sharedCounters'}/${sharedId}/data`))
  if (!dataSnap.exists()) return null
  return { name: dataSnap.child('name').val(), isFolder, sharedId }
}

export async function joinByCode(code) {
  const me = uid(); if (!me) throw new Error('No autenticado')

  const inviteSnap = await get(ref(db, `invites/${code}`))
  if (!inviteSnap.exists()) throw new Error('Código no válido')
  if (inviteSnap.child('createdBy').val() === me) throw new Error('Es tu propio código')

  const sharedId = inviteSnap.child('sharedId').val()
  const isFolder = inviteSnap.child('isFolder').val() ?? false

  if (isFolder) {
    return await joinSharedFolder(sharedId)
  } else {
    return await joinSharedCounter(sharedId)
  }
}

export async function joinSharedCounter(sharedId) {
  const me = uid(); if (!me) throw new Error('No autenticado')
  const username = auth.currentUser?.displayName ?? ''

  const dataSnap = await get(ref(db, `sharedCounters/${sharedId}/data`))
  if (!dataSnap.exists()) throw new Error('Contador no encontrado')

  await set(ref(db, `sharedCounters/${sharedId}/members/${me}`), {
    username, role: 'viewer', joinedAt: serverTimestamp(),
  })
  await set(ref(db, `users/${me}/linkedCounters/${sharedId}`), true)

  const isComp = dataSnap.child('mode').val() === 'competitive'
  const counter = {
    id: newId(),
    name: dataSnap.child('name').val() ?? '',
    value: isComp ? 0 : (dataSnap.child('value').val() ?? 0),
    increment: dataSnap.child('increment').val() ?? 1,
    target: dataSnap.child('target').val() ?? null,
    color: dataSnap.child('color').val() ?? null,
    backgroundImageUrl: dataSnap.child('backgroundImageUrl').val() ?? null,
    logEntries: [],
    folderId: null,
    isShared: true, sharedId, ownerId: null, role: 'viewer',
    isCompetitive: isComp,
    competitorScores: {}, competitorUsernames: {}, userColors: {},
  }
  if (!isComp) {
    dataSnap.child('logEntries').forEach(e => {
      counter.logEntries.push({ label: e.child('label').val() ?? '', text: e.child('text').val() ?? '', date: e.child('date').val() ?? 0 })
    })
  }
  return counter
}

// ─── Desvincular / Dejar de compartir ─────────────────────────────────────────

export async function unshareCounter(counter) {
  const me = uid(); if (!me) return
  const { sharedId, role } = counter
  if (!sharedId) return

  if (role === 'owner') {
    await storageDelete(sharedCounterPath(sharedId)).catch(() => {})
    const codeSnap = await get(ref(db, `sharedCounters/${sharedId}/inviteCode`))
    const code = codeSnap.val()
    if (code) await remove(ref(db, `invites/${code}`)).catch(() => {})
    await remove(ref(db, `sharedCounters/${sharedId}`))
  } else {
    await remove(ref(db, `sharedCounters/${sharedId}/members/${me}`))
  }
  await remove(ref(db, `users/${me}/linkedCounters/${sharedId}`))
}

// ─── Miembros ─────────────────────────────────────────────────────────────────

export async function getMembers(sharedId) {
  const snap = await get(ref(db, `sharedCounters/${sharedId}/members`))
  const list = []
  snap.forEach(m => {
    if (m.key) list.push({
      uid: m.key,
      username: m.child('username').val() ?? '',
      role: m.child('role').val() ?? 'viewer',
      joinedAt: m.child('joinedAt').val() ?? 0,
    })
  })
  return list
}

export async function setMemberRole(sharedId, targetUid, role) {
  await set(ref(db, `sharedCounters/${sharedId}/members/${targetUid}/role`), role)
}

export async function removeMember(sharedId, targetUid) {
  await remove(ref(db, `sharedCounters/${sharedId}/members/${targetUid}`))
}

// ─── Invitaciones ─────────────────────────────────────────────────────────────

export async function getUserIdByUsername(username) {
  const snap = await get(ref(db, `usernames/${username.toLowerCase().trim()}`))
  return snap.val()
}

export async function sendInvitation(sharedId, itemName, toUsername, role, isFolder = false) {
  const me = uid(); if (!me) return
  const fromUsername = auth.currentUser?.displayName ?? ''
  const toUid = await getUserIdByUsername(toUsername)
  if (!toUid) throw new Error('Usuario no encontrado')

  const basePath = isFolder ? `sharedFolders/${sharedId}/members` : `sharedCounters/${sharedId}/members`
  const memberSnap = await get(ref(db, `${basePath}/${toUid}`))
  if (memberSnap.exists()) throw new Error('Ya es miembro')

  const invId = `${me}_${sharedId}`
  const data = {
    fromUid: me, fromUsername, sharedId, itemName, role,
    createdAt: serverTimestamp(), status: 'pending',
    isRequest: false, isFolder,
  }
  await set(ref(db, `invitations/${toUid}/${invId}`), data)
  await set(ref(db, `sentInvitations/${me}/${invId}`), { ...data, toUid, toUsername })
}

export function listenInvitations(onUpdate) {
  const me = uid(); if (!me) return () => {}
  const r = ref(db, `invitations/${me}`)
  const handler = (snap) => {
    const list = []
    snap.forEach(c => {
      if (c.child('status').val() !== 'pending') return
      list.push({
        id: c.key, fromUid: c.child('fromUid').val(),
        fromUsername: c.child('fromUsername').val(),
        sharedId: c.child('sharedId').val(),
        itemName: c.child('itemName').val() ?? c.child('counterName').val() ?? '',
        role: c.child('role').val() ?? 'viewer',
        createdAt: c.child('createdAt').val() ?? 0,
        isRequest: c.child('isRequest').val() ?? false,
        isFolder: c.child('isFolder').val() ?? false,
      })
    })
    onUpdate(list)
  }
  onValue(r, handler)
  return () => off(r, 'value', handler)
}

export function listenSentInvitations(onUpdate) {
  const me = uid(); if (!me) return () => {}
  const r = ref(db, `sentInvitations/${me}`)
  const handler = (snap) => {
    const list = []
    snap.forEach(c => {
      if (c.child('status').val() !== 'pending') return
      list.push({
        id: c.key, toUid: c.child('toUid').val(),
        toUsername: c.child('toUsername').val(),
        sharedId: c.child('sharedId').val(),
        itemName: c.child('itemName').val() ?? '',
        role: c.child('role').val() ?? 'viewer',
        createdAt: c.child('createdAt').val() ?? 0,
        isFolder: c.child('isFolder').val() ?? false,
      })
    })
    onUpdate(list)
  }
  onValue(r, handler)
  return () => off(r, 'value', handler)
}

export async function acceptInvitation(invitation) {
  const me = uid(); if (!me) return
  const username = auth.currentUser?.displayName ?? ''

  const dSnap = await get(ref(db, `sharedCounters/${invitation.sharedId}/data`))
  if (!dSnap.exists()) {
    await remove(ref(db, `invitations/${me}/${invitation.id}`))
    return null
  }

  await set(ref(db, `sharedCounters/${invitation.sharedId}/members/${me}`), {
    username, role: invitation.role, joinedAt: serverTimestamp(),
  })
  await set(ref(db, `users/${me}/linkedCounters/${invitation.sharedId}`), true)

  const isComp = dSnap.child('mode').val() === 'competitive'
  const counter = {
    id: newId(),
    name: dSnap.child('name').val() ?? invitation.itemName,
    value: isComp ? 0 : (dSnap.child('value').val() ?? 0),
    increment: dSnap.child('increment').val() ?? 1,
    target: dSnap.child('target').val() ?? null,
    color: dSnap.child('color').val() ?? null,
    backgroundImageUrl: dSnap.child('backgroundImageUrl').val() ?? null,
    logEntries: [], folderId: null,
    isShared: true, sharedId: invitation.sharedId,
    ownerId: invitation.fromUid, ownerUsername: invitation.fromUsername,
    role: invitation.role, isCompetitive: isComp,
    competitorScores: {}, competitorUsernames: {}, userColors: {},
  }
  if (!isComp) {
    dSnap.child('logEntries').forEach(e => {
      counter.logEntries.push({ label: e.child('label').val() ?? '', text: e.child('text').val() ?? '', date: e.child('date').val() ?? 0 })
    })
  }

  await remove(ref(db, `invitations/${me}/${invitation.id}`))
  await remove(ref(db, `sentInvitations/${invitation.fromUid}/${invitation.id}`)).catch(() => {})
  return counter
}

export async function acceptFolderInvitation(invitation) {
  const me = uid(); if (!me) return null
  const username = auth.currentUser?.displayName ?? ''
  const dSnap = await get(ref(db, `sharedFolders/${invitation.sharedId}/data`))
  if (!dSnap.exists()) {
    await remove(ref(db, `invitations/${me}/${invitation.id}`))
    return null
  }
  await set(ref(db, `sharedFolders/${invitation.sharedId}/members/${me}`), {
    username, role: invitation.role, joinedAt: serverTimestamp(),
  })
  await set(ref(db, `users/${me}/linkedFolders/${invitation.sharedId}`), { isFolder: true })
  const folder = {
    id: newId(), name: dSnap.child('name').val() ?? invitation.itemName,
    color: dSnap.child('color').val() ?? null,
    backgroundImageUrl: dSnap.child('backgroundImageUrl').val() ?? null,
    parentFolderId: null, isShared: true, sharedId: invitation.sharedId,
    ownerId: invitation.fromUid, ownerUsername: invitation.fromUsername,
    role: invitation.role,
  }
  await remove(ref(db, `invitations/${me}/${invitation.id}`))
  await remove(ref(db, `sentInvitations/${invitation.fromUid}/${invitation.id}`)).catch(() => {})
  // Unirse a los contadores hijos automáticamente (igual que Android)
  const childCounters = await joinSharedFolderChildren(invitation.sharedId, folder.id)
  return { folder, childCounters }
}

export async function rejectInvitation(invitation) {
  const me = uid(); if (!me) return
  await remove(ref(db, `invitations/${me}/${invitation.id}`))
  await remove(ref(db, `sentInvitations/${invitation.fromUid}/${invitation.id}`)).catch(() => {})
}

export async function cancelSentInvitation(inv) {
  const me = uid(); if (!me) return
  await remove(ref(db, `sentInvitations/${me}/${inv.id}`))
  await remove(ref(db, `invitations/${inv.toUid}/${inv.id}`)).catch(() => {})
}

// ─── Amigos ───────────────────────────────────────────────────────────────────

export async function searchUsers(q) {
  const me = uid()
  const term = q.toLowerCase().trim()
  if (!term) return []

  const snap = await get(
    dbQuery(ref(db, 'usernames'), orderByKey(), startAt(term), endAt(term + ''), limitToFirst(20))
  )
  const results = []
  snap.forEach(c => {
    const fUid = c.val()
    if (!fUid || fUid === me) return
    results.push({ uid: fUid, username: c.key })
  })
  return results.slice(0, 10)
}

export async function sendFriendRequest(toUid, toUsername) {
  const me = uid(); if (!me) return
  const fromUsername = auth.currentUser?.displayName ?? ''
  const ts = serverTimestamp()
  await set(ref(db, `friends/${me}/${toUid}`), { username: toUsername, status: 'pending', direction: 'sent', addedAt: ts })
  await set(ref(db, `friends/${toUid}/${me}`), { username: fromUsername, status: 'pending', direction: 'received', addedAt: ts })
}

export async function acceptFriendRequest(friendUid) {
  const me = uid(); if (!me) return
  await set(ref(db, `friends/${me}/${friendUid}/status`), 'accepted')
  await set(ref(db, `friends/${friendUid}/${me}/status`), 'accepted')
}

export async function removeFriend(friendUid) {
  const me = uid(); if (!me) return
  await remove(ref(db, `friends/${me}/${friendUid}`))
  await remove(ref(db, `friends/${friendUid}/${me}`))
}

export async function getFriends() {
  const me = uid(); if (!me) return []
  const snap = await get(ref(db, `friends/${me}`))
  const list = []
  snap.forEach(c => {
    if (!c.key) return
    list.push({
      uid: c.key,
      username: c.child('username').val() ?? '',
      status: c.child('status').val() ?? 'accepted',
      direction: c.child('direction').val() ?? 'sent',
      addedAt: c.child('addedAt').val() ?? 0,
    })
  })
  return list
}

export function listenFriendRequests(onUpdate) {
  const me = uid(); if (!me) return () => {}
  const r = ref(db, `friends/${me}`)
  const handler = (snap) => {
    const requests = []
    snap.forEach(c => {
      if (c.child('status').val() !== 'pending' || c.child('direction').val() !== 'received') return
      requests.push({
        uid: c.key, username: c.child('username').val() ?? '',
        status: 'pending', direction: 'received',
      })
    })
    onUpdate(requests)
  }
  onValue(r, handler)
  return () => off(r, 'value', handler)
}

// ─── Datos personales: Google Drive ──────────────────────────────────────────

let _syncDebounceTimer = null

/**
 * Empuja los datos personales a Drive y actualiza dataVersion en RTDB.
 * Debounce de 1.5s igual que Android.
 */
export function schedulePushPersonalData(counters, folders, gridOrder, folderOrders, driveToken) {
  clearTimeout(_syncDebounceTimer)
  _syncDebounceTimer = setTimeout(async () => {
    await pushPersonalData(counters, folders, gridOrder, folderOrders, driveToken)
  }, 1500)
}

export async function pushPersonalData(counters, folders, gridOrder, folderOrders, driveToken) {
  if (!driveToken) return
  const me = uid(); if (!me) return

  const bundle = JSON.stringify({
    deviceId: 'web',
    version: Date.now(),
    counters: counters.map(buildCounterJson),
    folders: folders.map(buildFolderJson),
    gridOrder,
    folderOrders,
  })

  await uploadBundle(bundle, driveToken)
  await set(ref(db, `users/${me}/dataVersion`), Date.now())
}

export async function pullPersonalData(driveToken) {
  if (!driveToken) return null
  const bundleStr = await downloadBundle(driveToken)
  if (!bundleStr) return null
  try { return JSON.parse(bundleStr) } catch { return null }
}

export function listenDataVersion(onNewVersion) {
  const me = uid(); if (!me) return () => {}
  const r = ref(db, `users/${me}/dataVersion`)
  const handler = (snap) => { if (snap.exists()) onNewVersion(snap.val()) }
  onValue(r, handler)
  return () => off(r, 'value', handler)
}

export function listenBgVersion(onNewVersion) {
  const me = uid(); if (!me) return () => {}
  const r = ref(db, `users/${me}/bgVersion`)
  const handler = (snap) => { if (snap.exists()) onNewVersion(snap.val()) }
  onValue(r, handler)
  return () => off(r, 'value', handler)
}

export async function bumpBgVersion() {
  const me = uid(); if (!me) return
  await set(ref(db, `users/${me}/bgVersion`), Date.now())
}

// ─── Borrar cuenta ────────────────────────────────────────────────────────────

export async function deleteAccount(driveToken) {
  const me = uid(); if (!me) return
  const username = auth.currentUser?.displayName

  // Eliminar linked counters (sharedCounters)
  const lcs = await get(ref(db, `users/${me}/linkedCounters`))
  const lcKeys = []
  lcs.forEach(c => { if (c.key) lcKeys.push(c.key) })
  for (const sharedId of lcKeys) {
    try {
      const mSnap = await get(ref(db, `sharedCounters/${sharedId}/members/${me}`))
      if (mSnap.child('role').val() === 'owner') {
        await storageDelete(sharedCounterPath(sharedId)).catch(() => {})
        const codeSnap = await get(ref(db, `sharedCounters/${sharedId}/inviteCode`))
        if (codeSnap.val()) await remove(ref(db, `invites/${codeSnap.val()}`)).catch(() => {})
        await remove(ref(db, `sharedCounters/${sharedId}`))
      } else {
        await remove(ref(db, `sharedCounters/${sharedId}/members/${me}`))
        await remove(ref(db, `sharedCounters/${sharedId}/scores/${me}`)).catch(() => {})
      }
    } catch { /* ignore */ }
  }

  // Eliminar linked folders (sharedFolders)
  const lfs = await get(ref(db, `users/${me}/linkedFolders`))
  const lfKeys = []
  lfs.forEach(c => { if (c.key) lfKeys.push(c.key) })
  for (const sharedId of lfKeys) {
    try {
      const mSnap = await get(ref(db, `sharedFolders/${sharedId}/members/${me}`))
      if (mSnap.child('role').val() === 'owner') {
        const codeSnap = await get(ref(db, `sharedFolders/${sharedId}/inviteCode`))
        if (codeSnap.val()) await remove(ref(db, `invites/${codeSnap.val()}`)).catch(() => {})
        await remove(ref(db, `sharedFolders/${sharedId}`))
      } else {
        await remove(ref(db, `sharedFolders/${sharedId}/members/${me}`))
      }
    } catch { /* ignore */ }
  }

  // Eliminar friends
  const fr = await get(ref(db, `friends/${me}`))
  const frKeys = []
  fr.forEach(c => { if (c.key) frKeys.push(c.key) })
  for (const fk of frKeys) {
    await remove(ref(db, `friends/${fk}/${me}`)).catch(() => {})
  }

  await remove(ref(db, `friends/${me}`)).catch(() => {})
  await remove(ref(db, `invitations/${me}`)).catch(() => {})
  await remove(ref(db, `sentInvitations/${me}`)).catch(() => {})
  if (username) await remove(ref(db, `usernames/${username.toLowerCase()}`)).catch(() => {})
  await remove(ref(db, `users/${me}`)).catch(() => {})

  if (driveToken) await deleteAllAppData(driveToken).catch(() => {})
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { hasBundleData }

// ─── Helpers internos ────────────────────────────────────────────────────────

function buildCounterJson(c) {
  return {
    id: c.id, name: c.name, value: c.value, increment: c.increment,
    target: c.target ?? null, color: c.color ?? null, folderId: c.folderId ?? null,
    isShared: c.isShared, sharedId: c.sharedId ?? null,
    ownerId: c.ownerId ?? null, ownerUsername: c.ownerUsername ?? null,
    role: c.role ?? 'owner',
    logEntries: c.logEntries.map(e => ({ label: e.label ?? null, text: e.text, date: e.date })),
  }
}

function buildFolderJson(f) {
  return {
    id: f.id, name: f.name, color: f.color ?? null,
    backgroundImageUrl: f.backgroundImageUrl ?? null,
    parentFolderId: f.parentFolderId ?? null,
    isShared: f.isShared ?? false, sharedId: f.sharedId ?? null,
    ownerId: f.ownerId ?? null, role: f.role ?? 'owner',
  }
}

// ─── Recuperar linked counters al iniciar sesión ──────────────────────────────

export async function getLinkedCounterIds() {
  const me = uid(); if (!me) return []
  const snap = await get(ref(db, `users/${me}/linkedCounters`))
  const ids = []
  snap.forEach(c => { if (c.key) ids.push(c.key) })
  return ids
}

export async function fetchSharedCounter(sharedId) {
  const me = uid()
  const dSnap = await get(ref(db, `sharedCounters/${sharedId}/data`))
  if (!dSnap.exists()) return null
  const mSnap = await get(ref(db, `sharedCounters/${sharedId}/members/${me}`))
  if (!mSnap.exists()) return null
  const isComp = dSnap.child('mode').val() === 'competitive'
  return {
    id: newId(), name: dSnap.child('name').val() ?? '',
    value: isComp ? 0 : (dSnap.child('value').val() ?? 0),
    increment: dSnap.child('increment').val() ?? 1,
    target: dSnap.child('target').val() ?? null,
    color: dSnap.child('color').val() ?? null,
    backgroundImageUrl: dSnap.child('backgroundImageUrl').val() ?? null,
    logEntries: [], folderId: null,
    isShared: true, sharedId, role: mSnap.child('role').val() ?? 'viewer',
    isCompetitive: isComp, competitorScores: {}, competitorUsernames: {}, userColors: {},
  }
}

/**
 * Recupera contadores y carpetas compartidos desde RTDB para contadores que están
 * en linkedCounters/linkedFolders pero no en el estado local (Zustand).
 * Equivalente a Android's restoreLinkedCounters() + restoreFoldersFromRtdb().
 * Se usa como fallback cuando el bundle de Drive no existe (primer uso en web).
 * existingSharedIds: Set de sharedIds ya presentes en Zustand.
 * existingFolderSharedIds: Set de folder sharedIds ya presentes en Zustand.
 * Devuelve { counters, folders } con los nuevos items a añadir.
 */
export async function restoreLinkedSharedItems(existingSharedIds = new Set(), existingFolderSharedIds = new Set()) {
  const me = uid(); if (!me) return { counters: [], folders: [] }

  const counters = []
  const folders = []

  // ── Contadores ──────────────────────────────────────────────────────────────
  try {
    const lcSnap = await get(ref(db, `users/${me}/linkedCounters`))
    const sharedIds = []
    lcSnap.forEach(c => { if (c.key && !existingSharedIds.has(c.key)) sharedIds.push(c.key) })

    for (const sharedId of sharedIds) {
      try {
        const counter = await fetchSharedCounter(sharedId)
        if (counter) counters.push(counter)
      } catch { /* ignorar errores individuales */ }
    }
  } catch { /* sin acceso a RTDB */ }

  // ── Carpetas ─────────────────────────────────────────────────────────────────
  try {
    const lfSnap = await get(ref(db, `users/${me}/linkedFolders`))
    const folderSharedIds = []
    lfSnap.forEach(f => { if (f.key && !existingFolderSharedIds.has(f.key)) folderSharedIds.push(f.key) })

    for (const sharedId of folderSharedIds) {
      try {
        const dSnap = await get(ref(db, `sharedFolders/${sharedId}/data`))
        if (!dSnap.exists()) continue
        const mSnap = await get(ref(db, `sharedFolders/${sharedId}/members/${me}`))
        if (!mSnap.exists()) continue
        const folderId = newId()
        const folder = {
          id: folderId,
          name: dSnap.child('name').val() ?? '',
          color: dSnap.child('color').val() ?? null,
          backgroundImageUrl: dSnap.child('backgroundImageUrl').val() ?? null,
          parentFolderId: null,
          isShared: true, sharedId,
          role: mSnap.child('role').val() ?? 'viewer',
        }
        folders.push(folder)
        // También restaurar los contadores hijos de esta carpeta
        const childCounters = await joinSharedFolderChildren(sharedId, folderId)
        // Filtrar los que ya están
        for (const cc of childCounters) {
          if (!existingSharedIds.has(cc.sharedId)) counters.push(cc)
        }
      } catch { /* ignorar */ }
    }
  } catch { /* sin acceso a RTDB */ }

  return { counters, folders }
}

export async function joinSharedFolder(sharedId) {
  const me = uid(); if (!me) return null
  const username = auth.currentUser?.displayName ?? ''
  const dSnap = await get(ref(db, `sharedFolders/${sharedId}/data`))
  if (!dSnap.exists()) return null
  await set(ref(db, `sharedFolders/${sharedId}/members/${me}`), { username, role: 'viewer', joinedAt: serverTimestamp() })
  await set(ref(db, `users/${me}/linkedFolders/${sharedId}/isFolder`), true)
  const folder = {
    id: newId(), name: dSnap.child('name').val() ?? '',
    color: dSnap.child('color').val() ?? null,
    backgroundImageUrl: dSnap.child('backgroundImageUrl').val() ?? null,
    parentFolderId: null, isShared: true, sharedId, role: 'viewer',
  }
  // Unirse a los contadores hijos automáticamente (igual que Android)
  const childCounters = await joinSharedFolderChildren(sharedId, folder.id)
  return { folder, childCounters }
}

// ─── Carpetas compartidas: compartir ─────────────────────────────────────────

/**
 * Comparte una carpeta. Si se pasan contadores hijos, también los comparte
 * y los vincula bajo children/counters en RTDB (igual que Android).
 * Devuelve { sharedId, inviteCode, updatedCounters } donde updatedCounters
 * son los contadores que se han compartido dentro de la carpeta.
 */
export async function shareFolder(folder, countersInFolder = []) {
  const me = uid(); if (!me) throw new Error('No autenticado')
  const username = auth.currentUser?.displayName ?? ''
  const sharedRef = push(ref(db, 'sharedFolders'))
  const sharedId = sharedRef.key
  const inviteCode = newId().slice(0, 12)
  await set(ref(db, `sharedFolders/${sharedId}/members/${me}`), { username, role: 'owner', joinedAt: serverTimestamp() })
  await set(ref(db, `sharedFolders/${sharedId}/data`), {
    name: folder.name, color: folder.color ?? null,
    backgroundImageUrl: folder.backgroundImageUrl ?? null,
    localId: folder.id, lastModifiedBy: me, lastModifiedDeviceId: 'web',
  })
  await set(ref(db, `sharedFolders/${sharedId}/inviteCode`), inviteCode)
  await set(ref(db, `invites/${inviteCode}`), { sharedId, createdBy: me, createdAt: serverTimestamp(), isFolder: true })
  await set(ref(db, `users/${me}/linkedFolders/${sharedId}`), { isFolder: true })

  // Compartir contenidos: contadores dentro de la carpeta
  const updatedCounters = []
  for (const counter of countersInFolder) {
    try {
      let cSharedId = counter.sharedId
      if (!counter.isShared) {
        const result = await shareCounter(counter)
        cSharedId = result.sharedId
        updatedCounters.push({
          id: counter.id,
          isShared: true, sharedId: cSharedId, role: 'owner',
          ownerId: me, ownerUsername: username,
        })
      }
      if (cSharedId) {
        // Vincular en children/counters
        await set(ref(db, `sharedFolders/${sharedId}/children/counters/${counter.id}`), cSharedId)
        // Copiar miembros de la carpeta al contador (solo el owner, ya está)
      }
    } catch (e) { /* continuar aunque falle un contador */ }
  }

  return { sharedId, inviteCode, updatedCounters }
}

/**
 * Dada una carpeta compartida, une al usuario a todos los contadores hijos.
 * Devuelve los nuevos Counter objects con folderId ya asignado.
 */
export async function joinSharedFolderChildren(sharedFolderId, localFolderId) {
  const childrenSnap = await get(ref(db, `sharedFolders/${sharedFolderId}/children/counters`))
  if (!childrenSnap.exists()) return []
  const toJoin = []
  childrenSnap.forEach(c => {
    const cSharedId = c.val()
    if (c.key && cSharedId) toJoin.push(cSharedId)
  })
  const results = []
  for (const cSharedId of toJoin) {
    try {
      const counter = await joinSharedCounter(cSharedId)
      if (counter) results.push({ ...counter, folderId: localFolderId })
    } catch { /* ya es miembro u otro error — ignorar */ }
  }
  return results
}

export async function unshareFolder(folder) {
  const me = uid(); if (!me) return
  const { sharedId, role } = folder; if (!sharedId) return
  if (role === 'owner') {
    const codeSnap = await get(ref(db, `sharedFolders/${sharedId}/inviteCode`))
    const code = codeSnap.val()
    if (code) await remove(ref(db, `invites/${code}`)).catch(() => {})
    await remove(ref(db, `sharedFolders/${sharedId}`))
  } else {
    await remove(ref(db, `sharedFolders/${sharedId}/members/${me}`))
  }
  await remove(ref(db, `users/${me}/linkedFolders/${sharedId}`))
}

export async function getFolderInviteCode(sharedId) {
  const snap = await get(ref(db, `sharedFolders/${sharedId}/inviteCode`))
  return snap.val()
}

export async function getFolderMembers(sharedId) {
  const snap = await get(ref(db, `sharedFolders/${sharedId}/members`))
  const list = []
  snap.forEach(m => {
    if (m.key) list.push({
      uid: m.key,
      username: m.child('username').val() ?? '',
      role: m.child('role').val() ?? 'viewer',
    })
  })
  return list
}

export async function setFolderMemberRole(sharedId, targetUid, role) {
  await set(ref(db, `sharedFolders/${sharedId}/members/${targetUid}/role`), role)
}

export async function removeFolderMember(sharedId, targetUid) {
  await remove(ref(db, `sharedFolders/${sharedId}/members/${targetUid}`))
  await remove(ref(db, `users/${targetUid}/linkedFolders/${sharedId}`)).catch(() => {})
}

export function pushFolderUpdate(folder) {
  if (!folder.isShared || !folder.sharedId) return
  if (folder.role !== 'owner' && folder.role !== 'editor') return
  const me = uid(); if (!me) return
  const updates = {
    name: folder.name ?? '',
    color: folder.color ?? null,
    backgroundImageUrl: folder.backgroundImageUrl ?? null,
    lastModifiedBy: me,
    lastModifiedDeviceId: 'web',
  }
  update(ref(db, `sharedFolders/${folder.sharedId}/data`), updates)
}

/**
 * @param onNewChild(counter) — callback cuando se descubre un hijo nuevo en la carpeta compartida
 *   (igual que Android's syncFolderChildren). Llamado con el counter a añadir.
 *   El caller es responsable de añadirlo al store con folderId = localId.
 */
export function listenSharedFolder(sharedId, localId, onUpdate, onRemoved, onNewChild) {
  const me = uid(); if (!me) return () => {}
  const r = ref(db, `sharedFolders/${sharedId}`)
  // Track sharedIds ya procesados para no re-unirse en cada snapshot
  const processedChildren = new Set()

  const handler = onValue(r, async snap => {
    if (!snap.exists()) { onRemoved?.(localId); return }
    const data = snap.child('data')
    if (!data.exists()) return
    const myMember = snap.child(`members/${me}`)
    if (!myMember.exists()) { onRemoved?.(localId); return }
    onUpdate({
      localId,
      name: data.child('name').val() ?? '',
      color: data.child('color').val() ?? null,
      backgroundImageUrl: data.child('backgroundImageUrl').val() ?? null,
      role: myMember.child('role').val() ?? 'viewer',
    })
    // Sincronizar hijos nuevos (igual que Android's syncFolderChildren)
    if (onNewChild) {
      const childCounters = snap.child('children/counters')
      const toJoin = []
      childCounters.forEach(c => {
        const cSharedId = c.val()
        if (cSharedId && !processedChildren.has(cSharedId)) {
          processedChildren.add(cSharedId)
          toJoin.push(cSharedId)
        }
      })
      for (const cSharedId of toJoin) {
        try {
          const counter = await joinSharedCounter(cSharedId)
          if (counter) onNewChild({ ...counter, folderId: localId })
        } catch { /* ya es miembro u otro error — ignorar */ }
      }
    }
  })
  return () => off(r, 'value', handler)
}

// ─── Solicitud de permiso de edición ─────────────────────────────────────────

export async function requestEditPermission(counter) {
  const me = uid(); if (!me) return
  const myUsername = auth.currentUser?.displayName ?? ''
  const membersSnap = await get(ref(db, `sharedCounters/${counter.sharedId}/members`))
  let ownerUid = null
  membersSnap.forEach(m => { if (m.child('role').val() === 'owner') ownerUid = m.key })
  if (!ownerUid || ownerUid === me) throw new Error('No se encontró el propietario')
  const invId = `${me}_${counter.sharedId}_req`
  const data = {
    fromUid: me, fromUsername: myUsername, sharedId: counter.sharedId, itemName: counter.name,
    role: 'editor', createdAt: serverTimestamp(), status: 'pending', isRequest: true, isFolder: false,
  }
  await set(ref(db, `invitations/${ownerUid}/${invId}`), data)
  await set(ref(db, `sentInvitations/${me}/${invId}`), { ...data, toUid: ownerUid, toUsername: '' })
}

export async function acceptEditRequest(invitation) {
  const me = uid(); if (!me) return
  await set(ref(db, `sharedCounters/${invitation.sharedId}/members/${invitation.fromUid}/role`), 'editor')
  await remove(ref(db, `invitations/${me}/${invitation.id}`))
  await remove(ref(db, `sentInvitations/${invitation.fromUid}/${invitation.id}`)).catch(() => {})
}
