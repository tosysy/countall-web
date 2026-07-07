import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { onAuthChange, handleRedirectResult, getUsername, refreshDriveToken } from './firebase/auth'
import {
  listenDataVersion, listenBgVersion, pullPersonalData, pullLegacyDriveData,
  restoreLinkedSharedItems, setSyncReady,
} from './firebase/syncManager'
import {
  uploadSyncBundle, downloadAllBackgrounds as pbDownloadAllBackgrounds,
  uploadBackground as pbUploadBackground,
} from './firebase/personalBackup'
import { downloadAllBackgrounds as driveDownloadAllBackgrounds } from './firebase/driveManager'
import { getDeviceId } from './firebase/deviceId'
import { listenRemoteConfig } from './firebase/remoteConfig'
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

/** Modal de carga — bloquea toda la UI con barra de progreso */
function LoadingModal({ message, progress, variant = 'load' }) {
  const isSignOut = variant === 'signout'
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99997,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28, padding: 40, textAlign: 'center',
      animation: 'fadeIn 0.2s ease',
    }}>
      {isSignOut ? (
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
        </svg>
      ) : (
        <img
          src="https://raw.githubusercontent.com/tosysy/CountAll/main/icon-192.png"
          alt="CountAll" width="72" height="72"
          style={{ borderRadius: 18, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
        />
      )}
      <div>
        {!isSignOut && (
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: -0.5 }}>
            CountAll
          </h2>
        )}
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>{message}</p>
      </div>
      <div style={{ width: '100%', maxWidth: 260 }}>
        <div style={{ height: 5, background: 'var(--card-stroke)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'var(--btn-plus)',
            borderRadius: 99,
            transition: 'width 0.45s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>
    </div>
  )
}

/** Pantalla de mantenimiento — bloquea toda la UI igual que en Android */
function MaintenanceScreen({ message }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: 32, textAlign: 'center',
    }}>
      <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
        En mantenimiento
      </p>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 300, margin: 0, lineHeight: 1.5 }}>
        {message}
      </p>
    </div>
  )
}

