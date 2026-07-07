import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { auth } from '../firebase/config'
import { isUsernameAvailable, setUsername, signOut as firebaseSignOut, linkGoogleAccount, linkedProviders } from '../firebase/auth'
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

  // Editor por campo (filas independientes, como Android)
  const openFieldEditor = (field) => {
    setPFullName(profile?.fullName ?? '')
    setPGender(profile?.gender ?? '')
    setPBirthDate(profile?.birthDate ? new Date(profile.birthDate).toISOString().slice(0, 10) : '')
    setPInstagram(profile?.instagram ?? '')
    setEditingProfile(field) // 'fullName' | 'birthDate' | 'instagram' | 'gender'
  }

  const handleSaveField = async () => {
    setPSaving(true)
    try {
      const field = editingProfile
      const patch = {}
      const local = {}
      if (field === 'fullName') { patch.fullName = pFullName.trim(); local.fullName = pFullName.trim() }
      if (field === 'instagram') { patch.instagram = pInstagram; local.instagram = pInstagram.replace(/^@/, '').trim() || null }
      if (field === 'gender') { patch.gender = pGender || undefined; local.gender = pGender || profile?.gender }
      if (field === 'birthDate') {
        const ts = pBirthDate ? new Date(pBirthDate + 'T00:00:00').getTime() : undefined
        patch.birthDate = ts
        patch.birthDateVisible = profile?.birthDateVisible ?? false
        local.birthDate = ts ?? profile?.birthDate
      }
      await saveProfileFields(patch)
      setProfile(p => ({ ...p, ...local }))
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

        {/* ── CUENTA (como activity_settings.xml) ─────────────── */}
        <p className={styles.sectionLabel}>CUENTA</p>
        <div className={styles.card}>

          {/* Cabecera: avatar (clic = cambiar foto) + nombre/@usuario (clic = mi perfil) */}
          <button className={styles.rowBtn} style={{ padding: '18px 20px' }}
            onClick={() => (username || user?.uid) && navigate(`/user/${username || user.uid}`)}>
            <div className={styles.avatarSmall} style={{ width: 60, height: 60, fontSize: 24 }}
              onClick={e => { e.stopPropagation(); photoInputRef.current?.click() }}
              title="Cambiar foto de perfil">
              {profile?.photoUrl
                ? <img src={profile.photoUrl} alt="foto" className={styles.avatarImg} />
                : avatarLetter
              }
            </div>
            <div className={styles.rowTextCol} style={{ marginLeft: 6 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                {profile?.fullName || displayName || '—'}
              </span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
                @{displayName || '—'}
              </span>
            </div>
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePickProfilePhoto} />

          <div className={styles.divider} />

          {/* Estado de Google (icono Google + texto, como Android) */}
          {(() => {
            const googleLinked = linkedProviders().includes('google.com')
            const GoogleIcon = (
              <svg viewBox="0 0 24 24" width="22" height="22" style={{ flexShrink: 0 }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )
            return googleLinked ? (
              <div className={styles.row}>
                {GoogleIcon}
                <span style={{ fontSize: 14, color: 'var(--text-primary)', marginLeft: 14 }}>
                  Cuenta de Google vinculada · {user?.email ?? ''}
                </span>
              </div>
            ) : (
              <button className={styles.rowBtn} onClick={async () => {
                try {
                  await linkGoogleAccount()
                  showToast('Cuenta de Google vinculada')
                } catch (e) {
                  showToast(e.code === 'auth/credential-already-in-use'
                    ? 'Esa cuenta de Google ya está en uso'
                    : 'No se pudo vincular: ' + e.message)
                }
              }}>
                {GoogleIcon}
                <span style={{ fontSize: 14, color: 'var(--text-primary)', marginLeft: 14, flex: 1, textAlign: 'left' }}>
                  Vincula tu cuenta de Google
                </span>
              </button>
            )
          })()}

          <div className={styles.divider} />

          {/* Cerrar sesión — icono logout rojo, como Android */}
          <button className={styles.rowBtn} onClick={handleSignOut} disabled={signingOut}>
            {signingOut
              ? <span className="spinner" style={{ width: 20, height: 20, flexShrink: 0 }} />
              : <svg viewBox="0 0 24 24" width="22" height="22" fill="#EF5350" style={{ flexShrink: 0 }}>
                  <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                </svg>
            }
            <span style={{ fontSize: 15, color: '#EF5350', marginLeft: 16 }}>
              {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </span>
          </button>
        </div>

        {/* ── PERFIL (filas editables como Android) ───────────── */}
        <p className={styles.sectionLabel}>PERFIL</p>
        <div className={styles.card}>

          {[
            { id: 'fullName', label: 'Nombre completo', value: profile?.fullName || '—' },
            { id: 'username', label: 'Nombre de usuario', value: displayName || '—' },
          ].map(row => (
            <div key={row.id}>
              <button className={styles.rowBtn} onClick={() => {
                if (row.id === 'username') { setNewUsername(username ?? ''); setEditingUsername(true); setUsernameError('') }
                else openFieldEditor(row.id)
              }}>
                <div className={styles.rowTextCol} style={{ flex: 1 }}>
                  <span className={styles.rowSublabel}>{row.label}</span>
                  <span className={styles.rowBoldValue}>{row.value}</span>
                </div>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
              </button>
              <div className={styles.divider} />
            </div>
          ))}

          {/* Fecha de nacimiento + switch de visibilidad */}
          <div className={styles.row} style={{ paddingRight: 20 }}>
            <button className={styles.rowBtn} style={{ flex: 1, padding: '14px 12px 14px 20px' }}
              onClick={() => openFieldEditor('birthDate')}>
              <div className={styles.rowTextCol} style={{ flex: 1 }}>
                <span className={styles.rowSublabel}>Fecha de nacimiento</span>
                <span className={styles.rowBoldValue}>
                  {profile?.birthDate
                    ? new Date(profile.birthDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '—'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Mostrar en mi perfil</span>
              </div>
            </button>
            <button
              className={`${styles.toggle} ${profile?.birthDateVisible ? styles.toggleOn : ''}`}
              onClick={async () => {
                const v = !profile?.birthDateVisible
                setProfile(p => ({ ...p, birthDateVisible: v }))
                await saveProfileFields({ birthDate: profile?.birthDate ?? 0, birthDateVisible: v }).catch(() => {})
              }}>
              <div className={styles.toggleThumb} />
            </button>
          </div>

          <div className={styles.divider} />

          {/* Instagram */}
          <button className={styles.rowBtn} onClick={() => openFieldEditor('instagram')}>
            <div className={styles.rowTextCol} style={{ flex: 1 }}>
              <span className={styles.rowSublabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95C23.78 2.7 21.35.27 17 .07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zM12 16a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm6.4-11.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44z"/></svg>
                Instagram
              </span>
              <span className={styles.rowBoldValue}>{profile?.instagram || '—'}</span>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>

          <div className={styles.divider} />

          {/* Género */}
          <button className={styles.rowBtn} onClick={() => openFieldEditor('gender')}>
            <div className={styles.rowTextCol} style={{ flex: 1 }}>
              <span className={styles.rowSublabel}>Género</span>
              <span className={styles.rowBoldValue}>
                {{ male: 'Hombre', female: 'Mujer', other: 'Otro', na: 'Prefiero no decirlo' }[profile?.gender] ?? '—'}
              </span>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
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

        {/* ── HISTORIAL DE CAMBIOS ─────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p className={styles.sectionLabel} style={{ flex: 1 }}>HISTORIAL DE CAMBIOS</p>
          {history?.length > 0 && (
            <button
              onClick={() => { if (confirm('¿Borrar todo el historial?')) clearHistory() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8,
                fontSize: 13, color: '#EF5350', fontFamily: 'inherit' }}>
              Borrar todo
            </button>
          )}
        </div>
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

      {/* ── Editor de un campo del perfil (como los diálogos de Android) ── */}
      {editingProfile && (
        <div className="dialog-backdrop" onClick={() => setEditingProfile(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>{{
              fullName: 'Nombre completo',
              birthDate: 'Fecha de nacimiento',
              instagram: 'Instagram',
              gender: 'Género',
            }[editingProfile]}</h3>

            {editingProfile === 'fullName' && (
              <input className="input-field" value={pFullName} maxLength={50} autoFocus
                placeholder="Nombre y apellidos"
                onChange={e => setPFullName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveField()} />
            )}

            {editingProfile === 'birthDate' && (
              <input className="input-field" type="date" value={pBirthDate} autoFocus
                onChange={e => setPBirthDate(e.target.value)} />
            )}

            {editingProfile === 'instagram' && (
              <input className="input-field" value={pInstagram} maxLength={30} autoFocus
                placeholder="@tu_instagram"
                onChange={e => setPInstagram(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveField()} />
            )}

            {editingProfile === 'gender' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { id: 'male', label: 'Hombre' },
                  { id: 'female', label: 'Mujer' },
                  { id: 'other', label: 'Otro' },
                  { id: 'na', label: 'Prefiero no decirlo' },
                ].map(g => (
                  <button key={g.id}
                    onClick={() => setPGender(g.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      borderRadius: 12, cursor: 'pointer', fontSize: 15, fontFamily: 'inherit',
                      color: 'var(--text-primary)', textAlign: 'left',
                      border: '1.5px solid ' + (pGender === g.id ? 'var(--text-primary)' : 'var(--card-stroke)'),
                      background: pGender === g.id ? 'var(--log-card-bg)' : 'transparent' }}>
                    <div className={`${styles.radio} ${pGender === g.id ? styles.radioOn : ''}`}>
                      {pGender === g.id && <div className={styles.radioDot} />}
                    </div>
                    {g.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn-ghost" onClick={() => setEditingProfile(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveField} disabled={pSaving}>
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
