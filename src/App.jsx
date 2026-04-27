import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { onAuthChange, handleRedirectResult, getUsername, refreshDriveToken } from './firebase/auth'
import { listenDataVersion, listenBgVersion, pullPersonalData, restoreLinkedSharedItems } from './firebase/syncManager'
import { downloadAllBackgrounds } from './firebase/driveManager'
import useAppStore from './store/appStore'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'
import FriendsPage from './pages/FriendsPage'
import InvitationsPage from './pages/InvitationsPage'
import SettingsPage from './pages/SettingsPage'

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline  = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [])
  if (!offline) return null
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 9999,
      background: '#323232', color: '#fff',
      padding: '10px 16px',
      paddingBottom: 'max(10px, env(safe-area-inset-bottom) + 6px)',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 13, fontWeight: 600,
      boxShadow: '0 -2px 12px rgba(0,0,0,0.3)',
    }}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
      </svg>
      Sin conexión — los cambios se guardarán en local
    </div>
  )
}

function ThemeProvider({ children }) {
  const theme = useAppStore(s => s.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (t) => {
      const resolved = t === 'system' ? (mq.matches ? 'dark' : 'light') : t
      document.documentElement.setAttribute('data-theme', resolved)
      document.querySelector('meta[name="theme-color"]')?.remove()
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.content = resolved === 'dark' ? '#000000' : '#EBEBEB'
      document.head.appendChild(meta)
    }
    apply(theme)
    if (theme === 'system') {
      mq.addEventListener('change', () => apply('system'))
      return () => mq.removeEventListener('change', () => apply('system'))
    }
  }, [theme])
  return children
}

// ── Smart personal-data merge (mirrors Android applyRemoteCounters/applyRemoteFolders) ───
function applyPersonalData(data) {
  const store = useAppStore.getState()
  const { setCounters, setFolders, setGridOrder, setFolderOrders } = store
  const localCounters = store.counters
  const localFolders  = store.folders

  // ── Counters ──────────────────────────────────────────────────────────────
  if (data.counters) {
    const remoteIds    = new Set()
    const localMap     = Object.fromEntries(localCounters.map(c => [c.id, c]))
    const localByShId  = Object.fromEntries(
      localCounters.filter(c => c.isShared && c.sharedId).map(c => [c.sharedId, c])
    )
    const merged = []

    for (const rc of data.counters) {
      if (!rc.id) continue
      remoteIds.add(rc.id)
      const local = localMap[rc.id]

      if (local) {
        // Actualizar metadata; preservar backgroundImageLocal y, para compartidos,
        // preservar value/logEntries (el listener RTDB los gestiona)
        merged.push({
          ...local,
          name: rc.name, increment: rc.increment,
          target: rc.target ?? null, color: rc.color ?? null,
          folderId: rc.folderId ?? null,
          isShared: rc.isShared, sharedId: rc.sharedId ?? null,
          ownerId: rc.ownerId ?? null, ownerUsername: rc.ownerUsername ?? null,
          role: rc.role ?? 'owner',
          ...(rc.isShared ? {} : { value: rc.value, logEntries: rc.logEntries ?? [] }),
        })
      } else {
        // Mismo sharedId ya existe bajo otro localId → preservar el local
        if (rc.isShared && rc.sharedId && localByShId[rc.sharedId]) {
          remoteIds.add(localByShId[rc.sharedId].id)
          continue
        }
        merged.push({ backgroundImageLocal: null, ...rc, logEntries: rc.logEntries ?? [] })
      }
    }

    // Retener compartidos que no están en Drive (su ciclo de vida es RTDB)
    for (const lc of localCounters) {
      if (!remoteIds.has(lc.id) && lc.isShared) merged.push(lc)
    }

    setCounters(merged)
  }

  // ── Folders ───────────────────────────────────────────────────────────────
  if (data.folders) {
    const remoteFIds = new Set()
    const localFMap  = Object.fromEntries(localFolders.map(f => [f.id, f]))
    const mergedF    = []

    for (const rf of data.folders) {
      if (!rf.id) continue
      remoteFIds.add(rf.id)
      const lf = localFMap[rf.id]
      if (lf) {
        mergedF.push({
          ...lf,
          name: rf.name, color: rf.color ?? null,
          parentFolderId: rf.parentFolderId ?? null,
          isShared: rf.isShared ?? false, sharedId: rf.sharedId ?? null,
          ownerId: rf.ownerId ?? null, role: rf.role ?? 'owner',
          backgroundImageUrl: rf.backgroundImageUrl ?? null,
        })
      } else {
        mergedF.push({ backgroundImageLocal: null, ...rf })
      }
    }

    // Retener carpetas compartidas que no están en Drive
    for (const lf of localFolders) {
      if (!remoteFIds.has(lf.id) && lf.isShared) mergedF.push(lf)
    }

    setFolders(mergedF)
  }

  // ── Orden ─────────────────────────────────────────────────────────────────
  if (data.gridOrder)    setGridOrder(data.gridOrder)
  if (data.folderOrders) setFolderOrders(data.folderOrders)
}

