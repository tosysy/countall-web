import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithGoogle, signInWithEmail, registerWithEmail, resetPassword } from '../firebase/auth'
import useAppStore from '../store/appStore'
import styles from './LoginPage.module.css'

const ERROR_ES = {
  'auth/invalid-email': 'El correo no es válido.',
  'auth/user-not-found': 'No existe ninguna cuenta con ese correo.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
}

export default function LoginPage({ onDriveToken }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [mode, setMode] = useState('menu') // menu | email
  const [emailMode, setEmailMode] = useState('login') // login | register
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { setUser } = useAppStore()
  const navigate = useNavigate()

  const handleSignIn = async () => {
    setLoading(true)
    setError(null); setInfo(null)
    try {
      const result = await signInWithGoogle()
      if (!result) return // redirect en curso
      const { user, accessToken } = result
      setUser({ uid: user.uid, displayName: user.displayName, photoURL: user.photoURL, email: user.email })
      if (accessToken) onDriveToken?.(accessToken)
      navigate('/', { replace: true })
    } catch (e) {
      setError('No se pudo iniciar sesión. Inténtalo de nuevo.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSubmit = async () => {
    if (!email.trim() || !password) { setError('Rellena correo y contraseña.'); return }
    setLoading(true)
    setError(null); setInfo(null)
    try {
      if (emailMode === 'register') {
        await registerWithEmail(email, password)
        setInfo('Cuenta creada. Revisa tu correo y pulsa el enlace de verificación; después inicia sesión.')
        setEmailMode('login')
      } else {
        const user = await signInWithEmail(email, password)
        setUser({ uid: user.uid, displayName: user.displayName, photoURL: user.photoURL, email: user.email })
        navigate('/', { replace: true })
      }
    } catch (e) {
      setError(e.code === 'auth/email-not-verified' ? e.message : (ERROR_ES[e.code] ?? 'Error: ' + e.message))
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async () => {
    if (!email.trim()) { setError('Escribe tu correo para restablecer la contraseña.'); return }
    setLoading(true)
    setError(null); setInfo(null)
    try {
      await resetPassword(email)
      setInfo('Te hemos enviado un correo para restablecer la contraseña.')
    } catch (e) {
      setError(ERROR_ES[e.code] ?? 'Error: ' + e.message)
    } finally { setLoading(false) }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <img
              src={`${import.meta.env.BASE_URL}icon-192.png`}
              alt="CountAll"
              width="72"
              height="72"
              style={{ borderRadius: 16 }}
            />
          </div>
          <h1 className={styles.title}>CountAll</h1>
          <p className={styles.subtitle}>Contadores personales y compartidos</p>
        </div>

        {mode === 'menu' && (
          <>
            <button className={styles.googleBtn} onClick={handleSignIn} disabled={loading}>
              {loading ? (
                <span className="spinner" />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continuar con Google
                </>
              )}
            </button>

            <button className={styles.emailBtn} onClick={() => { setMode('email'); setError(null); setInfo(null) }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              Continuar con correo
            </button>
          </>
        )}

        {mode === 'email' && (
          <div className={styles.emailForm}>
            <input className={styles.input} type="email" autoComplete="email"
              placeholder="Correo electrónico" value={email}
              onChange={e => setEmail(e.target.value)} />
            <input className={styles.input} type="password"
              autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}
              placeholder="Contraseña" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()} />

            <button className={styles.googleBtn} onClick={handleEmailSubmit} disabled={loading}>
              {loading ? <span className="spinner" />
                : emailMode === 'register' ? 'Crear cuenta' : 'Entrar'}
            </button>

            <div className={styles.emailLinks}>
              <button className={styles.linkBtn}
                onClick={() => { setEmailMode(m => m === 'login' ? 'register' : 'login'); setError(null); setInfo(null) }}>
                {emailMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
              </button>
              {emailMode === 'login' && (
                <button className={styles.linkBtn} onClick={handleForgot}>
                  He olvidado mi contraseña
                </button>
              )}
              <button className={styles.linkBtn} onClick={() => { setMode('menu'); setError(null); setInfo(null) }}>
                ← Otras opciones
              </button>
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
        {info && <p className={styles.info}>{info}</p>}

        {mode === 'menu' && (
          <p className={styles.note}>
            Tus contadores se sincronizan con tu cuenta en todos tus dispositivos.
          </p>
        )}
      </div>
    </div>
  )
}
