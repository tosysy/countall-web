import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { auth } from '../firebase/config'
import { isUsernameAvailable, setUsername as saveUsername } from '../firebase/auth'
import { saveProfileFields, uploadProfilePhoto } from '../firebase/profileManager'
import useAppStore from '../store/appStore'
import styles from './OnboardingPage.module.css'

/**
 * Onboarding tras el primer inicio de sesión — mismo flujo de 6 pasos que
 * Android: usuario → nombre completo → género → fecha de nacimiento →
 * Instagram (opcional) → foto de perfil (opcional).
 */
const STEPS = ['username', 'fullName', 'gender', 'birthDate', 'instagram', 'photo']

export default function OnboardingPage() {
  const navigate = useNavigate()
  const setStoreUsername = useAppStore(s => s.setUsername)

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [gender, setGender] = useState(null)
  const [birthDay, setBirthDay] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [birthVisible, setBirthVisible] = useState(false)
  const [instagram, setInstagram] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const fileInputRef = useRef(null)

  const progress = ((step + 1) / STEPS.length) * 100
  const current = STEPS[step]

  const birthTimestamp = () => {
    const d = parseInt(birthDay), m = parseInt(birthMonth), y = parseInt(birthYear)
    if (!d || !m || !y) return null
    const date = new Date(y, m - 1, d)
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
    if (date > new Date() || y < 1900) return null
    return date.getTime()
  }

  const validateStep = async () => {
    setError('')
    switch (current) {
      case 'username': {
        const t = username.trim()
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(t)) { setError('3–20 caracteres: letras, números y _'); return false }
        setSaving(true)
        try {
          const free = await isUsernameAvailable(t)
          if (!free) { setError('Ese nombre de usuario ya está en uso'); return false }
        } finally { setSaving(false) }
        return true
      }
      case 'fullName':
        if (!fullName.trim()) { setError('Escribe tu nombre'); return false }
        return true
      case 'gender':
        if (!gender) { setError('Selecciona una opción'); return false }
        return true
      case 'birthDate':
        if (birthTimestamp() == null) { setError('Fecha no válida'); return false }
        return true
      default:
        return true // instagram y foto son opcionales
    }
  }

  const handleNext = async () => {
    if (!(await validateStep())) return
    if (step < STEPS.length - 1) { setStep(step + 1); return }
    // Último paso → guardar todo
    setSaving(true)
    setError('')
    try {
      const t = username.trim()
      await saveUsername(t)
      await updateProfile(auth.currentUser, { displayName: t })
      setStoreUsername(t)
      await saveProfileFields({
        fullName: fullName.trim(),
        gender,
        birthDate: birthTimestamp(),
        birthDateVisible: birthVisible,
        instagram: instagram.trim() || undefined,
      })
      if (photoFile) await uploadProfilePhoto(photoFile).catch(() => {})
      navigate('/', { replace: true })
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally { setSaving(false) }
  }

  const handlePickPhoto = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPhotoFile(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  const GENDERS = [
    { id: 'male',   label: 'Hombre',            icon: '👨' },
    { id: 'female', label: 'Mujer',             icon: '👩' },
    { id: 'other',  label: 'Otro',              icon: '🧑' },
    { id: 'na',     label: 'Prefiero no decirlo', icon: '🤐' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.stepLabel}>Paso {step + 1} de {STEPS.length}</p>

        {current === 'username' && (
          <>
            <h2 className={styles.title}>Elige tu nombre de usuario</h2>
            <p className={styles.subtitle}>Así te encontrarán tus amigos.</p>
            <input className={styles.input} value={username} autoFocus
              placeholder="usuario_123" maxLength={20}
              onChange={e => setUsername(e.target.value)} />
          </>
        )}

        {current === 'fullName' && (
          <>
            <h2 className={styles.title}>¿Cómo te llamas?</h2>
            <p className={styles.subtitle}>Tu nombre se muestra en tu perfil.</p>
            <input className={styles.input} value={fullName} autoFocus
              placeholder="Nombre y apellidos" maxLength={50}
              onChange={e => setFullName(e.target.value)} />
          </>
        )}

        {current === 'gender' && (
          <>
            <h2 className={styles.title}>Género</h2>
            <div className={styles.genderGrid}>
              {GENDERS.map(g => (
                <button key={g.id}
                  className={`${styles.genderCard} ${gender === g.id ? styles.genderActive : ''}`}
                  onClick={() => setGender(g.id)}>
                  <span className={styles.genderIcon}>{g.icon}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </>
        )}

        {current === 'birthDate' && (
          <>
            <h2 className={styles.title}>Fecha de nacimiento</h2>
            <div className={styles.dateRow}>
              <input className={styles.dateInput} inputMode="numeric" placeholder="Día"
                value={birthDay} maxLength={2} onChange={e => setBirthDay(e.target.value.replace(/\D/g, ''))} />
              <input className={styles.dateInput} inputMode="numeric" placeholder="Mes"
                value={birthMonth} maxLength={2} onChange={e => setBirthMonth(e.target.value.replace(/\D/g, ''))} />
              <input className={styles.dateInput} inputMode="numeric" placeholder="Año"
                value={birthYear} maxLength={4} onChange={e => setBirthYear(e.target.value.replace(/\D/g, ''))} />
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={birthVisible} onChange={e => setBirthVisible(e.target.checked)} />
              Mostrar mi fecha de nacimiento en mi perfil
            </label>
          </>
        )}

        {current === 'instagram' && (
          <>
            <h2 className={styles.title}>Instagram <span className={styles.optional}>(opcional)</span></h2>
            <p className={styles.subtitle}>Enlázalo para que aparezca en tu perfil.</p>
            <div className={styles.igRow}>
              <span className={styles.igAt}>@</span>
              <input className={styles.input} value={instagram}
                placeholder="tu_instagram" maxLength={30}
                onChange={e => setInstagram(e.target.value.replace(/^@/, ''))} />
            </div>
          </>
        )}

        {current === 'photo' && (
          <>
            <h2 className={styles.title}>Foto de perfil <span className={styles.optional}>(opcional)</span></h2>
            <div className={styles.photoWrap}>
              <button className={styles.photoCircle} onClick={() => fileInputRef.current?.click()}>
                {photoPreview
                  ? <img src={photoPreview} alt="" className={styles.photoImg} />
                  : <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                }
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePickPhoto} />
              <p className={styles.subtitle}>{photoPreview ? 'Toca para cambiarla' : 'Toca para elegir una imagen'}</p>
            </div>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.nav}>
          {step > 0 && (
            <button className={styles.btnBack} onClick={() => { setError(''); setStep(step - 1) }} disabled={saving}>
              Atrás
            </button>
          )}
          <button className={styles.btnNext} onClick={handleNext} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 16, height: 16 }} />
              : step === STEPS.length - 1 ? 'Terminar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
