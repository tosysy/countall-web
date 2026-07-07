import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getProfilesLite } from '../firebase/profileManager'
import {
  listenInvitations, listenSentInvitations,
  acceptInvitation, acceptFolderInvitation, rejectInvitation,
  cancelSentInvitation, sendInvitation, acceptEditRequest,
  shareCounter, shareFolder, schedulePushPersonalData, getFriends,
  listenFriendRequests, acceptFriendRequest, removeFriend,
} from '../firebase/syncManager'
import useAppStore from '../store/appStore'
import styles from './InvitationsPage.module.css'

// Hora relativa como Android ("hace un momento", "hace 5 min", …)
function relativeTime(time) {
  if (!time) return ''
  const diff = Date.now() - time
  if (diff < 60000) return 'hace un momento'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

const AVATAR_COLORS = ['#5C6BC0','#26A69A','#66BB6A','#EC407A','#FFA726','#42A5F5','#8D6E63','#78909C']
function avatarColor(name = '') {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function InvitationsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, counters, folders, addCounter, addFolder, updateCounter, updateFolder, driveToken } = useAppStore()
  const [received, setReceived] = useState([])
  const [sent, setSent] = useState([])
  const [loading, setLoading] = useState(null)
  const [dismissingId, setDismissingId] = useState(null)
  const [toast, setToast] = useState(null)
  const [showSend, setShowSend] = useState(false)
  const [sendForm, setSendForm] = useState({ itemId:'', sharedId:'', itemName:'', toUsername:'', role:'viewer', isFolder:false })
  const [sendLoading, setSendLoading] = useState(false)
  const [friendSuggestions, setFriendSuggestions] = useState([])
  const [friendReceived, setFriendReceived] = useState([]) // solicitudes de amistad recibidas
  const [friendSent, setFriendSent] = useState([])         // solicitudes de amistad enviadas
  const [profiles, setProfiles] = useState({})             // uid → {photoUrl, fullName}

  // "Enviar a un amigo" desde el diálogo de compartir → abrir el formulario preseleccionado
  useEffect(() => {
    const item = location.state?.sendItem
    if (!item) return
    navigate('/invitations', { replace: true, state: {} })
    // locked: se comparte directamente ese contador, sin selector de elemento
    setSendForm(f => ({ ...f, itemId: item.itemId, sharedId: item.sharedId ?? null, itemName: item.itemName, isFolder: item.isFolder ?? false, locked: true }))
    setShowSend(true)
  }, []) // eslint-disable-line

  // Fotos de perfil de todos los implicados (como Android)
  useEffect(() => {
    const uids = new Set()
    friendReceived.forEach(f => uids.add(f.uid))
    friendSent.forEach(f => uids.add(f.uid))
    received.forEach(i => i.fromUid && uids.add(i.fromUid))
    sent.forEach(i => i.toUid && uids.add(i.toUid))
    friendSuggestions.forEach(f => uids.add(f.uid))
    const missing = [...uids].filter(u => !(u in profiles))
    if (missing.length === 0) return
    getProfilesLite(missing).then(p => setProfiles(prev => ({ ...prev, ...p }))).catch(() => {})
  }, [friendReceived, friendSent, received, sent, friendSuggestions]) // eslint-disable-line

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(null), 3000) }

  const dismissThen = (id, action) => {
    setDismissingId(id)
    setTimeout(() => { action(); setDismissingId(null) }, 420)
  }

  useEffect(() => {
    const u1 = listenInvitations(setReceived)
    const u2 = listenSentInvitations(setSent)
    const u3 = listenFriendRequests(setFriendReceived)
    loadFriendData()
    return () => { u1(); u2(); u3() }
  }, [])

  const loadFriendData = async () => {
    const list = await getFriends().catch(() => [])
    setFriendSuggestions(list.filter(f => f.status === 'accepted').map(f => ({ uid: f.uid, username: f.username })))
    setFriendSent(list.filter(f => f.status === 'pending' && f.direction === 'sent'))
  }

  // ── Solicitudes de amistad (unificadas aquí, como Android) ────────────────
  const handleFriendAccept = async (f) => {
    setLoading('fr_' + f.uid)
    try {
      await acceptFriendRequest(f.uid)
      setFriendReceived(r => r.filter(x => x.uid !== f.uid))
      showToast('Solicitud aceptada ✓')
      loadFriendData()
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setLoading(null) }
  }

  const handleFriendReject = (f) => {
    dismissThen('fr_' + f.uid, async () => {
      try { await removeFriend(f.uid); setFriendReceived(r => r.filter(x => x.uid !== f.uid)); showToast('Solicitud rechazada') }
      catch (e) { showToast('Error: ' + e.message) }
    })
  }

  const handleFriendCancel = (f) => {
    dismissThen('fr_' + f.uid, async () => {
      try { await removeFriend(f.uid); setFriendSent(r => r.filter(x => x.uid !== f.uid)); showToast('Solicitud cancelada') }
      catch (e) { showToast('Error: ' + e.message) }
    })
  }

  const handleAccept = async (inv) => {
    setLoading(inv.id)
    try {
      if (inv.isRequest) {
        await acceptEditRequest(inv)
        showToast('Permiso de edición concedido ✓')
      } else if (inv.isFolder) {
        const result = await acceptFolderInvitation(inv)
        if (result) {
          addFolder(result.folder)
          for (const c of (result.childCounters ?? [])) addCounter(c)
        }
        schedulePushPersonalData(
          useAppStore.getState().counters, useAppStore.getState().folders,
          useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
        )
        showToast('Invitación a carpeta aceptada ✓')
      } else {
        const result = await acceptInvitation(inv)
        if (result) addCounter(result)
        schedulePushPersonalData(
          useAppStore.getState().counters, useAppStore.getState().folders,
          useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
        )
        showToast('Invitación aceptada ✓')
      }
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setLoading(null) }
  }

  const handleReject = (inv) => {
    dismissThen(inv.id, async () => {
      try { await rejectInvitation(inv); showToast('Invitación rechazada') }
      catch (e) { showToast('Error: ' + e.message) }
    })
  }

  const handleCancel = (inv) => {
    dismissThen(inv.id, async () => {
      try { await cancelSentInvitation(inv); showToast('Invitación cancelada') }
      catch (e) { showToast('Error: ' + e.message) }
    })
  }

  const handleSend = async () => {
    if (!sendForm.itemId || !sendForm.toUsername.trim()) return
    setSendLoading(true)
    try {
      const isFolder = sendForm.isFolder ?? false
      let sharedId = sendForm.sharedId

      if (!sharedId) {
        if (isFolder) {
          const folder = useAppStore.getState().folders.find(f => f.id === sendForm.itemId)
          if (!folder) throw new Error('Carpeta no encontrada')
          const { sharedId: sid, updatedCounters } = await shareFolder(folder, useAppStore.getState().counters.filter(c => c.folderId === folder.id))
          sharedId = sid
          updateFolder(folder.id, { isShared:true, sharedId:sid, role:'owner', ownerId:user?.uid })
          for (const p of (updatedCounters ?? [])) updateCounter(p.id, { isShared:p.isShared, sharedId:p.sharedId, role:p.role, ownerId:p.ownerId, ownerUsername:p.ownerUsername })
        } else {
          const counter = useAppStore.getState().counters.find(c => c.id === sendForm.itemId)
          if (!counter) throw new Error('Contador no encontrado')
          const { sharedId: sid } = await shareCounter(counter)
          sharedId = sid
          updateCounter(counter.id, { isShared:true, sharedId:sid, role:'owner', ownerId:user?.uid })
        }
        schedulePushPersonalData(
          useAppStore.getState().counters, useAppStore.getState().folders,
          useAppStore.getState().gridOrder, useAppStore.getState().folderOrders, driveToken
        )
      }

      await sendInvitation(sharedId, sendForm.itemName, sendForm.toUsername.trim(), sendForm.role, isFolder)
      setShowSend(false)
      setSendForm({ itemId:'', sharedId:'', itemName:'', toUsername:'', role:'viewer', isFolder:false })
      showToast('Invitación enviada ✓')
    } catch (e) { showToast(e.message) }
    finally { setSendLoading(false) }
  }

  const allOwnedItems = [
    ...counters.filter(c => !c.isShared || c.role === 'owner').map(c => ({ itemId:c.id, sharedId:c.sharedId??null, name:c.name, isFolder:false })),
    ...folders.filter(f => !f.isShared || f.role === 'owner').map(f => ({ itemId:f.id, sharedId:f.sharedId??null, name:f.name, isFolder:true })),
  ]

  const selectedItem = allOwnedItems.find(i => i.itemId === sendForm.itemId)

  return (
    <div className={styles.page}>
    <div className={styles.inner}>
      <header className={styles.header}>
        <button className="btn-icon" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className={styles.title}>Notificaciones</h1>
        {allOwnedItems.length > 0 && (
          <button className={styles.btnNew}
            onClick={() => { setSendForm({ itemId:'', sharedId:'', itemName:'', toUsername:'', role:'viewer', isFolder:false, locked:false }); setShowSend(true) }}
            title="Nueva invitación">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        )}
      </header>


      {/* Lista */}
      <div className={styles.list}>

        {/* ── Lista unificada, ordenada por fecha (como Android) ── */}
        {(() => {
          const unified = [
            ...friendReceived.map(f => ({
              id: 'fr_rcv_' + f.uid, dismissKey: 'fr_' + f.uid, ts: f.addedAt ?? 0,
              uid: f.uid, username: f.username,
              message: <>ha enviado una <strong>solicitud de amistad</strong></>,
              role: null, isSent: false,
              onAccept: () => handleFriendAccept(f), onReject: () => handleFriendReject(f),
            })),
            ...friendSent.map(f => ({
              id: 'fr_snd_' + f.uid, dismissKey: 'fr_' + f.uid, ts: f.addedAt ?? 0,
              uid: f.uid, username: f.username,
              message: <>Has enviado una <strong>solicitud de amistad</strong></>,
              role: null, isSent: true,
              onCancel: () => handleFriendCancel(f),
            })),
            ...received.map(inv => ({
              id: 'inv_rcv_' + inv.id, dismissKey: inv.id, ts: inv.createdAt ?? 0,
              uid: inv.fromUid, username: inv.fromUsername,
              message: inv.isRequest
                ? <>solicita permiso de edición en <strong>{inv.itemName}</strong></>
                : <>te ha invitado a participar en {inv.isFolder ? 'la carpeta ' : ''}<strong>{inv.itemName}</strong></>,
              role: inv.role === 'editor' ? 'Permisos: Editor (puede modificar)' : 'Permisos: Visor (solo lectura)',
              isSent: false,
              onAccept: () => handleAccept(inv), onReject: () => handleReject(inv),
            })),
            ...sent.map(inv => ({
              id: 'inv_snd_' + inv.id, dismissKey: inv.id, ts: inv.createdAt ?? 0,
              uid: inv.toUid, username: inv.toUsername,
              message: <>Has enviado una <strong>invitación</strong>{inv.isFolder ? ' a la carpeta ' : ' al contador '}<strong>{inv.itemName}</strong></>,
              role: inv.role === 'editor' ? 'Permisos: Editor (puede modificar)' : 'Permisos: Visor (solo lectura)',
              isSent: true,
              onCancel: () => handleCancel(inv),
            })),
          ].sort((a, b) => b.ts - a.ts)

          if (unified.length === 0) {
            return (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                </svg>
                <p>No hay notificaciones</p>
              </div>
            )
          }

          return unified.map(n => {
            const busy = loading === n.dismissKey || dismissingId === n.dismissKey
            const photo = n.uid ? profiles[n.uid]?.photoUrl : null
            return (
              <div key={n.id} className={dismissingId === n.dismissKey ? styles.collapseWrap : undefined}>
                <div
                  className={dismissingId === n.dismissKey ? styles.cardDismissing : undefined}
                  onClick={() => (n.username || n.uid) && navigate(`/user/${n.username || n.uid}`)}
                  style={{ border: '1px solid var(--card-stroke)', borderRadius: 16, padding: 16,
                    marginBottom: 12, cursor: n.uid ? 'pointer' : 'default' }}>
                  {/* Fila superior: avatar + textos */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: photo ? 'transparent' : avatarColor(n.username),
                      color: '#fff', fontWeight: 700, fontSize: 17 }}>
                      {photo
                        ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (n.username?.[0]?.toUpperCase() ?? '?')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <p style={{ margin: 0, flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.username}</p>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{relativeTime(n.ts)}</span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{n.message}</p>
                      {n.role && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{n.role}</p>
                      )}
                    </div>
                  </div>
                  {/* Botones de texto abajo a la derecha (como Android) */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}
                    onClick={e => e.stopPropagation()}>
                    {n.isSent ? (
                      <button disabled={busy} onClick={n.onCancel}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px',
                          fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                        {loading === n.dismissKey ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Cancelar'}
                      </button>
                    ) : (
                      <>
                        <button disabled={busy} onClick={n.onReject}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px',
                            fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                          Rechazar
                        </button>
                        <button disabled={busy} onClick={n.onAccept}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px',
                            fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'inherit' }}>
                          {loading === n.dismissKey ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Aceptar'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        })()}

      </div>

      {/* ── Dialog enviar invitación ── */}
      {showSend && (
        <div className="dialog-backdrop" onClick={() => setShowSend(false)}>
          <div className={styles.sendDialog} onClick={e => e.stopPropagation()}>
            <div className={styles.sendDialogHeader}>
              <h3 className={styles.sendDialogTitle}>
                {sendForm.locked ? <>Invitar a «{sendForm.itemName}»</> : 'Nueva invitación'}
              </h3>
              <button className="btn-icon" onClick={() => setShowSend(false)}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>

            {/* Seleccionar elemento — oculto si se llegó desde un contador concreto */}
            {!sendForm.locked && (
              <>
                <p className={styles.sendLabel}>Elemento</p>
                <div className={styles.itemPicker}>
                  {allOwnedItems.map(item => (
                    <button key={item.itemId}
                      className={`${styles.itemChip} ${sendForm.itemId === item.itemId ? styles.itemChipActive : ''}`}
                      onClick={() => setSendForm(f => ({ ...f, itemId:item.itemId, sharedId:item.sharedId??null, itemName:item.name, isFolder:item.isFolder }))}>
                      {item.isFolder
                        ? <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                        : <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                      }
                      {item.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Usuario destino */}
            <p className={styles.sendLabel}>Usuario</p>
            <div className={styles.sendInputWrap}>
              {(() => {
                // Si el nombre escrito es un amigo, mostrar su foto en el campo
                const match = friendSuggestions.find(f => f.username.toLowerCase() === sendForm.toUsername.trim().toLowerCase())
                const photo = match ? profiles[match.uid]?.photoUrl : null
                if (match) {
                  return (
                    <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: photo ? 'transparent' : avatarColor(match.username),
                      color: '#fff', fontWeight: 700, fontSize: 11 }}>
                      {photo
                        ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : match.username[0]?.toUpperCase()}
                    </span>
                  )
                }
                return (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color:'var(--text-secondary)', flexShrink:0 }}>
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                )
              })()}
              <input className={styles.sendInput} placeholder="Nombre de usuario"
                value={sendForm.toUsername}
                onChange={e => setSendForm(f => ({ ...f, toUsername:e.target.value }))} />
              {sendForm.toUsername && (
                <button className={styles.searchClearBtn} onClick={() => setSendForm(f => ({ ...f, toUsername:'' }))}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              )}
            </div>
            {/* Chips de amigos con foto de perfil — filtra por lo que se escribe */}
            {friendSuggestions.length > 0 && (() => {
              const q = sendForm.toUsername.toLowerCase()
              const visible = friendSuggestions.filter(f =>
                f.username !== sendForm.toUsername && (!q || f.username.toLowerCase().includes(q))
              )
              return visible.length > 0 ? (
                <div className={styles.friendChips}>
                  {visible.map(f => {
                    const photo = profiles[f.uid]?.photoUrl
                    return (
                      <button key={f.uid} className={styles.friendChip}
                        onClick={() => setSendForm(prev => ({ ...prev, toUsername: f.username }))}>
                        <span className={styles.friendChipAvatar} style={photo ? { overflow: 'hidden', padding: 0 } : undefined}>
                          {photo
                            ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : f.username[0]?.toUpperCase()}
                        </span>
                        {f.username}
                      </button>
                    )
                  })}
                </div>
              ) : null
            })()}

            {/* Rol */}
            <p className={styles.sendLabel}>Permisos</p>
            <div className={styles.rolePicker}>
              {[
                { id:'viewer', label:'Solo ver',  icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg> },
                { id:'editor', label:'Editor',    icon:<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> },
              ].map(r => (
                <button key={r.id}
                  className={`${styles.roleChip} ${sendForm.role === r.id ? styles.roleChipActive : ''}`}
                  onClick={() => setSendForm(f => ({ ...f, role:r.id }))}>
                  {r.icon}{r.label}
                </button>
              ))}
            </div>

            {/* Botón enviar */}
            <button className={styles.sendBtn}
              disabled={!sendForm.itemId || !sendForm.toUsername.trim() || sendLoading}
              onClick={handleSend}>
              {sendLoading
                ? <span className="spinner" style={{width:18,height:18}}/>
                : <>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    Enviar invitación
                  </>
              }
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
    </div>
  )
}
