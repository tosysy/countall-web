import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config'
import app from './config'

const remoteConfig = getRemoteConfig(app)

// Intervalo mínimo de fetch: 1 hora en producción
remoteConfig.settings.minimumFetchIntervalMillis = 3_600_000

// Valores por defecto — se usan antes del primer fetch o si no hay red
remoteConfig.defaultConfig = {
  maintenance_mode:    false,
  maintenance_message: 'La aplicación está en mantenimiento. Vuelve en breve.',
  app_banner:          '',         // Si tiene texto, se muestra un banner de aviso
  app_banner_color:    '#1E88E5',  // Color de fondo del banner (hex)
}

/**
 * Obtiene los valores actuales de Remote Config (después de fetchAndActivate).
 * Devuelve un objeto con todos los parámetros listos para usar.
 */
function getConfig() {
  return {
    maintenanceMode:    getValue(remoteConfig, 'maintenance_mode').asBoolean(),
    maintenanceMessage: getValue(remoteConfig, 'maintenance_message').asString(),
    appBanner:          getValue(remoteConfig, 'app_banner').asString(),
    appBannerColor:     getValue(remoteConfig, 'app_banner_color').asString(),
  }
}

/**
 * Descarga y activa los valores remotos.
 * Resuelve con el objeto de config tras aplicarlos.
 */
export async function initRemoteConfig() {
  try {
    await fetchAndActivate(remoteConfig)
  } catch {
    // Sin red o fetch fallido → se usan los defaults, la app sigue funcionando
  }
  return getConfig()
}

export { remoteConfig, getConfig }
