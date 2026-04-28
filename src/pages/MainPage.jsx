import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import CounterCard from '../components/CounterCard'
import FolderCard from '../components/FolderCard'
import ExpandedCounter from '../components/ExpandedCounter'
import QrScanner from '../components/QrScanner'
import ColorPicker from '../components/ColorPicker'
import useAppStore from '../store/appStore'
import {
  pushCounterUpdate, listenSharedCounter, schedulePushPersonalData,
  joinByCode, getPreviewByCode, listenInvitations, listenFriendRequests,
  shareFolder, unshareFolder, getFolderInviteCode, getFolderMembers,
  setFolderMemberRole, removeFolderMember,
  listenSharedFolder, pushFolderUpdate,
  getInviteCode, getMembers,
} from '../firebase/syncManager'
import { uploadBackground as storageUpload, folderPath } from '../firebase/storageManager'
import styles from './MainPage.module.css'

const AVATAR_COLORS = ['#5C6BC0','#26A69A','#66BB6A','#EC407A','#FFA726','#42A5F5','#8D6E63','#78909C']
function avatarColor(name = '') {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function MainPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    user, username, driveToken,
    counters, folders, gridOrder, folderOrders,
    currentFolderId,
    addCounter, updateCounter, removeCounter,
    addFolder, updateFolder, removeFolder,
    setGridOrder, setFolderOrder, setCurrentFolder,
    getCurrentItems, getFolderCounters,
  } = useAppStore()

  const [expanded, setExpanded] = useState(null) // Counter object
  const [showFab, setShowFab] = useState(false)   // fab menu open
  const [joinInput, setJoinInput] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [joinPreview, setJoinPreview] = useState(null) // {name, isFolder, sharedId}
  const [joinLoading, setJoinLoading] = useState(false)
  const [showCreateCounter, setShowCreateCounter] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIncrement, setNewIncrement] = useState('1')
  const [newTarget, setNewTarget] = useState('')
  const [createErrors, setCreateErrors] = useState({}) // { name, increment, target }
  const [invBadge, setInvBadge] = useState(false)
  const [friendBadge, setFriendBadge] = useState(false)
  const [dragKey, setDragKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)
  const [dragOverFolder, setDragOverFolder] = useState(null)
  // dragClone: { item, x, y, width, height } — clone flotante que sigue el puntero
  const [dragClone, setDragClone] = useState(null)
  const dragStateRef = useRef(null) // acceso sin stale closure en pointermove
  const [expandedShowMenu, setExpandedShowMenu] = useState(false)
  const [expandedInitialTab, setExpandedInitialTab] = useState('log')
  const [counterMenu, setCounterMenu] = useState(null) // { counter, top, right }
  const [sharedInfoSheet, setSharedInfoSheet] = useState(null) // { counter, inviteCode, members }
  const [editingFolder, setEditingFolder] = useState(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [editFolderColor, setEditFolderColor] = useState(null)
  const [showFolderColorPicker, setShowFolderColorPicker] = useState(false)
  const [folderInviteCode, setFolderInviteCode] = useState(null)
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderMembers, setFolderMembers] = useState([])
  const [toast, setToast] = useState(null)
  const [counterNotif, setCounterNotif] = useState(null) // {text, counterId}
  const counterNotifTimer = useRef(null)
  // ── Modo selección ───────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState(new Set()) // Set<"C:id"|"F:id">
  const longPressTimer = useRef(null)
  const listenerCleanups = useRef({})
  const folderListenerCleanups = useRef({})

  const items = getCurrentItems()
  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null

  // ── Shared counter listeners ─────────────────────────────────────────────
  useEffect(() => {
    const toAttach = counters.filter(c => c.isShared && c.sharedId)
    const current = new Set(Object.keys(listenerCleanups.current))
    const needed = new Set(toAttach.map(c => c.sharedId))

    // Detach removed
    for (const sid of current) {
      if (!needed.has(sid)) { listenerCleanups.current[sid]?.(); delete listenerCleanups.current[sid] }
    }

    // Attach new
    for (const c of toAttach) {
      if (!listenerCleanups.current[c.sharedId]) {
        listenerCleanups.current[c.sharedId] = listenSharedCounter(
          c.sharedId, c.id,
          (update) => {
            const patch = {
              name: update.name, increment: update.increment,
              target: update.target, color: update.color,
              backgroundImageUrl: update.backgroundImageUrl,
              role: update.role, isCompetitive: update.isCompetitive,
              competitorScores: update.competitorScores ?? {},
              competitorUsernames: update.competitorUsernames ?? {},
              userColors: update.userColors ?? {},
              competitorTargets: update.competitorTargets ?? {},
              competitorLogEntries: update.competitorLogEntries ?? {},
            }

            // In-app notification for remote changes
            if (update.fromRemote && !update.isCompetitive) {
              const current = useAppStore.getState().counters.find(c2 => c2.id === update.localId)
              if (current && update.value !== undefined && update.value !== current.value) {
                const who = update.lastModifiedUsername || 'Alguien'
                const text = `${who} cambió ${update.name ?? current.name}: ${current.value} → ${update.value}`
                clearTimeout(counterNotifTimer.current)
                setCounterNotif({ text, counterId: update.localId })
                counterNotifTimer.current = setTimeout(() => setCounterNotif(null), 4000)
              }
            }

            if (!update.isCompetitive && update.fromRemote) {
              patch.value = update.value
              patch.logEntries = update.logEntries ?? []
            }
            if (update.myValue !== undefined) {
              patch.value = update.myValue
              patch.logEntries = update.myLogEntries ?? []
            }
            updateCounter(update.localId, patch)
            // Si está expandido, actualizarlo también
            setExpanded(prev => prev?.id === update.localId ? { ...prev, ...patch } : prev)
          },
          (localId) => {
            // Si el propietario desvinculó intencionalmente (isShared ya es false),
            // no eliminar — solo dejar el contador como personal.
            // (igual que Android: owner → unshare → keep; viewer → deleted → remove)
            const current = useAppStore.getState().counters.find(x => x.id === localId)
            if (current && !current.isShared) return
            removeCounter(localId)
          }
        )
      }
    }

    return () => {} // se limpian en el effect de counters
  }, [counters.map(c => c.sharedId).join(',')])

  // ── Shared folder listeners ──────────────────────────────────────────────
  useEffect(() => {
    const toAttach = folders.filter(f => f.isShared && f.sharedId)
    const current = new Set(Object.keys(folderListenerCleanups.current))
    const needed = new Set(toAttach.map(f => f.sharedId))
    for (const sid of current) {
      if (!needed.has(sid)) { folderListenerCleanups.current[sid]?.(); delete folderListenerCleanups.current[sid] }
    }
    for (const f of toAttach) {
      if (!folderListenerCleanups.current[f.sharedId]) {
        folderListenerCleanups.current[f.sharedId] = listenSharedFolder(
          f.sharedId, f.id,
          (upd) => { updateFolder(upd.localId, { name: upd.name, color: upd.color, backgroundImageUrl: upd.backgroundImageUrl, role: upd.role }) },
          (localId) => { removeFolder(localId) },
          // onNewChild: cuando el owner añade un contador a la carpeta tras unirnos
          (counter) => { addCounter(counter) }
        )
      }
    }
  }, [folders.map(f => f.sharedId).join(',')])

  // ── Invitation & friend request badges ──────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return
    const u1 = listenInvitations(list => setInvBadge(list.length > 0))
    const u2 = listenFriendRequests(list => setFriendBadge(list.length > 0))
    return () => { u1(); u2() }
  }, [user?.uid])

  // ── Deep link: ?code= pasado desde App.jsx vía route state ─────────────
  // Observar pendingCode para que funcione tanto si el usuario ya estaba
  // autenticado (código llega en el primer mount) como si acaba de hacer
  // login (handleUser en App.jsx navega de nuevo con el state tras montar).
  useEffect(() => {
    const code = location.state?.pendingCode
    if (!code) return
    // Limpiar el state para que no se reprocese
    navigate('/', { replace: true, state: {} })
    setJoinInput(code)
    setShowJoin(true)
    // Lanzar preview automáticamente
    getPreviewByCode(code).then(preview => {
      if (preview) setJoinPreview(preview)
      else showToast('Enlace inválido o no encontrado')
    }).catch(() => showToast('Error al procesar el enlace'))
  }, [location.state?.pendingCode]) // eslint-disable-line

  // ── Helpers ──────────────────────────────────────────────────────────────
  const showToast = (text) => { setToast(text); setTimeout(() => setToast(null), 3000) }
  const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
  const { saveHistory } = useAppStore.getState()

  // ── Modo selección ────────────────────────────────────────────────────────
  const enterSelection = (key) => {
    setSelectionMode(true)
    setSelectedKeys(new Set([key]))
  }
  const exitSelection = () => { setSelectionMode(false); setSelectedKeys(new Set()) }
  const toggleSelect = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const allKeys = items.map(i => `${i.type==='counter'?'C':'F'}:${i.data.id}`)
  const selectAll = () => {
    if (selectedKeys.size === allKeys.length) {
      setSelectedKeys(new Set()) // deseleccionar todo
    } else {
      setSelectedKeys(new Set(allKeys)) // seleccionar todo
    }
  }

  const handleLongPress = (key) => {
    clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => enterSelection(key), 500)
  }
  const cancelLongPress = () => clearTimeout(longPressTimer.current)

  const deleteSelected = () => {
    if (!confirm(`¿Eliminar ${selectedKeys.size} elemento(s)?`)) return
    saveHistory(`Eliminados ${selectedKeys.size} elementos`)
    for (const key of selectedKeys) {
      if (key.startsWith('C:')) removeCounter(key.slice(2))
      else removeFolder(key.slice(2))
    }
    exitSelection()
    push()
  }

  const removeSelectedFromFolder = () => {
    for (const key of selectedKeys) {
      if (key.startsWith('C:')) {
        const id = key.slice(2)
        updateCounter(id, { folderId: null })
        const newRoot = [...useAppStore.getState().gridOrder, key]
        setGridOrder(newRoot)
        setFolderOrder(currentFolderId, (useAppStore.getState().folderOrders[currentFolderId] ?? []).filter(k => k !== key))
      }
    }
    exitSelection()
    push()
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  const MAX_VALUE = 999_999_999_999
  const handleIncrement = useCallback((counter) => {
    if (counter.value >= MAX_VALUE) return null
    const newLog = [...(counter.logEntries ?? []), { text: '', date: Date.now() }]
    let patch

    if (counter.isCompetitive && counter.isShared) {
      // Modo competitivo: actualiza puntuación del usuario actual
      const uid = useAppStore.getState().user?.uid
      if (!uid) return null
      const myScore = Math.min((counter.competitorScores?.[uid] ?? 0) + counter.increment, MAX_VALUE)
      const newScores = { ...counter.competitorScores, [uid]: myScore }
      const newTotal = Object.values(newScores).reduce((a, b) => a + b, 0)
      patch = { competitorScores: newScores, value: newTotal, logEntries: newLog }
    } else {
      patch = { value: Math.min(counter.value + counter.increment, MAX_VALUE), logEntries: newLog }
    }

    updateCounter(counter.id, patch)
    if (counter.isShared) pushCounterUpdate({ ...counter, ...patch })
    else schedulePushPersonalData(
      useAppStore.getState().counters, useAppStore.getState().folders,
      useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
    )
    return patch
  }, [driveToken])

  const handleDecrement = useCallback((counter) => {
    const newLog = (counter.logEntries ?? []).slice(0, -1)
    let patch

    if (counter.isCompetitive && counter.isShared) {
      const uid = useAppStore.getState().user?.uid
      if (!uid) return null
      const myScore = (counter.competitorScores?.[uid] ?? 0) - counter.increment
      if (myScore < 0) return null
      const newScores = { ...counter.competitorScores, [uid]: myScore }
      const newTotal = Object.values(newScores).reduce((a, b) => a + b, 0)
      patch = { competitorScores: newScores, value: newTotal, logEntries: newLog }
    } else {
      if (counter.value <= 0) return null
      const newVal = counter.value - counter.increment
      if (newVal < 0) return null
      patch = { value: newVal, logEntries: newLog }
    }

    updateCounter(counter.id, patch)
    if (counter.isShared) pushCounterUpdate({ ...counter, ...patch })
    else schedulePushPersonalData(
      useAppStore.getState().counters, useAppStore.getState().folders,
      useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
    )
    return patch
  }, [driveToken])

  const handleCounterUpdate = (patch) => {
    if (!expanded) return
    updateCounter(expanded.id, patch)
    setExpanded(prev => ({ ...prev, ...patch }))
    schedulePushPersonalData(
      useAppStore.getState().counters,
      useAppStore.getState().folders,
      useAppStore.getState().gridOrder,
      useAppStore.getState().folderOrders,
      driveToken
    )
  }

  const handleDelete = (counter) => {
    if (!confirm(`¿Eliminar "${counter.name}"?`)) return
    saveHistory(`Contador "${counter.name}" eliminado`)
    removeCounter(counter.id)
    setExpanded(null)
    schedulePushPersonalData(
      useAppStore.getState().counters,
      useAppStore.getState().folders,
      useAppStore.getState().gridOrder,
      useAppStore.getState().folderOrders,
      driveToken
    )
  }

  const handleCreateCounter = () => {
    const errs = {}
    if (!newName.trim()) errs.name = 'El nombre es obligatorio'
    else if (newName.trim().length > 15) errs.name = 'Máximo 15 caracteres'
    const incVal = parseInt(newIncrement)
    if (!newIncrement || isNaN(incVal) || incVal < 1) errs.increment = 'Debe ser un número ≥ 1'
    if (newTarget !== '') {
      const tgtVal = parseInt(newTarget)
      if (isNaN(tgtVal) || tgtVal < 1) errs.target = 'Debe ser un número ≥ 1'
      else if (tgtVal <= incVal) errs.target = 'El objetivo debe ser mayor que el incremento'
    }
    if (Object.keys(errs).length > 0) { setCreateErrors(errs); return }
    setCreateErrors({})
    saveHistory(`Antes de crear "${newName.trim()}"`)
    const inc = Math.max(1, parseInt(newIncrement) || 1)
    const tgt = newTarget !== '' ? Math.max(1, parseInt(newTarget) || 1) : null
    const counter = {
      id: newId(), name: newName.trim().slice(0, 15), value: 0, increment: inc,
      target: tgt, color: null, backgroundImageUrl: null, backgroundImageLocal: null,
      logEntries: [], folderId: currentFolderId ?? null,
      isShared: false, sharedId: null, ownerId: null, role: 'owner',
      isCompetitive: false, competitorScores: {}, competitorUsernames: {}, userColors: {},
    }
    addCounter(counter)
    if (currentFolderId) {
      const cur = useAppStore.getState().folderOrders[currentFolderId] ?? []
      setFolderOrder(currentFolderId, [...cur, `C:${counter.id}`])
    }
    setNewName(''); setNewIncrement('1'); setNewTarget(''); setCreateErrors({}); setShowCreateCounter(false)
    schedulePushPersonalData(
      useAppStore.getState().counters,
      useAppStore.getState().folders,
      useAppStore.getState().gridOrder,
      useAppStore.getState().folderOrders,
      driveToken
    )
  }

  const handleCreateFolder = () => {
    if (!newName.trim()) return
    saveHistory(`Antes de crear carpeta "${newName.trim()}"`)
    const folder = {
      id: newId(), name: newName.trim(), color: null,
      backgroundImageUrl: null, parentFolderId: currentFolderId ?? null,
      isShared: false, sharedId: null, ownerId: null, role: 'owner',
    }
    addFolder(folder)
    setNewName(''); setShowCreateFolder(false)
    schedulePushPersonalData(
      useAppStore.getState().counters,
      useAppStore.getState().folders,
      useAppStore.getState().gridOrder,
      useAppStore.getState().folderOrders,
      driveToken
    )
  }

  const handleJoinPreview = async () => {
    if (!joinInput.trim()) return
    setJoinLoading(true)
    try {
      const preview = await getPreviewByCode(joinInput.trim())
      if (!preview) { showToast('Código no válido'); return }
      setJoinPreview(preview)
    } catch (e) { showToast(e.message) }
    finally { setJoinLoading(false) }
  }

  const handleJoinConfirm = async () => {
    setJoinLoading(true)
    try {
      const result = await joinByCode(joinInput.trim())
      if (result) {
        if (result.folder) {
          // Resultado de una carpeta compartida: { folder, childCounters }
          addFolder(result.folder)
          for (const c of (result.childCounters ?? [])) addCounter(c)
          showToast(`¡Unido a "${result.folder.name}"!`)
        } else {
          // Resultado de un contador compartido (objeto directo)
          addCounter(result)
          showToast(`¡Unido a "${result.name}"!`)
        }
      }
      setShowJoin(false); setJoinInput(''); setJoinPreview(null)
      schedulePushPersonalData(
        useAppStore.getState().counters,
        useAppStore.getState().folders,
        useAppStore.getState().gridOrder,
        useAppStore.getState().folderOrders,
        driveToken
      )
    } catch (e) { showToast(e.message) }
    finally { setJoinLoading(false) }
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const getItemKey = (item) => `${item.type === 'counter' ? 'C' : 'F'}:${item.data.id}`

  const resetDrag = () => { setDragKey(null); setDragOverKey(null); setDragOverFolder(null); setDragClone(null); dragStateRef.current = null }

  // ── Drag reorder helpers ──────────────────────────────────────────────────

  // Reordena items en vivo mientras se arrastra
  const getLiveItems = (baseItems) => {
    const dk = dragStateRef.current?.dragKey
    const dok = dragStateRef.current?.dragOverKey
    if (!dk || !dok || dk === dok) return baseItems
    const overItem = baseItems.find(i => getItemKey(i) === dok)
    if (overItem?.type === 'folder' && dk.startsWith('C:')) return baseItems
    const fromIdx = baseItems.findIndex(i => getItemKey(i) === dk)
    const toIdx   = baseItems.findIndex(i => getItemKey(i) === dok)
    if (fromIdx === -1 || toIdx === -1) return baseItems
    const next = [...baseItems]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    return next
  }

  const commitDrag = (finalDragKey, finalOverKey) => {
    if (!finalDragKey || !finalOverKey || finalDragKey === finalOverKey) return
    const currentOrder = currentFolderId
      ? [...(folderOrders[currentFolderId] ?? [])]
      : [...gridOrder]
    const fromIdx = currentOrder.indexOf(finalDragKey)
    const toIdx   = currentOrder.indexOf(finalOverKey)
    if (fromIdx === -1 || toIdx === -1) return
    const newOrder = [...currentOrder]
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, finalDragKey)
    if (currentFolderId) setFolderOrder(currentFolderId, newOrder)
    else setGridOrder(newOrder)
    push()
  }

  // ── Pointer-based drag (funciona en móvil y escritorio) ───────────────────

  const handleHandlePointerDown = (e, item) => {
    if (!selectionMode) return
    e.preventDefault()
    e.stopPropagation()
    const key = getItemKey(item)
    // Buscar el grid-item contenedor
    const gridEl = document.querySelector(`[data-drag-key="${key}"]`)
    if (!gridEl) return
    const rect = gridEl.getBoundingClientRect()
    const state = {
      dragKey: key,
      dragOverKey: key,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    }
    dragStateRef.current = state
    setDragKey(key)
    setDragOverKey(key)
    setDragClone({ item, x: rect.left, y: rect.top, width: rect.width, height: rect.height })
    // Capturar puntero para recibir eventos aunque salga del elemento
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
  }

  const handleDragPointerMove = useCallback((e) => {
    const state = dragStateRef.current
    if (!state) return
    const x = e.clientX - state.offsetX
    const y = e.clientY - state.offsetY
    setDragClone(prev => prev ? { ...prev, x, y } : null)

    // Ocultar temporalmente el clone para hacer hit-test debajo de él
    const cloneEl = document.getElementById('drag-clone-portal')
    if (cloneEl) cloneEl.style.pointerEvents = 'none'
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const overCard = el?.closest('[data-drag-key]')
    if (overCard) {
      const overKey = overCard.getAttribute('data-drag-key')
      if (overKey && overKey !== state.dragOverKey) {
        state.dragOverKey = overKey
        setDragOverKey(overKey)
        // Forzar re-render para getLiveItems
        setDragClone(prev => prev ? { ...prev } : null)
      }
    }
  }, [])

  const handleDragPointerUp = useCallback(() => {
    const state = dragStateRef.current
    if (!state) return
    commitDrag(state.dragKey, state.dragOverKey)
    dragStateRef.current = null
    setDragKey(null)
    setDragOverKey(null)
    setDragClone(null)
    setDragOverFolder(null)
  }, [currentFolderId, folderOrders, gridOrder]) // eslint-disable-line

  useEffect(() => {
    if (!dragClone) return
    document.addEventListener('pointermove', handleDragPointerMove)
    document.addEventListener('pointerup',   handleDragPointerUp)
    document.addEventListener('pointercancel', handleDragPointerUp)
    return () => {
      document.removeEventListener('pointermove', handleDragPointerMove)
      document.removeEventListener('pointerup',   handleDragPointerUp)
      document.removeEventListener('pointercancel', handleDragPointerUp)
    }
  }, [dragClone, handleDragPointerMove, handleDragPointerUp])

  const handleRemoveFromFolder = (counter) => {
    if (!counter.folderId) return
    const folderId = counter.folderId
    const key = `C:${counter.id}`
    updateCounter(counter.id, { folderId: null })
    setGridOrder([...useAppStore.getState().gridOrder, key])
    setFolderOrder(folderId, (useAppStore.getState().folderOrders[folderId] ?? []).filter(k => k !== key))
    setExpanded(prev => prev ? { ...prev, folderId: null } : null)
    schedulePushPersonalData(
      useAppStore.getState().counters, useAppStore.getState().folders,
      useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
    )
  }

  const push = () => schedulePushPersonalData(
    useAppStore.getState().counters,
    useAppStore.getState().folders,
    useAppStore.getState().gridOrder,
    useAppStore.getState().folderOrders,
    driveToken
  )

  const openSharedInfo = async (counter) => {
    // loading: inviteCode=undefined, members=undefined
    setSharedInfoSheet({ counter, inviteCode: undefined, members: undefined })
    const [code, mems] = await Promise.all([
      counter.role === 'owner' ? getInviteCode(counter.sharedId).catch(() => null) : Promise.resolve(null),
      getMembers(counter.sharedId).catch(() => []),
    ])
    const roleOrder = { owner: 0, editor: 1, viewer: 2 }
    const sorted = [...mems].sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3))
    // Fix owner username if empty (may be null from old data)
    const currentUsername = useAppStore.getState().username
    const currentUid = useAppStore.getState().user?.uid
    const fixed = sorted.map(m => ({
      ...m,
      username: m.username || (m.role === 'owner' && m.uid === currentUid ? currentUsername : counter.ownerUsername || m.username),
    }))
    setSharedInfoSheet(prev => prev ? { ...prev, inviteCode: code, members: fixed } : null)
  }

  // ── Folder management ─────────────────────────────────────────────────────
  const handleFolderMenu = (folder) => {
    setEditingFolder(folder)
    setEditFolderName(folder.name)
    setEditFolderColor(folder.color ?? null)
    setFolderInviteCode(null)
    setFolderMembers([])
    if (folder.isShared && folder.sharedId) {
      getFolderMembers(folder.sharedId).then(m => setFolderMembers(m)).catch(() => {})
    }
    if (folder.isShared && folder.role === 'owner' && folder.sharedId) {
      getFolderInviteCode(folder.sharedId).then(c => setFolderInviteCode(c))
    }
  }

  const handleSaveFolder = () => {
    if (!editingFolder || !editFolderName.trim()) return
    const patch = { name: editFolderName.trim(), color: editFolderColor ?? null }
    updateFolder(editingFolder.id, patch)
    if (editingFolder.isShared) {
      pushFolderUpdate({ ...editingFolder, ...patch })
    }
    push()
    setEditingFolder(null)
  }

  const handleDeleteFolder = () => {
    if (!editingFolder) return
    if (!confirm(`¿Eliminar la carpeta "${editingFolder.name}" y todos sus contadores?`)) return
    removeFolder(editingFolder.id)
    push()
    setEditingFolder(null)
  }

  const handleFolderBgImage = () => {
    if (!editingFolder) return
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return
      const url = URL.createObjectURL(file)
      if (editingFolder.isShared && editingFolder.sharedId) {
        try {
          const path = folderPath(user?.uid, editingFolder.id)
          const uploadedUrl = await storageUpload(path, file)
          updateFolder(editingFolder.id, { backgroundImageUrl: uploadedUrl })
          setEditingFolder(f => ({ ...f, backgroundImageUrl: uploadedUrl }))
        } catch { updateFolder(editingFolder.id, { backgroundImageUrl: url }); setEditingFolder(f => ({ ...f, backgroundImageUrl: url })) }
      } else {
        updateFolder(editingFolder.id, { backgroundImageUrl: url })
        setEditingFolder(f => ({ ...f, backgroundImageUrl: url }))
      }
      push()
    }
    input.click()
  }

  const handleFolderRemoveBg = () => {
    if (!editingFolder) return
    updateFolder(editingFolder.id, { backgroundImageUrl: null })
    setEditingFolder(f => ({ ...f, backgroundImageUrl: null }))
    push()
  }

  const handleShareFolder = async () => {
    if (!editingFolder) return
    setFolderLoading(true)
    try {
      // Pasar los contadores que están dentro de la carpeta para compartirlos también
      const countersInFolder = counters.filter(c => c.folderId === editingFolder.id)
      const { sharedId, inviteCode: code, updatedCounters } = await shareFolder(editingFolder, countersInFolder)
      updateFolder(editingFolder.id, { isShared: true, sharedId, role: 'owner', ownerId: user?.uid })
      setEditingFolder(f => ({ ...f, isShared: true, sharedId, role: 'owner' }))
      setFolderInviteCode(code)
      // Actualizar los contadores que se han compartido como parte de la carpeta
      for (const patch of (updatedCounters ?? [])) {
        updateCounter(patch.id, { isShared: patch.isShared, sharedId: patch.sharedId, role: patch.role, ownerId: patch.ownerId, ownerUsername: patch.ownerUsername })
      }
      push()
      showToast('Carpeta compartida ✓')
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setFolderLoading(false) }
  }

  const handleUnshareFolder = async () => {
    if (!editingFolder) return
    if (!confirm('¿Dejar de compartir esta carpeta?')) return
    setFolderLoading(true)
    try {
      await unshareFolder(editingFolder)
      updateFolder(editingFolder.id, { isShared: false, sharedId: null, role: 'owner' })
      setEditingFolder(f => ({ ...f, isShared: false, sharedId: null, role: 'owner' }))
      setFolderInviteCode(null)
      push()
      showToast('Dejaste de compartir')
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setFolderLoading(false) }
  }

  const handleAbandonFolder = async () => {
    if (!editingFolder) return
    if (!confirm('¿Abandonar esta carpeta compartida?')) return
    setFolderLoading(true)
    try {
      await unshareFolder(editingFolder)
      removeFolder(editingFolder.id)
      setEditingFolder(null)
      push()
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setFolderLoading(false) }
  }

  const INVITE_BASE = 'https://tosysy.github.io/countall-web/?code='
  const handleCopyFolderCode = () => {
    if (!folderInviteCode) return
    navigator.clipboard.writeText(INVITE_BASE + folderInviteCode).catch(() => {})
    showToast('Enlace copiado ✓')
  }

  const parentFolderName = () => {
    if (!currentFolderId) return null
    const parent = folders.find(f => f.id === currentFolder?.parentFolderId)
    return parent?.name ?? 'Inicio'
  }

  return (
    <div className={styles.page}>
      {/* ── Header selección ───────────────────────────────────────────── */}
      {selectionMode && (
        <header className={styles.selectionHeader}>
          <button className="btn-icon" onClick={exitSelection}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <span className={styles.selectionTitle}>{selectedKeys.size} seleccionado{selectedKeys.size !== 1 ? 's' : ''}</span>
          <div style={{ display:'flex', gap:4 }}>
            <button className="btn-icon" title="Seleccionar todo" onClick={selectAll}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M3 5h2V3a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2h-2v2a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2zm0 14h12V7H3v12z"/>
              </svg>
            </button>
            {currentFolderId && (
              <button className="btn-icon" title="Sacar de carpeta" onClick={removeSelectedFromFolder}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8c0-1.1-.9-2-2-2zm-6 10l-4-4 1.41-1.41L13 13.17V9h2v4.17l1.59-1.58L18 13l-4 3z"/>
                </svg>
              </button>
            )}
            <button className="btn-icon" title="Eliminar" onClick={deleteSelected} style={{ color: 'var(--danger)' }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </button>
          </div>
        </header>
      )}

      {/* ── Header normal ───────────────────────────────────────────────── */}
      {!selectionMode && <header className={styles.header}>
        {currentFolderId ? (
          <>
            <button className="btn-icon" onClick={() => setCurrentFolder(currentFolder?.parentFolderId ?? null)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
            <div className={styles.breadcrumb}>
              <span className={styles.breadcrumbSub}
                onClick={() => setCurrentFolder(currentFolder?.parentFolderId ?? null)}>
                {parentFolderName() ?? 'Inicio'}
              </span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
              <span className={styles.headerTitle}>{currentFolder?.name ?? ''}</span>
            </div>
          </>
        ) : (
          <h1 className={styles.headerTitle}>CountAll</h1>
        )}

        <div className={styles.headerActions}>
          {/* Amigos */}
          <div className={styles.iconWrap}>
            <button className="btn-icon" onClick={() => navigate('/friends')} title="Amigos">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
            </button>
            {friendBadge && <div className="badge-dot" />}
          </div>

          {/* Invitaciones */}
          <div className={styles.iconWrap}>
            <button className="btn-icon" onClick={() => navigate('/invitations')} title="Invitaciones">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
            </button>
            {invBadge && <div className="badge-dot" />}
          </div>

          {/* Ajustes */}
          <button className="btn-icon" onClick={() => navigate('/settings')} title="Ajustes">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        </div>
      </header>}

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
          </svg>
          <p>Pulsa + para crear tu primer contador</p>
        </div>
      ) : (
        <div key={currentFolderId ?? 'root'} className="counter-grid">
          {getLiveItems(items).map((item, idx) => {
            const key = getItemKey(item)
            const isFolder = item.type === 'folder'
            const isFolderDropTarget = isFolder && dragOverFolder === item.data.id
            const isSelected = selectedKeys.has(key)
            const isDragging = dragKey === key
            const isLandingSpot = !isDragging && !!dragKey && dragOverKey === key && !isFolderDropTarget
            return (
              <div key={key}
                data-drag-key={key}
                className={`${styles.gridItem} ${isSelected ? styles.gridItemSelected : ''}`}
                onPointerDown={() => !selectionMode && handleLongPress(key)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                style={{
                  opacity: isDragging ? 0 : 1,
                  transition: dragKey ? 'opacity 0.12s, transform 0.18s cubic-bezier(0.2,0,0,1)' : undefined,
                  transform: isLandingSpot ? 'scale(0.93)' : 'scale(1)',
                  position: 'relative',
                  animationDelay: dragKey ? '0ms' : `${idx * 35}ms`,
                }}
              >
                {item.type === 'counter' ? (
                  <CounterCard
                    counter={item.data}
                    onIncrement={() => !selectionMode && handleIncrement(useAppStore.getState().counters.find(c => c.id === item.data.id) ?? item.data)}
                    onDecrement={() => !selectionMode && handleDecrement(useAppStore.getState().counters.find(c => c.id === item.data.id) ?? item.data)}
                    onClick={(c) => selectionMode ? toggleSelect(key) : (setExpandedInitialTab('log'), setExpanded(c))}
                    onMenu={!selectionMode ? (c, e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setCounterMenu({ counter: c, top: r.bottom + 4, right: window.innerWidth - r.right })
                    } : undefined}
                    onSharedBadge={!selectionMode ? (c) => openSharedInfo(c) : undefined}
                  />
                ) : (
                  <FolderCard
                    folder={item.data}
                    folderCounters={getFolderCounters(item.data.id)}
                    subFolders={folders.filter(f => f.parentFolderId === item.data.id)}
                    folderOrder={folderOrders[item.data.id] ?? []}
                    onClick={(f) => selectionMode ? toggleSelect(key) : setCurrentFolder(f.id)}
                    onMenu={!selectionMode ? handleFolderMenu : undefined}
                    isDragTarget={isFolderDropTarget}
                  />
                )}
                {/* Overlay modo selección: drag handle izquierda, checkbox derecha */}
                {selectionMode && (
                  <>
                    <div className={styles.dragHandle}
                      onPointerDown={(e) => handleHandlePointerDown(e, item)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                      </svg>
                    </div>
                    <div className={`${styles.checkbox} ${isSelected ? styles.checkboxOn : ''}`}
                      onPointerDown={e => { e.stopPropagation(); toggleSelect(key) }}>
                      {isSelected && (
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── FAB ────────────────────────────────────────────────────────── */}
      {showFab && (
        <div className={styles.fabBackdrop} onClick={() => setShowFab(false)}>
          <div className={styles.fabMenu} onClick={e => e.stopPropagation()}>
            <button className={styles.fabMenuItem} onClick={() => { setShowFab(false); setShowCreateCounter(true); setNewName(''); setNewIncrement('1'); setNewTarget(''); setCreateErrors({}) }}>
              <div className={styles.fabMenuIcon}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                </svg>
              </div>
              <span>Nuevo contador</span>
            </button>
            <button className={styles.fabMenuItem} onClick={() => { setShowFab(false); setShowCreateFolder(true); setNewName('') }}>
              <div className={styles.fabMenuIcon}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
              </div>
              <span>Nueva carpeta</span>
            </button>
            <button className={styles.fabMenuItem} onClick={() => { setShowFab(false); setShowJoin(true); setJoinInput(''); setJoinPreview(null) }}>
              <div className={styles.fabMenuIcon}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              </div>
              <span>Unirse con código</span>
            </button>
          </div>
        </div>
      )}
      <button className="fab" onClick={() => setShowFab(f => !f)}>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"
          style={{ transform: showFab ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </button>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Create counter */}
      {showCreateCounter && (
        <div className="dialog-backdrop" onClick={() => { setShowCreateCounter(false); setCreateErrors({}) }}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Nuevo contador</h3>

            {/* Nombre */}
            <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginBottom: createErrors.name ? 2 : 10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <label style={{ fontSize:'12px', color:'var(--text-secondary)', fontWeight:600 }}>Nombre</label>
                <span style={{ fontSize:'11px', color: newName.length > 12 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                  {newName.length}/15
                </span>
              </div>
              <input className="input-field" placeholder="Nombre del contador"
                value={newName} autoFocus maxLength={15}
                style={ createErrors.name ? { borderColor:'var(--danger)' } : {}}
                onChange={e => { setNewName(e.target.value); if (e.target.value.trim()) setCreateErrors(p => ({ ...p, name: undefined })) }}
                onKeyDown={e => e.key === 'Enter' && handleCreateCounter()} />
              {createErrors.name && (
                <span style={{ fontSize:'11px', color:'var(--danger)', paddingLeft:2 }}>{createErrors.name}</span>
              )}
            </div>

            {/* Incremento + Objetivo */}
            <div style={{ display:'flex', gap:'10px' }}>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
                <label style={{ fontSize:'12px', color:'var(--text-secondary)', fontWeight:600 }}>Incremento</label>
                <input className="input-field" type="number" inputMode="numeric" min="1" placeholder="1"
                  value={newIncrement}
                  style={ createErrors.increment ? { borderColor:'var(--danger)' } : {}}
                  onChange={e => { setNewIncrement(e.target.value); setCreateErrors(p => ({ ...p, increment: undefined })) }}
                  onBlur={() => { const v = parseInt(newIncrement); if (!isNaN(v) && v >= 1) setNewIncrement(String(v)) }} />
                {createErrors.increment && (
                  <span style={{ fontSize:'11px', color:'var(--danger)', paddingLeft:2 }}>{createErrors.increment}</span>
                )}
              </div>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
                <label style={{ fontSize:'12px', color:'var(--text-secondary)', fontWeight:600 }}>
                  Objetivo <span style={{ fontWeight:400 }}>(opcional)</span>
                </label>
                <input className="input-field" type="number" inputMode="numeric" min="1" placeholder="Sin objetivo"
                  value={newTarget}
                  style={ createErrors.target ? { borderColor:'var(--danger)' } : {}}
                  onChange={e => { setNewTarget(e.target.value); setCreateErrors(p => ({ ...p, target: undefined })) }}
                  onBlur={() => { if (newTarget !== '') { const v = parseInt(newTarget); if (isNaN(v) || v < 1) setNewTarget('') } }} />
                {createErrors.target && (
                  <span style={{ fontSize:'11px', color:'var(--danger)', paddingLeft:2 }}>{createErrors.target}</span>
                )}
              </div>
            </div>

            <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setShowCreateCounter(false); setCreateErrors({}) }}>Cancelar</button>
              <button className="btn-primary" onClick={handleCreateCounter}
                disabled={!newName.trim()}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create folder */}
      {showCreateFolder && (
        <div className="dialog-backdrop" onClick={() => setShowCreateFolder(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Nueva carpeta</h3>
            <input className="input-field" placeholder="Nombre de la carpeta"
              value={newName} autoFocus
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} />
            <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowCreateFolder(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleCreateFolder}>Crear</button>
            </div>
          </div>
        </div>
      )}


      {/* Edit folder */}
      {editingFolder && (
        <div className="dialog-backdrop" onClick={() => setEditingFolder(null)}>
          <div className="dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h3>Carpeta</h3>

            {/* Nombre */}
            <input className="input-field" placeholder="Nombre de la carpeta"
              value={editFolderName} autoFocus
              onChange={e => setEditFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveFolder()} />

            {/* Color */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: editFolderColor ?? 'var(--card-bg)',
                border: editFolderColor ? undefined : '2px solid var(--card-stroke)',
              }} />
              <button className="btn-ghost" style={{ flex:1, fontSize:13 }} onClick={() => setShowFolderColorPicker(true)}>
                {editFolderColor ? editFolderColor.toUpperCase() : 'Color de carpeta'}
              </button>
              {editFolderColor && (
                <button className="btn-ghost" style={{ fontSize:12, padding:'4px 8px' }}
                  onClick={() => setEditFolderColor(null)}>✕</button>
              )}
            </div>

            {/* Imagen de fondo */}
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button className="btn-ghost" style={{ flex:1, fontSize:13 }} onClick={handleFolderBgImage}>
                {editingFolder.backgroundImageUrl ? 'Cambiar imagen' : 'Añadir imagen'}
              </button>
              {editingFolder.backgroundImageUrl && (
                <button className="btn-ghost" style={{ fontSize:13 }} onClick={handleFolderRemoveBg}>Quitar</button>
              )}
            </div>

            {/* Compartir / Código */}
            <div style={{ borderTop:'1px solid var(--card-stroke)', marginTop:12, paddingTop:12, display:'flex', flexDirection:'column', gap:8 }}>
              {!editingFolder.isShared && editingFolder.role === 'owner' && (
                <button className="btn-ghost" style={{ fontSize:13 }} onClick={handleShareFolder} disabled={folderLoading}>
                  {folderLoading ? <span className="spinner" style={{ width:14, height:14 }} /> : 'Compartir carpeta'}
                </button>
              )}
              {editingFolder.isShared && editingFolder.role === 'owner' && (
                <>
                  {folderInviteCode && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--log-card-bg)', borderRadius:10, padding:'8px 12px' }}>
                      <code style={{ flex:1, fontFamily:'monospace', fontSize:14, letterSpacing:2, color:'var(--text-primary)' }}>{folderInviteCode}</code>
                      <button className="btn-ghost" style={{ fontSize:12, padding:'4px 8px' }} onClick={handleCopyFolderCode}>Copiar</button>
                    </div>
                  )}
                  <button className="btn-ghost" style={{ fontSize:13, color:'var(--danger)' }} onClick={handleUnshareFolder} disabled={folderLoading}>
                    Dejar de compartir
                  </button>
                </>
              )}
              {editingFolder.isShared && editingFolder.role !== 'owner' && (
                <button className="btn-ghost" style={{ fontSize:13, color:'var(--danger)' }} onClick={handleAbandonFolder} disabled={folderLoading}>
                  Abandonar carpeta
                </button>
              )}
            </div>

            {/* Miembros de la carpeta compartida */}
            {editingFolder.isShared && folderMembers.length > 0 && (
              <div style={{ borderTop:'1px solid var(--card-stroke)', marginTop:12, paddingTop:12 }}>
                <p style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:8, textTransform:'uppercase' }}>
                  Miembros ({folderMembers.length})
                </p>
                {folderMembers.map(m => (
                  <div key={m.uid} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0' }}>
                    <div className="avatar" style={{ width:28, height:28, fontSize:12, background:'#607D8B', flexShrink:0 }}>
                      {m.username?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span style={{ flex:1, fontSize:13, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {m.username}
                    </span>
                    {editingFolder.role === 'owner' && m.uid !== user?.uid ? (
                      <>
                        <select style={{ fontSize:12, background:'var(--log-card-bg)', border:'1px solid var(--card-stroke)', borderRadius:6, color:'var(--text-primary)', padding:'2px 4px' }}
                          value={m.role}
                          onChange={async e => {
                            await setFolderMemberRole(editingFolder.sharedId, m.uid, e.target.value).catch(() => {})
                            setFolderMembers(prev => prev.map(x => x.uid === m.uid ? { ...x, role: e.target.value } : x))
                          }}>
                          <option value="viewer">Lector</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button className="btn-icon" style={{ padding:4 }}
                          onClick={async () => {
                            if (!confirm(`¿Expulsar a ${m.username}?`)) return
                            await removeFolderMember(editingFolder.sharedId, m.uid).catch(() => {})
                            setFolderMembers(prev => prev.filter(x => x.uid !== m.uid))
                          }}>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--danger)" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize:11, color:'var(--text-secondary)' }}>
                        {{ owner:'Propietario', editor:'Editor', viewer:'Lector' }[m.role] ?? m.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
              {editingFolder.role === 'owner' && (
                <button className="btn-danger" onClick={handleDeleteFolder}>Eliminar</button>
              )}
              <div style={{ flex:1 }} />
              <button className="btn-ghost" onClick={() => setEditingFolder(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveFolder}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Join by code */}
      {showJoin && (
        <div className="dialog-backdrop" onClick={() => { setShowJoin(false); setJoinPreview(null) }}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Unirse con código</h3>
            {!joinPreview ? (
              <>
                <p>Introduce el código de invitación</p>
                <div style={{ display:'flex', gap:'8px' }}>
                  <input className="input-field" placeholder="Código"
                    value={joinInput} autoFocus style={{ flex: 1 }}
                    onChange={e => setJoinInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoinPreview()} />
                  <button className="btn-ghost" style={{ padding:'0 12px', flexShrink:0 }}
                    onClick={() => { setShowJoin(false); setShowQrScanner(true) }}
                    title="Escanear QR">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path d="M3 3h7v7H3zm1 1v5h5V4zm1 1h3v3H5zM14 3h7v7h-7zm1 1v5h5V4zm1 1h3v3h-3zM3 14h7v7H3zm1 1v5h5v-5zm1 1h3v3H5zM14 14h2v2h-2zm3 0h2v2h-2zm0 3h2v2h-2zm-3 0h2v2h-2zm0 3h2v2h-2zm3-3h2v2h-2z"/>
                    </svg>
                  </button>
                </div>
                <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
                  <button className="btn-ghost" onClick={() => setShowJoin(false)}>Cancelar</button>
                  <button className="btn-primary" onClick={handleJoinPreview} disabled={joinLoading}>
                    {joinLoading ? <span className="spinner" style={{ width:16, height:16 }} /> : 'Continuar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>¿Unirse a <strong>"{joinPreview.name}"</strong>?</p>
                <p style={{ fontSize:'13px' }}>{joinPreview.isFolder ? 'Carpeta compartida' : 'Contador compartido'}</p>
                <div style={{ display:'flex', gap:'8px', marginTop:'16px', justifyContent:'flex-end' }}>
                  <button className="btn-ghost" onClick={() => setJoinPreview(null)}>Atrás</button>
                  <button className="btn-primary" onClick={handleJoinConfirm} disabled={joinLoading}>
                    {joinLoading ? <span className="spinner" style={{ width:16, height:16 }} /> : 'Unirse'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Expanded counter */}
      {expanded && (
        <ExpandedCounter
          counter={expanded}
          onClose={() => { setExpanded(null); setExpandedShowMenu(false); setExpandedInitialTab('log') }}
          onUpdate={handleCounterUpdate}
          onDelete={() => handleDelete(expanded)}
          onIncrement={() => { const p = handleIncrement(expanded); if (p) setExpanded(prev => ({ ...prev, ...p })) }}
          onDecrement={() => { const p = handleDecrement(expanded); if (p) setExpanded(prev => ({ ...prev, ...p })) }}
          initialShowMenu={expandedShowMenu}
          initialTab={expandedInitialTab}
          onRemoveFromFolder={() => handleRemoveFromFolder(expanded)}
        />
      )}

      {/* QR Scanner */}
      {showQrScanner && (
        <QrScanner
          onResult={(raw) => {
            setShowQrScanner(false)
            // El QR contiene la URL completa (?code=XYZ). Extraer solo el código.
            let code = raw
            try {
              const u = new URL(raw)
              const p = u.searchParams.get('code')
              if (p) code = p
            } catch { /* raw no es URL → usarlo tal cual */ }
            setJoinInput(code)
            setShowJoin(true)
          }}
          onClose={() => setShowQrScanner(false)}
        />
      )}

      {/* Folder color picker */}
      {showFolderColorPicker && (
        <ColorPicker
          initialColor={editFolderColor}
          onSave={(hex) => { setEditFolderColor(hex); setShowFolderColorPicker(false) }}
          onCancel={() => setShowFolderColorPicker(false)}
          onReset={() => { setEditFolderColor(null); setShowFolderColorPicker(false) }}
        />
      )}

      {/* ── Menú contextual de contador ─────────────────────────────────── */}
      {counterMenu && (
        <>
          {/* capa transparente para cerrar al hacer clic fuera */}
          <div style={{ position:'fixed', inset:0, zIndex:49 }}
            onPointerDown={() => setCounterMenu(null)} />
          <div style={{
            position: 'fixed',
            top: counterMenu.top,
            right: counterMenu.right,
            background: 'var(--card-bg)',
            border: '1px solid var(--card-stroke)',
            borderRadius: 14,
            minWidth: 190,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            overflow: 'hidden',
            zIndex: 50,
            animation: 'scaleIn 0.15s ease',
            transformOrigin: 'top right',
          }}>
            {/* Editar → abre el contador ampliado en Ajustes */}
            <button className="portal-menu-item" style={cMenuStyle}
              onClick={() => { setExpandedInitialTab('settings'); setExpanded(counterMenu.counter); setCounterMenu(null) }}>
              Editar
            </button>
            {/* Sacar de carpeta */}
            {counterMenu.counter.folderId && (
              <button className="portal-menu-item" style={cMenuStyle}
                onClick={() => { handleRemoveFromFolder(counterMenu.counter); setCounterMenu(null) }}>
                Sacar de carpeta
              </button>
            )}
            {/* Compartir */}
            {!counterMenu.counter.isShared && (
              <button className="portal-menu-item" style={cMenuStyle}
                onClick={() => { setExpandedInitialTab('settings'); setExpanded(counterMenu.counter); setCounterMenu(null) }}>
                Compartir
              </button>
            )}
            {counterMenu.counter.isShared && counterMenu.counter.role === 'owner' && (
              <button className="portal-menu-item" style={cMenuStyle}
                onClick={() => { setExpandedInitialTab('settings'); setExpanded(counterMenu.counter); setCounterMenu(null) }}>
                Dejar de compartir
              </button>
            )}
            {/* Eliminar */}
            <button className="portal-menu-item" style={{ ...cMenuStyle, color: 'var(--danger)' }}
              onClick={() => {
                setCounterMenu(null)
                handleDelete(counterMenu.counter)
              }}>
              Eliminar
            </button>
          </div>
        </>
      )}

      {/* ── Hoja de info compartida ──────────────────────────────────────── */}
      {sharedInfoSheet && (() => {
        const { counter, inviteCode, members } = sharedInfoSheet
        const INVITE_BASE = 'https://tosysy.github.io/countall-web/?code='
        const qrUrl = inviteCode
          ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&bgcolor=ffffff&color=000000&data=${encodeURIComponent(INVITE_BASE + inviteCode)}`
          : null
        const ROLE_LABEL = { owner: 'Propietario', editor: 'Editor', viewer: 'Lector' }
        const ROLE_ICON  = { owner: '👑', editor: '✏️', viewer: '👁️' }
        return (
          <div className="dialog-backdrop" onClick={() => setSharedInfoSheet(null)}>
            <div className="dialog" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>

              {/* Nombre del contador */}
              <h3 style={{ margin: '0 0 16px' }}>{counter.name}</h3>

              {/* QR */}
              {/* Contenedor blanco fijo — QR centrado con margen */}
              <div style={{
                width: 160, height: 160,
                background: '#fff', borderRadius: 20,
                margin: '0 auto 10px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {qrUrl ? (
                  <img src={qrUrl} alt="QR" style={{ width: 110, height: 110, display: 'block' }} />
                ) : (
                  <span style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: '0 12px' }}>
                    {inviteCode === undefined ? 'Cargando…' : 'Solo el propietario puede ver el QR'}
                  </span>
                )}
              </div>

              {/* Código */}
              {inviteCode && (
                <code style={{ fontSize: 18, fontWeight: 800, letterSpacing: 3,
                  color: 'var(--text-primary)', fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>
                  {inviteCode}
                </code>
              )}

              {/* Separador */}
              <div style={{ height: 1, background: 'var(--card-stroke)', margin: '12px 0' }} />

              {/* Miembros */}
              <div style={{ textAlign: 'left' }}>
                {!members || members.length === 0
                  ? <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '8px 0' }}>{members === undefined ? 'Cargando…' : 'Sin miembros'}</p>
                  : members.map(m => (
                    <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                      borderBottom: '1px solid var(--card-stroke)' }}>
                      <span style={{ fontSize: 16 }}>{ROLE_ICON[m.role] ?? '👤'}</span>
                      <span style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{m.username}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ROLE_LABEL[m.role] ?? m.role}</span>
                    </div>
                  ))
                }
              </div>

              {/* Acciones */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-ghost" style={{ flex: 1 }}
                  onClick={() => setSharedInfoSheet(null)}>
                  Cerrar
                </button>
                {inviteCode && (
                  <button className="btn-primary" style={{ flex: 1 }}
                    onClick={() => {
                      navigator.clipboard.writeText(INVITE_BASE + inviteCode).catch(() => {})
                      showToast('Enlace copiado ✓')
                      setSharedInfoSheet(null)
                    }}>
                    Copiar enlace
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Clone flotante para drag ─────────────────────────────────────── */}
      {dragClone && (
        <div
          id="drag-clone-portal"
          style={{
            position: 'fixed',
            left: dragClone.x,
            top: dragClone.y,
            width: dragClone.width,
            height: dragClone.height,
            zIndex: 1000,
            pointerEvents: 'none',
            transform: 'scale(1.05)',
            transformOrigin: 'center center',
            boxShadow: '0 12px 40px rgba(0,0,0,0.38)',
            borderRadius: 16,
            opacity: 0.96,
            willChange: 'left, top',
          }}
        >
          {dragClone.item.type === 'counter' ? (
            <CounterCard
              counter={dragClone.item.data}
              onIncrement={undefined}
              onDecrement={undefined}
              onClick={undefined}
            />
          ) : (
            <FolderCard
              folder={dragClone.item.data}
              folderCounters={getFolderCounters(dragClone.item.data.id)}
              subFolders={folders.filter(f => f.parentFolderId === dragClone.item.data.id)}
              folderOrder={folderOrders[dragClone.item.data.id] ?? []}
              onClick={undefined}
            />
          )}
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}

      {/* In-app counter change notification */}
      {counterNotif && (
        <div
          className={styles.counterNotif}
          onClick={() => {
            setCounterNotif(null)
            const c = useAppStore.getState().counters.find(c2 => c2.id === counterNotif.counterId)
            if (c) setExpanded(c)
          }}
        >
          {counterNotif.text}
        </div>
      )}
    </div>
  )
}

const cMenuStyle = {
  display: 'block', width: '100%',
  padding: '12px 16px', textAlign: 'left',
  fontSize: 14, color: 'var(--text-primary)',
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.1s',
}
