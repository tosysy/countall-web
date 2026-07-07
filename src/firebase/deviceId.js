/**
 * Identificador estable de este navegador, análogo al ANDROID_ID de la app nativa.
 * Permite que dos navegadores del mismo usuario se sincronicen entre sí y que
 * cada cliente ignore el eco de sus propios cambios (lastModifiedDeviceId,
 * scores/{uid}/deviceId, bundle.deviceId).
 */
const KEY = 'countall-device-id'

let cached = null

export function getDeviceId() {
  if (cached) return cached
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = 'web-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem(KEY, id)
    }
    cached = id
  } catch {
    // localStorage no disponible (modo privado extremo) — id efímero de sesión
    cached = 'web-' + Math.random().toString(36).slice(2)
  }
  return cached
}
