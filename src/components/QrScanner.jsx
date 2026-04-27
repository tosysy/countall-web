import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import styles from './QrScanner.module.css'

export default function QrScanner({ onResult, onClose }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const streamRef = useRef(null)
  const [error, setError]   = useState(null)
  const [ready, setReady]   = useState(false)
  const [found, setFound]   = useState(false)

  useEffect(() => {
    let active = true

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        videoRef.current.srcObject = stream
        videoRef.current.play()
        videoRef.current.addEventListener('loadedmetadata', () => { if (active) setReady(true) })
      } catch (e) {
        setError('No se pudo acceder a la cámara')
      }
    }

    start()
    return () => {
      active = false
      streamRef.current?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const canvas = canvasRef.current
    const video  = videoRef.current
    const ctx    = canvas.getContext('2d', { willReadFrequently: true })

    const scan = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })
        if (code?.data) {
          setFound(true)
          streamRef.current?.getTracks().forEach(t => t.stop())
          cancelAnimationFrame(rafRef.current)
          setTimeout(() => onResult(code.data), 200)
          return
        }
      }
      rafRef.current = requestAnimationFrame(scan)
    }

    rafRef.current = requestAnimationFrame(scan)
    return () => cancelAnimationFrame(rafRef.current)
  }, [ready])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Escanear QR</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className={styles.viewfinder}>
          <video ref={videoRef} className={styles.video} playsInline muted />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {/* Líneas de esquina */}
          <div className={styles.corners}>
            <span className={`${styles.corner} ${styles.tl}`} />
            <span className={`${styles.corner} ${styles.tr}`} />
            <span className={`${styles.corner} ${styles.bl}`} />
            <span className={`${styles.corner} ${styles.br}`} />
          </div>
          {/* Línea de escaneo animada */}
          {ready && !found && <div className={styles.scanLine} />}
          {found && (
            <div className={styles.foundOverlay}>
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#4CAF50" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {!error && !ready && <p className={styles.hint}>Iniciando cámara…</p>}
        {ready && !found && <p className={styles.hint}>Apunta al código QR del contador</p>}
      </div>
    </div>
  )
}
