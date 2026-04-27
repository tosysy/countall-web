import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './ColorPicker.module.css'

/* ── Color math ─────────────────────────────────────────────────────────── */
function hsvToRgb(h, s, v) {
  const i = Math.floor(h / 60) % 6
  const f = (h / 60) - Math.floor(h / 60)
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const cases = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]]
  const [r,g,b] = cases[i] ?? cases[0]
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)]
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min
  let h = 0
  if (d !== 0) {
    switch(max) {
      case r: h = 60 * (((g - b) / d) % 6); break
      case g: h = 60 * (((b - r) / d) + 2); break
      case b: h = 60 * (((r - g) / d) + 4); break
    }
  }
  if (h < 0) h += 360
  return [h, max === 0 ? 0 : d / max, max]
}

function hexToRgb(hex) {
  const clean = hex.replace('#','')
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0,2),16)
  const g = parseInt(clean.slice(2,4),16)
  const b = parseInt(clean.slice(4,6),16)
  if (isNaN(r)||isNaN(g)||isNaN(b)) return null
  return [r,g,b]
}

function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')
}

function parseInitialHsv(color) {
  if (!color) return [210, 0.47, 0.72]
  const rgb = hexToRgb(color)
  if (!rgb) return [210, 0.47, 0.72]
  return rgbToHsv(...rgb)
}

