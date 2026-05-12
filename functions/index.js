/**
 * Cloud Function: notifySharedCounterChange
 *
 * Se dispara cuando cambia el nodo data de un sharedCounter.
 * Lee los miembros del contador, recoge sus tokens FCM del RTDB
 * y les envía una notificación push.
 */
const { onValueUpdated } = require('firebase-functions/v2/database')
const admin = require('firebase-admin')

admin.initializeApp()

const db        = admin.database()
const messaging = admin.messaging()

exports.notifySharedCounterChange = onValueUpdated(
  {
    ref:    'sharedCounters/{sharedId}/data',
    region: 'us-central1',
    // Limitar instancias para no consumir cuota en proyectos pequeños
    maxInstances: 10,
  },
  async (event) => {
    const { sharedId } = event.params
    const newData = event.data.after.val()
    const oldData = event.data.before.val()

    if (!newData) return null

    const newValue = newData.value ?? 0
    const oldValue = oldData?.value ?? 0

    // Solo notificar si cambió el valor (evitar notifs por edición de nombre/color)
    if (newValue === oldValue) return null

    const modifiedBy         = newData.lastModifiedBy       ?? ''
    const modifiedByUsername = newData.lastModifiedUsername ?? 'Alguien'
    const counterName        = newData.name                 ?? 'Contador'

    // Obtener miembros del contador compartido
    const membersSnap = await db.ref(`sharedCounters/${sharedId}/members`).get()
    if (!membersSnap.exists()) return null

    // Excluir quien hizo el cambio
    const memberUids = []
    membersSnap.forEach(m => {
      if (m.key && m.key !== modifiedBy) memberUids.push(m.key)
    })
    if (memberUids.length === 0) return null

    // Recoger tokens FCM de todos los miembros
    const tokens = []
    await Promise.all(
      memberUids.map(async (uid) => {
        const snap = await db.ref(`users/${uid}/fcmTokens`).get()
        if (snap.exists()) {
          snap.forEach(t => { if (t.val()) tokens.push(t.val()) })
        }
      })
    )
    if (tokens.length === 0) return null

    // Construir mensaje
    const diff = newValue - oldValue
    const sign = diff > 0 ? `+${diff}` : `${diff}`
    const body = `${modifiedByUsername}: ${oldValue} → ${newValue} (${sign})`

    // Enviar en lotes de 500 (límite FCM sendEachForMulticast)
    const BATCH = 500
    const batches = []
    for (let i = 0; i < tokens.length; i += BATCH) {
      batches.push(tokens.slice(i, i + BATCH))
    }

    const results = await Promise.allSettled(
      batches.map(batch =>
        messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: counterName, body },
          webpush: {
            notification: {
              icon:     'https://raw.githubusercontent.com/tosysy/CountAll/main/icon-192.png',
              badge:    'https://raw.githubusercontent.com/tosysy/CountAll/main/icon-192.png',
              tag:      `counter-${sharedId}`,
              renotify: true,
            },
            fcmOptions: {
              link: 'https://tosysy.github.io/countall-web/',
            },
          },
          data: { sharedId, type: 'counter_update' },
        })
      )
    )

    // Limpiar tokens caducados (404 → invalid-registration-token)
    const expiredTokens = new Set()
    results.forEach((r, bi) => {
      if (r.status !== 'fulfilled') return
      r.value.responses.forEach((resp, ti) => {
        if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
          expiredTokens.add(batches[bi][ti])
        }
      })
    })

    if (expiredTokens.size > 0) {
      // Eliminar tokens caducados de todos los usuarios (búsqueda por valor)
      await Promise.allSettled(
        memberUids.map(async (uid) => {
          const snap = await db.ref(`users/${uid}/fcmTokens`).get()
          if (!snap.exists()) return
          const removes = []
          snap.forEach(t => {
            if (expiredTokens.has(t.val())) {
              removes.push(db.ref(`users/${uid}/fcmTokens/${t.key}`).remove())
            }
          })
          await Promise.allSettled(removes)
        })
      )
    }

    return null
  }
)
