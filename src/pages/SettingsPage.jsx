import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { auth } from '../firebase/config'
import { isUsernameAvailable, setUsername, signOut as firebaseSignOut } from '../firebase/auth'
import { deleteAccount } from '../firebase/syncManager'
import useAppStore from '../store/appStore'
import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, username, driveToken, theme, setTheme, clearData, history, restoreHistory, removeHistory, clearHistory } = useAppStore()

  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState(username ?? '')
  const [usernameError, setUsernameError] = useState('')
  const [usernameLoading, setUsernameLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [hideSyncNotif, setHideSyncNotif] = useState(false)

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(null), 3000) }

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim()
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
      setUsernameError('3–20 caracteres: letras, números y _')
      return
    }
    if (trimmed.toLowerCase() === username?.toLowerCase()) { setEditingUsername(false); return }
    setUsernameLoading(true)
    setUsernameError('')
    try {
      const available = await isUsernameAvailable(trimmed)
      if (!available) { setUsernameError('Ese nombre de usuario ya está en uso'); return }
      await setUsername(trimmed)
      await updateProfile(auth.currentUser, { displayName: trimmed })
      useAppStore.setState({ username: trimmed })
      setEditingUsername(false)
      showToast('Nombre de usuario actualizado')
    } catch (e) {
      setUsernameError('Error: ' + e.message)
    } finally {
      setUsernameLoading(false)
    }
  }

  const handleSignOut = async () => {
    await firebaseSignOut()
    clearData()
    navigate('/login', { replace: true })
  }

  const handleDeleteAccount = async () => {
    if (deleteText !== 'BORRAR') return
    setDeleting(true)
    try {
      const { driveToken: token } = useAppStore.getState()
      await deleteAccount(token)
      await auth.currentUser.delete()
      clearData()
      navigate('/login', { replace: true })
    } catch (e) {
      showToast('Error al borrar la cuenta: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

  const displayName = username ?? user?.displayName ?? ''
  const avatarLetter = displayName[0]?.toUpperCase() ?? '?'
  const currentTheme = theme ?? 'system'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className="btn-icon" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <h1 className={styles.title}>Ajustes</h1>
      </header>

      <div className={styles.content}>

        {/* ── CUENTA ──────────────────────────────────────────── */}
        <p className={styles.sectionLabel}>CUENTA</p>
        <div className={styles.card}>

          {/* Username row */}
          <button className={styles.rowBtn} onClick={() => { setNewUsername(username ?? ''); setEditingUsername(true); setUsernameError('') }}>
            <div className={styles.avatarSmall}>
              {user?.photoURL
                ? <img src={user.photoURL} alt="foto" className={styles.avatarImg} />
                : avatarLetter
              }
            </div>
            <div className={styles.rowTextCol}>
              <span className={styles.rowSublabel}>Nombre de usuario</span>
              <span className={styles.rowBoldValue}>{displayName || '—'}</span>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>

          <div className={styles.divider} />

          {/* Google account */}
          <div className={styles.row}>
            <div className={styles.iconCircleGreen}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            </div>
            <div className={styles.rowTextCol}>
              <span className={styles.rowMain}>Cuenta de Google vinculada</span>
              <span className={styles.rowSub}>{user?.email ?? ''}</span>
            </div>
          </div>

          <div className={styles.divider} />

          {/* Sign out */}
          <button className={styles.rowBtn} onClick={handleSignOut}>
            <div className={styles.iconTriangleRed}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
            </div>
            <span className={styles.rowDanger}>Cerrar sesión de Google</span>
          </button>
        </div>

        {/* ── APARIENCIA ──────────────────────────────────────── */}
        <p className={styles.sectionLabel}>APARIENCIA</p>
        <div className={styles.card}>

          {[
            {
              id: 'system', label: 'Seguir sistema',
              icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>
            },
            {
              id: 'light', label: 'Modo claro',
              icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>
            },
            {
              id: 'dark', label: 'Modo oscuro',
              icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>
            },
          ].map((opt, i, arr) => (
            <div key={opt.id}>
              <button className={styles.rowBtn} onClick={() => setTheme(opt.id)}>
                <span className={styles.themeIcon}>{opt.icon}</span>
                <span className={styles.rowMain} style={{ flex: 1 }}>{opt.label}</span>
                {/* Radio button */}
                <div className={`${styles.radio} ${currentTheme === opt.id ? styles.radioOn : ''}`}>
                  {currentTheme === opt.id && <div className={styles.radioDot} />}
                </div>
              </button>
              {i < arr.length - 1 && <div className={styles.divider} />}
            </div>
          ))}
        </div>

        {/* ── SINCRONIZACIÓN ──────────────────────────────────── */}
        <p className={styles.sectionLabel}>SINCRONIZACIÓN</p>
        <div className={styles.card}>
          <div className={styles.row}>
            <div className={styles.themeIcon} style={{ color: 'var(--text-secondary)' }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
            </div>
            <div className={styles.rowTextCol} style={{ flex: 1 }}>
              <span className={styles.rowMain}>Ocultar notificación de sincronización</span>
              <span className={styles.rowSub}>La sincronización continúa en segundo plano</span>
            </div>
            {/* Toggle */}
            <button
              className={`${styles.toggle} ${hideSyncNotif ? styles.toggleOn : ''}`}
              onClick={() => setHideSyncNotif(v => !v)}
            >
              <div className={styles.toggleThumb} />
            </button>
          </div>
        </div>

        {/* ── HISTORIAL DE CAMBIOS ─────────────────────────────── */}
        <p className={styles.sectionLabel}>HISTORIAL DE CAMBIOS</p>
        {(!history || history.length === 0) ? (
          <p className={styles.emptyHistory}>No hay cambios registrados</p>
        ) : (
          <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
            {history.map((h, i) => (
              <div key={h.id} className={styles.historyRow} style={{ borderBottom: i < history.length - 1 ? '1px solid var(--card-stroke)' : 'none' }}>
                <div className={styles.historyInfo}>
                  <span className={styles.historyDesc}>{h.description}</span>
                  <span className={styles.historyDate}>
                    {new Date(h.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={styles.btnSmall} onClick={() => {
                    if (confirm('¿Restaurar a este estado?')) { restoreHistory(h.id); showToast('Estado restaurado') }
                  }}>Restaurar</button>
                  <button className={styles.btnSmall} style={{ color: 'var(--danger)' }} onClick={() => removeHistory(h.id)}>✕</button>
                </div>
              </div>
            ))}
            <button className={styles.clearHistoryBtn} onClick={() => { if (confirm('¿Borrar todo el historial?')) clearHistory() }}>
              Borrar historial
            </button>
          </div>
        )}

        {/* ── DELETE ALL DATA button ───────────────────────────── */}
        <div className={styles.deleteSection}>
          <button className={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            Eliminar todos mis datos
          </button>
          <p className={styles.deleteWarning}>
            Esta acción borrará permanentemente tus contadores personales, amigos y configuración de la nube. No se puede deshacer.
          </p>
        </div>

      </div>{/* end .content */}

      {/* ── Edit username dialog ─────────────────────────────── */}
      {editingUsername && (
        <div className="dialog-backdrop" onClick={() => setEditingUsername(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>Nombre de usuario</h3>
            <input
              className="input-field"
              style={{ marginBottom: 8 }}
              value={newUsername}
              onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="nombre_usuario"
              maxLength={30}
              autoFocus
            />
            {usernameError && <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{usernameError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => setEditingUsername(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveUsername} disabled={usernameLoading}>
                {usernameLoading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm dialog ──────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="dialog-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--danger)' }}>Eliminar todos mis datos</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Esta acción es <strong>irreversible</strong>. Se borrarán todos tus contadores, carpetas y datos de Drive.
              Los contadores compartidos donde eres propietario también se eliminarán.
            </p>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Escribe <strong>BORRAR</strong> para confirmar:
            </p>
            <input
              className="input-field"
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              placeholder="BORRAR"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setShowDeleteConfirm(false); setDeleteText('') }}>Cancelar</button>
              <button
                className="btn-danger"
                disabled={deleteText !== 'BORRAR' || deleting}
                onClick={handleDeleteAccount}
              >
                {deleting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
