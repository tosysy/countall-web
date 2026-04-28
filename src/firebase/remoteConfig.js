/**
 * App config en tiempo real usando RTDB — igual que Android usa Remote Config
 * pero con respuesta instantánea gracias al listener onValue de RTDB.
 *
 * Estructura en Firebase RTDB:
 *   appConfig/
 *     maintenance_mode:    false
 *     maintenance_message: "La aplicación está en mantenimiento..."
 *     app_banner:          ""
 *     app_banner_color:    "#1E88E5"
 *
 * Para activar mantenimiento: Firebase Console → Realtime Database →
 *   appConfig/maintenance_mode = true
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
  const d = snap.val() ?? {}
  return {
    maintenanceMode:    d.maintenance_mode    ?? DEFAULTS.maintenanceMode,
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
 * Listener en tiempo real — llama a onChange(config) inmediatamente
 * y cada vez que cambia appConfig en RTDB.
 * Devuelve la función de unsuscripción.
 */
export function listenRemoteConfig(onChange) {
  const r = ref(db, CONFIG_PATH)
  const unsub = onValue(r, (snap) => onChange(parseSnap(snap)), () => {})
  return unsub
}
