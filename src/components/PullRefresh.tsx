import { useEffect, useRef, useState } from 'react'
import { buzz } from '../motion'

/** Pull down at the top of a screen to reload, with a little sakura spinner. */
export default function PullRefresh({ onRefresh, enabled }: { onRefresh: () => Promise<void>; enabled: boolean }) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<number | null>(null)
  const pullRef = useRef(0)
  const TRIGGER = 64

  useEffect(() => {
    if (!enabled) return
    const down = (e: TouchEvent) => {
      // only from the very top, and never while a sheet or menu is open
      start.current = window.scrollY <= 0 && !document.querySelector('.sheet') && !busy ? e.touches[0].clientY : null
    }
    const move = (e: TouchEvent) => {
      if (start.current == null) return
      const dy = e.touches[0].clientY - start.current
      if (dy <= 0 || window.scrollY > 0) { pullRef.current = 0; setPull(0); return }
      const p = Math.min(96, dy * 0.45)
      if (p >= TRIGGER && pullRef.current < TRIGGER) buzz(8)
      pullRef.current = p; setPull(p)
    }
    const up = async () => {
      if (start.current == null) return
      start.current = null
      const p = pullRef.current
      pullRef.current = 0; setPull(0)
      if (p >= TRIGGER) {
        setBusy(true)
        try { await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 700))]) } finally { setBusy(false) }
      }
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', up)
    window.addEventListener('touchcancel', up)
    return () => {
      window.removeEventListener('touchstart', down); window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up); window.removeEventListener('touchcancel', up)
    }
  }, [enabled, onRefresh, busy])

  if (!busy && pull < 6) return null
  const shown = busy ? TRIGGER : pull
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-[650] flex justify-center"
      style={{ transform: `translateY(${shown - 30}px)`, opacity: Math.min(1, shown / TRIGGER) }}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md">
        <svg viewBox="0 0 40 40" className={`h-7 w-7 ${busy ? 'ptr-spin' : ''}`} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} aria-hidden>
          {[0, 72, 144, 216, 288].map((a) => (
            <path key={a} transform={`rotate(${a} 20 20)`} fill="#f2a3b4" stroke="#d65a6f" strokeWidth="1"
              d="M20 20 C 14 14, 14 6, 18 4 L 20 6.5 L 22 4 C 26 6, 26 14, 20 20 Z" />
          ))}
          <circle cx="20" cy="20" r="3" fill="#fff4f1" stroke="#d65a6f" strokeWidth="1" />
        </svg>
      </div>
      {busy && <span className="sr-only">Refreshing</span>}
    </div>
  )
}
