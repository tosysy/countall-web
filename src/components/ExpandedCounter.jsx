import { useState, useEffect, useRef } from 'react'
import styles from './ExpandedCounter.module.css'
import DatePicker from './DatePicker'
import ColorPicker from './ColorPicker'
import CompetitivePodium, { getProgressColor } from './CompetitivePodium'
import { pushCounterUpdate, getMembers, setMemberRole, removeMember, sendInvitation, getInviteCode, shareCounter, unshareCounter, requestEditPermission, bumpBgVersion, getFriends } from '../firebase/syncManager'
import { uploadBackground as storageUpload, sharedCounterPath } from '../firebase/storageManager'
import { uploadBackground as driveUploadBg, deleteBackground as driveDeleteBg } from '../firebase/driveManager'
import useAppStore from '../store/appStore'

const ROLE_BADGE = { owner: '👑', editor: '✏️', viewer: '👁️' }

// URL base para compartir — los QR y los "Copiar enlace" apuntan aquí
const INVITE_BASE = 'https://tosysy.github.io/countall-web/?code='
const inviteUrl = (code) => INVITE_BASE + code

// QR code via free API (no library needed)
const qrUrl = (code) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=ffffff&color=000000&data=${encodeURIComponent(inviteUrl(code))}`

function luminance(hex) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 0.5
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255
  return 0.299*r + 0.587*g + 0.114*b
}

export default function ExpandedCounter({ counter, onClose, onUpdate, onDelete, onIncrement, onDecrement, initialShowMenu = false, initialTab = 'log', onRemoveFromFolder }) {
  const { user, username, driveToken } = useAppStore()

  const isOwner = counter.role === 'owner'
  const canEdit = counter.role === 'owner' || counter.role === 'editor'
  const bg = counter.backgroundImageLocal || counter.backgroundImageUrl
  const cardColor = counter.color

  // Estilos automáticos de botones hero (igual que CounterCard)
  const heroBtnMinusStyle = (bg || cardColor) ? { background: '#ffffff', color: '#333' } : {}
  const heroBtnPlusStyle  = cardColor
    ? { background: cardColor, color: luminance(cardColor) > 0.55 ? '#333' : '#fff' }
    : bg ? { background: '#ffffff', color: '#333' } : {}

  // Tabs
  const tabs = [
    'log',
    ...(counter.isCompetitive ? ['competitive'] : []),
    'settings',
    ...(counter.isShared ? ['members'] : []),
  ]
  const tabLabels = { log: 'Notas', competitive: 'Podio', settings: 'Ajustes', members: 'Miembros' }
  const [tab, setTab] = useState(initialTab)

  // Hero states
  const [showMenu, setShowMenu]         = useState(initialShowMenu)
  const [editingName, setEditingName]   = useState(false)
  const [name, setName]                 = useState(counter.name)
  const [editValue, setEditValue]       = useState(false)
  const [valueInput, setValueInput]     = useState(String(counter.value))

  // Settings states
  const [incrementInput, setIncrementInput] = useState(String(counter.increment))
  const [targetInput, setTargetInput]       = useState(counter.target != null ? String(counter.target) : '')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showQr, setShowQr]                 = useState(false)

  // Members states
  const [members, setMembers]           = useState([])
  const [friends, setFriends]           = useState([])
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole, setInviteRole]     = useState('viewer')
  const [inviteCode, setInviteCode]     = useState(null)

  // Misc
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState(null)
  const menuRef = useRef(null)        // botón ⋮
  const menuDropRef = useRef(null)    // dropdown portal
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  // Computed display value
  const myUid = user?.uid
  const myScore = counter.competitorScores?.[myUid] ?? 0
  const totalScore = Object.values(counter.competitorScores ?? {}).reduce((a, b) => a + b, 0)
  const displayValue = counter.isCompetitive ? totalScore : counter.value

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'members' && counter.isShared) {
      loadMembers()
      if (isOwner && friends.length === 0)
        getFriends().then(list => setFriends(list.filter(f => f.status === 'accepted')))
    }
  }, [tab])
  useEffect(() => {
    if (counter.isShared && isOwner) getInviteCode(counter.sharedId).then(c => setInviteCode(c))
  }, [counter.sharedId])
  useEffect(() => {
    if (!showMenu) return
    const h = (e) => {
      if (!menuRef.current?.contains(e.target) && !menuDropRef.current?.contains(e.target))
        setShowMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showMenu])

  // ── Helpers ──────────────────────────────────────────────────────────────
  const showMsg = (text, error = false) => { setMsg({ text, error }); setTimeout(() => setMsg(null), 3000) }
  const loadMembers = async () => {
    if (!counter.sharedId) return
    const roleOrder = { owner: 0, editor: 1, viewer: 2 }
    const list = await getMembers(counter.sharedId)
    // Sort: owner first, then editor, then viewer. Fix empty owner username.
    const sorted = [...list]
      .sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3))
      .map(m => ({
        ...m,
        username: m.username || (m.uid === user?.uid ? username : counter.ownerUsername) || m.username,
      }))
    setMembers(sorted)
  }

  // ── Save handlers ────────────────────────────────────────────────────────
  const saveName = () => {
    setEditingName(false)
    const trimmed = name.trim().slice(0, 15)
    if (!trimmed || trimmed === counter.name) return
    onUpdate({ name: trimmed })
    if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, name: trimmed })
  }

  const saveValue = () => {
    setEditValue(false)
    const v = parseInt(valueInput, 10)
    if (isNaN(v) || v < 0) return
    onUpdate({ value: v })
    if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, value: v })
  }

  const saveSettings = () => {
    const inc = Math.max(1, parseInt(incrementInput, 10) || 1)
    const tgtRaw = parseInt(targetInput, 10)
    const tgt = targetInput.trim() && !isNaN(tgtRaw) ? Math.max(1, tgtRaw) : null
    const patch = { increment: inc, target: tgt }
    onUpdate(patch)
    if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, ...patch })
    showMsg('Guardado')
  }

  const toggleCompetitive = () => {
    if (!isOwner || !counter.isShared) return
    const patch = { isCompetitive: !counter.isCompetitive }
    onUpdate(patch)
    pushCounterUpdate({ ...counter, ...patch })
    showMsg(patch.isCompetitive ? 'Modo competitivo activado' : 'Modo competitivo desactivado')
  }

  const applyColor = (color) => {
    onUpdate({ color })
    if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, color })
  }

  // ── Log entries ──────────────────────────────────────────────────────────
  const updateLogField = (i, field, value) => {
    const base = [...(counter.logEntries ?? [])]
    while (base.length <= i) base.push({ text: '', date: Date.now() })
    const newEntries = base.map((e, idx) => idx === i ? { ...e, [field]: value } : e)
    onUpdate({ logEntries: newEntries })
    if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, logEntries: newEntries })
  }

  // ── Sharing ──────────────────────────────────────────────────────────────
  const handleShare = async () => {
    setLoading(true); setShowMenu(false)
    try {
      const { sharedId, inviteCode: code } = await shareCounter(counter)
      onUpdate({ isShared: true, sharedId, role: 'owner', ownerId: user.uid, ownerUsername: username })
      setInviteCode(code)
      showMsg('Contador compartido ✓')
    } catch (e) { showMsg('Error: ' + e.message, true) }
    finally { setLoading(false) }
  }

  const handleUnshare = async () => {
    if (!confirm('¿Dejar de compartir este contador?')) return
    setLoading(true)
    try {
      await unshareCounter(counter)
      onUpdate({ isShared: false, sharedId: null, role: 'owner' })
      showMsg('Dejaste de compartir')
    } catch (e) { showMsg('Error: ' + e.message, true) }
    finally { setLoading(false) }
  }

  const handleInvite = async () => {
    if (!inviteUsername.trim()) return
    setLoading(true)
    try {
      await sendInvitation(counter.sharedId, counter.name, inviteUsername.trim(), inviteRole)
      setInviteUsername('')
      showMsg('Invitación enviada ✓')
    } catch (e) { showMsg(e.message, true) }
    finally { setLoading(false) }
  }

  const handleCopyCode = () => {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteUrl(inviteCode)).catch(() => {})
    showMsg('Enlace copiado ✓')
  }

  // ── Background ───────────────────────────────────────────────────────────
  const handleBgImage = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return
      const url = URL.createObjectURL(file)
      if (counter.isShared) {
        try {
          const uploadedUrl = await storageUpload(sharedCounterPath(counter.sharedId), file)
          onUpdate({ backgroundImageUrl: uploadedUrl, backgroundImageLocal: url })
          pushCounterUpdate({ ...counter, backgroundImageUrl: uploadedUrl })
        } catch { onUpdate({ backgroundImageLocal: url }) }
      } else {
        onUpdate({ backgroundImageLocal: url })
        // Upload to Drive for cross-device sync (igual que Android pushPersonalCounterBackground)
        if (driveToken) {
          driveUploadBg(counter.id, file, driveToken)
            .then(() => bumpBgVersion())
            .catch(() => {}) // fail silently — background stays local
        }
      }
    }
    input.click()
  }

  const removeBg = () => {
    onUpdate({ backgroundImageUrl: null, backgroundImageLocal: null })
    if (counter.isShared) {
      pushCounterUpdate({ ...counter, backgroundImageUrl: null })
    } else if (driveToken) {
      // Delete from Drive (igual que Android deleteCounterBackground para personales)
      driveDeleteBg(counter.id, driveToken).catch(() => {})
      bumpBgVersion().catch(() => {})
    }
  }

  // ── Reset / Abandon / Request edit ──────────────────────────────────────────
  const handleReset = () => {
    if (!confirm('¿Reiniciar el contador a 0?')) return
    setShowMenu(false)
    if (counter.isCompetitive && counter.isShared) {
      const uid = myUid; if (!uid) return
      const newScores = { ...counter.competitorScores, [uid]: 0 }
      const newTotal = Object.values(newScores).reduce((a, b) => a + b, 0)
      const patch = { competitorScores: newScores, value: newTotal, logEntries: [] }
      onUpdate(patch)
      pushCounterUpdate({ ...counter, ...patch })
    } else {
      const patch = { value: 0, logEntries: [] }
      onUpdate(patch)
      if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, ...patch })
    }
    showMsg('Contador reiniciado')
  }

  const handleAbandon = async () => {
    if (!confirm('¿Abandonar este contador compartido?')) return
    setLoading(true); setShowMenu(false)
    try {
      await unshareCounter(counter)
      onDelete()
    } catch (e) { showMsg('Error: ' + e.message, true) }
    finally { setLoading(false) }
  }

  const handleRequestEdit = async () => {
    setLoading(true); setShowMenu(false)
    try {
      await requestEditPermission(counter)
      showMsg('Solicitud enviada ✓')
    } catch (e) { showMsg(e.message, true) }
    finally { setLoading(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
    <div className={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.panel}>

        {/* ── HERO WRAP — zona gris con padding alrededor de la tarjeta ── */}
        <div className={styles.heroWrap}>

          {/* Barra superior: cerrar · título · menú (sobre fondo del panel) */}
          <div className={styles.heroTop}>
            <button className={styles.heroBtn} onClick={onClose} aria-label="Cerrar">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>

            <div className={styles.heroTitleWrap}>
              {editingName ? (
                <input className={styles.heroNameInput} value={name} autoFocus maxLength={15}
                  onChange={e => setName(e.target.value)}
                  onBlur={saveName} onKeyDown={e => e.key === 'Enter' && saveName()} />
              ) : (
                <button className={styles.heroName} onClick={() => canEdit && setEditingName(true)}>
                  {counter.isShared && ROLE_BADGE[counter.role] && <span className={styles.roleBadge}>{ROLE_BADGE[counter.role]}</span>}
                  {counter.name}
                </button>
              )}
            </div>

            {/* ⋮ menu */}
            <div ref={menuRef}>
              <button className={styles.heroBtn} aria-label="Menú"
                onClick={() => {
                  if (menuRef.current) {
                    const r = menuRef.current.getBoundingClientRect()
                    setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
                  }
                  setShowMenu(v => !v)
                }}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                </svg>
              </button>
            </div>
          </div>

          {/* ── Tarjeta del contador ─── */}
          <div
            className={styles.hero}
            style={{
              backgroundColor: cardColor || 'var(--card-bg)',
              backgroundImage: bg ? `url(${bg})` : undefined,
              backgroundSize: 'cover', backgroundPosition: 'center',
            }}
          >
            {(bg || cardColor) && <div className={styles.heroOverlay} />}

            {/* Nombre dentro de la tarjeta con gradiente superior */}
            <div className={styles.heroCardName}>
              <span>{counter.name}</span>
              {counter.isShared && ROLE_BADGE[counter.role] && (
                <span className={styles.roleBadge}>{ROLE_BADGE[counter.role]}</span>
              )}
            </div>

            {/* Valor centrado */}
            <div className={styles.heroBody}>
              {editValue ? (
                <input className={styles.heroValueInput} type="number" inputMode="numeric" value={valueInput} autoFocus
                  onChange={e => setValueInput(e.target.value)}
                  onBlur={saveValue} onKeyDown={e => e.key === 'Enter' && saveValue()} />
              ) : (
                <button key={displayValue} className={styles.heroValue}
                  style={!(bg || cardColor) ? { color: 'var(--text-primary)', textShadow: 'none' } : {}}
                  onClick={() => canEdit && !counter.isCompetitive && setEditValue(true)}>
                  {displayValue}
                </button>
              )}
              {counter.isCompetitive && myUid && (
                <p className={styles.heroOwnScore} style={!(bg || cardColor) ? { color: 'var(--text-secondary)' } : {}}>tú: {myScore}</p>
              )}
              {counter.target != null && !counter.isCompetitive && (
                <p className={styles.heroTarget} style={!(bg || cardColor) ? { color: 'var(--text-secondary)' } : {}}>/ {counter.target}</p>
              )}
              {!counter.isCompetitive && counter.target != null && counter.value >= counter.target && (
                <span className={styles.heroTrophy}>🏆</span>
              )}
            </div>

            {/* Botones +/- dentro de la tarjeta */}
            {canEdit && (
              <div className={styles.heroButtons}>
                <button className={styles.heroMinus} style={heroBtnMinusStyle} onClick={onDecrement} onContextMenu={e => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
                </button>
                <button className={styles.heroPlus} style={heroBtnPlusStyle} onClick={onIncrement} onContextMenu={e => e.preventDefault()}>
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>{/* end heroWrap */}

        {/* ── QR ───────────────────────────────────────────────────────── */}
        {showQr && inviteCode && (
          <div className={styles.qrBox}>
            <p className={styles.qrLabel}>Escanea para unirse</p>
            <img src={qrUrl(inviteCode)} alt="QR" className={styles.qrImg} />
            <code className={styles.qrCode}>{inviteCode}</code>
          </div>
        )}

        {/* ── TABS ─────────────────────────────────────────────────────── */}
        <div className={styles.tabs}>
          {tabs.map(t => (
            <button key={t} className={`${styles.tab} ${tab === t ? styles.active : ''}`} onClick={() => setTab(t)}>
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* ── BODY ─────────────────────────────────────────────────────── */}
        <div className={styles.body}>

          {/* ── Notas ── */}
          {tab === 'log' && (
            <div className={styles.logTab}>
              {(() => {
                const inc = counter.increment || 1
                const n   = Math.max(0, Math.floor(counter.value / inc))
                if (n === 0) return <p className={styles.emptyLog}>Pulsa + para empezar a contar</p>
                return Array.from({ length: n }, (_, i) => {
                  const label  = (i + 1) * inc
                  const entry  = counter.logEntries?.[i]
                  const barColor = getProgressColor(label, counter.target)
                  return (
                    <div key={i} className={styles.logCard}>
                      {barColor && <div className={styles.logBar} style={{ background: barColor }} />}
                      <span className={styles.logLabel}>
                        {label}
                        {label === counter.target && <span style={{ marginLeft: 4 }}>🏆</span>}
                      </span>
                      <textarea
                        className={styles.logText}
                        value={entry?.text ?? ''}
                        placeholder="Nota..."
                        readOnly={!canEdit}
                        rows={1}
                        onChange={e => updateLogField(i, 'text', e.target.value)}
                        onBlur={() => { if (counter.isShared && canEdit) pushCounterUpdate(counter) }}
                      />
                      <DatePicker
                        value={entry?.date || Date.now()}
                        onChange={ts => updateLogField(i, 'date', ts)}
                        disabled={!canEdit}
                      />
                    </div>
                  )
                })
              })()}
            </div>
          )}

          {/* ── Podio competitivo ── */}
          {tab === 'competitive' && counter.isCompetitive && (
            <CompetitivePodium
              scores={counter.competitorScores ?? {}}
              usernames={counter.competitorUsernames ?? {}}
              userColors={counter.userColors ?? {}}
              targets={counter.competitorTargets ?? {}}
              logEntries={counter.competitorLogEntries ?? {}}
              increment={counter.increment ?? 1}
              myUid={myUid}
              isOwner={isOwner}
              canEdit={canEdit}
              onSetMyColor={(color) => {
                const newColors = { ...(counter.userColors ?? {}), [myUid]: color }
                if (color == null) delete newColors[myUid]
                const patch = { userColors: newColors }
                onUpdate(patch)
                if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, ...patch })
              }}
              onSetColor={(uid, color) => {
                if (!isOwner) return
                const newColors = { ...(counter.userColors ?? {}), [uid]: color }
                if (color == null) delete newColors[uid]
                const patch = { userColors: newColors }
                onUpdate(patch)
                if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, ...patch })
              }}
              onSetMyTarget={(target) => {
                const newTargets = { ...(counter.competitorTargets ?? {}), [myUid]: target }
                if (target == null) delete newTargets[myUid]
                const patch = { competitorTargets: newTargets }
                onUpdate(patch)
                if (counter.isShared && canEdit) pushCounterUpdate({ ...counter, ...patch })
              }}
            />
          )}

          {/* ── Ajustes ── */}
          {tab === 'settings' && (
            <div className={styles.settingsTab}>

              {/* ── APARIENCIA ── */}
              {canEdit && (
                <>
                  <p className={styles.settingSection}>APARIENCIA</p>
                  <div className={styles.settingCard}>
                    {/* Color de fondo */}
                    <button className={styles.settingCardRow} onClick={() => setShowColorPicker(true)}>
                      <div className={styles.settingCardIcon}>
                        <div className={styles.colorDot} style={{ background: counter.color || 'transparent', border: counter.color ? 'none' : '2px solid var(--card-stroke)' }} />
                      </div>
                      <span className={styles.settingCardLabel}>Color de fondo</span>
                      <span className={styles.settingCardValue}>{counter.color ? counter.color.toUpperCase() : 'Sin color'}</span>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color:'var(--text-secondary)', flexShrink:0 }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </button>

                    <div className={styles.settingCardDivider} />

                    {/* Imagen de fondo */}
                    <button className={styles.settingCardRow} onClick={handleBgImage}>
                      <div className={styles.settingCardIcon}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                      </div>
                      <span className={styles.settingCardLabel}>
                        {(counter.backgroundImageLocal || counter.backgroundImageUrl) ? 'Cambiar imagen' : 'Añadir imagen'}
                      </span>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color:'var(--text-secondary)', flexShrink:0 }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                    </button>

                    {/* Quitar imagen */}
                    {(counter.backgroundImageLocal || counter.backgroundImageUrl) && (
                      <>
                        <div className={styles.settingCardDivider} />
                        <button className={styles.settingCardRow} onClick={removeBg}>
                          <div className={styles.settingCardIcon}>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ color:'var(--danger)' }}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                          </div>
                          <span className={styles.settingCardLabelDanger}>Quitar imagen</span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* ── CONFIGURACIÓN ── */}
              {canEdit && (
                <>
                  <p className={styles.settingSection}>CONFIGURACIÓN</p>
                  <div className={styles.settingCard}>
                    {/* Incremento */}
                    <div className={styles.settingCardRow}>
                      <div className={styles.settingCardIcon}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                      </div>
                      <span className={styles.settingCardLabel}>Incremento</span>
                      <input className={styles.settingCardInput} type="number" inputMode="numeric" min="1"
                        value={incrementInput}
                        onChange={e => setIncrementInput(e.target.value)}
                        onBlur={() => { const v = parseInt(incrementInput); setIncrementInput(String(isNaN(v)||v<1?1:v)) }} />
                    </div>

                    {/* Objetivo */}
                    {!counter.isCompetitive && (
                      <>
                        <div className={styles.settingCardDivider} />
                        <div className={styles.settingCardRow}>
                          <div className={styles.settingCardIcon}>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
                          </div>
                          <span className={styles.settingCardLabel}>Objetivo</span>
                          <input className={styles.settingCardInput} type="number" inputMode="numeric" min="1"
                            value={targetInput} placeholder="—"
                            onChange={e => setTargetInput(e.target.value)}
                            onBlur={() => { if (targetInput!=='') { const v=parseInt(targetInput); setTargetInput(isNaN(v)||v<1?'':String(v)) } }} />
                        </div>
                      </>
                    )}
                  </div>
                  <button className={styles.settingSaveBtn} onClick={saveSettings}>Guardar</button>
                </>
              )}

              {/* ── MODO (solo owner compartido) ── */}
              {counter.isShared && isOwner && (
                <>
                  <p className={styles.settingSection}>MODO</p>
                  <div className={styles.settingCard}>
                    <div className={styles.settingCardRow}>
                      <div className={styles.settingCardIcon}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                      </div>
                      <span className={styles.settingCardLabel}>Modo competitivo</span>
                      <button
                        className={`${styles.settingToggle} ${counter.isCompetitive ? styles.settingToggleOn : ''}`}
                        onClick={toggleCompetitive}
                      >
                        <div className={styles.settingToggleThumb} />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ── CÓDIGO DE INVITACIÓN ── */}
              {counter.isShared && inviteCode && isOwner && (
                <>
                  <p className={styles.settingSection}>INVITACIÓN</p>
                  <div className={styles.settingCard}>
                    <div className={styles.settingCardRow} style={{ gap: 10 }}>
                      <div className={styles.settingCardIcon}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                      </div>
                      <code style={{ flex:1, fontFamily:'monospace', fontSize:15, letterSpacing:2, color:'var(--text-primary)' }}>{inviteCode}</code>
                      <button className="btn-ghost" style={{ padding:'6px 10px', fontSize:13 }} onClick={handleCopyCode}>Copiar</button>
                      <button className="btn-ghost" style={{ padding:'6px 10px', fontSize:13 }} onClick={() => setShowQr(v => !v)}>QR</button>
                    </div>
                  </div>
                </>
              )}

              {/* ── ACCIONES ── */}
              {canEdit && (
                <>
                  <p className={styles.settingSection}>ACCIONES</p>
                  <button className={styles.settingDangerBtn} onClick={handleReset}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                    Reiniciar contador
                  </button>
                  {isOwner && (
                    <button className={styles.settingDangerBtn} onClick={() => { onDelete() }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                      Eliminar contador
                    </button>
                  )}
                </>
              )}

            </div>
          )}

          {/* ── Miembros ── */}
          {tab === 'members' && counter.isShared && (
            <div className={styles.membersTab}>
              {isOwner && (
                <div className={styles.inviteBox}>
                  <h4>Invitar usuario</h4>
                  {friends.length > 0 && (
                    <datalist id="ec-friends-list">
                      {friends
                        .filter(f => !members.some(m => m.username === f.username))
                        .map(f => <option key={f.uid} value={f.username} />)
                      }
                    </datalist>
                  )}
                  <input className="input-field" placeholder="Nombre de usuario"
                    list={friends.length > 0 ? 'ec-friends-list' : undefined}
                    value={inviteUsername} onChange={e => setInviteUsername(e.target.value)} />
                  <div className={styles.inviteRoleRow}>
                    <select className="input-field" value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ flex:1 }}>
                      <option value="viewer">Solo ver</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button className="btn-primary" onClick={handleInvite} disabled={loading}>Invitar</button>
                  </div>
                </div>
              )}
              {members.map(m => (
                <div key={m.uid} className={styles.memberRow}>
                  <div className="avatar" style={{ background: '#607D8B' }}>
                    {m.username?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className={styles.memberInfo}>
                    <span className={styles.memberName}>{m.username}</span>
                    {isOwner && m.uid !== user?.uid ? (
                      <select className={styles.roleSelect} value={m.role}
                        onChange={async e => { await setMemberRole(counter.sharedId, m.uid, e.target.value); loadMembers() }}>
                        <option value="viewer">Solo ver</option>
                        <option value="editor">Editor</option>
                      </select>
                    ) : (
                      <span className={styles.memberRole}>
                        {{ owner:'Propietario', editor:'Editor', viewer:'Lector' }[m.role] ?? m.role}
                      </span>
                    )}
                  </div>
                  {isOwner && m.uid !== user?.uid && (
                    <button className="btn-icon" onClick={async () => { await removeMember(counter.sharedId, m.uid); loadMembers() }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--danger)" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {msg && (
          <div className={`${styles.toast} ${msg.error ? styles.toastError : ''}`}>{msg.text}</div>
        )}
      </div>

      {/* ⋮ Dropdown — fuera del panel, dentro del backdrop full-screen */}
      {showMenu && (
        <div
          ref={menuDropRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: menuPos.top,
            right: menuPos.right,
            background: 'var(--card-bg)',
            border: '1px solid var(--card-stroke)',
            borderRadius: 16,
            minWidth: 210,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            overflow: 'hidden',
            zIndex: 200,
            animation: 'scaleIn 0.15s ease',
            transformOrigin: 'top right',
          }}
        >
          {/* Editar → abre pestaña Ajustes */}
          {canEdit && (
            <button className="portal-menu-item" style={menuItemStyle}
              onClick={() => { setShowMenu(false); setTab('settings') }}>
              <span style={menuIconStyle}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></span>
              Editar
            </button>
          )}
          {/* Sacar de carpeta */}
          {counter.folderId && (
            <button className="portal-menu-item" style={menuItemStyle}
              onClick={() => { setShowMenu(false); onRemoveFromFolder?.() }}>
              <span style={menuIconStyle}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg></span>
              Sacar de carpeta
            </button>
          )}
          {/* Compartir */}
          {!counter.isShared && isOwner && (
            <button className="portal-menu-item" style={menuItemStyle}
              onClick={handleShare} disabled={loading}>
              <span style={menuIconStyle}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg></span>
              Compartir
            </button>
          )}
          {/* Dejar de compartir */}
          {counter.isShared && isOwner && (
            <button className="portal-menu-item" style={menuItemStyle}
              onClick={handleUnshare} disabled={loading}>
              <span style={menuIconStyle}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7l.01-.03-1.99-1.99C6.47 10.58 6 11.24 6 12c0 1.66 1.34 3 3 3 .79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92zM20.71 5.63l-1.41-1.41-16.6 16.6 1.41 1.41 3.37-3.37.01.01.54.31c.53.29 1.1.54 1.72.65V21h4v-2.18c1.86-.35 3.43-1.42 4.48-2.93l1.56.9 1.41-1.41-1.47-1.47 1.47-1.47zM19 3c-1.66 0-3 1.34-3 3 0 .24.04.47.09.7L8.04 10.81C7.5 10.31 6.79 10 6 10c-.28 0-.54.04-.8.1L3.27 8.17C3.1 8.48 3 8.72 3 9c0 1.66 1.34 3 3 3 .79 0 1.5-.31 2.04-.81l7.05 4.11c-.05.23-.09.46-.09.7 0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3z"/></svg></span>
              Dejar de compartir
            </button>
          )}
          {/* Abandonar */}
          {counter.isShared && !isOwner && (
            <button className="portal-menu-item" style={{ ...menuItemStyle, color: 'var(--danger)' }}
              onClick={handleAbandon} disabled={loading}>
              <span style={{ ...menuIconStyle, color: 'var(--danger)' }}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg></span>
              Abandonar
            </button>
          )}
          {/* Separador antes de Eliminar */}
          {isOwner && <div style={{ height:1, background:'var(--card-stroke)', margin:'0 12px' }} />}
          {/* Eliminar */}
          {isOwner && (
            <button className="portal-menu-item" style={{ ...menuItemStyle, color: 'var(--danger)' }}
              onClick={() => { setShowMenu(false); onDelete() }}>
              <span style={{ ...menuIconStyle, color: 'var(--danger)' }}><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></span>
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>

    {showColorPicker && (
      <ColorPicker
        initialColor={counter.color}
        onSave={(hex) => { applyColor(hex); setShowColorPicker(false) }}
        onCancel={() => setShowColorPicker(false)}
        onReset={() => { applyColor(null); setShowColorPicker(false) }}
        onPickImage={() => { setShowColorPicker(false); handleBgImage() }}
      />
    )}

    </>
  )
}

const menuItemStyle = {
  display: 'flex', alignItems: 'center', gap: 12,
  width: '100%',
  padding: '13px 16px', textAlign: 'left',
  fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
  background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.1s',
}

const menuIconStyle = {
  width: 34, height: 34, borderRadius: 10,
  background: 'var(--log-card-bg)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-secondary)', flexShrink: 0,
}
