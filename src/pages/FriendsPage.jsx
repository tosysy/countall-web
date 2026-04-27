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
  const [tab, setTab] = useState('friends') // friends | sent | received
  const [friends, setFriends] = useState([])
  const [received, setReceived] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [inSearchMode, setInSearchMode] = useState(false)
  const [pendingSent, setPendingSent] = useState([]) // [{uid, username}] with pending sent requests
  const [loading, setLoading] = useState(false)
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
    const sent = list.filter(f => f.status === 'pending' && f.direction === 'sent').map(f => ({ uid: f.uid, username: f.username }))
    setPendingSent(sent)
  }

  const handleSearchChange = (e) => {
    const q = e.target.value
    setSearch(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) {
      setInSearchMode(false); setSearchResults([]); return
    }
    searchTimer.current = setTimeout(async () => {
      if (q !== search + e.nativeEvent.data) {} // just run
      const results = await searchUsers(q.trim()).catch(() => [])
      if (lastQuery.current !== q) return
      setInSearchMode(true)
      setSearchResults(results)
    }, 220)
    lastQuery.current = q
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

  const handleRemove = async (friendUid) => {
    if (!confirm('¿Eliminar de amigos?')) return
    await removeFriend(friendUid)
    setFriends(f => f.filter(fr => fr.uid !== friendUid))
  }

  const handleReject = async (friend) => {
    await removeFriend(friend.uid)
    setReceived(r => r.filter(f => f.uid !== friend.uid))
  }

  const handleCancelRequest = async (targetUid) => {
    if (!confirm('¿Cancelar solicitud?')) return
    await removeFriend(targetUid)
    setPendingSent(s => s.filter(f => f.uid !== targetUid))
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
        {['friends','sent','received'].map((t, i) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.active : ''}`}
            onClick={() => { setTab(t); setSearch(''); setInSearchMode(false); setSearchResults([]) }}>
            {{ friends:'Agregados', sent:'Enviadas', received:'Recibidas' }[t]}
            {t === 'received' && received.length > 0 && <span className={styles.tabBadge} />}
          </button>
        ))}
      </div>

      {/* Search bar (solo en tab friends) */}
      {tab === 'friends' && (
        <div className={styles.searchBox}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color:'var(--text-secondary)', flexShrink:0 }}>
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Buscar usuario"
            value={search}
            onChange={handleSearchChange}
          />
          {search && (
            <button style={{ color:'var(--text-secondary)' }}
              onClick={() => { setSearch(''); setInSearchMode(false); setSearchResults([]) }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className={styles.list}>
        {tab === 'friends' && (
          <>
            {displayList.length === 0 && (
              <p className={styles.empty}>
                {inSearchMode ? `Sin resultados para "${search}"` : 'Aún no tienes amigos agregados'}
              </p>
            )}
            {displayList.map(f => {
              const state = getState(f.uid)
              return (
                <div key={f.uid} className={styles.userCard}>
                  <div className="avatar" style={{ background: avatarColor(f.username) }}>
                    {f.username?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{f.username}</span>
                    {state === 'sent' && <span className={styles.userSub}>Solicitud enviada</span>}
                    {state === 'accepted' && <span className={styles.userSub}>Amigo</span>}
                  </div>
                  <div className={styles.userActions}>
                    {state === 'none' && (
                      <button className={styles.btnAdd} onClick={() => handleSendRequest(f.uid, f.username)}>Añadir</button>
                    )}
                    {state === 'sent' && (
                      <button className={styles.btnCancel} onClick={() => handleCancelRequest(f.uid)}>Cancelar</button>
                    )}
                    {state === 'accepted' && (
                      <button className={styles.btnRemove} onClick={() => handleRemove(f.uid)}>Eliminar</button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {tab === 'sent' && (
          <>
            {pendingSent.length === 0 && <p className={styles.empty}>No hay solicitudes enviadas</p>}
            {pendingSent.map(f => (
              <div key={f.uid} className={styles.userCard}>
                <div className="avatar" style={{ background: avatarColor(f.username) }}>
                  {f.username?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{f.username}</span>
                  <span className={styles.userSub}>Solicitud enviada</span>
                </div>
                <button className={styles.btnCancel} onClick={() => handleCancelRequest(f.uid)}>Cancelar</button>
              </div>
            ))}
          </>
        )}

        {tab === 'received' && (
          <>
            {received.length === 0 && <p className={styles.empty}>No hay solicitudes recibidas</p>}
            {received.map(f => (
              <div key={f.uid} className={styles.userCard}>
                <div className="avatar" style={{ background: avatarColor(f.username) }}>
                  {f.username?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className={styles.userInfo}>
                  <span className={styles.userName}>{f.username}</span>
                  <span className={styles.userSub}>Quiere ser tu amigo</span>
                </div>
                <div className={styles.userActions}>
                  <button className={styles.btnAdd} onClick={() => handleAccept(f)}>Aceptar</button>
                  <button className={styles.btnCancel} onClick={() => handleReject(f)}>Rechazar</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
