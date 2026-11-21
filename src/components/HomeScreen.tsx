import { lazy, Suspense, useMemo } from 'react'
import { HOTELS, catOf, km, regionOf, type Place } from '../lib'
import Thumb from './Thumb'
import { tripToday } from '../tools'

const MiniMap = lazy(() => import('./MiniMap'))

/**
 * 🏠 Home v3 (Maryam's sketch, 20 Nov 2026 evening): the real map front and centre (tap → full map),
 * three big buttons (Activities · Food · Plan), and a Tokyo vs Osaka chart of 👍 votes per category.
 * Tools (salah, ¥↔R, taxi card) and "suggested for today" live in the face menu. Read-only: nothing here writes data.
 */
export type Door = 'map' | 'restaurant' | 'activity' | 'plan'

/** Sumo ranks, top to bottom (横綱 grand champion … 前頭 senior division). */
const RANKS = [['横綱', 'Yokozuna'], ['大関', 'Ōzeki'], ['関脇', 'Sekiwake'], ['小結', 'Komusubi'], ['前頭', 'Maegashira']] as const
// banzuke stays vibrant (torii red / indigo); the stamps are the muted pastel ones (Maryam, 21 Nov)
/** 三賞: sumo's three special prizes, one per kind of place */
const PRIZES = [
  { e: '🍜', label: 'Food', test: (p: Place) => p.kind === 'restaurant' },
  { e: '⛩️', label: 'Activity', test: (p: Place) => p.kind === 'activity' && catOf(p) === 'activity' },
  { e: '🛍️', label: 'Shop', test: (p: Place) => p.kind === 'activity' && catOf(p) === 'shopping' },
]

