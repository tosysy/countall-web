import { useState, useEffect, useRef } from 'react'
import styles from './ExpandedCounter.module.css'
import DatePicker from './DatePicker'
import ColorPicker from './ColorPicker'
import CompetitivePodium, { getProgressColor } from './CompetitivePodium'
import { pushCounterUpdate, getMembers, setMemberRole, removeMember, sendInvitation, getInviteCode, shareCounter, unshareCounter, requestEditPermission, bumpBgVersion } from '../firebase/syncManager'
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

export default function ExpandedCounter({ counter, onClose, onUpdate, onDelete, onIncrement, onDecrement }) {
  const { user, username, driveToken } = useAppStore()

  const isOwner = counter.role === 'owner'
  const canEdit = counter.role === 'owner' || counter.role === 'editor'
  const bg = counter.backgroundImageLocal || counter.backgroundImageUrl
  const cardColor = counter.color

  // Tabs
  const tabs = [
    'log',
    ...(counter.isCompetitive ? ['competitive'] : []),
    'settings',
    ...(counter.isShared ? ['members'] : []),
  ]
  const tabLabels = { log: 'Notas', competitive: 'Podio', settings: 'Ajustes', members: 'Miembros' }
  const [tab, setTab] = useState('log')

  // Hero states
  const [showMenu, setShowMenu]         = useState(false)
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
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole, setInviteRole]     = useState('viewer')
  const [inviteCode, setInviteCode]     = useState(null)

  // Misc
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState(null)
  const menuRef = useRef(null)

  // Computed display value
  const myUid = user?.uid
  const myScore = counter.competitorScores?.[myUid] ?? 0
  const totalScore = Object.values(counter.competitorScores ?? {}).reduce((a, b) => a + b, 0)
  const displayValue = counter.isCompetitive ? totalScore : counter.value

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => { if (tab === 'members' && counter.isShared) loadMembers() }, [tab])
  useEffect(() => {
    if (counter.isShared && isOwner) getInviteCode(counter.sharedId).then(c => setInviteCode(c))
  }, [counter.sharedId])
  useEffect(() => {
    if (!showMenu) return
    const h = (e) => { if (!menuRef.current?.contains(e.target)) setShowMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showMenu])

  // ── Helpers ──────────────────────────────────────────────────────────────
  const showMsg = (text, error = false) => { setMsg({ text, error }); setTimeout(() => setMsg(null), 3000) }
  const loadMembers = async () => { if (counter.sharedId) setMembers(await getMembers(counter.sharedId)) }

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

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <div
          className={styles.hero}
          style={{
            backgroundColor: cardColor || 'var(--card-bg)',
            backgroundImage: bg ? `url(${bg})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center',
          }}
        >
          {(bg || cardColor) && <div className={styles.heroOverlay} />}

          {/* Top controls */}
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
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button className={styles.heroBtn} onClick={() => setShowMenu(v => !v)} aria-label="Menú">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                </svg>
              </button>
              {showMenu && (
                <div className={styles.menuDropdown}>
                  {canEdit && <button onClick={() => { setShowMenu(false); handleBgImage() }}>Cambiar imagen</button>}
                  {canEdit && (bg || cardColor) && <button onClick={() => { setShowMenu(false); removeBg() }}>Quitar imagen</button>}
                  {!counter.isShared && canEdit && <button onClick={() => { setShowMenu(false); handleShare() }}>Compartir</button>}
                  {counter.isShared && isOwner && <button onClick={() => { setShowMenu(false); handleUnshare() }}>Dejar de compartir</button>}
                  {counter.isShared && inviteCode && isOwner && (
                    <>
                      <button onClick={handleCopyCode}>Copiar enlace</button>
                      <button onClick={() => { setShowMenu(false); setShowQr(v => !v) }}>Ver QR</button>
                    </>
                  )}
                  {canEdit && <button onClick={handleReset}>Reiniciar contador</button>}
                  {counter.isShared && counter.role === 'viewer' && (
                    <button onClick={handleRequestEdit}>Solicitar edición</button>
                  )}
                  {counter.isShared && !isOwner && (
                    <button className={styles.menuDanger} onClick={handleAbandon}>Abandonar contador</button>
                  )}
                  <button className={styles.menuDanger} onClick={() => { setShowMenu(false); onDelete() }}>Eliminar</button>
                </div>
              )}
            </div>
          </div>

          {/* Value */}
          <div className={styles.heroBody}>
            {editValue ? (
              <input className={styles.heroValueInput} type="number" inputMode="numeric" value={valueInput} autoFocus
                onChange={e => setValueInput(e.target.value)}
                onBlur={saveValue} onKeyDown={e => e.key === 'Enter' && saveValue()} />
            ) : (
              <button className={styles.heroValue} onClick={() => canEdit && !counter.isCompetitive && setEditValue(true)}>
                {displayValue}
              </button>
            )}
            {/* Own score in competitive mode */}
            {counter.isCompetitive && myUid && (
              <p className={styles.heroOwnScore}>tú: {myScore}</p>
            )}
            {counter.target != null && !counter.isCompetitive && (
              <p className={styles.heroTarget}>/ {counter.target}</p>
            )}
            {/* Trophy when goal reached */}
            {!counter.isCompetitive && counter.target != null && counter.value >= counter.target && (
              <span className={styles.heroTrophy}>🏆</span>
            )}
          </div>

          {/* +/- buttons */}
          {canEdit && (
            <div className={styles.heroButtons}>
              <button className={styles.heroMinus} onClick={onDecrement} onContextMenu={e => e.preventDefault()}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
              </button>
              <button className={styles.heroPlus} onClick={onIncrement} onContextMenu={e => e.preventDefault()}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              </button>
            </div>
          )}
        </div>

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
              <div className={styles.settingRow}>
                <label>Incremento</label>
                <input className="input-field" type="number" inputMode="numeric" min="1"
                  value={incrementInput} disabled={!canEdit}
                  onChange={e => setIncrementInput(e.target.value)}
                  onBlur={() => { const v = parseInt(incrementInput); setIncrementInput(String(isNaN(v)||v<1?1:v)) }}
                  style={{ width: 100, textAlign: 'right' }} />
              </div>
              {!counter.isCompetitive && (
                <div className={styles.settingRow}>
                  <label>Objetivo</label>
                  <input className="input-field" type="number" inputMode="numeric" min="1"
                    value={targetInput} disabled={!canEdit}
                    placeholder="Sin objetivo"
                    onChange={e => setTargetInput(e.target.value)}
                    onBlur={() => { if (targetInput!=='') { const v=parseInt(targetInput); setTargetInput(isNaN(v)||v<1?'':String(v)) } }}
                    style={{ width: 120, textAlign: 'right' }} />
                </div>
              )}

              {/* Modo competitivo toggle (solo owner de compartido) */}
              {counter.isShared && isOwner && (
                <div className={styles.settingRow}>
                  <label>Modo competitivo</label>
                  <button
                    className={counter.isCompetitive ? 'btn-primary' : 'btn-ghost'}
                    onClick={toggleCompetitive}
                    style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13 }}
                  >
                    {counter.isCompetitive ? 'Activado' : 'Desactivado'}
                  </button>
                </div>
              )}

              {canEdit && (
                <button className="btn-primary" style={{ width:'100%', marginTop: 4 }} onClick={saveSettings}>
                  Guardar
                </button>
              )}

              {canEdit && (
                <>
                  <p className={styles.settingLabel}>Color de fondo</p>
                  <div className={styles.colorPreviewRow}>
                    <div className={styles.colorPreviewSwatch}
                      style={{ background: counter.color ?? 'var(--card-bg)', border: counter.color ? undefined : '2px solid var(--card-stroke)' }} />
                    <button className="btn-ghost" style={{ flex:1 }} onClick={() => setShowColorPicker(true)}>
                      {counter.color ? counter.color.toUpperCase() : 'Sin color'}
                    </button>
                  </div>
                </>
              )}

              {/* Código de invitación */}
              {counter.isShared && inviteCode && isOwner && (
                <>
                  <p className={styles.settingLabel}>Código de invitación</p>
                  <div className={styles.codeBox}>
                    <div className={styles.codeRow}>
                      <code className={styles.code}>{inviteCode}</code>
                      <button className="btn-ghost" onClick={handleCopyCode}>Copiar</button>
                      <button className="btn-ghost" onClick={() => setShowQr(v => !v)}>QR</button>
                    </div>
                  </div>
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
                  <input className="input-field" placeholder="Nombre de usuario"
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
