import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './DatePicker.module.css'

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function daysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Desplegable propio (los <select> nativos no permiten esquinas redondeadas):
 * botón con el valor + lista flotante redondeada con los colores del tema.
 */
function Dropdown({ value, options, labels, onSelect, width }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null) // { top, left, width } en coords de viewport
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const selectedRef = useRef(null)

  const openList = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    const LIST_H = 190
    // Abrir hacia arriba si no cabe por debajo
    const below = window.innerHeight - r.bottom
    setPos({
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 64) - 8),
      width: Math.max(r.width, 64),
      ...(below < LIST_H + 8 && r.top > LIST_H
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    // Centrar la opción seleccionada y cerrar al tocar fuera o hacer scroll
    selectedRef.current?.scrollIntoView({ block: 'center' })
    const close = (e) => {
      if (!wrapRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false)
    }
    const closeOnScroll = (e) => { if (!listRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', closeOnScroll)
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', closeOnScroll)
    }
  }, [open])

  const label = labels ? labels[options.indexOf(value)] : String(value)

  return (
    <div className={styles.dropWrap} ref={wrapRef} style={{ width }}>
      <button className={styles.dropBtn} onClick={() => (open ? setOpen(false) : openList())}>
        {label}
        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style={{ opacity: 0.6, flexShrink: 0 }}>
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
      {/* Portal a <body> con posición fija: la lista escapa de contenedores con overflow */}
      {open && pos && createPortal(
        <div className={styles.dropList} ref={listRef} style={pos}>
          <div className={styles.dropScroll}>
            {options.map((opt, i) => (
              <button key={opt}
                ref={opt === value ? selectedRef : undefined}
                className={`${styles.dropItem} ${opt === value ? styles.dropItemActive : ''}`}
                onClick={() => { onSelect(opt); setOpen(false) }}>
                {labels ? labels[i] : String(opt)}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default function DatePicker({ value, onChange, disabled }) {
  const [editing, setEditing] = useState(false)

  const date = value ? new Date(value) : new Date()
  const [day,   setDay]   = useState(date.getDate())
  const [month, setMonth] = useState(date.getMonth())
  const [year,  setYear]  = useState(date.getFullYear())

  useEffect(() => {
    if (!value) return
    const d = new Date(value)
    setDay(d.getDate()); setMonth(d.getMonth()); setYear(d.getFullYear())
  }, [value])

  const commit = (d, m, y) => {
    onChange?.(new Date(y, m, d, 12, 0, 0).getTime())
  }

  const handleDay = (v) => {
    const d = Math.min(Math.max(1, Number(v)), daysInMonth(month, year))
    setDay(d); commit(d, month, year)
  }
  const handleMonth = (v) => {
    const m = Number(v)
    const d = Math.min(day, daysInMonth(m, year))
    setDay(d); setMonth(m); commit(d, m, year)
  }
  const handleYear = (v) => {
    const y = Number(v); setYear(y); commit(day, month, y)
  }

  const label = value
    ? `${String(day).padStart(2,'0')} ${MONTHS[month]} ${year}`
    : '—'

  const yearNow = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => yearNow - 5 + i)
  const days = Array.from({ length: daysInMonth(month, year) }, (_, i) => i + 1)

  if (disabled || !editing) {
    return (
      <button
        className={styles.trigger}
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
      >
        {label}
        {!disabled && (
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity:0.45, flexShrink:0 }}>
            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        )}
      </button>
    )
  }

  return (
    <div className={styles.inlineEdit}>
      <Dropdown value={day} options={days}
        labels={days.map(d => String(d).padStart(2, '0'))}
        onSelect={handleDay} width={52} />
      <Dropdown value={month} options={MONTHS.map((_, i) => i)}
        labels={MONTHS}
        onSelect={handleMonth} width={56} />
      <Dropdown value={year} options={years}
        onSelect={handleYear} width={62} />
      <button className={styles.done} onClick={() => setEditing(false)}>✓</button>
    </div>
  )
}
