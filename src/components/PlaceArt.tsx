/** Original placeholder illustrations (line-art on a pastel wash), one per kind. Colour wash is picked per place. */

export const WASHES = [
  { bg: '#fde2e4', line: '#c8102e', sun: '#f5a5b4' }, // sakura
  { bg: '#e2efd9', line: '#3f7d4e', sun: '#a9d4a3' }, // matcha
  { bg: '#dcebfb', line: '#2f5ea8', sun: '#9fc3ef' }, // sky
  { bg: '#fdeace', line: '#c2571b', sun: '#f6b77a' }, // yuzu
  { bg: '#ece3fb', line: '#6b46c1', sun: '#c8b6fb' }, // fuji
] as const

export const washFor = (id: string) => WASHES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % WASHES.length]

export function FoodArt({ id, className = '' }: { id: string; className?: string }) {
  const w = washFor(id)
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <rect width="100" height="100" fill={w.bg} />
      <circle cx="58" cy="40" r="26" fill={w.sun} />
      {/* steam */}
      <g fill="none" stroke={w.line} strokeWidth="1.6" strokeLinecap="round" opacity=".7">
        <path d="M38 34c-3-4 3-6 0-10" /><path d="M48 30c-3-4 3-6 0-10" /><path d="M58 34c-3-4 3-6 0-10" />
      </g>
      {/* chopsticks */}
      <g stroke={w.line} strokeWidth="2.2" strokeLinecap="round">
        <line x1="62" y1="52" x2="90" y2="24" /><line x1="66" y1="54" x2="94" y2="30" />
      </g>
      {/* noodles + egg + bowl */}
      <path d="M22 56c6-6 12 4 18-2s12 4 18-2 12 4 18-2" fill="none" stroke={w.line} strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="38" cy="54" rx="7" ry="5" fill="#fff" stroke={w.line} strokeWidth="1.6" />
      <circle cx="38" cy="54" r="2.6" fill={w.sun} stroke={w.line} strokeWidth="1" />
      <path d="M16 58h68c0 15-14 24-34 24S16 73 16 58z" fill="#fff" stroke={w.line} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M22 66h56" stroke={w.line} strokeWidth="1.4" />
      <g fill="none" stroke={w.line} strokeWidth="1.2">
        {[28, 38, 48, 58, 68].map((x) => <path key={x} d={`M${x - 4} 72a4 4 0 0 1 8 0`} />)}
      </g>
      <path d="M40 82h20l-2 5H42z" fill={w.line} />
    </svg>
  )
}

export function ActivityArt({ id, className = '' }: { id: string; className?: string }) {
  const w = washFor(id)
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <rect width="100" height="100" fill={w.bg} />
      <circle cx="70" cy="28" r="14" fill={w.sun} />
      {/* mountain */}
      <path d="M0 78 L38 40 Q46 33 54 40 L100 80 V100 H0z" fill="#fff" stroke={w.line} strokeWidth="2" strokeLinejoin="round" />
      <path d="M38 40 Q46 33 54 40 L50 45 L46 41 L42 46z" fill={w.line} opacity=".85" />
      {/* torii */}
      <g fill={w.line}>
        <path d="M14 52 Q34 46 56 52 L55 56 Q34 51 15 56z" />
        <rect x="18" y="59" width="34" height="3" rx="1" />
        <rect x="21" y="55" width="3.4" height="35" rx="1" />
        <rect x="46" y="55" width="3.4" height="35" rx="1" />
        <rect x="33.5" y="55" width="3" height="5" />
      </g>
      {/* ground waves */}
      <g fill="none" stroke={w.line} strokeWidth="1.2" opacity=".7">
        {[8, 26, 62, 80].map((x) => <path key={x} d={`M${x} 94a6 6 0 0 1 12 0`} />)}
      </g>
    </svg>
  )
}