export default function App() {
  const navigate = useNavigate()
  const { setUser, setUsername, setDriveToken, updateCounter, clearData } = useAppStore()
  const pendingCodeRef = useRef(null)
  const tokenRefreshedRef = useRef(false) // evitar bucle si signInWithPopup dispara onAuthStateChanged

  // ── Detectar ?code= en la URL (deep link de invitación) ──────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      pendingCodeRef.current = code
      // Limpiar el parámetro de la URL sin recargar la página
      const clean = window.location.pathname + window.location.hash
      window.history.replaceState({}, '', clean)
    }
  }, [])

  // ── Auth listener + redirect result ──────────────────────────────────────
  useEffect(() => {
    let dataVersionUnsub = null
    let bgVersionUnsub = null

    const handleUser = async (user) => {
      if (!user) {
        clearData()
        navigate('/login', { replace: true })
        return
      }

      setUser({ uid: user.uid, displayName: user.displayName, photoURL: user.photoURL, email: user.email })

      // Restaurar username desde Firebase
      const fbUsername = await getUsername(user.uid)
      if (fbUsername) setUsername(fbUsername)

      // Navegar a main, pasando código de invitación pendiente si lo hay
      const pending = pendingCodeRef.current
      pendingCodeRef.current = null
      navigate('/', { replace: true, state: pending ? { pendingCode: pending } : undefined })

      // Obtener token de Drive:
      // 1. Si hay redirect result (flujo signInWithRedirect), usarlo directamente.
      // 2. Si no (flujo popup o recarga de página), intentar refrescar silenciosamente.
      //    Usamos tokenRefreshedRef para evitar bucle infinito si signInWithPopup
      //    re-dispara onAuthStateChanged con el mismo usuario.
      const redirectRes = await handleRedirectResult()
      if (redirectRes?.accessToken) {
        // Flujo redirect: usar token recién obtenido
        tokenRefreshedRef.current = true
        setDriveToken(redirectRes.accessToken, Date.now() + 3600_000)
        initPersonalSync(redirectRes.accessToken)
      } else if (!tokenRefreshedRef.current) {
        tokenRefreshedRef.current = true
        const { driveToken: saved, driveTokenExpiry } = useAppStore.getState()
        if (saved && Date.now() < driveTokenExpiry) {
          // Token persistido todavía válido — usarlo directamente (evita popup en recarga)
          initPersonalSync(saved)
        } else {
          // Token expirado o ausente — intentar popup silencioso como fallback
          refreshDriveToken().then(token => {
            if (token) {
              setDriveToken(token, Date.now() + 3600_000)
              initPersonalSync(token)
            }
          }).catch(() => {})
        }
      }
    }

    const unsub = onAuthChange(handleUser)

    return () => {
      unsub()
      dataVersionUnsub?.()
      bgVersionUnsub?.()
    }
  }, []) // eslint-disable-line

  const initPersonalSync = async (token) => {
    if (!token) return

    // Intento inicial: pull de Drive para sincronizar estado (independientemente del deviceId,
    // ya que esto es el primer carga — podría ser un dispositivo/navegador nuevo).
    // Si no hay bundle en Drive, restaurar desde RTDB como fallback.
    const initialData = await pullPersonalData(token).catch(() => null)
    if (initialData) {
      applyPersonalData(initialData)
    } else {
      // Sin bundle en Drive: restaurar contadores/carpetas compartidos desde RTDB
      const store = useAppStore.getState()
      const existingSharedIds = new Set(store.counters.filter(c => c.isShared && c.sharedId).map(c => c.sharedId))
      const existingFolderSharedIds = new Set(store.folders.filter(f => f.isShared && f.sharedId).map(f => f.sharedId))
      if (existingSharedIds.size === 0 && existingFolderSharedIds.size === 0) {
        const { counters: restoredCounters, folders: restoredFolders } = await restoreLinkedSharedItems(
          existingSharedIds, existingFolderSharedIds
        ).catch(() => ({ counters: [], folders: [] }))
        const { addCounter, addFolder } = useAppStore.getState()
        for (const c of restoredCounters) addCounter(c)
        for (const f of restoredFolders) addFolder(f)
      }
    }

    // Descarga inicial de imágenes de fondo (blob URLs no sobreviven recargas)
    downloadAllBackgrounds(token).then(bgs => {
      const store = useAppStore.getState()
      store.counters.forEach(c => {
        if (!c.isShared && bgs[c.id]) {
          updateCounter(c.id, { backgroundImageLocal: bgs[c.id] })
        }
      })
    }).catch(() => {})

    // Escuchar dataVersion → pull de Drive cuando cambie desde otro dispositivo
    const unsub1 = listenDataVersion(async () => {
      const data = await pullPersonalData(token).catch(() => null)
      if (!data) return
      if (data.deviceId === 'web') return // propio cambio (ignorar)
      applyPersonalData(data)
    })

    // Escuchar bgVersion → pull de backgrounds
    const unsub2 = listenBgVersion(async () => {
      const bgs = await downloadAllBackgrounds(token).catch(() => ({}))
      const store = useAppStore.getState()
      store.counters.forEach(c => {
        if (!c.isShared && bgs[c.id]) {
          updateCounter(c.id, { backgroundImageLocal: bgs[c.id] })
        }
      })
    })

    return () => { unsub1(); unsub2() }
  }

  // ── Tema ─────────────────────────────────────────────────────────────────
  return (
    <ThemeProvider>
      <div className="app">
        <OfflineBanner />
        <Routes>
          <Route path="/login" element={<LoginPage onDriveToken={(t) => {
            setDriveToken(t, Date.now() + 3600_000)
            initPersonalSync(t)
          }} />} />
          <Route path="/" element={<MainPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ThemeProvider>
  )
}
