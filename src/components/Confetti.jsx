import { useEffect, useRef } from 'react'

/**
 * Confeti a pantalla completa — dos cañones diagonales desde las esquinas
 * inferiores, con gravedad, balanceo y rotación (como ConfettiView de Android).
 * Se desmonta solo cuando termina la animación (~2.6 s).
 */
const COLORS = ['#FFC107', '#FF5252', '#4CAF50', '#2196F3', '#E040FB', '#FF9800', '#00BCD4']

export default function Confetti({ onDone }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth, H = window.innerHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const parts = []
    const spawn = (x, dir) => {
      for (let i = 0; i < 55; i++) {
        const angle = (-Math.PI / 2) + dir * (0.25 + Math.random() * 0.5)
        const speed = 9 + Math.random() * 9
        parts.push({
          x, y: H + 10,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          size: 5 + Math.random() * 6,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
          sway: Math.random() * Math.PI * 2,
        })
      }
    }
    spawn(0, +1)      // esquina inferior izquierda → arriba-derecha
    spawn(W, -1)      // esquina inferior derecha → arriba-izquierda

    const GRAVITY = 0.32
    let frame = 0
    let raf
    const tick = () => {
      frame++
      ctx.clearRect(0, 0, W, H)
      let alive = 0
      for (const p of parts) {
        p.vy += GRAVITY
        p.sway += 0.12
        p.x += p.vx + Math.sin(p.sway) * 0.8
        p.y += p.vy
        p.rot += p.vr
        if (p.y < H + 30) {
          alive++
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.fillStyle = p.color
          ctx.globalAlpha = frame > 120 ? Math.max(0, 1 - (frame - 120) / 40) : 1
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
          ctx.restore()
        }
      }
      if (alive > 0 && frame < 165) raf = requestAnimationFrame(tick)
      else onDone?.()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, zIndex: 99990,
      width: '100vw', height: '100vh', pointerEvents: 'none',
    }} />
  )
}
