import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFriends, sendFriendRequest, acceptFriendRequest, removeFriend, searchUsers, listenFriendRequests } from '../firebase/syncManager'
import useAppStore from '../store/appStore'
import styles from './FriendsPage.module.css'

const AVATAR_COLORS = ['#5C6BC0','#26A69A','#66BB6A','#EC407A','#FFA726','#42A5F5','#8D6E63','#78909C']
function avatarColor(name = '') {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function FriendsPage() {
  const navigate = useNavigate()
  const { user } = useAppStore()
  const [tab, setTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [received, setReceived] = useState([])
  const [pendingSent, setPendingSent] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [inSearchMode, setInSearchMode] = useState(false)
  const [dismissingId, setDismissingId] = useState(null)
  const searchTimer = useRef(null)
  const lastQuery = useRef('')

  useEffect(() => {
    loadFriends()
    const unsub = listenFriendRequests(list => setReceived(list))
    return unsub
  }, [])

  const loadFriends = async () => {
    const list = await getFriends()
    setFriends(list.filter(f => f.status === 'accepted'))
    setPendingSent(list.filter(f => f.status === 'pending' && f.direction === 'sent').map(f => ({ uid: f.uid, username: f.username })))
  }

  const handleSearchChange = (e) => {
    const q = e.target.value
    setSearch(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setInSearchMode(false); setSearchResults([]); return }
    lastQuery.current = q
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchUsers(q.trim())
        if (lastQuery.current !== q) return
        setSearchResults(results)
        setInSearchMode(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const clearSearch = () => { setSearch(''); setInSearchMode(false); setSearchResults([]); setSearching(false) }

  // Anima la tarjeta hacia la derecha y luego ejecuta la acción (igual que Android)
  const dismissThen = (uid, action) => {
    setDismissingId(uid)
    setTimeout(() => { action(); setDismissingId(null) }, 420)
  }

  const handleSendRequest = async (targetUid, username) => {
    try {
      await sendFriendRequest(targetUid, username)
      setPendingSent(s => [...s, { uid: targetUid, username }])
    } catch (e) { alert(e.message) }
  }

  const handleAccept = async (friend) => {
    try {
      await acceptFriendRequest(friend.uid)
      setReceived(r => r.filter(f => f.uid !== friend.uid))
      loadFriends()
    } catch (e) { alert(e.message) }
  }

  const handleRemove = async (uid) => {
    if (!confirm('¿Eliminar de amigos?')) return
    await removeFriend(uid)
    setFriends(f => f.filter(fr => fr.uid !== uid))
  }

  const handleReject = async (friend) => {
    await removeFriend(friend.uid)
    setReceived(r => r.filter(f => f.uid !== friend.uid))
  }

  const handleCancelRequest = async (uid) => {
    if (!confirm('¿Cancelar solicitud?')) return
    await removeFriend(uid)
    setPendingSent(s => s.filter(f => f.uid !== uid))
  }

  const getState = (uid) => {
    if (friends.some(f => f.uid === uid)) return 'accepted'
    if (pendingSent.some(f => f.uid === uid)) return 'sent'
    if (received.some(f => f.uid === uid)) return 'received'
    return 'none'
  }

  const displayList = inSearchMode ? searchResults : friends

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className="btn-icon" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className={styles.title}>Amigos</h1>
      </header>

      {/* Tab bar */}
      <div className={styles.tabs}>
        <div className={styles.tabIndicator}
          style={{ transform: `translateX(${{ friends:0, sent:1, received:2 }[tab] * 100}%)`, width: '33.33%' }} />
        {[
          { id:'friends', label:'Amigos' },
          { id:'sent',    label:'Enviadas' },
          { id:'received',label:'Recibidas' },
        ].map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.active : ''}`}
            onClick={() => { setTab(t.id); clearSearch() }}>
            {t.label}
            {t.id === 'received' && received.length > 0 && <span className={styles.tabBadge} />}
          </button>
        ))}
      </div>

      {/* Search bar — debajo de las pestañas, solo en Amigos */}
      {tab === 'friends' && (
        <div className={styles.searchWrap}>
          <div className={styles.searchBox}>
            {searching
              ? <span className="spinner" style={{ width:16, height:16, flexShrink:0 }} />
              : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" style={{ color:'var(--text-secondary)', flexShrink:0 }}>
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
            }
            <input
              className={styles.searchInput}
              placeholder="Buscar por nombre de usuario..."
              value={search}
              onChange={handleSearchChange}
              autoComplete="off"
            />
            {search && (
              <button className={styles.searchClear} onClick={clearSearch}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Listas */}
      <div className={styles.list}>

        {/* ── AMIGOS / BÚSQUEDA ── */}
        {tab === 'friends' && (
          <>
            {inSearchMode && (
              <p className={styles.sectionLabel}>
                {searchResults.length > 0 ? `${searchResults.length} resultado${searchResults.length > 1 ? 's' : ''}` : `Sin resultados para "${search}"`}
              </p>
            )}
            {!inSearchMode && friends.length === 0 && (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
                <p>Busca un usuario para agregar amigos</p>
              </div>
            )}
            {displayList.map(f => {
              const state = getState(f.uid)
              const isSelf = f.uid === user?.uid
              if (isSelf) return null
              return <UserCard key={f.uid} user={f} state={state}
                isDismissing={dismissingId === f.uid}
                onAdd={() => handleSendRequest(f.uid, f.username)}
                onCancel={() => dismissThen(f.uid, () => handleCancelRequest(f.uid))}
                onRemove={() => dismissThen(f.uid, () => handleRemove(f.uid))} />
            })}
          </>
        )}

        {/* ── ENVIADAS ── */}
        {tab === 'sent' && (
          pendingSent.length === 0
            ? <div className="empty-state">
                <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                <p>No hay solicitudes enviadas</p>
              </div>
            : pendingSent.map(f => (
                <UserCard key={f.uid} user={f} state="sent"
                  isDismissing={dismissingId === f.uid}
                  onCancel={() => dismissThen(f.uid, () => handleCancelRequest(f.uid))} />
              ))
        )}

        {/* ── RECIBIDAS ── */}
        {tab === 'received' && (
          received.length === 0
            ? <div className="empty-state">
                <svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                <p>No hay solicitudes recibidas</p>
              </div>
            : received.map(f => (
                <UserCard key={f.uid} user={f} state="received"
                  isDismissing={dismissingId === f.uid}
                  onAccept={() => handleAccept(f)}
                  onReject={() => dismissThen(f.uid, () => handleReject(f))} />
              ))
        )}
      </div>
    </div>
  )
}

function UserCard({ user: f, state, isDismissing, onAdd, onCancel, onRemove, onAccept, onReject }) {
  const color = (() => {
    const COLORS = ['#5C6BC0','#26A69A','#66BB6A','#EC407A','#FFA726','#42A5F5','#8D6E63','#78909C']
    let h = 0; for (const c of (f.username ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0
    return COLORS[h % COLORS.length]
  })()

  const stateLabel = { accepted:'Amigo', sent:'Solicitud enviada', received:'Quiere ser tu amigo', none:'' }[state]

  return (
    <div className={isDismissing ? styles.collapseWrap : undefined}>
      <div className={`${styles.userCard} ${isDismissing ? styles.userCardDismissing : ''}`}>
        <div className={styles.avatar} style={{ background: color }}>
          {f.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{f.username}</span>
          {stateLabel && <span className={styles.userSub}>{stateLabel}</span>}
        </div>
        <div className={styles.userActions}>
          {state === 'none'     && <button className={styles.btnAdd}    onClick={onAdd}>Añadir</button>}
          {state === 'sent'     && <button className={styles.btnGhost}  onClick={onCancel}>Cancelar</button>}
          {state === 'accepted' && <button className={styles.btnDanger} onClick={onRemove}>Eliminar</button>}
          {state === 'received' && <>
            <button className={styles.btnAdd}   onClick={onAccept}>Aceptar</button>
            <button className={styles.btnGhost} onClick={onReject}>Rechazar</button>
          </>}
        </div>
      </div>
    </div>
  )
}