export default function HomeScreen({ places, voteCount, photoUrls, onGo, onOpen }: {
  places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>
  onGo: (d: Door) => void; onOpen: (p: Place) => void
}) {
  const t = tripToday()
  const H = HOTELS[t.hotel]

  // 番付: places nobody has ticked "been", most 👍 first; ties → closest to tonight's hotel
  const rank = useMemo(() => {
    const dist = (p: Place) => (p.lat != null && p.lng != null ? km({ lat: p.lat, lng: p.lng }, H) : 999)
    const pool = places.filter((p) => !p.visited && (voteCount[p.id] ?? 0) > 0)
      .sort((a, b) => (voteCount[b.id] ?? 0) - (voteCount[a.id] ?? 0) || dist(a) - dist(b))
    return {
      east: pool.filter((p) => regionOf(p) === 'kanto').slice(0, 5),
      west: pool.filter((p) => regionOf(p) === 'kansai').slice(0, 5),
      prizes: PRIZES.map((z) => ({ ...z, p: pool.find(z.test) ?? null })),
    }
  }, [places, voteCount, H])

  const Side = ({ title, en, color, list }: { title: string; en: string; color: string; list: Place[] }) => (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-center gap-1.5 rounded-lg py-1 text-white" style={{ background: color }}>
        <span className="font-jp text-lg font-bold leading-none">{title}</span><span className="text-[11px] font-semibold">{en}</span>
      </div>
      {list.length ? (
        <ol className="space-y-1.5">
          {list.map((p, i) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p)} aria-label={`${RANKS[i][1]}: ${p.name}, ${voteCount[p.id] ?? 0} votes`}
                className={`flex w-full items-stretch overflow-hidden rounded-xl bg-white text-left ${i === 0 ? 'border-2' : 'border border-stone-200'}`}
                style={{ borderColor: i === 0 ? color : undefined }}>
                {/* rank written top-to-bottom, like a real banzuke */}
                <span className="font-jp flex w-6 shrink-0 items-center justify-center py-1 text-[13px] font-bold leading-[1.05] text-white [writing-mode:vertical-rl]"
                  style={{ background: color, opacity: 1 - i * 0.12 }}>{RANKS[i][0]}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 p-1.5">
                  <Thumb place={p} photoUrls={photoUrls} className={`shrink-0 rounded-full ${i === 0 ? 'h-11 w-11' : 'h-8 w-8'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`line-clamp-2 font-semibold leading-tight text-ink [overflow-wrap:anywhere] ${i === 0 ? 'text-[13px]' : 'text-[12px]'}`}>{p.name}</span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{voteCount[p.id] ?? 0} 👍</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : <p className="py-4 text-center text-xs text-stone-500">No votes yet</p>}
    </div>
  )

  return (
    <div className="relative z-10 space-y-5 px-4 pb-10 pt-4">
      {/* The map, front and centre */}
      <button onClick={() => onGo('map')} aria-label={`Open the map (${H.city})`}
        className="relative block aspect-square w-full overflow-hidden rounded-[28px] border-[3px] border-[#d65a6f] bg-[#fbf3e6] shadow-md active:scale-[.99]">
        <Suspense fallback={<div className="h-full w-full animate-pulse bg-[#fbf3e6]" />}>
          <MiniMap places={places} region={H.region} hotel={t.hotel} />
        </Suspense>
        {/* vertical 地図 / MAP tag, like a Japanese shop sign */}
        <span aria-hidden className="absolute left-3 top-3 flex flex-col items-center rounded-lg bg-[#d65a6f] p-[3px] shadow">
          <span className="flex flex-col items-center rounded-[5px] border-[1.5px] border-white/90 px-1.5 pb-1 pt-1.5 text-white">
            <span className="font-jp text-[26px] font-bold leading-[1.05]">地</span>
            <span className="font-jp text-[26px] font-bold leading-[1.05]">図</span>
            <span className="mt-1 text-[10px] font-extrabold tracking-[.12em]">MAP</span>
          </span>
        </span>
        <span className="absolute bottom-3 right-3 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#d65a6f] bg-white shadow">
          <img src="/stamps/japan.svg" alt="" width={36} height={36} className="h-9 w-9" />
        </span>
      </button>

      {/* Three big buttons, drawn as Japanese postage stamps (original art, public/stamps; made by scripts/make-stamps.py) */}
      <nav aria-label="Go to" className="grid grid-cols-3 gap-3">
        {([['activity', 'activities', 'Activities'], ['restaurant', 'food', 'Food'], ['plan', 'plan', 'Plan']] as const).map(([k, img, label], i) => (
          <button key={k} data-sound="tab" onClick={() => onGo(k)}
            className={`group flex flex-col items-center gap-1.5 transition active:scale-[.96] ${['-rotate-2', 'rotate-1', '-rotate-1'][i]}`}>
            <img src={`/stamps/stamp-${img}.svg`} alt="" width={120} height={148} draggable={false}
              className="w-full drop-shadow-[0_4px_6px_rgba(60,40,30,.28)] transition group-hover:-translate-y-0.5" />
            <span className="text-base font-semibold">{label}</span>
          </button>
        ))}
      </nav>

      {/* 番付 Banzuke: a sumo ranking sheet. East = Tokyo (red), West = Osaka (indigo). */}
      <section aria-labelledby="banzuke-title" className="relative rounded-[22px] border-[3px] border-[#c8102e] bg-[#fbf3e6] p-1.5 shadow-md">
        <div className="rounded-[16px] border border-[#c8102e]/60 px-3 pb-3 pt-2">
          <div className="flex items-center justify-center gap-2">
            <span className="h-px flex-1 bg-[#c8102e]/40" />
            <h2 id="banzuke-title" className="text-center">
              <span className="block font-jp text-2xl font-bold leading-none text-[#c8102e]">番付</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[.2em] text-stone-500">Banzuke · top places</span>
            </h2>
            <span className="h-px flex-1 bg-[#c8102e]/40" />
          </div>
          <p className="mt-1 text-center text-[11px] text-stone-500">Most 👍 · not visited yet</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Side title="東" en="East · Tokyo" color="#c8102e" list={rank.east} />
            <Side title="西" en="West · Osaka" color="#1f3a6d" list={rank.west} />
          </div>
          <div className="mt-3 border-t border-dashed border-[#c8102e]/40 pt-2">
            <p className="text-center text-[11px] font-semibold text-stone-500"><span className="font-jp text-sm text-[#c8102e]">三賞</span> Special prizes</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {rank.prizes.map((z) => (
                <button key={z.label} disabled={!z.p} onClick={() => z.p && onOpen(z.p)}
                  className="flex flex-col items-center gap-0.5 rounded-xl bg-white/80 px-1 py-2 text-center disabled:opacity-50">
                  <span className="text-xl">{z.e}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-stone-500">{z.label}</span>
                  <span className="line-clamp-2 text-[12px] font-semibold leading-tight">{z.p?.name ?? '—'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
