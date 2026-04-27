import { useState } from 'react'
import styles from './CompetitivePodium.module.css'

const TROPHY = { 0: '🥇', 1: '🥈', 2: '🥉' }
const TROPHY_COLOR = { 0: '#FFD700', 1: '#C0C0C0', 2: '#CD7F32' }
const BAR_COLORS = { 0: '#FFD700', 1: '#C0C0C0', 2: '#CD7F32' }

function lerpColor(a, b, t) {
  const ah = a.replace('#',''), bh = b.replace('#','')
  const ar = parseInt(ah.slice(0,2),16), ag = parseInt(ah.slice(2,4),16), ab = parseInt(ah.slice(4,6),16)
  const br = parseInt(bh.slice(0,2),16), bg = parseInt(bh.slice(2,4),16), bb = parseInt(bh.slice(4,6),16)
  const r = Math.round(ar + (br-ar)*t), g = Math.round(ag + (bg-ag)*t), bv = Math.round(ab + (bb-ab)*t)
  return `rgb(${r},${g},${bv})`
}

export function getProgressColor(value, target) {
  if (!target || target <= 0) return null
  const pct = Math.min(1, value / target)
  if (pct >= 1) return '#4CAF50'
  if (pct <= 0) return '#F44336'
  if (pct < 0.5) return lerpColor('#F44336', '#FFC107', pct * 2)
  return lerpColor('#FFC107', '#4CAF50', (pct - 0.5) * 2)
}

const PRESET_COLORS = [
  '#5C6BC0','#26A69A','#66BB6A','#EC407A',
  '#FFA726','#42A5F5','#8D6E63','#EF5350',
  '#AB47BC','#26C6DA','#D4E157','#FF7043',
]

function ColorSwatchPicker({ current, onSelect }) {
  return (
    <div className={styles.colorSwatchPanel}>
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          className={`${styles.swatch} ${current === c ? styles.swatchActive : ''}`}
          style={{ background: c }}
          onClick={() => onSelect(c)}
        />
      ))}
      <button className={styles.swatchReset} onClick={() => onSelect(null)}>✕</button>
    </div>
  )
}