/* ── Image color picker mode ─────────────────────────────────────────────── */
function ImageColorPicker({ onPick, onBack }) {
  const canvasRef  = useRef(null)
  const imgRef     = useRef(null)
  const [imgLoaded, setImgLoaded]   = useState(false)
  const [magnifier, setMagnifier]   = useState(null) // {x, y, hex}

  // Load image from file input
  useEffect(() => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) { onBack(); return }
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width  = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        setImgLoaded(true)
        URL.revokeObjectURL(url)
      }
      img.src = url
    }
    input.oncancel = onBack
    input.click()
  }, [])

  const samplePixel = (e) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const px     = Math.round((e.clientX - rect.left) * scaleX)
    const py     = Math.round((e.clientY - rect.top)  * scaleY)
    const ctx    = canvas.getContext('2d', { willReadFrequently: true })
    const [r,g,b] = ctx.getImageData(Math.max(0,px), Math.max(0,py), 1, 1).data
    return rgbToHex(r,g,b)
  }

  const handlePointerMove = (e) => {
    if (!imgLoaded) return
    const hex = samplePixel(e)
    const rect = canvasRef.current.getBoundingClientRect()
    setMagnifier({ x: e.clientX - rect.left, y: e.clientY - rect.top, hex })
  }

  const handlePointerUp = (e) => {
    if (!imgLoaded) return
    const hex = samplePixel(e)
    if (hex) onPick(hex)
  }

  return (
    <div className={styles.imgPickerWrap}>
      <div className={styles.imgPickerHeader}>
        <button className={styles.imgPickerBack} onClick={onBack}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <span className={styles.imgPickerTitle}>Toca para elegir el color</span>
      </div>

      <div className={styles.imgPickerCanvas}>
        <canvas
          ref={canvasRef}
          className={styles.imgCanvas}
          style={{ cursor: imgLoaded ? 'crosshair' : 'wait' }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => setMagnifier(null)}
        />
        {!imgLoaded && (
          <div className={styles.imgLoading}>
            <span className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        )}
        {/* Magnifier bubble */}
        {magnifier && (
          <div
            className={styles.magnifier}
            style={{
              left:  Math.min(magnifier.x + 20, 240),
              top:   Math.max(magnifier.y - 60, 8),
              background: magnifier.hex,
            }}
          >
            <span className={styles.magnifierHex}
              style={{ color: isLight(magnifier.hex) ? '#000' : '#fff' }}>
              {magnifier.hex.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// Determina si un color es claro para elegir texto oscuro/claro
function isLight(hex) {
  const rgb = hexToRgb(hex); if (!rgb) return true
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 128
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function ColorPicker({ initialColor, onSave, onCancel, onReset, onPickImage }) {
  const [hsv, setHsv] = useState(() => parseInitialHsv(initialColor))
  const [hue, sat, val] = hsv
  const [hexInput, setHexInput] = useState(() => {
    const [r,g,b] = hsvToRgb(...parseInitialHsv(initialColor))
    return rgbToHex(r,g,b).slice(1).toUpperCase()
  })
  const [imageMode, setImageMode] = useState(false)

  const gradientRef = useRef(null)
  const hueRef = useRef(null)
  const dragging = useRef(null)

  const currentRgb = hsvToRgb(hue, sat, val)
  const currentHex = rgbToHex(...currentRgb)

  useEffect(() => {
    setHexInput(currentHex.slice(1).toUpperCase())
  }, [currentHex])

  const updateFromGradient = useCallback((clientX, clientY) => {
    const rect = gradientRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    setHsv(prev => [prev[0], x, 1 - y])
  }, [])

  const updateFromHue = useCallback((clientX) => {
    const rect = hueRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setHsv(prev => [x * 360, prev[1], prev[2]])
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX
      const cy = e.touches ? e.touches[0].clientY : e.clientY
      if (dragging.current === 'grad') updateFromGradient(cx, cy)
      if (dragging.current === 'hue')  updateFromHue(cx)
    }
    const onUp = () => { dragging.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [updateFromGradient, updateFromHue])

  const handleHexChange = (raw) => {
    const v = raw.replace(/[^0-9a-fA-F]/g,'').slice(0,6).toUpperCase()
    setHexInput(v)
    if (v.length === 6) {
      const rgb = hexToRgb('#' + v)
      if (rgb) setHsv(rgbToHsv(...rgb))
    }
  }

  const handleImagePick = (hex) => {
    const rgb = hexToRgb(hex)
    if (rgb) setHsv(rgbToHsv(...rgb))
    setImageMode(false)
  }

  const pureHue = `hsl(${hue}, 100%, 50%)`

  return (
    <div className={styles.backdrop} onPointerDown={onCancel}>
      <div className={styles.panel} onPointerDown={e => e.stopPropagation()}>
        <h3 className={styles.title}>Selector de Color</h3>

        {imageMode ? (
          <ImageColorPicker onPick={handleImagePick} onBack={() => setImageMode(false)} />
        ) : (
          <>
            {/* ── 2D gradient picker ─────────────────────────────────── */}
            <div
              ref={gradientRef}
              className={styles.gradient}
              style={{ '--hue-color': pureHue }}
              onPointerDown={e => {
                dragging.current = 'grad'
                e.currentTarget.setPointerCapture(e.pointerId)
                updateFromGradient(e.clientX, e.clientY)
              }}
            >
              <div className={styles.gradWhite} />
              <div className={styles.gradBlack} />
              <div
                className={styles.cursor}
                style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }}
              />
            </div>

            {/* ── Hue slider ─────────────────────────────────────────── */}
            <div
              ref={hueRef}
              className={styles.hueTrack}
              onPointerDown={e => {
                dragging.current = 'hue'
                e.currentTarget.setPointerCapture(e.pointerId)
                updateFromHue(e.clientX)
              }}
            >
              <div className={styles.hueThumb} style={{ left: `${(hue / 360) * 100}%` }} />
            </div>

            {/* ── Preview + HEX ──────────────────────────────────────── */}
            <div className={styles.infoRow}>
              <div className={styles.preview} style={{ background: currentHex }} />
              <div className={styles.infoBlock}>
                <div className={styles.hexRow}>
                  <div className={styles.hexBox}>
                    <span className={styles.hexLabel}>HEX</span>
                    <div className={styles.hexInputRow}>
                      <span className={styles.hexHash}>#</span>
                      <input
                        className={styles.hexInput}
                        value={hexInput}
                        onChange={e => handleHexChange(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </div>
                <p className={styles.colorInfo}>RGB: {currentRgb.join(', ')}</p>
                <p className={styles.colorInfo}>
                  HSV: {Math.round(hue)}°, {Math.round(sat*100)}%, {Math.round(val*100)}%
                </p>
              </div>
            </div>

            {/* ── Action buttons ─────────────────────────────────────── */}
            <div className={styles.actionsTop}>
              <button className={styles.actionBtn} onClick={() => setImageMode(true)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
                IMAGEN
              </button>
              <button className={styles.actionBtn} onClick={onReset}>
                RESTABLECER
              </button>
            </div>
            <div className={styles.actionsCenter}>
              <button className={styles.actionBtn} onClick={onPickImage}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
                FONDO
              </button>
            </div>
          </>
        )}

        {/* ── Footer ─────────────────────────────────────────────────── */}
        {!imageMode && (
          <div className={styles.footer}>
            <button className={styles.cancelBtn} onClick={onCancel}>Cancelar</button>
            <button className={styles.saveBtn} onClick={() => onSave(currentHex)}>Guardar</button>
          </div>
        )}
      </div>
    </div>
  )
}
