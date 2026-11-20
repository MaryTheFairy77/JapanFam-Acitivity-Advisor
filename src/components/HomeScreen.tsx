import { lazy, Suspense, useMemo } from 'react'
import { HOTELS, catOf, regionOf, type Place, type Region } from '../lib'
import { tripToday } from '../tools'

const MiniMap = lazy(() => import('./MiniMap'))

/**
 * 🏠 Home v3 (Maryam's sketch, 20 Nov 2026 evening): the real map front and centre (tap → full map),
 * three big buttons (Activities · Food · Plan), and a Tokyo vs Osaka chart of 👍 votes per category.
 * Tools (salah, ¥↔R, taxi card) and "suggested for today" live in the face menu. Read-only: nothing here writes data.
 */
export type Door = 'map' | 'restaurant' | 'activity' | 'plan'

const CATS = [
  { key: 'activity', label: 'Activities', test: (p: Place) => p.kind === 'activity' && catOf(p) === 'activity' },
  { key: 'shop', label: 'Shops', test: (p: Place) => p.kind === 'activity' && catOf(p) === 'shopping' },
  { key: 'dessert', label: 'Dessert', test: (p: Place) => p.kind === 'restaurant' && (p.taste === 'sweet' || p.taste === 'both') },
  { key: 'food', label: 'Food', test: (p: Place) => p.kind === 'restaurant' && p.taste !== 'sweet' },
] as const
// Tokyo darker purple, Osaka lighter blue: told apart by lightness too, not only by colour
const CITY: { r: Region; label: string; color: string }[] = [
  { r: 'kanto', label: 'Tokyo', color: '#6a4cae' },
  { r: 'kansai', label: 'Osaka', color: '#7fb2f0' },
]

export default function HomeScreen({ places, voteCount, onGo }: {
  places: Place[]; voteCount: Record<string, number>
  onGo: (d: Door) => void
}) {
  const t = tripToday()
  const H = HOTELS[t.hotel]

  const data = useMemo(() => CATS.map((c) => ({
    ...c,
    v: Object.fromEntries(CITY.map(({ r }) => [r, places.filter((p) => c.test(p) && regionOf(p) === r).reduce((s, p) => s + (voteCount[p.id] ?? 0), 0)])) as Record<Region, number>,
  })), [places, voteCount])
  const max = Math.max(1, ...data.flatMap((d) => CITY.map(({ r }) => d.v[r])))
  const step = max <= 10 ? 2 : max <= 25 ? 5 : max <= 60 ? 10 : 20
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
  const CH = 150 // chart height in px

  return (
    <div className="relative z-10 space-y-5 px-4 pb-10 pt-4">
      {/* The map, front and centre */}
      <button onClick={() => onGo('map')} aria-label={`Open the map (${H.city})`}
        className="relative block aspect-square w-full overflow-hidden rounded-[28px] border-[3px] border-torii bg-[#fbf3e6] shadow-md active:scale-[.99]">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-[#fbf3e6]" />}>
          <MiniMap places={places} region={H.region} hotel={t.hotel} />
        </Suspense>
        <span className="absolute bottom-3 left-3 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-torii bg-white text-3xl shadow">🗾</span>
        <span className="absolute bottom-4 right-3 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-ink shadow-sm">Open map ›</span>
      </button>

      {/* Three big buttons */}
      <nav aria-label="Go to" className="grid grid-cols-3 gap-3">
        {([['activity', '⛩️', 'Activities', '#fde2e4'], ['restaurant', '🍜', 'Food', '#ffe5d0'], ['plan', '📋', 'Plan', '#e0e7ff']] as const).map(([k, e, label, bg]) => (
          <button key={k} data-sound="tab" onClick={() => onGo(k)} className="flex flex-col items-center gap-1.5 active:scale-[.97]">
            <span style={{ background: bg }} className="flex aspect-square w-full items-center justify-center rounded-[22px] border-[3px] border-torii text-5xl shadow-sm">{e}</span>
            <span className="text-base font-semibold">{label}</span>
          </button>
        ))}
      </nav>

      {/* Tokyo vs Osaka: 👍 votes per category */}
      <section className="rounded-3xl bg-white p-4 shadow-sm" aria-labelledby="chart-title">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 id="chart-title" className="flex-1 font-semibold">👍 Votes by city</h2>
          {CITY.map((c) => (
            <span key={c.r} className="flex items-center gap-1.5 text-sm text-stone-600"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.label}</span>
          ))}
        </div>
        <div className="relative mt-5" style={{ height: CH + 28 }}>
          {ticks.map((v) => (
            <div key={v} className="absolute inset-x-0 flex items-center" style={{ bottom: 28 + (v / top) * CH - 6 }}>
              <span className="w-6 text-right text-[10px] tabular-nums text-stone-400">{v}</span>
              <span className="ml-1 h-px flex-1 bg-stone-100" />
            </div>
          ))}
          <div className="absolute bottom-0 left-8 right-0 grid grid-cols-4 gap-3" style={{ height: CH + 28 }}>
            {data.map((d) => (
              <div key={d.key} className="flex flex-col items-center justify-end">
                <div className="flex w-full items-end justify-center gap-1" style={{ height: CH }}>
                  {CITY.map((c) => (
                    <div key={c.r} className="relative flex w-1/2 max-w-[22px] justify-center rounded-t-md" title={`${c.label} ${d.label}: ${d.v[c.r]} votes`}
                      style={{ height: Math.max(2, (d.v[c.r] / top) * CH), background: c.color }}>
                      <span className="absolute -top-4 text-[10px] font-semibold tabular-nums text-stone-600">{d.v[c.r]}</span>
                    </div>
                  ))}
                </div>
                <span className="mt-1.5 h-5 text-[12px] font-medium text-stone-600">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="sr-only">{data.map((d) => `${d.label}: Tokyo ${d.v.kanto}, Osaka ${d.v.kansai}`).join('. ')}</p>
      </section>
    </div>
  )
}