// ── User logs popup ──────────────────────────────────────────────────────────
function UserLogsPopup({ entry, logs, increment, rank, onClose }) {
  const trophyColor = TROPHY_COLOR[rank] ?? 'var(--text-primary)'
  const fmt = (ts) => ts ? new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
  return (
    <div className={styles.logsBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.logsPanel}>
        <div className={styles.logsHeader}>
          <button className={styles.logsClose} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
          <span className={styles.logsTrophy} style={{ color: trophyColor }}>
            {TROPHY[rank] ?? '🏅'}
          </span>
          <span className={styles.logsTitle}>Registros de {entry.username}</span>
        </div>
        <div className={styles.logsList}>
          {logs.length === 0 ? (
            <p className={styles.logsEmpty}>Sin registros aún</p>
          ) : (
            logs.map((e, i) => (
              <div key={i} className={styles.logsRow}>
                <span className={styles.logsIdx}>{(i + 1) * increment}</span>
                <span className={styles.logsText}>{e.text || <em style={{ opacity: 0.5 }}>Sin nota</em>}</span>
                <span className={styles.logsDate}>{fmt(e.date)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function CompetitivePodium({
  scores = {}, usernames = {}, userColors = {}, targets = {},
  logEntries = {}, increment = 1, myUid, isOwner = false, canEdit,
  onSetMyColor, onSetMyTarget, onSetColor,
}) {
  const [showColorPicker, setShowColorPicker] = useState(null) // uid
  const [editingTarget, setEditingTarget] = useState(null)     // uid
  const [targetDraft, setTargetDraft] = useState('')
  const [viewingLogs, setViewingLogs] = useState(null)         // {entry, rank}

  const sorted = Object.entries(scores)
    .map(([uid, score]) => ({ uid, score, username: usernames[uid] ?? uid, color: userColors[uid] ?? null, target: targets[uid] ?? null }))
    .sort((a, b) => b.score - a.score)

  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const maxScore = top3[0]?.score || 1

  // Podio: orden visual 2nd | 1st | 3rd
  const podiumSlots = [top3[1], top3[0], top3[2]]
  const podiumRank  = [2, 1, 3]

  // Any user whose color dot is clickable
  const canEditColor = (uid) => uid === myUid || isOwner

  const handleColorSelect = (uid, color) => {
    setShowColorPicker(null)
    if (uid === myUid) {
      onSetMyColor?.(color)
    } else if (isOwner && onSetColor) {
      onSetColor(uid, color)
    }
  }

  const handleTargetSave = (uid) => {
    const v = parseInt(targetDraft, 10)
    setEditingTarget(null)
    if (!isNaN(v) && v > 0 && uid === myUid) onSetMyTarget?.(v)
    else if (targetDraft.trim() === '' && uid === myUid) onSetMyTarget?.(null)
  }

  return (
    <div className={styles.wrap}>

      {/* ── Podio ── */}
      {top3.length > 0 && (
        <div className={styles.podium}>
          {podiumSlots.map((entry, slot) => {
            if (!entry) return <div key={slot} className={styles.podiumSlot} />
            const rankIdx = podiumRank[slot] - 1
            const barH = Math.max(55, Math.round(200 * entry.score / maxScore))
            const isMe = entry.uid === myUid
            const barColor = entry.color ?? BAR_COLORS[rankIdx] ?? '#BDBDBD'
            const progressColor = getProgressColor(entry.score, entry.target)
            return (
              <div key={entry.uid} className={styles.podiumSlot}>
                <span className={styles.trophy}>{TROPHY[rankIdx]}</span>

                {/* Username + color picker trigger */}
                <span
                  className={`${styles.podiumName} ${isMe ? styles.podiumNameMe : ''}`}
                  style={{ borderBottom: `2.5px solid ${barColor}` }}
                >
                  {entry.username}
                  {canEditColor(entry.uid) && (
                    <button
                      className={styles.colorDot}
                      style={{ background: barColor }}
                      onClick={(e) => { e.stopPropagation(); setShowColorPicker(showColorPicker === entry.uid ? null : entry.uid) }}
                      title={isMe ? 'Tu color' : 'Color del miembro'}
                    />
                  )}
                </span>

                {/* Color swatch picker popup */}
                {canEditColor(entry.uid) && showColorPicker === entry.uid && (
                  <ColorSwatchPicker current={entry.color} onSelect={(c) => handleColorSelect(entry.uid, c)} />
                )}

                {/* Score + target — click to view logs */}
                <button
                  className={styles.podiumScore}
                  onClick={() => setViewingLogs({ entry, rank: rankIdx })}
                  title="Ver registros"
                >
                  {entry.score}
                  {entry.target != null && <span className={styles.podiumTarget}>/{entry.target}</span>}
                </button>

                {/* My target edit */}
                {isMe && editingTarget === entry.uid ? (
                  <div className={styles.targetEditRow}>
                    <input
                      className={styles.targetInput}
                      type="number" inputMode="numeric" min="1"
                      value={targetDraft} autoFocus
                      placeholder="Objetivo"
                      onChange={e => setTargetDraft(e.target.value)}
                      onBlur={() => handleTargetSave(entry.uid)}
                      onKeyDown={e => e.key === 'Enter' && handleTargetSave(entry.uid)}
                    />
                  </div>
                ) : isMe ? (
                  <button className={styles.setTargetBtn} onClick={() => {
                    setTargetDraft(entry.target != null ? String(entry.target) : '')
                    setEditingTarget(entry.uid)
                  }}>
                    {entry.target != null ? '✎' : '+ meta'}
                  </button>
                ) : null}

                {/* Bar */}
                <div
                  className={styles.podiumBar}
                  style={{ height: barH, background: progressColor ?? barColor, opacity: 0.85 }}
                >
                  <span className={styles.podiumRank} style={{ color: '#fff' }}>
                    {podiumRank[slot]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Lista 4.º en adelante ── */}
      {rest.map((entry, i) => {
        const rank = i + 4
        const isMe = entry.uid === myUid
        const barColor = entry.color ?? '#BDBDBD'
        const userLog = logEntries[entry.uid] ?? []
        return (
          <div key={entry.uid} className={`${styles.rankCard} ${isMe ? styles.rankCardMe : ''}`}>
            <span className={styles.rankNum}>{rank}</span>
            <span className={styles.rankUsername} style={{ borderBottom: `2px solid ${barColor}` }}>
              {isMe ? <strong>{entry.username}</strong> : entry.username}
              {canEditColor(entry.uid) && (
                <button
                  className={styles.colorDotSmall}
                  style={{ background: barColor }}
                  onClick={() => setShowColorPicker(showColorPicker === entry.uid ? null : entry.uid)}
                />
              )}
            </span>
            {canEditColor(entry.uid) && showColorPicker === entry.uid && (
              <div className={styles.colorSwatchPanelInline}>
                {PRESET_COLORS.map(c => (
                  <button key={c} className={`${styles.swatch} ${entry.color === c ? styles.swatchActive : ''}`}
                    style={{ background: c }} onClick={() => handleColorSelect(entry.uid, c)} />
                ))}
                <button className={styles.swatchReset} onClick={() => handleColorSelect(entry.uid, null)}>✕</button>
              </div>
            )}
            {/* Score — click to view logs */}
            <button
              className={styles.rankScore}
              onClick={() => setViewingLogs({ entry, rank: rank - 1 })}
              title="Ver registros"
              style={{ background: 'none', cursor: 'pointer' }}
            >
              {entry.score}
            </button>
            {isMe && editingTarget === entry.uid ? (
              <div className={styles.targetEditRow}>
                <input
                  className={styles.targetInput}
                  type="number" inputMode="numeric" min="1"
                  value={targetDraft} autoFocus
                  placeholder="Objetivo"
                  onChange={e => setTargetDraft(e.target.value)}
                  onBlur={() => handleTargetSave(entry.uid)}
                  onKeyDown={e => e.key === 'Enter' && handleTargetSave(entry.uid)}
                />
              </div>
            ) : isMe ? (
              <button className={styles.setTargetBtn} style={{ marginLeft: 4 }} onClick={() => {
                setTargetDraft(entry.target != null ? String(entry.target) : '')
                setEditingTarget(entry.uid)
              }}>
                {entry.target != null ? '✎' : '+ meta'}
              </button>
            ) : null}
          </div>
        )
      })}

      {sorted.length === 0 && (
        <p className={styles.empty}>Aún no hay puntuaciones</p>
      )}

      {/* ── User logs popup ── */}
      {viewingLogs && (
        <UserLogsPopup
          entry={viewingLogs.entry}
          logs={logEntries[viewingLogs.entry.uid] ?? []}
          increment={increment}
          rank={viewingLogs.rank}
          onClose={() => setViewingLogs(null)}
        />
      )}
    </div>
  )
}
