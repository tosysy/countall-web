import { useState, useEffect } from 'react'
import styles from './DatePicker.module.css'

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function daysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate()
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
      <select className={styles.sel} value={day} onChange={e => handleDay(e.target.value)}>
        {Array.from({ length: daysInMonth(month, year) }, (_, i) => i + 1).map(d => (
          <option key={d} value={d}>{String(d).padStart(2,'0')}</option>
        ))}
      </select>
      <select className={styles.sel} value={month} onChange={e => handleMonth(e.target.value)}>
        {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
      </select>
      <select className={styles.sel} value={year} onChange={e => handleYear(e.target.value)}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <button className={styles.done} onClick={() => setEditing(false)}>✓</button>
    </div>
  )
}
