import { useMemo, useState } from 'react'
import { ChevronRight, Phone, X } from 'lucide-react'
import { HOTELS, catOf, regionOf, type Place, type Region } from '../lib'
import { planTrip } from '../itinerary'
import { usePlanData } from './TripPlan'
import { useWeather } from '../extras'
import { mosquesNear } from '../mosques'
import { PRAYER_NAMES, hhmm, nextPrayer, prayerTimes } from '../prayer'
import { TAXI, tripToday, useYenRate } from '../tools'
import Thumb from './Thumb'

/**
 * 🏠 Home (Phase 2, picked by Maryam 20 Nov 2026, mockup "H1"): the centre of the app.
 * Overview first (tonight's hotel, today's suggestion, family favourites), then big doors into Map · Food · Do · Plan.
 * Read-only: nothing here writes to the database. Compare's numbers now live in "🏆 Family favourites".
 */
export type Door = 'map' | 'restaurant' | 'activity' | 'plan'

const fmtDay = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const sheetCls = 'fixed inset-0 z-[950] flex items-end justify-center bg-black/40'
const panelCls = 'max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-washi p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl'

export default function HomeScreen({ places, voteCount, photoUrls, onGo, onOpen, onOpenDay }: {
  places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>
  onGo: (d: Door) => void; onOpen: (p: Place) => void; onOpenDay: (date: string) => void
}) {
  const t = tripToday()
  const H = HOTELS[t.hotel]
  const weather = useWeather(H.region) // today's forecast: only shown during the trip (before it, it isn't that day's weather)
  const { plans } = usePlanData()
  const today = useMemo(() => planTrip(places, voteCount, plans).find((d) => d.date === t.day.date) ?? null, [places, voteCount, plans, t.day.date])
  const [tool, setTool] = useState<'prayer' | 'money' | 'taxi' | null>(null)
  const [area, setArea] = useState<Region>(H.region)
  const pray = prayerTimes(t.day.date, H.lat, H.lng)
  const next = t.nowMin != null ? nextPrayer(pray, t.nowMin) : null
  const rate = useYenRate()

  // 🏆 favourites: places we haven't been to yet, in the chosen area, by votes
  const fav = useMemo(() => {
    const pool = places.filter((p) => !p.visited && (regionOf(p) ?? H.region) === area)
      .map((p) => ({ p, v: voteCount[p.id] ?? 0 })).sort((a, b) => b.v - a.v || a.p.name.localeCompare(b.p.name))
    const podium = pool.filter((x) => x.v > 0).slice(0, 3)
    const onPodium = new Set(podium.map((x) => x.p.id))
    const best = (f: (p: Place) => boolean) => pool.find((x) => f(x.p) && x.v > 0 && !onPodium.has(x.p.id)) ?? pool.find((x) => f(x.p) && x.v > 0) ?? null
    return {
      podium,
      wins: [
        { e: '🛍️', label: 'Top shop', x: best((p) => p.kind === 'activity' && catOf(p) === 'shopping') },
        { e: '🎢', label: 'Top activity', x: best((p) => p.kind === 'activity' && catOf(p) === 'activity') },
        { e: '🍡', label: 'Top sweet', x: best((p) => p.kind === 'restaurant' && (p.taste === 'sweet' || p.taste === 'both')) },
        { e: '🍜', label: 'Top savoury', x: best((p) => p.kind === 'restaurant' && (p.taste === 'savory' || p.taste === 'both')) },
      ],
    }
  }, [places, voteCount, area, H.region])

  const stops = today?.timeline
    ? today.timeline.steps.flatMap((s) => [...s.places.map((p) => ({ key: p.id, e: null as string | null, p, label: p.name, at: s.arrive })), ...s.prayers.map((pr, i) => ({ key: `${pr.name}-${i}`, e: '🕌', p: null as Place | null, label: pr.name, at: pr.at }))])
      .sort((a, b) => a.at - b.at)
    : (today?.acts ?? []).map((p) => ({ key: p.id, e: null as string | null, p, label: p.name, at: null as number | null }))

  const podiumOrder = [1, 0, 2].map((i) => fav.podium[i]).filter(Boolean)
  const heights = ['h-28', 'h-20', 'h-16']

  return (
    <div className="relative z-10 space-y-4 px-4 pb-10 pt-3">
      {/* Tonight's hotel */}
      <button onClick={() => onGo('map')} className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left shadow-sm">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#fde2e4] text-4xl">🏯</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-torii">
            {t.phase === 'before' ? `First night · ${fmtDay(t.day.date)} · in ${t.daysTo} day${t.daysTo === 1 ? '' : 's'}` : t.phase === 'after' ? 'Last stop' : `Tonight · ${fmtDay(t.day.date)}`}
          </span>
          <span className="block font-display text-lg leading-tight">{H.short}</span>
          <span className="block text-sm text-stone-600">
            {H.region === 'kanto' ? '🗼' : '🦌'} {H.city}{t.phase === 'during' && weather && <> · {weather.rain != null ? (weather.rain >= 50 ? '☔' : '☀️') : '🌤️'} {weather.max}° / {weather.min}°</>}
          </span>
        </span>
      </button>

      {/* The four doors */}
      <nav aria-label="Go to" className="grid grid-cols-2 gap-3">
        {([['map', '🗾', 'Map', '#dbeafe'], ['restaurant', '🍜', 'Food', '#ffe5d0'], ['activity', '🎢', 'Do', '#e9d5ff'], ['plan', '🗓️', 'Plan', '#d8f3dc']] as const).map(([k, e, label, bg]) => (
          <button key={k} data-sound="tab" onClick={() => onGo(k)} style={{ background: bg }}
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-3xl text-lg font-semibold text-ink shadow-sm active:scale-[.97]">
            <span className="text-5xl">{e}</span>{label}
          </button>
        ))}
      </nav>

      {/* Today's suggestion */}
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <button onClick={() => onOpenDay(t.day.date)} className="flex w-full items-center text-left">
          <span className="flex-1 font-semibold">✨ Suggested for {t.phase === 'during' ? 'today' : fmtDay(t.day.date)}</span>
          <span className="flex items-center text-sm font-medium text-iris">Open<ChevronRight className="h-4 w-4" /></span>
        </button>
        {stops.length ? (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {stops.map((s) => (
              <button key={s.key} onClick={() => (s.p ? onOpen(s.p) : onOpenDay(t.day.date))} className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
                {s.p ? <Thumb place={s.p} photoUrls={photoUrls} className="h-16 w-16 rounded-2xl" />
                  : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">{s.e}</span>}
                <span className="line-clamp-2 text-[12px] font-medium leading-tight">{s.label}</span>
                {s.at != null && <span className="text-[11px] text-stone-500">{hhmm(s.at)}</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">{t.day.last ? '✈️ Flying home' : 'Vote for places and a suggested day appears here.'}</p>
        )}
      </section>

      {/* Tools */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setTool('prayer')} className="flex min-h-[84px] flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-2 text-center">
          <span className="text-2xl">🕌</span>
          <span className="text-sm font-semibold">{next ? `${next.label} ${hhmm(next.at)}` : 'Salah times'}</span>
          <span className="text-[11px] text-stone-500">{next ? 'next' : fmtDay(t.day.date)}</span>
        </button>
        <button onClick={() => setTool('money')} className="flex min-h-[84px] flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-2 text-center">
          <span className="text-2xl">💴</span><span className="text-sm font-semibold">¥ ↔ R</span>
          <span className="text-[11px] text-stone-500">¥1,000 ≈ R{Math.round(1000 * rate.zarPerYen)}</span>
        </button>
        <button onClick={() => setTool('taxi')} className="flex min-h-[84px] flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-2 text-center">
          <span className="text-2xl">🚕</span><span className="text-sm font-semibold">Taxi card</span>
          <span className="text-[11px] text-stone-500">Show the driver</span>
        </button>
      </div>

      {/* 🏆 Family favourites (replaces Compare) */}
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 font-semibold">🏆 Favourites</h2>
          <div className="flex rounded-full bg-stone-100 p-0.5 text-sm" role="tablist">
            {([['kanto', '🗼 Tokyo'], ['kansai', '🦌 Osaka']] as const).map(([r, label]) => (
              <button key={r} role="tab" aria-selected={area === r} onClick={() => setArea(r)}
                className={`rounded-full px-3 py-1 ${area === r ? 'bg-iris text-white' : 'text-stone-600'}`}>{label}</button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-stone-500">Most 👍 · only places we haven't been to yet</p>
        {fav.podium.length ? (
          <div className="mt-3 flex items-end gap-2">
            {podiumOrder.map((x) => {
              const rank = fav.podium.indexOf(x)
              return (
                <button key={x.p.id} onClick={() => onOpen(x.p)} className="flex flex-1 flex-col items-center gap-1">
                  <Thumb place={x.p} photoUrls={photoUrls} className="h-14 w-14 rounded-full ring-2 ring-white" />
                  <span className="line-clamp-2 text-center text-[12px] font-medium leading-tight">{x.p.name}</span>
                  <span className={`flex w-full flex-col items-center justify-start rounded-t-2xl pt-2 ${heights[rank]} ${['bg-amber-100', 'bg-stone-100', 'bg-orange-100'][rank]}`}>
                    <span className="text-2xl">{['🥇', '🥈', '🥉'][rank]}</span>
                    <span className="text-sm font-bold">{x.v} 👍</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : <p className="mt-3 text-sm text-stone-500">No votes here yet.</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {fav.wins.map((w) => (
            <button key={w.label} disabled={!w.x} onClick={() => w.x && onOpen(w.x.p)} className="flex items-center gap-2 rounded-2xl bg-washi p-2 text-left disabled:opacity-50">
              <span className="text-2xl">{w.e}</span>
              <span className="min-w-0">
                <span className="block text-[11px] text-stone-500">{w.label}</span>
                <span className="block truncate text-sm font-semibold">{w.x ? w.x.p.name : '—'}</span>
                {w.x && <span className="block text-[11px] text-torii">{w.x.v} 👍</span>}
              </span>
            </button>
          ))}
        </div>
      </section>

      {tool && (
        <div className={sheetCls} onClick={() => setTool(null)}>
          <div className={panelCls} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-3 flex items-center">
              <h2 className="flex-1 font-display text-xl">{tool === 'prayer' ? '🕌 Salah times' : tool === 'money' ? '💴 Yen ↔ Rand' : '🚕 Taxi card'}</h2>
              <button onClick={() => setTool(null)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-white"><X className="h-5 w-5" /></button>
            </div>
            {tool === 'prayer' && <PrayerSheet date={t.day.date} hotel={t.hotel} times={pray} nextKey={next?.key ?? null} />}
            {tool === 'money' && <Converter rate={rate} />}
            {tool === 'taxi' && <TaxiCard hotel={t.hotel} />}
          </div>
        </div>
      )}
    </div>
  )
}

function PrayerSheet({ date, hotel, times, nextKey }: { date: string; hotel: keyof typeof HOTELS; times: ReturnType<typeof prayerTimes>; nextKey: string | null }) {
  const H = HOTELS[hotel]
  const near = mosquesNear(H, 3)
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">{fmtDay(date)} · near {H.short}</p>
      <div className="overflow-hidden rounded-2xl bg-white">
        {PRAYER_NAMES.map((p) => (
          <div key={p.key} className={`flex items-center px-4 py-3 ${p.key === nextKey ? 'bg-emerald-50 font-semibold' : ''} ${p.prayer ? '' : 'text-stone-400'}`}>
            <span className="flex-1">{p.label}{p.key === nextKey && ' · next'}</span><span className="tabular-nums">{hhmm(times[p.key])}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500">Worked out on the phone (Muslim World League, Shafi'i Asr). Mosque timetables can differ by a few minutes.</p>
      <h3 className="pt-1 font-semibold">Nearest to the hotel</h3>
      {near.map((m) => (
        <a key={m.name} href={`https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}&travelmode=walking`} target="_blank" rel="noreferrer"
          className="flex items-center gap-3 rounded-2xl bg-white p-3">
          <span className="text-2xl">{m.kind === 'mosque' ? '🕌' : '🧎'}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{m.name}</span><span className="block text-xs text-stone-500">{m.d.toFixed(1)} km · tap for directions</span></span>
          <ChevronRight className="h-4 w-4 text-stone-400" />
        </a>
      ))}
    </div>
  )
}

function Converter({ rate }: { rate: ReturnType<typeof useYenRate> }) {
  const [yen, setYen] = useState('1000')
  const [rand, setRand] = useState(String(Math.round(1000 * rate.zarPerYen)))
  const num = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0
  const fmt = (n: number, d = 0) => n.toLocaleString('en-ZA', { maximumFractionDigits: d })
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-stone-600">Yen</span>
        <span className="mt-1 flex items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4">
          <span className="text-2xl font-bold">¥</span>
          <input inputMode="decimal" value={yen} onFocus={(e) => e.target.select()} aria-label="Yen"
            onChange={(e) => { setYen(e.target.value); setRand(fmt(num(e.target.value) * rate.zarPerYen, 2)) }}
            className="h-16 min-w-0 flex-1 bg-transparent text-3xl font-bold outline-none" />
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-stone-600">Rand</span>
        <span className="mt-1 flex items-center gap-2 rounded-2xl border border-stone-300 bg-[#d8f3dc] px-4">
          <span className="text-2xl font-bold">R</span>
          <input inputMode="decimal" value={rand} onFocus={(e) => e.target.select()} aria-label="Rand"
            onChange={(e) => { setRand(e.target.value); setYen(fmt(num(e.target.value) / rate.zarPerYen)) }}
            className="h-16 min-w-0 flex-1 bg-transparent text-3xl font-bold outline-none" />
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        {[500, 1000, 3000, 5000, 10000].map((n) => (
          <button key={n} onClick={() => { setYen(String(n)); setRand(fmt(n * rate.zarPerYen, 2)) }} className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm">¥{fmt(n)}</button>
        ))}
      </div>
      <p className="text-xs text-stone-500">
        ¥1 = R{rate.zarPerYen.toFixed(4)} · {rate.live ? `central-bank rate of ${rate.date ?? 'the latest day'} (Frankfurter), saved for offline` : 'approximate, until the phone gets internet'}. Banks and cards add their own fees.
      </p>
    </div>
  )
}

function TaxiCard({ hotel }: { hotel: keyof typeof TAXI }) {
  const x = TAXI[hotel]
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-3xl border-2 border-ink bg-white p-5" lang="ja">
        <p className="text-sm text-stone-500" lang="en">Please take me to:</p>
        <p className="text-sm font-medium">こちらまでお願いします。</p>
        <p className="text-[28px] font-bold leading-snug">{x.ja}</p>
        <p className="text-lg leading-snug">{x.building}</p>
        <p className="text-xl font-semibold leading-snug">{x.address}</p>
      </div>
      <a href={`tel:${x.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 rounded-2xl bg-white p-3">
        <Phone className="h-5 w-5 text-iris" /><span className="flex-1">Hotel phone (driver can call)</span><span className="font-semibold tabular-nums">{x.phone}</span>
      </a>
      <p className="text-xs text-stone-500">Turn the phone towards the driver. It switches to the right hotel on each date. Address from the hotel's own website (checked 20 Nov 2026).</p>
    </div>
  )
}
