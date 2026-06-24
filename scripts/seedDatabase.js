/**
 * seedDatabase.js — Pobla Firebase RTDB con datos simulados para countall-web.
 *
 * Uso:
 *   1. Descarga tu serviceAccountKey.json desde Firebase Console →
 *      Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
 *   2. Coloca el archivo como scripts/serviceAccountKey.json
 *   3. Ejecuta: npm install && npm run seed
 *
 * ADVERTENCIA: Este script ESCRIBE datos en la base de datos real.
 * Revisa MY_UID y MY_USERNAME antes de ejecutar.
 */

const admin = require('firebase-admin')
const serviceAccount = require('./serviceAccountKey.json')

// ─── Configuración ────────────────────────────────────────────────────────────

const DATABASE_URL = 'https://contadorapp-e8d35-default-rtdb.firebaseio.com'

/** Tu UID de Firebase (el usuario principal que recibirá todas las amistades). */
const MY_UID = 'iOEd0Rin9XSwnoMMio0y7Q2J3p43'

/**
 * Tu username en la app. Si todavía no tienes uno configurado, pon cualquier
 * valor temporal; los amigos lo usarán como referencia de quién los invitó.
 */
const MY_USERNAME = 'mi_usuario'

// ─── Init Firebase Admin ──────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL,
})

const db = admin.database()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ID aleatorio estilo Firebase (28 chars alfanuméricos). */
function genFirebaseId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 28; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

/** Timestamp aleatorio dentro de los últimos N días. */
function randomTs(daysAgo = 60) {
  return Date.now() - Math.floor(Math.random() * daysAgo * 86_400_000)
}

/** URL de avatar generado con texto (sin servicios de pago). */
function avatarUrl(name) {
  const encoded = encodeURIComponent(name)
  return `https://ui-avatars.com/api/?name=${encoded}&background=random&color=fff&size=128`
}

/** Color aleatorio de la paleta de la app. */
function randomColor() {
  const palette = [
    '#5C6BC0', '#26A69A', '#66BB6A', '#EC407A',
    '#FFA726', '#42A5F5', '#8D6E63', '#78909C',
    '#AB47BC', '#EF5350',
  ]
  return palette[Math.floor(Math.random() * palette.length)]
}

/** Genera entradas de log simuladas para un contador. */
function genLogEntries(count = 5, counterName = 'contador') {
  const entries = []
  for (let i = 0; i < count; i++) {
    entries.push({
      label: null,
      text: `+1 en ${counterName}`,
      date: randomTs(30),
    })
  }
  return entries.sort((a, b) => b.date - a.date)
}

// ─── Datos de usuarios simulados ──────────────────────────────────────────────

const SIMULATED_USERS = [
  {
    uid: 'SIM001xKpLmNqRsTuVwXyZ01234',
    displayName: 'Alejandro García',
    username: 'alegarcia',
    platform: 'android',
    deviceModel: 'Samsung Galaxy S23',
  },
  {
    uid: 'SIM002aAbBcCdDeEfFgGhHiIjJ56',
    displayName: 'María López',
    username: 'marialopez',
    platform: 'ios',
    deviceModel: 'iPhone 15 Pro',
  },
  {
    uid: 'SIM003kKlLmMnNoOpPqQrRsStT78',
    displayName: 'Carlos Martínez',
    username: 'carlomtz',
    platform: 'android',
    deviceModel: 'Pixel 8',
  },
  {
    uid: 'SIM004uUvVwWxXyYzZaAbBcCdD90',
    displayName: 'Laura Fernández',
    username: 'laurafern',
    platform: 'ios',
    deviceModel: 'iPhone 14',
  },
  {
    uid: 'SIM005eEfFgGhHiIjJkKlLmMnN12',
    displayName: 'Pablo Rodríguez',
    username: 'pablorod',
    platform: 'android',
    deviceModel: 'Xiaomi 13',
  },
  {
    uid: 'SIM006oOpPqQrRsStTuUvVwWxX34',
    displayName: 'Ana Sánchez',
    username: 'anasanchez',
    platform: 'ios',
    deviceModel: 'iPhone 13 Mini',
  },
  {
    uid: 'SIM007yYzZaAbBcCdDeEfFgGhH56',
    displayName: 'Luis González',
    username: 'luisgon',
    platform: 'android',
    deviceModel: 'OnePlus 12',
  },
  {
    uid: 'SIM008iIjJkKlLmMnNoOpPqQrR78',
    displayName: 'Elena Torres',
    username: 'elenatrs',
    platform: 'ios',
    deviceModel: 'iPhone 15',
  },
  {
    uid: 'SIM009sStTuUvVwWxXyYzZaAbB90',
    displayName: 'Javier Ruiz',
    username: 'javierruiz',
    platform: 'android',
    deviceModel: 'Samsung Galaxy A54',
  },
  {
    uid: 'SIM010cCdDeEfFgGhHiIjJkKlL12',
    displayName: 'Carmen Díaz',
    username: 'carmendiaz',
    platform: 'ios',
    deviceModel: 'iPhone 12',
  },
]

