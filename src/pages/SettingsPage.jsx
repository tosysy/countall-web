import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { auth } from '../firebase/config'
import { isUsernameAvailable, setUsername, signOut as firebaseSignOut } from '../firebase/auth'
import { deleteAccount } from '../firebase/syncManager'
import useAppStore from '../store/appStore'
import styles from './SettingsPage.module.css'

const THEMES = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'system', label: 'Sistema' },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, username, driveToken, theme, setTheme, clearData, history, restoreHistory, removeHistory, clearHistory, counters, folders, gridOrder, folderOrders } = useAppStore()

  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState(username ?? '')
  const [usernameError, setUsernameError] = useState('')
  const [usernameLoading, setUsernameLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const showToast = (t) => { setToast(t); setTimeout(() => setToast(null), 3000) }

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim()
    // Igual que Android: ^[a-zA-Z0-9_]{3,20}$
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
      await deleteAccount(driveToken)
      await auth.currentUser.delete()
      clearData()
      navigate('/login', { replace: true })
    } catch (e) {
      showToast('Error al borrar la cuenta: ' + e.message)
    } finally {
      setDeleting(false)
    }
  }

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
        {/* Profile section */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>PERFIL</p>
          <div className={styles.card}>
            <div className={styles.profileRow}>
              <div className={styles.avatar}>
                {user?.photoURL
                  ? <img src={user.photoURL} alt="foto" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} />
                  : (username ?? user?.displayName ?? '?')[0]?.toUpperCase()
                }
              </div>
              <div className={styles.profileInfo}>
                <span className={styles.profileName}>{username ?? user?.displayName ?? ''}</span>
                <span className={styles.profileEmail}>{user?.email ?? ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Username section */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>NOMBRE DE USUARIO</p>
          <div className={styles.card}>
            {!editingUsername ? (
              <div className={styles.row}>
                <span className={styles.rowLabel}>Usuario</span>
                <div className={styles.rowRight}>
                  <span className={styles.rowValue}>{username ?? '—'}</span>
                  <button className={styles.btnEdit} onClick={() => { setNewUsername(username ?? ''); setEditingUsername(true); setUsernameError('') }}>
                    Editar
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.editBlock}>
                <input
                  className="input-field"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="nombre_usuario"
                  maxLength={30}
                  autoFocus
                />
                {usernameError && <p className={styles.errorText}>{usernameError}</p>}
                <div className={styles.editActions}>
                  <button className="btn-ghost" onClick={() => setEditingUsername(false)}>Cancelar</button>
                  <button className="btn-primary" onClick={handleSaveUsername} disabled={usernameLoading}>
                    {usernameLoading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Theme section */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>APARIENCIA</p>
          <div className={styles.card}>
            <div className={styles.themeRow}>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  className={`${styles.themeBtn} ${theme === t.id ? styles.themeBtnActive : ''}`}
                  onClick={() => setTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Drive sync info */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>SINCRONIZACIÓN</p>
          <div className={styles.card}>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Google Drive</span>
              <span className={styles.rowValue} style={{ color: driveToken ? 'var(--goal-color)' : 'var(--danger)' }}>
                {driveToken ? 'Conectado' : 'No conectado'}
              </span>
            </div>
            <p className={styles.rowSub}>
              Los contadores personales se sincronizan con tu Google Drive privado. Los datos son solo tuyos.
            </p>
          </div>
        </div>

        {/* Account actions */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>CUENTA</p>
          <div className={styles.card}>
            <button className={styles.rowBtn} onClick={handleSignOut}>
              <span className={styles.rowLabel}>Cerrar sesión</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>ZONA DE PELIGRO</p>
          <div className={styles.card}>
            <button className={styles.rowBtnDanger} onClick={() => setShowDeleteConfirm(true)}>
              <span>Borrar cuenta</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>

        {/* History section */}
        {history && history.length > 0 && (
          <div className={styles.section}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
              <p className={styles.sectionLabel} style={{ margin:0 }}>HISTORIAL DE CAMBIOS</p>
              <button className={styles.btnEdit} onClick={() => { if (confirm('¿Borrar todo el historial?')) clearHistory() }}>
                Borrar todo
              </button>
            </div>
            <div className={styles.card} style={{ padding: 0, overflow:'hidden' }}>
              {history.map((h, i) => (
                <div key={h.id} className={styles.historyRow} style={{ borderBottom: i < history.length-1 ? '1px solid var(--card-stroke)' : 'none' }}>
                  <div className={styles.historyInfo}>
                    <span className={styles.historyDesc}>{h.description}</span>
                    <span className={styles.historyDate}>
                      {new Date(h.timestamp).toLocaleDateString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className={styles.btnEdit} onClick={() => {
                      if (confirm('¿Restaurar a este estado? Se perderán los cambios posteriores.')) {
                        restoreHistory(h.id)
                        showToast('Estado restaurado')
                      }
                    }}>
                      Restaurar
                    </button>
                    <button className={styles.btnEdit} style={{ color:'var(--danger)' }} onClick={() => removeHistory(h.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className={styles.version}>CountAll Web · v1.0</p>
      </div>

      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <div className="dialog-backdrop" onClick={() => setShowDeleteConfirm(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--danger)' }}>Borrar cuenta</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Esta acción es <strong>irreversible</strong>. Se borrarán todos tus contadores, carpetas y datos de Drive. Los contadores compartidos donde eres propietario también se eliminarán.
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
                {deleting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Borrar cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
