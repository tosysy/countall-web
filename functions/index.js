/**
 * Cloud Functions de CountAll — set UNIFICADO para la app Android y la web.
 *
 * IMPORTANTE: este archivo debe ser idéntico al functions/index.js del repo
 * de la app Android (CountAll). Ambos repos despliegan al mismo proyecto
 * Firebase (contadorapp-e8d35); si divergen, un deploy pisa al otro.
 *
 * Mensajes FCM DATA-only de prioridad alta: cada cliente decide cómo
 * mostrarlos (Android: CountAllMessagingService; web: service worker).
 * Tipos: friend_request, friend_accepted, counter_change, PERSONAL_SYNC.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

function cfg(name, envName) {
  try {
    const c = functions.config().instagram || {};
    return process.env[envName] || c[name];
  } catch (e) {
    return process.env[envName];
  }
}

const APP_ID = cfg("app_id", "IG_APP_ID");
const APP_SECRET = cfg("app_secret", "IG_APP_SECRET");
const REDIRECT_URI = cfg("redirect", "IG_REDIRECT");

exports.instagramCallback = functions.https.onRequest(async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state; // nonce
    const error = req.query.error;

    if (error) {
      res.redirect("countall://instagram/connected?error=" + encodeURIComponent(String(error)));
      return;
    }
    if (!code || !state) {
      res.status(400).send("Faltan parámetros");
      return;
    }

    // 1) nonce -> uid
    const sessRef = admin.database().ref(`instagramOAuth/${state}`);
    const snap = await sessRef.get();
    if (!snap.exists()) {
      res.status(400).send("Sesión inválida o expirada");
      return;
    }
    const uid = snap.val().uid;
    if (!uid) {
      res.status(400).send("Sesión sin usuario");
      return;
    }

    // 2) code -> access token
    const form = new URLSearchParams();
    form.append("client_id", APP_ID);
    form.append("client_secret", APP_SECRET);
    form.append("grant_type", "authorization_code");
    form.append("redirect_uri", REDIRECT_URI);
    form.append("code", code);

    const tokenResp = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: form,
    });
    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      console.error("Token error", tokenJson);
      res.status(400).send("No se pudo obtener el token de Instagram");
      return;
    }

    // 3) token -> username
    const meResp = await fetch(
      `https://graph.instagram.com/me?fields=username&access_token=${encodeURIComponent(accessToken)}`
    );
    const me = await meResp.json();
    const username = me.username;
    if (!username) {
      console.error("Me error", me);
      res.status(400).send("No se pudo leer el perfil de Instagram");
      return;
    }

    // 4) guardar (verificado) y limpiar la sesión
    const updates = {};
    updates[`users/${uid}/instagram`] = username;
    updates[`users/${uid}/instagramVerified`] = true;
    updates[`publicProfiles/${uid}/instagram`] = username;
    updates[`publicProfiles/${uid}/instagramVerified`] = true;
    updates[`instagramOAuth/${state}`] = null;
    await admin.database().ref().update(updates);

    // 5) volver a la app
    res.redirect("countall://instagram/connected?username=" + encodeURIComponent(username));
  } catch (e) {
    console.error("instagramCallback failed", e);
    res.status(500).send("Error interno: " + e.message);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Notificaciones push (FCM) — disparadas por cambios en RTDB.
// Mensajes DATA-only de prioridad alta: el cliente decide si mostrarlos (no se
// muestran si la app está en primer plano). Limpia tokens caducados.
// ───────────────────────────────────────────────────────────────────────────

async function sendToUser(uid, data) {
  if (!uid) return;
  const tokensSnap = await admin.database().ref(`users/${uid}/fcmTokens`).get();
  if (!tokensSnap.exists()) return;
  const tokens = Object.keys(tokensSnap.val() || {});
  if (tokens.length === 0) return;

  // Todos los valores de `data` deben ser strings.
  const payload = {};
  Object.keys(data).forEach((k) => { payload[k] = String(data[k]); });

  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    data: payload,
    android: { priority: "high" },
    webpush: { headers: { Urgency: "high" } },
  });

  // Eliminar tokens inválidos.
  const updates = {};
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-argument" ||
          code === "messaging/invalid-registration-token") {
        updates[`users/${uid}/fcmTokens/${tokens[i]}`] = null;
      }
    }
  });
  if (Object.keys(updates).length > 0) {
    await admin.database().ref().update(updates);
  }
}

// Solicitud de amistad recibida.
exports.onFriendRequest = functions.database
  .ref("/friends/{uid}/{fromUid}")
  .onCreate(async (snap, context) => {
    const v = snap.val() || {};
    if (v.direction !== "received" || v.status !== "pending") return null;
    const username = v.username || "Alguien";
    await sendToUser(context.params.uid, {
      type: "friend_request",
      title: "CountAll",
      body: `${username} te ha enviado una solicitud de amistad`,
      fromUid: context.params.fromUid,
      fromUsername: username,
    });
    return null;
  });

// Una solicitud que TÚ enviaste ha sido aceptada (notificamos al remitente).
exports.onFriendAccepted = functions.database
  .ref("/friends/{uid}/{otherUid}/status")
  .onUpdate(async (change, context) => {
    if (change.after.val() !== "accepted" || change.before.val() === "accepted") return null;
    const { uid, otherUid } = context.params;
    const edgeSnap = await admin.database().ref(`friends/${uid}/${otherUid}`).get();
    const edge = edgeSnap.val() || {};
    if (edge.direction !== "sent") return null; // solo al que ENVIÓ la solicitud
    const username = edge.username || "Alguien";
    await sendToUser(uid, {
      type: "friend_accepted",
      title: "CountAll",
      body: `${username} ha aceptado tu solicitud de amistad`,
      fromUid: otherUid,
      fromUsername: username,
    });
    return null;
  });

// Mantiene publicProfiles/{uid}/friendCount = nº de amigos ACEPTADOS de ese usuario.
// Se dispara con cualquier cambio en friends/{uid}/{friendUid}.
exports.onFriendsCountChange = functions.database
  .ref("/friends/{uid}/{friendUid}")
  .onWrite(async (change, context) => {
    const { uid } = context.params;
    const allSnap = await admin.database().ref(`friends/${uid}`).get();
    const all = allSnap.val() || {};
    let count = 0;
    Object.keys(all).forEach((k) => {
      if (all[k] && all[k].status === "accepted") count++;
    });
    await admin.database().ref(`publicProfiles/${uid}/friendCount`).set(count);
    return null;
  });

// Cambio de valor en un contador compartido (se dispara con cada push del cliente,
// que actualiza data/lastModifiedTimestamp). Notifica a los miembros menos al autor.
exports.onSharedCounterChange = functions.database
  .ref("/sharedCounters/{sharedId}/data/lastModifiedTimestamp")
  .onWrite(async (change, context) => {
    if (!change.after.exists()) return null;
    const { sharedId } = context.params;
    const dataSnap = await admin.database().ref(`sharedCounters/${sharedId}/data`).get();
    const data = dataSnap.val() || {};
    const lastBy = data.lastModifiedBy || "";
    const name = data.name || "un contador";
    const username = data.lastModifiedUsername || "Alguien";

    const membersSnap = await admin.database().ref(`sharedCounters/${sharedId}/members`).get();
    const members = membersSnap.val() || {};
    const recipients = Object.keys(members).filter((u) => u !== lastBy);

    await Promise.all(recipients.map((u) => sendToUser(u, {
      type: "counter_change",
      title: "CountAll",
      body: `${username} cambió ${name}`,
      sharedId,
    })));
    return null;
  });

exports.onPersonalDataChanged = functions.database.ref("users/{uid}/dataVersion").onWrite(async (change, context) => {
  const uid = context.params.uid;
  const newDataVersion = change.after.val();
  if (!newDataVersion) return;
  await sendToUser(uid, {
    type: "PERSONAL_SYNC",
    dataVersion: String(newDataVersion)
  });
});