// ─── Definición de contadores compartidos ─────────────────────────────────────

/**
 * Grupo A: Alejandro, María, Carlos, Laura + MY_UID
 * Contador regular: "Pasos diarios"
 */
const SHARED_COUNTER_A_ID = genFirebaseId()

/**
 * Grupo B: Pablo, Ana, Luis
 * Contador regular: "Libros leídos"
 */
const SHARED_COUNTER_B_ID = genFirebaseId()

/**
 * Grupo C: Elena, Javier, Carmen + MY_UID
 * Contador COMPETITIVO: "Reto de ejercicio"
 */
const SHARED_COUNTER_C_ID = genFirebaseId()

// ─── Función principal ────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Iniciando seed de Firebase RTDB...')
  console.log(`   Base de datos: ${DATABASE_URL}`)
  console.log(`   Usuario principal: ${MY_UID}`)
  console.log(`   Usuarios simulados: ${SIMULATED_USERS.length}`)
  console.log()

  // Objeto de multi-path update: una sola operación atómica para mayor eficiencia.
  const updates = {}

  // ── 1. Usuarios simulados ────────────────────────────────────────────────────

  console.log('📦 Generando usuarios simulados...')
  for (const u of SIMULATED_USERS) {
    const deviceId = `dev_${u.uid.slice(0, 8)}`
    const joinedAt = randomTs(60)

    // /users/$uid — datos privados del usuario
    updates[`users/${u.uid}/username`] = u.username
    updates[`users/${u.uid}/dataVersion`] = randomTs(10)

    // /publicProfiles/$uid — perfil público
    updates[`publicProfiles/${u.uid}/displayName`] = u.displayName
    updates[`publicProfiles/${u.uid}/username`] = u.username
    updates[`publicProfiles/${u.uid}/photoUrl`] = avatarUrl(u.displayName)

    // /usernames/$username — índice de unicidad de nombre de usuario
    updates[`usernames/${u.username}`] = u.uid

    // /devices/$deviceId — dispositivo asociado al usuario
    updates[`devices/${deviceId}/userId`] = u.uid
    updates[`devices/${deviceId}/platform`] = u.platform
    updates[`devices/${deviceId}/deviceName`] = u.deviceModel
    updates[`devices/${deviceId}/fcmToken`] = `sim_fcm_token_${u.uid.slice(0, 12)}`
    updates[`devices/${deviceId}/lastSeen`] = joinedAt
    updates[`devices/${deviceId}/appVersion`] = '2.4.1'
  }

  // ── 2. Amistades bidireccionales entre usuarios simulados ────────────────────

  console.log('🤝 Generando amistades entre usuarios simulados...')
  for (let i = 0; i < SIMULATED_USERS.length; i++) {
    for (let j = i + 1; j < SIMULATED_USERS.length; j++) {
      const userA = SIMULATED_USERS[i]
      const userB = SIMULATED_USERS[j]
      const ts = randomTs(45)

      // A → B
      updates[`friends/${userA.uid}/${userB.uid}/username`] = userB.username
      updates[`friends/${userA.uid}/${userB.uid}/status`] = 'accepted'
      updates[`friends/${userA.uid}/${userB.uid}/direction`] = 'sent'
      updates[`friends/${userA.uid}/${userB.uid}/addedAt`] = ts

      // B → A (bidireccional)
      updates[`friends/${userB.uid}/${userA.uid}/username`] = userA.username
      updates[`friends/${userB.uid}/${userA.uid}/status`] = 'accepted'
      updates[`friends/${userB.uid}/${userA.uid}/direction`] = 'received'
      updates[`friends/${userB.uid}/${userA.uid}/addedAt`] = ts
    }
  }

  // ── 3. Amistades bidireccionales de todos los simulados con MY_UID ───────────

  console.log(`👤 Vinculando ${SIMULATED_USERS.length} usuarios como amigos de ${MY_UID}...`)
  for (const u of SIMULATED_USERS) {
    const ts = randomTs(30)

    // MY_UID → usuario simulado
    updates[`friends/${MY_UID}/${u.uid}/username`] = u.username
    updates[`friends/${MY_UID}/${u.uid}/status`] = 'accepted'
    updates[`friends/${MY_UID}/${u.uid}/direction`] = 'sent'
    updates[`friends/${MY_UID}/${u.uid}/addedAt`] = ts

    // Usuario simulado → MY_UID
    updates[`friends/${u.uid}/${MY_UID}/username`] = MY_USERNAME
    updates[`friends/${u.uid}/${MY_UID}/status`] = 'accepted'
    updates[`friends/${u.uid}/${MY_UID}/direction`] = 'received'
    updates[`friends/${u.uid}/${MY_UID}/addedAt`] = ts
  }

  // ── 4. Contadores compartidos ─────────────────────────────────────────────────

  console.log('🔢 Generando contadores compartidos...')

  // ── Contador A: "Pasos diarios" (regular) ────────────────────────────────────
  {
    const members = [
      SIMULATED_USERS[0], // Alejandro (owner)
      SIMULATED_USERS[1], // María
      SIMULATED_USERS[2], // Carlos
      SIMULATED_USERS[3], // Laura
    ]
    const owner = members[0]
    const inviteCode = genFirebaseId().slice(0, 12).toLowerCase()
    const counterValue = Math.floor(Math.random() * 8000) + 2000

    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/name`] = 'Pasos diarios'
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/value`] = counterValue
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/increment`] = 100
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/target`] = 10000
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/color`] = '#26A69A'
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/backgroundImageUrl`] = null
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/localId`] = genFirebaseId()
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/lastModifiedBy`] = owner.uid
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/lastModifiedDeviceId`] = 'android'
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/lastModifiedUsername`] = owner.username
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/lastModifiedTimestamp`] = randomTs(2)
    updates[`sharedCounters/${SHARED_COUNTER_A_ID}/inviteCode`] = inviteCode
    updates[`invites/${inviteCode}/sharedId`] = SHARED_COUNTER_A_ID
    updates[`invites/${inviteCode}/createdBy`] = owner.uid
    updates[`invites/${inviteCode}/createdAt`] = randomTs(30)
    updates[`invites/${inviteCode}/isFolder`] = false

    // Entradas de log
    const logEntries = genLogEntries(8, 'Pasos diarios')
    logEntries.forEach((entry, idx) => {
      updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/logEntries/${idx}/label`] = entry.label
      updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/logEntries/${idx}/text`] = entry.text
      updates[`sharedCounters/${SHARED_COUNTER_A_ID}/data/logEntries/${idx}/date`] = entry.date
    })

    // Miembros del contador + MY_UID como viewer
    const allMembers = [...members, { uid: MY_UID, username: MY_USERNAME }]
    for (const [idx, m] of allMembers.entries()) {
      const role = idx === 0 ? 'owner' : 'viewer'
      updates[`sharedCounters/${SHARED_COUNTER_A_ID}/members/${m.uid}/username`] = m.username
      updates[`sharedCounters/${SHARED_COUNTER_A_ID}/members/${m.uid}/role`] = role
      updates[`sharedCounters/${SHARED_COUNTER_A_ID}/members/${m.uid}/joinedAt`] = randomTs(30)
      // Vincular en /users/$uid/linkedCounters
      updates[`users/${m.uid}/linkedCounters/${SHARED_COUNTER_A_ID}`] = true
    }
  }

  // ── Contador B: "Libros leídos" (regular) ────────────────────────────────────
  {
    const members = [
      SIMULATED_USERS[4], // Pablo (owner)
      SIMULATED_USERS[5], // Ana
      SIMULATED_USERS[6], // Luis
    ]
    const owner = members[0]
    const inviteCode = genFirebaseId().slice(0, 12).toLowerCase()
    const counterValue = Math.floor(Math.random() * 15) + 1

    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/name`] = 'Libros leídos'
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/value`] = counterValue
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/increment`] = 1
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/target`] = 20
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/color`] = '#FFA726'
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/backgroundImageUrl`] = null
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/localId`] = genFirebaseId()
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/lastModifiedBy`] = owner.uid
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/lastModifiedDeviceId`] = 'android'
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/lastModifiedUsername`] = owner.username
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/lastModifiedTimestamp`] = randomTs(5)
    updates[`sharedCounters/${SHARED_COUNTER_B_ID}/inviteCode`] = inviteCode
    updates[`invites/${inviteCode}/sharedId`] = SHARED_COUNTER_B_ID
    updates[`invites/${inviteCode}/createdBy`] = owner.uid
    updates[`invites/${inviteCode}/createdAt`] = randomTs(20)
    updates[`invites/${inviteCode}/isFolder`] = false

    const logEntries = genLogEntries(3, 'Libros leídos')
    logEntries.forEach((entry, idx) => {
      updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/logEntries/${idx}/label`] = entry.label
      updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/logEntries/${idx}/text`] = entry.text
      updates[`sharedCounters/${SHARED_COUNTER_B_ID}/data/logEntries/${idx}/date`] = entry.date
    })

    for (const [idx, m] of members.entries()) {
      const role = idx === 0 ? 'owner' : 'editor'
      updates[`sharedCounters/${SHARED_COUNTER_B_ID}/members/${m.uid}/username`] = m.username
      updates[`sharedCounters/${SHARED_COUNTER_B_ID}/members/${m.uid}/role`] = role
      updates[`sharedCounters/${SHARED_COUNTER_B_ID}/members/${m.uid}/joinedAt`] = randomTs(20)
      updates[`users/${m.uid}/linkedCounters/${SHARED_COUNTER_B_ID}`] = true
    }
  }

  // ── Contador C: "Reto de ejercicio" (COMPETITIVO) ─────────────────────────────
  {
    const members = [
      SIMULATED_USERS[7], // Elena (owner)
      SIMULATED_USERS[8], // Javier
      SIMULATED_USERS[9], // Carmen
    ]
    const owner = members[0]
    const inviteCode = genFirebaseId().slice(0, 12).toLowerCase()

    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/name`] = 'Reto de ejercicio'
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/mode`] = 'competitive'
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/increment`] = 1
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/target`] = null
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/color`] = '#EC407A'
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/backgroundImageUrl`] = null
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/localId`] = genFirebaseId()
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/lastModifiedBy`] = owner.uid
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/lastModifiedDeviceId`] = 'ios'
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/lastModifiedUsername`] = owner.username
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/data/lastModifiedTimestamp`] = randomTs(1)
    updates[`sharedCounters/${SHARED_COUNTER_C_ID}/inviteCode`] = inviteCode
    updates[`invites/${inviteCode}/sharedId`] = SHARED_COUNTER_C_ID
    updates[`invites/${inviteCode}/createdBy`] = owner.uid
    updates[`invites/${inviteCode}/createdAt`] = randomTs(15)
    updates[`invites/${inviteCode}/isFolder`] = false

    // MY_UID también participa en el reto competitivo
    const allMembers = [...members, { uid: MY_UID, username: MY_USERNAME }]
    for (const [idx, m] of allMembers.entries()) {
      const role = idx === 0 ? 'owner' : 'viewer'
      const score = Math.floor(Math.random() * 50) + 5

      updates[`sharedCounters/${SHARED_COUNTER_C_ID}/members/${m.uid}/username`] = m.username
      updates[`sharedCounters/${SHARED_COUNTER_C_ID}/members/${m.uid}/role`] = role
      updates[`sharedCounters/${SHARED_COUNTER_C_ID}/members/${m.uid}/joinedAt`] = randomTs(15)

      // Puntuación individual (modo competitivo)
      updates[`sharedCounters/${SHARED_COUNTER_C_ID}/scores/${m.uid}/value`] = score
      updates[`sharedCounters/${SHARED_COUNTER_C_ID}/scores/${m.uid}/deviceId`] = m.platform ?? 'android'

      const scoreEntries = genLogEntries(Math.floor(Math.random() * 4) + 1, 'ejercicio')
      scoreEntries.forEach((entry, eIdx) => {
        updates[`sharedCounters/${SHARED_COUNTER_C_ID}/scores/${m.uid}/logEntries/${eIdx}/label`] = entry.label
        updates[`sharedCounters/${SHARED_COUNTER_C_ID}/scores/${m.uid}/logEntries/${eIdx}/text`] = entry.text
        updates[`sharedCounters/${SHARED_COUNTER_C_ID}/scores/${m.uid}/logEntries/${eIdx}/date`] = entry.date
      })

      updates[`sharedCounters/${SHARED_COUNTER_C_ID}/userColors/${m.uid}`] = randomColor()
      updates[`users/${m.uid}/linkedCounters/${SHARED_COUNTER_C_ID}`] = true
    }
  }

  // ── 5. Subir todo con una sola operación multi-path ──────────────────────────

  const totalPaths = Object.keys(updates).length
  console.log(`\n📤 Subiendo ${totalPaths} nodos a Firebase en una sola operación...`)

  try {
    await db.ref('/').update(updates)
    console.log('\n✅ Seed completado con éxito.\n')
    console.log('Resumen de datos creados:')
    console.log(`  • ${SIMULATED_USERS.length} usuarios simulados`)
    console.log(`  • ${SIMULATED_USERS.length} perfiles públicos`)
    console.log(`  • ${SIMULATED_USERS.length} entradas de username`)
    console.log(`  • ${SIMULATED_USERS.length} dispositivos`)
    const friendPairs = (SIMULATED_USERS.length * (SIMULATED_USERS.length - 1)) / 2
    console.log(`  • ${friendPairs} pares de amistad entre simulados (${friendPairs * 2} nodos bidireccionales)`)
    console.log(`  • ${SIMULATED_USERS.length} amistades bidireccionales con UID ${MY_UID}`)
    console.log('  • 3 contadores compartidos:')
    console.log(`    - "Pasos diarios"    (regular,      ID: ${SHARED_COUNTER_A_ID})`)
    console.log(`    - "Libros leídos"    (regular,      ID: ${SHARED_COUNTER_B_ID})`)
    console.log(`    - "Reto de ejercicio" (competitivo, ID: ${SHARED_COUNTER_C_ID})`)
    console.log()
    console.log('⚠️  Recuerda actualizar MY_USERNAME en el script con tu username real de la app.')
  } catch (err) {
    console.error('\n❌ Error al escribir en Firebase:', err.message)
    process.exit(1)
  } finally {
    await db.app.delete()
  }
}

main()
