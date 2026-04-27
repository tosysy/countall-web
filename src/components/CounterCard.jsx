import { useState, useRef } from 'react'
import styles from './CounterCard.module.css'

function lerpColor(a, b, t) {
  const ah = a.replace('#',''), bh = b.replace('#','')
  const ar = parseInt(ah.slice(0,2),16), ag = parseInt(ah.slice(2,4),16), ab = parseInt(ah.slice(4,6),16)
  const br = parseInt(bh.slice(0,2),16), bg = parseInt(bh.slice(2,4),16), bb = parseInt(bh.slice(4,6),16)
  const r = Math.round(ar+(br-ar)*t), g = Math.round(ag+(bg-ag)*t), bv = Math.round(ab+(bb-ab)*t)
  return `rgb(${r},${g},${bv})`
}

function progressColor(pct) {
  if (pct >= 1) return '#52CF48'
  if (pct <= 0) return '#F44336'
  if (pct < 0.5) return lerpColor('#F44336','#FFC107', pct * 2)
  return lerpColor('#FFC107','#52CF48', (pct - 0.5) * 2)
}

export default function CounterCard({ counter, onIncrement, onDecrement, onClick, onMenu }) {
  const longPressTimer = useRef(null)
  const longPressInterval = useRef(null)
  const [pressing, setPressing] = useState(null) // 'plus' | 'minus'

  const startLongPress = (type) => {
    setPressing(type)
    longPressTimer.current = setTimeout(() => {
      longPressInterval.current = setInterval(() => {
        if (type === 'plus') onIncrement?.()
        else onDecrement?.()
      }, 80)
    }, 400)
  }

  const endLongPress = () => {
    setPressing(null)
    clearTimeout(longPressTimer.current)
    clearInterval(longPressInterval.current)
  }

  const bg = counter.backgroundImageLocal || counter.backgroundImageUrl
  const hasTarget = counter.target != null && counter.target > 0
  const goalReached = hasTarget && counter.value >= counter.target
  const cardColor = counter.color

  const pct = hasTarget ? Math.min(1, counter.value / counter.target) : 0
  const progColor = hasTarget ? progressColor(pct) : null

  const outerStyle = hasTarget ? { '--prog': pct, '--prog-color': progColor } : {}

  return (
    <div
      className={`${styles.cardOuter} ${hasTarget ? styles.cardOuterProgress : ''} ${goalReached ? styles.goalReached : ''}`}
      style={outerStyle}
      onClick={() => onClick?.(counter)}
    >
    <div
      className={styles.card}
      style={{
        backgroundColor: cardColor || undefined,
        backgroundImage: bg ? `url(${bg})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}
    >
      {/* Overlay para texto legible sobre fondo de imagen */}
      {(bg || cardColor) && <div className={styles.overlay} />}

      {/* Botón menú 3 puntos */}
      {onMenu && (
        <button className={styles.menuBtn}
          onPointerDown={e => { e.stopPropagation(); onMenu(counter) }}
          style={(bg || cardColor) ? { background: 'rgba(0,0,0,0.35)', color: '#fff' } : {}}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      )}

      {/* Indicador compartido */}
      {counter.isShared && (
        <div className={styles.sharedBadge} title={`Compartido · ${counter.role}`}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
        </div>
      )}

      {/* Nombre arriba */}
      <p className={styles.name} style={bg || cardColor ? { color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : {}}>
        {counter.name}
      </p>

      {/* Valor centrado */}
      <div className={styles.content}>
        {goalReached
          ? <span className={styles.trophy}>🏆</span>
          : null
        }
        <p className={styles.value} style={goalReached ? { color: '#52CF48' } : (bg || cardColor ? { color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.45)' } : {})}>
          {counter.isCompetitive
            ? Object.values(counter.competitorScores ?? {}).reduce((a, b) => a + b, 0)
            : counter.value}
        </p>

        {hasTarget && !counter.isCompetitive && (
          <p className={styles.target} style={bg || cardColor ? { color: 'rgba(255,255,255,0.7)' } : {}}>
            / {counter.target}
          </p>
        )}
      </div>

      <div className={styles.buttons} onClick={e => e.stopPropagation()}>
        <button
          className={styles.btnMinus}
          style={bg || cardColor ? { background: '#ffffff', color: '#333' } : {}}
          onPointerDown={() => { onDecrement?.(); startLongPress('minus') }}
          onPointerUp={endLongPress} onPointerLeave={endLongPress}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
        </button>
        <button
          className={styles.btnPlus}
          style={bg || cardColor ? { background: '#ffffff', color: '#333' } : {}}
          onPointerDown={() => { onIncrement?.(); startLongPress('plus') }}
          onPointerUp={endLongPress} onPointerLeave={endLongPress}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>
    </div>
    </div>
  )
}
