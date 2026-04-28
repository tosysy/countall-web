import { getRemoteConfig, fetchAndActivate, getValue, onConfigUpdated } from 'firebase/remote-config'
import app from './config'

const remoteConfig = getRemoteConfig(app)

// Intervalo mínimo de fetch: 5 minutos (más corto para que onConfigUpdated
// pueda propagar cambios sin esperar 1 hora)
remoteConfig.settings.minimumFetchIntervalMillis = 300_000

// Valores por defecto — se usan antes del primer fetch o si no hay red
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

/**
 * Fetch inicial + activación.
 * Devuelve la config actual.
 */
export async function initRemoteConfig() {
  try {
    await fetchAndActivate(remoteConfig)
  } catch {
    // Sin red → defaults
  }
  return getConfig()
}

/**
 * Suscripción en tiempo real.
 * Llama a `onChange(config)` cada vez que Firebase publica nuevos valores.
 * Devuelve la función de unsuscripción.
 */
export function listenRemoteConfig(onChange) {
  const unsub = onConfigUpdated(remoteConfig, async () => {
    try {
      await fetchAndActivate(remoteConfig)
    } catch { /* sin red */ }
    onChange(getConfig())
  })
  return unsub
}

export { remoteConfig, getConfig }
