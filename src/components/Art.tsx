/** Original pastel Japan illustrations (pure SVG/CSS, no external images). */

export function FujiScene({ className = '', sun = true }: { className?: string; sun?: boolean }) {
  return (
    <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="fj-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde2e4" stopOpacity="0" />
          <stop offset="1" stopColor="#fde2e4" />
        </linearGradient>
        <linearGradient id="fj-mtn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a5b4fc" />
          <stop offset="1" stopColor="#c7d2fe" />
        </linearGradient>
        <pattern id="fj-wave" width="28" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 14a14 14 0 0 1 28 0M4 14a10 10 0 0 1 20 0M8 14a6 6 0 0 1 12 0" fill="none" stroke="#ffffff" strokeWidth="1.4" opacity=".8" />
        </pattern>
      </defs>
      <rect width="400" height="220" fill="url(#fj-sky)" />
      {sun && <circle cx="300" cy="78" r="30" fill="#f9a8b8" opacity=".9" />}
      <path d="M40 220 L170 82 Q200 62 230 82 L370 220 Z" fill="url(#fj-mtn)" />
      <path d="M170 82 Q200 62 230 82 L216 98 L206 90 L198 101 L188 91 L180 99 Z" fill="#ffffff" />
      <path d="M-20 220 L70 150 Q90 138 110 150 L200 220 Z" fill="#c4b5fd" opacity=".55" />
      <path d="M250 220 L330 160 Q345 150 360 160 L440 220 Z" fill="#c4b5fd" opacity=".55" />
      <rect y="186" width="400" height="34" fill="#93c5fd" opacity=".55" />
      <rect y="186" width="400" height="34" fill="url(#fj-wave)" />
    </svg>
  )
}

export function Torii({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M6 14 Q32 6 58 14 L56 20 Q32 13 8 20 Z" fill="#c8102e" />
      <rect x="12" y="24" width="40" height="5" rx="1" fill="#c8102e" />
      <rect x="16" y="18" width="5" height="44" rx="1" fill="#c8102e" />
      <rect x="43" y="18" width="5" height="44" rx="1" fill="#c8102e" />
      <rect x="29.5" y="19" width="5" height="6" fill="#c8102e" />
    </svg>
  )
}

/** Falling sakura petals overlay. */
export function Petals({ count = 14 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * 37) % 100, delay = (i * 0.73) % 6, dur = 7 + ((i * 1.9) % 5), size = 8 + ((i * 5) % 9)
        return (
          <span key={i} className="petal" style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${dur}s`, width: size, height: size * 0.8 }} />
        )
      })}
    </div>
  )
}

/** Thin seigaiha (wave) strip used as a decorative band. */
export function WaveBand({ className = '' }: { className?: string }) {
  return <div className={`wave-band ${className}`} aria-hidden />
}
