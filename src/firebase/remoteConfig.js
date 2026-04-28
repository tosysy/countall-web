/**
 * App config via Firebase Remote Config.
 * Android usa el listener en tiempo real nativo del SDK Android.
 * Web no tiene ese listener, así que hace polling cada POLL_INTERVAL ms.
 *
 * Parámetros en Remote Config (mismos que en Android):
 *   maintenance_mode    Boolean  false
 *   maintenance_message String   "La aplicación está en mantenimiento..."
 *   app_banner          String   ""
 *   app_banner_color    String   "#1E88E5"
 */
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config'
import app from './config'

const POLL_INTERVAL = 15_000 // 15 segundos — sin recargar y sin Cloud Functions

const DEFAULTS = {
  maintenanceMode:    false,
  maintenanceMessage: 'La aplicación está en mantenimiento. Vuelve en breve.',
  appBanner:          '',
  appBannerColor:     '#1E88E5',
}

let _rc = null
function getRC() {
  if (!_rc) {
    _rc = getRemoteConfig(app)
    _rc.settings.minimumFetchIntervalMillis = POLL_INTERVAL
    _rc.defaultConfig = {
      maintenance_mode:    false,
      maintenance_message: DEFAULTS.maintenanceMessage,
      app_banner:          '',
      app_banner_color:    '#1E88E5',
    }
  }
  return _rc
}

function readActive() {
  const rc = getRC()
  return {
    maintenanceMode:    getValue(rc, 'maintenance_mode').asBoolean(),
    maintenanceMessage: getValue(rc, 'maintenance_message').asString() || DEFAULTS.maintenanceMessage,
    appBanner:          getValue(rc, 'app_banner').asString(),
    appBannerColor:     getValue(rc, 'app_banner_color').asString() || DEFAULTS.appBannerColor,
  }
}

/** Fetch inicial al arrancar. */
export async function initRemoteConfig() {
  try {
    await fetchAndActivate(getRC())
    return readActive()
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * Polling cada POLL_INTERVAL ms.
 * Llama a onChange inmediatamente y luego en cada comprobación.
 * @returns función para detener el polling
 */
export function listenRemoteConfig(onChange, onError) {
  const rc = getRC()
  let stopped = false

  const poll = async () => {
    if (stopped) return
    try {
      await fetchAndActivate(rc)
      onChange(readActive())
    } catch (e) {
      console.warn('[remoteConfig] fetch error:', e)
      onError?.(e)
    }
  }

  // Primera llamada inmediata
  poll()

  // Polling continuo
  const timer = setInterval(poll, POLL_INTERVAL)

  return () => {
    stopped = true
    clearInterval(timer)
  }
}