/** Banner de aviso en la parte superior — dismiss con ✕ */
function AppBanner({ text, color }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || !text) return null
  // Calcular si el texto sobre el color es legible en blanco o negro
  const r = parseInt(color.slice(1,3),16)/255, g = parseInt(color.slice(3,5),16)/255, b = parseInt(color.slice(5,7),16)/255
  const lum = 0.299*r + 0.587*g + 0.114*b
  const textColor = lum > 0.55 ? '#000' : '#fff'
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9990,
      background: color, color: textColor,
      padding: 'max(10px, env(safe-area-inset-top) + 4px) 16px 10px',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 13, fontWeight: 600,
      boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
      animation: 'slideDown 0.25s ease',
    }}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span style={{ flex: 1 }}>{text}</span>
      <button onClick={() => setDismissed(true)} style={{ color: textColor, opacity: 0.8, padding: 4, lineHeight: 0 }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
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
  const tokenRefreshedRef = useRef(false)   // evitar bucle si signInWithPopup dispara onAuthStateChanged
  const syncInProgressRef = useRef(false)   // evitar doble llamada a initPersonalSync
  const [loadingScreen, setLoadingScreen] = useState(null) // null | { message, progress, variant }
  const [rcConfig, setRcConfig] = useState({ maintenanceMode: false, maintenanceMessage: '', appBanner: '', appBannerColor: '#1E88E5' })

  // ── App config / mantenimiento — listener RTDB, arranca siempre ─────────
  // IMPORTANTE: en Firebase Console → Realtime Database → Rules añadir:
  // "appConfig": { ".read": true, ".write": false }
  // para que sea legible sin autenticación.
  const rcUnsubRef = useRef(null)
  useEffect(() => {
    // listenRemoteConfig hace el fetch inicial y luego polling cada 15 s.
    // Si falla (sin red, etc.) reintenta en el siguiente ciclo automáticamente.
    rcUnsubRef.current = listenRemoteConfig(setRcConfig, () => {})
    return () => rcUnsubRef.current?.()
  }, [])

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
        // Resetear flags para que el próximo login funcione correctamente
        tokenRefreshedRef.current = false
        syncInProgressRef.current = false
        setSyncReady(false)

        // Mostrar pantalla de cierre de sesión
        setLoadingScreen({ message: 'Cerrando sesión…', progress: 30, variant: 'signout' })

        // Limpiar todo el estado en memoria
        clearData()

        // Eliminar datos persistidos: Zustand localStorage, sessionStorage y cualquier caché
        try { localStorage.removeItem('countall-storage') } catch {}
        try { sessionStorage.clear() } catch {}
        // Revocar el token de Drive si está disponible
        const { driveToken } = useAppStore.getState()
        if (driveToken) {
          fetch(`https://oauth2.googleapis.com/revoke?token=${driveToken}`, { method: 'POST' }).catch(() => {})
        }

        setLoadingScreen({ message: 'Cerrando sesión…', progress: 100, variant: 'signout' })
        await new Promise(r => setTimeout(r, 350))
        setLoadingScreen(null)
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

      // La sincronización personal ya no depende de Drive: el bundle vive en
      // RTDB users/{uid}/syncBundle (mismo canal que Android). El token de
      // Drive solo se usa para importar una vez los datos de usuarios antiguos.
      if (!tokenRefreshedRef.current) {
        tokenRefreshedRef.current = true
        const redirectRes = await handleRedirectResult()
        let token = null
        if (redirectRes?.accessToken) {
          token = redirectRes.accessToken
          setDriveToken(token, Date.now() + 3600_000)
        } else {
          const { driveToken: saved, driveTokenExpiry } = useAppStore.getState()
          if (saved && Date.now() < driveTokenExpiry) token = saved
        }
        initPersonalSync(token)
      }
    }

    const unsub = onAuthChange(handleUser)

    return () => {
      unsub()
      dataVersionUnsub?.()
      bgVersionUnsub?.()
    }
  }, []) // eslint-disable-line

  // Importa una sola vez los fondos legados de Drive al Storage de Firebase.
  const migrateLegacyBackgrounds = async (token) => {
    if (!token) return {}
    try {
      const bgs = await driveDownloadAllBackgrounds(token)
      for (const [counterId, blobUrl] of Object.entries(bgs)) {
        try {
          const blob = await (await fetch(blobUrl)).blob()
          await pbUploadBackground(counterId, blob)
        } catch { /* seguir con el resto */ }
      }
      return bgs
    } catch { return {} }
  }

  const initPersonalSync = async (token) => {
    // Evitar doble ejecución (onDriveToken de LoginPage + handleUser pueden coincidir)
    if (syncInProgressRef.current) return
    syncInProgressRef.current = true

    // ── Paso 1: descargar datos personales (RTDB syncBundle, canal de Android) ─
    setLoadingScreen({ message: 'Descargando tus contadores…', progress: 20 })
    let initialData = await pullPersonalData().catch(() => null)

    // Usuarios antiguos de la web: importar desde Drive una única vez
    let legacyImported = false
    if (!initialData) {
      let driveTok = token ?? useAppStore.getState().driveToken
      if (!driveTok) {
        driveTok = await refreshDriveToken().catch(() => null)
        if (driveTok) setDriveToken(driveTok, Date.now() + 3600_000)
      }
      const legacy = await pullLegacyDriveData(driveTok).catch(() => null)
      if (legacy) {
        initialData = legacy
        legacyImported = true
        // Migrar al canal nuevo para que Android también lo vea
        uploadSyncBundle(JSON.stringify({ ...legacy, deviceId: getDeviceId() })).catch(() => {})
        migrateLegacyBackgrounds(driveTok).catch(() => {})
      }
    }

    // ── Paso 2: aplicar datos ────────────────────────────────────────────────
    setLoadingScreen({ message: 'Cargando contadores…', progress: 55 })
    if (initialData) {
      applyPersonalData(initialData)
    } else {
      // Sin bundle: restaurar compartidos desde RTDB como fallback
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

    // ── Paso 3: descargar imágenes de fondo (Storage personal/{uid}/) ────────
    setLoadingScreen({ message: 'Descargando imágenes…', progress: 80 })
    try {
      const bgs = (await pbDownloadAllBackgrounds()) ?? {}
      const store = useAppStore.getState()
      store.counters.forEach(c => {
        if (!c.isShared && bgs[c.id]) updateCounter(c.id, { backgroundImageLocal: bgs[c.id] })
      })
    } catch {}

    // ── Paso 4: listo ────────────────────────────────────────────────────────
    setLoadingScreen({ message: '¡Todo listo!', progress: 100 })
    setSyncReady(true)
    if (legacyImported) {
      // Bump inicial para que otros dispositivos (Android) se enteren del import
      // (pushPersonalData ya lo hará en el próximo cambio; no forzamos aquí)
    }
    await new Promise(r => setTimeout(r, 450))
    setLoadingScreen(null)
    syncInProgressRef.current = false

    // ── Listeners en tiempo real (después de mostrar la UI) ──────────────────
    const unsub1 = listenDataVersion(async () => {
      const data = await pullPersonalData().catch(() => null)
      if (!data) return
      if (data.deviceId === getDeviceId()) return // propio cambio (ignorar)
      applyPersonalData(data)
    })

    const unsub2 = listenBgVersion(async () => {
      const bgs = (await pbDownloadAllBackgrounds().catch(() => null)) ?? {}
      const store = useAppStore.getState()
      store.counters.forEach(c => {
        if (!c.isShared && bgs[c.id]) updateCounter(c.id, { backgroundImageLocal: bgs[c.id] })
      })
    })

    return () => { unsub1(); unsub2() }
  }

  // ── Tema ─────────────────────────────────────────────────────────────────
  return (
    <ThemeProvider>
      <div className="app">
        {loadingScreen && <LoadingModal {...loadingScreen} />}
        {rcConfig.maintenanceMode && <MaintenanceScreen message={rcConfig.maintenanceMessage} />}
        {!rcConfig.maintenanceMode && rcConfig.appBanner && <AppBanner text={rcConfig.appBanner} color={rcConfig.appBannerColor} />}
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
