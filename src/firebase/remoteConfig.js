/**
 * App config en tiempo real via RTDB.
 *
 * Estructura en Firebase RTDB:
 *   appConfig/
 *     maintenance_mode:    false
 *     maintenance_message: "..."
 *     app_banner:          ""
 *     app_banner_color:    "#1E88E5"
 *
 * IMPORTANTE — Firebase Rules deben permitir lectura pública en appConfig:
 *   "appConfig": { ".read": true, ".write": false }
 */
import { ref, onValue, get } from 'firebase/database'
import { db } from './config'

const CONFIG_PATH = 'appConfig'

const DEFAULTS = {
  maintenanceMode:    false,
  maintenanceMessage: 'La aplicación está en mantenimiento. Vuelve en breve.',
  appBanner:          '',
  appBannerColor:     '#1E88E5',
}

function parseSnap(snap) {
  if (!snap.exists()) return { ...DEFAULTS }
  const d = snap.val() ?? {}
  return {
    maintenanceMode:    d.maintenance_mode    === true,
    maintenanceMessage: d.maintenance_message ?? DEFAULTS.maintenanceMessage,
    appBanner:          d.app_banner          ?? DEFAULTS.appBanner,
    appBannerColor:     d.app_banner_color    ?? DEFAULTS.appBannerColor,
  }
}

/** Lectura única al arrancar. */
export async function initRemoteConfig() {
  try {
    const snap = await get(ref(db, CONFIG_PATH))
    return parseSnap(snap)
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Listener en tiempo real.
 * @param {function} onChange  - se llama con la config al arrancar y en cada cambio
 * @param {function} onError   - se llama si el listener falla (ej: sin permiso)
 * @returns función de unsuscripción
 */
export function listenRemoteConfig(onChange, onError) {
  const r = ref(db, CONFIG_PATH)
  return onValue(
    r,
    (snap) => onChange(parseSnap(snap)),
    (err) => { console.warn('appConfig listener error:', err); onError?.(err) }
  )
}
