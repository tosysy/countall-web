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

// Acepta boolean true, string "true" o número 1
function isTruthy(v) { return v === true || v === 'true' || v === 1 }

function parseSnap(snap) {
  if (!snap.exists()) {
    console.log('[appConfig] nodo no existe → usando defaults')
    return { ...DEFAULTS }
  }
  const d = snap.val() ?? {}
  console.log('[appConfig] datos recibidos de RTDB:', d)
  const cfg = {
    // Acepta tanto maintenance_mode como maintenanceMode (por si el usuario usa camelCase)
    maintenanceMode:    isTruthy(d.maintenance_mode) || isTruthy(d.maintenanceMode),
    maintenanceMessage: d.maintenance_message ?? d.maintenanceMessage ?? DEFAULTS.maintenanceMessage,
    appBanner:          d.app_banner          ?? d.appBanner          ?? DEFAULTS.appBanner,
    appBannerColor:     d.app_banner_color    ?? d.appBannerColor     ?? DEFAULTS.appBannerColor,
  }
  console.log('[appConfig] config parseada:', cfg)
  return cfg
}

/** Lectura única al arrancar. */
export async function initRemoteConfig() {
  try {
    const snap = await get(ref(db, CONFIG_PATH))
    return parseSnap(snap)
  } catch (e) {
    console.warn('[appConfig] initRemoteConfig error:', e)
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
  console.log('[appConfig] iniciando listener RTDB en:', CONFIG_PATH)
  const r = ref(db, CONFIG_PATH)
  return onValue(
    r,
    (snap) => {
      console.log('[appConfig] onValue disparado, exists:', snap.exists())
      onChange(parseSnap(snap))
    },
    (err) => {
      console.warn('[appConfig] listener error:', err)
      onError?.(err)
    }
  )
}
