import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { auth } from '../firebase/config'
import { isUsernameAvailable, setUsername, signOut as firebaseSignOut } from '../firebase/auth'
import { deleteAccount } from '../firebase/syncManager'
import { unregisterFcmToken } from '../firebase/messagingManager'
import { getOwnProfile, saveProfileFields, uploadProfilePhoto } from '../firebase/profileManager'
import { useEffect, useRef } from 'react'
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
  const [signingOut, setSigningOut] = useState(false)
  const [hideSyncNotif, setHideSyncNotif] = useState(false)

  // ── Perfil público (foto, nombre, género, fecha, Instagram) ──────────────
  const [profile, setProfile] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [pFullName, setPFullName] = useState('')
  const [pGender, setPGender] = useState('')
  const [pBirthDate, setPBirthDate] = useState('') // yyyy-mm-dd para <input type=date>
  const [pBirthVisible, setPBirthVisible] = useState(false)
  const [pInstagram, setPInstagram] = useState('')
  const [pSaving, setPSaving] = useState(false)
  const photoInputRef = useRef(null)

  useEffect(() => {
    getOwnProfile().then(p => { if (p) setProfile(p) }).catch(() => {})
  }, [])

  const openProfileEditor = () => {
    setPFullName(profile?.fullName ?? '')
    setPGender(profile?.gender ?? '')
    setPBirthDate(profile?.birthDate ? new Date(profile.birthDate).toISOString().slice(0, 10) : '')
    setPBirthVisible(profile?.birthDateVisible ?? false)
    setPInstagram(profile?.instagram ?? '')
    setEditingProfile(true)
  }

  const handleSaveProfile = async () => {
    setPSaving(true)
    try {
      const birthTs = pBirthDate ? new Date(pBirthDate + 'T00:00:00').getTime() : undefined
      await saveProfileFields({
        fullName: pFullName.trim(),
        gender: pGender || undefined,
        birthDate: birthTs,
        birthDateVisible: pBirthVisible,
        instagram: pInstagram,
      })
      setProfile(p => ({
        ...p, fullName: pFullName.trim(), gender: pGender || p?.gender,
        birthDate: birthTs ?? p?.birthDate, birthDateVisible: pBirthVisible,
        instagram: pInstagram.replace(/^@/, '').trim() || null,
      }))
      setEditingProfile(false)
      showToast('Perfil actualizado')
    } catch (e) { showToast('Error: ' + e.message) }
    finally { setPSaving(false) }
  }

  const handlePickProfilePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const url = await uploadProfilePhoto(file)
      setProfile(p => ({ ...p, photoUrl: url }))
      showToast('Foto actualizada')
    } catch (err) { showToast('Error al subir la foto: ' + err.message) }
  }

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
    setSigningOut(true)
    // Retirar el token FCM ANTES de perder la sesión (necesita el uid)
    await unregisterFcmToken().catch(() => {})
    // Firebase sign-out dispara onAuthStateChanged(null) en App.jsx,
    // que se encarga de limpiar datos y navegar al login.
    await firebaseSignOut()
    // clearData y navigate los gestiona App.jsx → nada más que hacer aquí.
  }

  const handleDeleteAccount = async () => {
    if (deleteText !== 'BORRAR') return
    setDeleting(true)
    try {
      await unregisterFcmToken().catch(() => {})
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
    <div className={styles.inner}>
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

          {/* Foto de perfil */}
          <button className={styles.rowBtn} onClick={() => photoInputRef.current?.click()}>
            <div className={styles.avatarSmall}>
              {profile?.photoUrl
                ? <img src={profile.photoUrl} alt="foto" className={styles.avatarImg} />
                : avatarLetter
              }
            </div>
            <div className={styles.rowTextCol}>
              <span className={styles.rowSublabel}>Foto de perfil</span>
              <span className={styles.rowBoldValue}>{profile?.photoUrl ? 'Cambiar foto' : 'Añadir foto'}</span>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePickProfilePhoto} />

          <div className={styles.divider} />

          {/* Username row */}
          <button className={styles.rowBtn} onClick={() => { setNewUsername(username ?? ''); setEditingUsername(true); setUsernameError('') }}>
            <div className={styles.iconCircleGreen}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
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

          {/* Perfil público */}
          <button className={styles.rowBtn} onClick={openProfileEditor}>
            <div className={styles.iconCircleGreen}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </div>
            <div className={styles.rowTextCol}>
              <span className={styles.rowSublabel}>Perfil público</span>
              <span className={styles.rowBoldValue}>{profile?.fullName || 'Completar perfil'}</span>
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
          <button className={styles.rowBtn} onClick={handleSignOut} disabled={signingOut}>
            <div className={styles.iconTriangleRed}>
              {signingOut
                ? <span className="spinner" style={{ width: 16, height: 16 }} />
                : <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
              }
            </div>
            <span className={styles.rowDanger}>{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión de Google'}</span>
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
    </div>{/* end .inner */}

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

      {/* ── Profile editor dialog ──────────────────────────────── */}
      {editingProfile && (
        <div className="dialog-backdrop" onClick={() => setEditingProfile(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()} style={{ maxHeight: '85dvh', overflowY: 'auto' }}>
            <h3>Perfil público</h3>

            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '10px 0 4px' }}>Nombre completo</p>
            <input className="input-field" value={pFullName} maxLength={50}
              placeholder="Nombre y apellidos"
              onChange={e => setPFullName(e.target.value)} />

            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '10px 0 4px' }}>Género</p>
            <select className="input-field" value={pGender} onChange={e => setPGender(e.target.value)}>
              <option value="">—</option>
              <option value="male">Hombre</option>
              <option value="female">Mujer</option>
              <option value="other">Otro</option>
              <option value="na">Prefiero no decirlo</option>
            </select>

            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '10px 0 4px' }}>Fecha de nacimiento</p>
            <input className="input-field" type="date" value={pBirthDate}
              onChange={e => setPBirthDate(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', margin: '8px 0' }}>
              <input type="checkbox" checked={pBirthVisible} onChange={e => setPBirthVisible(e.target.checked)} />
              Mostrarla en mi perfil
            </label>

            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '10px 0 4px' }}>Instagram</p>
            <input className="input-field" value={pInstagram} maxLength={30}
              placeholder="@tu_instagram"
              onChange={e => setPInstagram(e.target.value)} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn-ghost" onClick={() => setEditingProfile(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveProfile} disabled={pSaving}>
                {pSaving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Guardar'}
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
