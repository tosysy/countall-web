import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPublicProfile } from '../firebase/profileManager'
import { getFriends, sendFriendRequest, acceptFriendRequest, removeFriend } from '../firebase/syncManager'
import CompetitivePodium from '../components/CompetitivePodium'
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

const GENDER_LABEL = { male: 'Hombre', female: 'Mujer', other: 'Otro' }

/**
 * Perfil público de otro usuario — foto, datos, y sus contadores/carpetas
 * públicos en una cuadrícula de solo lectura (como UserProfileActivity).
 */
export default function UserProfilePage() {
  const navigate = useNavigate()
  const { uid: targetUid } = useParams()
  const myUid = useAppStore(s => s.user?.uid)

  const [profile, setProfile] = useState(undefined) // undefined = cargando
  const [relation, setRelation] = useState('none')  // none | sent | received | accepted
  const [folderStack, setFolderStack] = useState([]) // navegación por carpetas públicas
  const [expanded, setExpanded] = useState(null)     // contador público ampliado

  useEffect(() => {
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
  const infoLine = [birth, GENDER_LABEL[profile.gender]].filter(Boolean).join('  ·  ')

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

          {/* Nº de amigos grande, como Android */}
          <div className={styles.friendCount}>
            <span className={styles.friendCountNumber}>{profile.friendCount}</span>
            <span className={styles.friendCountLabel}>amigo{profile.friendCount === 1 ? '' : 's'}</span>
          </div>

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
            {visibleCounters.map(c => {
              const pct = c.target ? Math.min(100, (c.value / c.target) * 100) : null
              return (
                <button key={c.id} className={styles.counterCard}
                  style={{
                    background: c.backgroundImageUrl ? `url(${c.backgroundImageUrl}) center/cover` : (c.color ?? undefined),
                  }}
                  onClick={() => setExpanded(c)}>
                  <span className={`${styles.cardName} ${(c.color || c.backgroundImageUrl) ? styles.onColor : ''}`}>{c.name}</span>
                  <span className={`${styles.cardValue} ${(c.color || c.backgroundImageUrl) ? styles.onColor : ''}`}>{c.value}</span>
                  {pct != null && (
                    <div className={styles.cardProgress}><div style={{ width: `${pct}%` }} /></div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Contador público ampliado (solo lectura) */}
        {expanded && (
          <div className={styles.overlay} onClick={() => setExpanded(null)}>
            <div className={styles.expandedCard} onClick={e => e.stopPropagation()}>
              <div className={styles.expandedHeader}>
                <h2 className={styles.expandedName}>{expanded.name}</h2>
                <button className="btn-icon" onClick={() => setExpanded(null)}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>
              {expanded.isCompetitive ? (
                <CompetitivePodium
                  scores={expanded.competitorScores ?? {}}
                  usernames={expanded.competitorUsernames ?? {}}
                  userColors={expanded.userColors ?? {}}
                  targets={expanded.competitorTargets ?? {}}
                  logEntries={expanded.competitorLogEntries ?? {}}
                  increment={expanded.increment ?? 1}
                  myUid={null}
                  isOwner={false}
                  canEdit={false}
                />
              ) : (
                <>
                  <p className={styles.expandedValue} style={{ color: expanded.color ?? undefined }}>{expanded.value}</p>
                  {expanded.target != null && (
                    <p className={styles.expandedTarget}>Objetivo: {expanded.target}</p>
                  )}
                  <div className={styles.logList}>
                    {(expanded.logEntries ?? []).slice().reverse().map((e, i) => (
                      <div key={i} className={styles.logEntry}>
                        <span className={styles.logLabel}>{e.label || '•'}</span>
                        <span className={styles.logText}>{e.text}</span>
                        <span className={styles.logDate}>{e.date ? new Date(e.date).toLocaleDateString('es-ES') : ''}</span>
                      </div>
                    ))}
                    {(expanded.logEntries ?? []).length === 0 && (
                      <p className={styles.metaLine}>Sin registros</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
