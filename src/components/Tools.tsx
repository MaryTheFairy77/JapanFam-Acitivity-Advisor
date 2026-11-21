import { useState } from 'react'
import { ChevronRight, Phone, X } from 'lucide-react'
import { HOTELS } from '../lib'
import { mosquesNear } from '../mosques'
import { PRAYER_NAMES, hhmm, nextPrayer, prayerTimes } from '../prayer'
import { TAXI, tripToday, useYenRate } from '../tools'

/**
 * Travel tools (Phase 2): 🕌 salah times, 💴 ¥ ↔ R, 🚕 taxi card. Opened from the face menu (moved off Home 20 Nov 2026,
 * Maryam's sketch). Read-only; nothing here writes to the database.
 */
export type Tool = 'prayer' | 'money' | 'taxi'
const fmtDay = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** One line for the face menu: "Asr 14:12 next" during the trip, else the day the times are for. */
export function prayerHint() {
  const t = tripToday(), H = HOTELS[t.hotel]
  const n = t.nowMin != null ? nextPrayer(prayerTimes(t.day.date, H.lat, H.lng), t.nowMin) : null
  return n ? `${n.label} ${hhmm(n.at)} is next` : `Times for ${fmtDay(t.day.date)} near ${H.short}`
}

export default function ToolSheet({ tool, onClose }: { tool: Tool; onClose: () => void }) {
  const t = tripToday(), H = HOTELS[t.hotel]
  const pray = prayerTimes(t.day.date, H.lat, H.lng)
  const next = t.nowMin != null ? nextPrayer(pray, t.nowMin) : null
  const rate = useYenRate()
  return (
    <div className="fixed inset-0 z-[950] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto sheet rounded-t-3xl bg-washi p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 font-display text-xl">{tool === 'prayer' ? '🕌 Salah times' : tool === 'money' ? '💴 Yen ↔ Rand' : '🚕 Taxi card'}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-white"><X className="h-5 w-5" /></button>
        </div>
        {tool === 'prayer' && <PrayerSheet date={t.day.date} hotel={t.hotel} times={pray} nextKey={next?.key ?? null} />}
        {tool === 'money' && <Converter rate={rate} />}
        {tool === 'taxi' && <TaxiCard hotel={t.hotel} />}
      </div>
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
      <p className="text-xs text-stone-500">Muslim World League · Shafi'i Asr. Mosques may differ by a few minutes.</p>
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
      <p className="text-xs text-stone-500">Show this to the driver. It picks the right hotel for each date.</p>
    </div>
  )
}
