import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPublicProfile, getProfilesLite } from '../firebase/profileManager'
import { getFriends, getFriendsOf, sendFriendRequest, acceptFriendRequest, removeFriend, getUserIdByUsername } from '../firebase/syncManager'
import CounterCard from '../components/CounterCard'
import ExpandedCounter from '../components/ExpandedCounter'
import useAppStore from '../store/appStore'
import styles from './UserProfilePage.module.css'

const AVATAR_COLORS = ['#5C6BC0','#26A69A','#66BB6A','#EC407A','#FFA726','#42A5F5','#8D6E63','#78909C']
function avatarColor(name = '') {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function formatDate(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Android guarda los valores canónicos en español; mapear también los antiguos de la web.
// "Prefiero no decirlo" no se muestra en la línea de información.
function genderLabel(g) {
  if (!g || g === 'Prefiero no decirlo' || g === 'na') return null
  return { male: 'Hombre', female: 'Mujer', other: 'Otro' }[g] ?? g
}

/**
 * Perfil público de otro usuario — foto, datos, y sus contadores/carpetas
 * públicos en una cuadrícula de solo lectura (como UserProfileActivity).
 */
export default function UserProfilePage() {
  const navigate = useNavigate()
  // La URL lleva el username (/user/pablo); si no existe en el índice, se trata como uid
  const { handle } = useParams()
  const myUid = useAppStore(s => s.user?.uid)

  const [targetUid, setTargetUid] = useState(null)   // uid resuelto desde el username
  const [profile, setProfile] = useState(undefined) // undefined = cargando
  const [relation, setRelation] = useState('none')  // none | sent | received | accepted
  const [folderStack, setFolderStack] = useState([]) // navegación por carpetas públicas
  const [expanded, setExpanded] = useState(null)     // contador público ampliado
  const [showFriends, setShowFriends] = useState(false)
  const [friendsList, setFriendsList] = useState(undefined) // undefined=cargando, null=sin permiso, []=vacía
  const [myRelations, setMyRelations] = useState({})        // uid → 'accepted' | 'sent' | 'received'

  useEffect(() => {
    let alive = true
    setProfile(undefined)
    setTargetUid(null)
    setRelation('none')
    setFolderStack([])
    setExpanded(null)
    setShowFriends(false)
    setFriendsList(undefined)
    getUserIdByUsername(handle).catch(() => null).then(uid => {
      if (alive) setTargetUid(uid ?? handle) // retrocompatibilidad con enlaces por uid
    })
    return () => { alive = false }
  }, [handle])

  useEffect(() => {
    if (!targetUid) return
    let alive = true
    getPublicProfile(targetUid).then(p => { if (alive) setProfile(p) }).catch(() => setProfile(null))
    getFriends().then(list => {
      if (!alive) return
      const f = list.find(x => x.uid === targetUid)
      if (!f) return
      setRelation(f.status === 'accepted' ? 'accepted' : f.direction === 'sent' ? 'sent' : 'received')
    }).catch(() => {})
    return () => { alive = false }
  }, [targetUid])

  // Lista de amigos del perfil (como FriendsListActivity en Android)
  const openFriendsList = async () => {
    setShowFriends(true)
    setFriendsList(undefined)
    try {
      const list = await getFriendsOf(targetUid)
      // Fotos y nombre completo desde publicProfiles
      const profiles = await getProfilesLite(list.map(f => f.uid)).catch(() => ({}))
      const enriched = list.map(f => ({ ...f, ...profiles[f.uid], username: profiles[f.uid]?.username || f.username }))
      setFriendsList(enriched)
      // Mi relación con cada uno, para el botón de acción de cada fila
      const mine = await getFriends().catch(() => [])
      const rel = {}
      mine.forEach(f => { rel[f.uid] = f.status === 'accepted' ? 'accepted' : (f.direction === 'sent' ? 'sent' : 'received') })
      setMyRelations(rel)
    } catch {
      setFriendsList(null) // las reglas solo dejan verla a sus amigos
    }
  }

  const handleRowAction = async (f) => {
    const state = myRelations[f.uid] ?? 'none'
    try {
      if (state === 'none') {
        await sendFriendRequest(f.uid, f.username)
        setMyRelations(r => ({ ...r, [f.uid]: 'sent' }))
      } else if (state === 'received') {
        await acceptFriendRequest(f.uid)
        setMyRelations(r => ({ ...r, [f.uid]: 'accepted' }))
      } else if (state === 'accepted') {
        if (!confirm(`¿Eliminar a ${f.username} de tus amigos?`)) return
        await removeFriend(f.uid)
        setMyRelations(r => ({ ...r, [f.uid]: 'none' }))
      }
    } catch (e) { alert(e.message) }
  }

  const handleFriendAction = async () => {
    try {
      if (relation === 'none') {
        await sendFriendRequest(targetUid, profile?.username ?? '')
        setRelation('sent')
      } else if (relation === 'received') {
        await acceptFriendRequest(targetUid)
        setRelation('accepted')
      } else if (relation === 'sent' || relation === 'accepted') {
        if (!confirm(relation === 'accepted' ? '¿Eliminar de amigos?' : '¿Cancelar solicitud?')) return
        await removeFriend(targetUid)
        setRelation('none')
      }
    } catch (e) { alert(e.message) }
  }

  if (profile === undefined) {
    return <div className={styles.page}><div className={styles.center}><span className="spinner" /></div></div>
  }
  if (profile === null) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <p style={{ color: 'var(--text-secondary)' }}>Este perfil no existe</p>
          <button className={styles.btnPrimary} onClick={() => navigate(-1)}>Volver</button>
        </div>
      </div>
    )
  }

  const currentFolder = folderStack.length ? folderStack[folderStack.length - 1] : null
  const currentFolderId = currentFolder?.id ?? null
  const visibleCounters = profile.publicCounters.filter(c => (c.folderId ?? null) === currentFolderId)
  const visibleFolders = profile.publicFolders.filter(f => (f.parentFolderId ?? null) === currentFolderId)
  const birth = formatDate(profile.birthDate)
  const isSelf = myUid === targetUid
  const infoLine = [birth, genderLabel(profile.gender)].filter(Boolean).join('  ·  ')

  const FRIEND_BTN = {
    none:     { label: 'Agregar amigo', cls: styles.btnAccent },
    sent:     { label: 'Solicitud enviada', cls: styles.btnGhost },
    received: { label: 'Aceptar solicitud', cls: styles.btnAccent },
    accepted: { label: 'Amigos ✓', cls: styles.btnGhost },
  }[relation]

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* Header: solo la flecha, como Android */}
        <header className={styles.header}>
          <button className="btn-icon" onClick={() => {
            if (expanded) setExpanded(null)
            else if (folderStack.length) setFolderStack(s => s.slice(0, -1))
            else navigate(-1)
          }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
        </header>

        {/* Tarjeta de perfil centrada (como activity_user_profile) */}
        <div className={styles.profileCard}>
          <div className={styles.avatarBig} style={{ background: profile.photoUrl ? 'transparent' : avatarColor(profile.username) }}>
            {profile.photoUrl
              ? <img src={profile.photoUrl} alt="" className={styles.avatarImg} />
              : (profile.username?.[0]?.toUpperCase() ?? '?')}
          </div>

          <p className={styles.fullName}>{profile.fullName || profile.username}</p>

          <div className={styles.usernameRow}>
            <span className={styles.username}>{profile.username}</span>
            {profile.instagram && (
              <a className={styles.igIcon} href={`https://instagram.com/${profile.instagram}`}
                target="_blank" rel="noopener noreferrer" title={`@${profile.instagram}`}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95C23.78 2.7 21.35.27 17 .07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zM12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm6.4-11.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44z"/></svg>
              </a>
            )}
          </div>

          {/* Nº de amigos grande, como Android — tocar abre su lista de amigos */}
          <button className={styles.friendCount} onClick={openFriendsList}>
            <span className={styles.friendCountNumber}>{profile.friendCount}</span>
            <span className={styles.friendCountLabel}>amigo{profile.friendCount === 1 ? '' : 's'}</span>
          </button>

          {infoLine && <p className={styles.infoLine}>{infoLine}</p>}

          {!isSelf && (
            <button className={FRIEND_BTN.cls} onClick={handleFriendAction}>{FRIEND_BTN.label}</button>
          )}
        </div>

        {/* Cabecera de contadores públicos / carpeta (como Android) */}
        <div className={styles.countersHeader}>
          {currentFolder && (
            <button className={styles.btnExitFolder} onClick={() => setFolderStack(s => s.slice(0, -1))}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              Salir
            </button>
          )}
          <h3 className={styles.sectionTitle}>{currentFolder ? currentFolder.name : 'Contadores públicos'}</h3>
        </div>
        {visibleCounters.length === 0 && visibleFolders.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            <p>No hay contadores públicos aquí</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleFolders.map(f => (
              <button key={f.id} className={styles.folderCard}
                style={{ borderColor: f.color ?? undefined }}
                onClick={() => setFolderStack(s => [...s, f])}>
                <span className={styles.folderIcon}>📁</span>
                <span className={styles.cardName}>{f.name}</span>
              </button>
            ))}
            {/* Tarjeta real de contador con + y − visibles pero inertes (solo lectura, como Android) */}
            {visibleCounters.map(c => (
              <div key={c.id}>
                <CounterCard
                  counter={c}
                  onClick={() => setExpanded(c)}
                />
              </div>
            ))}
          </div>
        )}

        {/* Lista de amigos del perfil (como FriendsListActivity) */}
        {showFriends && (
          <div className={styles.overlay} onClick={() => setShowFriends(false)}>
            <div className={styles.expandedCard} onClick={e => e.stopPropagation()}>
              <div className={styles.expandedHeader}>
                <h2 className={styles.expandedName}>
                  {isSelf ? 'Tus amigos' : `Amigos de ${profile.username}`}
                </h2>
                <button className="btn-icon" onClick={() => setShowFriends(false)}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>

              {friendsList === undefined && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                  <span className="spinner" />
                </div>
              )}
              {friendsList === null && (
                <p className={styles.metaLine} style={{ textAlign: 'center', padding: '16px 0' }}>
                  Solo sus amigos pueden ver esta lista
                </p>
              )}
              {Array.isArray(friendsList) && friendsList.length === 0 && (
                <p className={styles.metaLine} style={{ textAlign: 'center', padding: '16px 0' }}>
                  Todavía no tiene amigos
                </p>
              )}
              {Array.isArray(friendsList) && friendsList.map(f => {
                const state = f.uid === myUid ? 'self' : (myRelations[f.uid] ?? 'none')
                const ACTION = {
                  none:     { label: 'Añadir', solid: true },
                  sent:     { label: 'Enviada', solid: false },
                  received: { label: 'Aceptar', solid: true },
                  accepted: { label: 'Amigo ✓', solid: false },
                }[state]
                return (
                  <div key={f.uid}
                    onClick={() => { setShowFriends(false); navigate(`/user/${f.username || f.uid}`) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      marginBottom: 8, borderRadius: 14, border: '1px solid var(--card-stroke)',
                      cursor: 'pointer' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: f.photoUrl ? 'transparent' : avatarColor(f.username),
                      color: '#fff', fontWeight: 800, fontSize: 18 }}>
                      {f.photoUrl
                        ? <img src={f.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : (f.username?.[0]?.toUpperCase() ?? '?')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.fullName?.trim() || f.username}
                      </p>
                      {f.fullName?.trim() && (
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.username}
                        </p>
                      )}
                    </div>
                    {state !== 'self' && (
                      <button
                        onClick={e => { e.stopPropagation(); if (state !== 'sent') handleRowAction(f) }}
                        style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 10, fontSize: 13,
                          fontWeight: 700, cursor: state === 'sent' ? 'default' : 'pointer', fontFamily: 'inherit',
                          border: ACTION.solid ? 'none' : '1px solid var(--card-stroke)',
                          background: ACTION.solid ? 'var(--text-primary)' : 'transparent',
                          color: ACTION.solid ? 'var(--bg)' : 'var(--text-secondary)' }}>
                        {ACTION.label}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Contador público ampliado — la misma vista que en la pantalla principal, en modo lectura */}
        {expanded && (
          <ExpandedCounter
            counter={{ ...expanded, role: 'viewer' }}
            readOnly
            onClose={() => setExpanded(null)}
            onUpdate={() => {}}
            onDelete={() => {}}
            onIncrement={() => {}}
            onDecrement={() => {}}
          />
        )}
      </div>
    </div>
  )
}
