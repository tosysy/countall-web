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

function luminance(hex) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 0.5
  const r = parseInt(hex.slice(1,3),16)/255
  const g = parseInt(hex.slice(3,5),16)/255
  const b = parseInt(hex.slice(5,7),16)/255
  return 0.299*r + 0.587*g + 0.114*b
}

export default function CounterCard({ counter, onIncrement, onDecrement, onClick, onMenu, onSharedBadge }) {
  const longPressTimer = useRef(null)
  const longPressInterval = useRef(null)
  const [pressing, setPressing] = useState(null)

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

  const btnMinusStyle = (bg || cardColor) ? { background: '#ffffff', color: '#333', border: 'none' } : {}
  const btnPlusStyle = cardColor
    ? { background: cardColor, color: luminance(cardColor) > 0.55 ? '#333' : '#fff', border: 'none' }
    : bg ? { background: '#ffffff', color: '#333', border: 'none' } : {}

  // El click en el outer solo abre el contador si NO viene de un botón hijo
  const handleOuterClick = (e) => {
    if (e.target.closest('button')) return
    onClick?.(counter)
  }

  return (
    <div
      className={`${styles.cardOuter} ${hasTarget ? styles.cardOuterProgress : ''} ${goalReached ? styles.goalReached : ''}`}
      style={outerStyle}
      onClick={handleOuterClick}
    >
    <div
      className={styles.card}
      style={{
        backgroundColor: cardColor || undefined,
        backgroundImage: bg ? `url(${bg})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}
    >
      {(bg || cardColor) && <div className={styles.overlay} />}

      {/* Botón menú 3 puntos */}
      {onMenu && (
        <button className={styles.menuBtn}
          onClick={e => { e.stopPropagation(); onMenu(counter, e) }}
          style={(bg || cardColor) ? { background: 'rgba(0,0,0,0.35)', color: '#fff' } : {}}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      )}

      {/* Badge compartido — botón que abre la hoja de info */}
      {counter.isShared && (
        <button
          className={styles.sharedBadge}
          title={`Compartido · ${counter.role}`}
          onClick={e => { e.stopPropagation(); onSharedBadge?.(counter) }}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
        </button>
      )}

      {/* Nombre arriba */}
      <p className={styles.name} style={bg || cardColor ? { color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' } : {}}>
        {counter.name}
      </p>

      {/* Valor centrado */}
      <div className={styles.content}>
        {goalReached ? <span className={styles.trophy}>🏆</span> : null}
        {(() => {
          const displayValue = counter.isCompetitive
            ? Object.values(counter.competitorScores ?? {}).reduce((a, b) => a + b, 0)
            : counter.value
          return (
            <p key={displayValue} className={styles.value} style={goalReached ? { color: '#52CF48' } : (bg || cardColor ? { color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.45)' } : {})}>
              {displayValue}
            </p>
          )
        })()}
        {hasTarget && !counter.isCompetitive && (
          <p className={styles.target} style={bg || cardColor ? { color: 'rgba(255,255,255,0.7)' } : {}}>
            / {counter.target}
          </p>
        )}
      </div>

      <div className={styles.buttons}>
        <button
          className={styles.btnMinus}
          style={btnMinusStyle}
          onPointerDown={e => { e.stopPropagation(); onDecrement?.(); startLongPress('minus') }}
          onPointerUp={endLongPress} onPointerLeave={endLongPress}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 13H5v-2h14v2z"/></svg>
        </button>
        <button
          className={styles.btnPlus}
          style={btnPlusStyle}
          onPointerDown={e => { e.stopPropagation(); onIncrement?.(); startLongPress('plus') }}
          onPointerUp={endLongPress} onPointerLeave={endLongPress}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>
    </div>
    </div>
  )
}
