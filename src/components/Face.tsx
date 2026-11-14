import { useEffect, useState } from 'react'
import { displayName, type Member } from '../lib'

/**
 * An emoji avatar you can tap: a see-through name bubble pops up above it for ~2.5 s.
 * Only one bubble is open at a time (opening one closes the others).
 * `inButton`: use inside another button/row (renders a span so HTML stays valid; the tap doesn't open the row).
 */
const EVT = 'jf-face-open'
let seq = 0

export default function Face({ m, className = '', inButton = false }: { m: Member; className?: string; inButton?: boolean }) {
  const [id] = useState(() => ++seq)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent<number>).detail !== id) setOpen(false) }
    window.addEventListener(EVT, other)
    return () => window.removeEventListener(EVT, other)
  }, [id])
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setOpen(false), 2500)
    return () => clearTimeout(t)
  }, [open])

  const toggle = (e: React.SyntheticEvent) => {
    e.stopPropagation(); e.preventDefault()
    if (!open) window.dispatchEvent(new CustomEvent(EVT, { detail: id }))
    setOpen(!open)
  }
  const name = displayName(m)
  const bubble = open && (
    <span role="status" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink/75 px-2 py-1 text-xs font-medium text-white shadow backdrop-blur-sm">
      {name}
    </span>
  )
  const cls = `relative inline-flex items-center justify-center leading-none ${className}`
  return inButton ? (
    <span role="button" tabIndex={0} aria-label={name} data-sound="tap" onClick={toggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e) }} className={cls}>
      {m.emoji}{bubble}
    </span>
  ) : (
    <button type="button" aria-label={name} data-sound="tap" onClick={toggle} className={cls}>{m.emoji}{bubble}</button>
  )
}
