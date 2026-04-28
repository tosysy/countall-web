import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config'
import app from './config'

const remoteConfig = getRemoteConfig(app)

// Intervalo mínimo entre fetches reales de Firebase
remoteConfig.settings.minimumFetchIntervalMillis = 60_000 // 1 min

remoteConfig.defaultConfig = {
  maintenance_mode:    false,
  maintenance_message: 'La aplicación está en mantenimiento. Vuelve en breve.',
  app_banner:          '',
  app_banner_color:    '#1E88E5',
}

function getConfig() {
  return {
    maintenanceMode:    getValue(remoteConfig, 'maintenance_mode').asBoolean(),
    maintenanceMessage: getValue(remoteConfig, 'maintenance_message').asString(),
    appBanner:          getValue(remoteConfig, 'app_banner').asString(),
    appBannerColor:     getValue(remoteConfig, 'app_banner_color').asString(),
  }
}

export async function initRemoteConfig() {
  try { await fetchAndActivate(remoteConfig) } catch { /* sin red → defaults */ }
  return getConfig()
}

/**
 * Polling cada 60 s — llama onChange(config) cuando detecta cambios.
 * Devuelve la función para detener el polling.
 */
export function listenRemoteConfig(onChange) {
  let prev = JSON.stringify(getConfig())
  const id = setInterval(async () => {
    try { await fetchAndActivate(remoteConfig) } catch { return }
    const next = JSON.stringify(getConfig())
    if (next !== prev) { prev = next; onChange(getConfig()) }
  }, 60_000)
  return () => clearInterval(id)
}

export { remoteConfig, getConfig }
