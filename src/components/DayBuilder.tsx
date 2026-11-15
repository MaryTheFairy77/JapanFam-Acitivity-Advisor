import { useMemo, useState } from 'react'
import { ChevronLeft, Link2, Loader2, X } from 'lucide-react'
import { HOTELS, catOf, regionOf, type HotelId, type Place } from '../lib'
import { EARLIEST, activityIds, addCost, buildTimeline, isActivity, type Layout, type PlannedDay, type Timeline } from '../itinerary'
import Thumb from './Thumb'

/**
 * B (mix) · the day builder (Maryam picked "Mix" 15 Nov 2026): picture tray with "+time" badges (B4) and a
 * day bar on top; tap the bar → full photo timeline with big ↑ ↓ to shuffle, 🔗 together, ✕ (no "Add here": Maryam 15 Nov).
 * Used by 💡 Suggest a day (everyone) and by planners editing a day.
 */
export const clock = (m: number) => {
  const r = Math.round(m / 5) * 5
  const h = Math.floor(r / 60) % 24, mm = r % 60
  return `${((h + 11) % 12) + 1}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`
}
export const dur = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`)
export const legText = (l: { minutes: number; walk: boolean; car?: boolean }) => `${l.walk ? '🚶' : l.car ? '🚕' : '🚆'} ${l.minutes} min`

/** Thin coloured day bar: stops, travel stripes, 🌅 Maghrib tick. Tap to open the full timeline. */
export function DayBar({ tl, onClick }: { tl: Timeline | null; onClick?: () => void }) {
  const from = 8 * 60, to = 22 * 60, w = (m: number) => `${((m) / (to - from)) * 100}%`, x = (m: number) => `${((m - from) / (to - from)) * 100}%`
  return (
    <button onClick={onClick} className="block w-full rounded-2xl bg-white p-2.5 text-left shadow-sm" aria-label="Open the full day timeline">
      <div className="relative h-9 overflow-hidden rounded-lg bg-stone-100">
        {tl?.steps.map((s, i) => (
          <div key={i}>
            <div className="absolute inset-y-2 bg-[repeating-linear-gradient(90deg,#d6d3d1_0_3px,transparent_3px_6px)]" style={{ left: x(s.arrive - s.leg.minutes), width: w(s.leg.minutes) }} />
            <div className={`absolute inset-y-0 rounded-md ${s.places.some((p) => p.kind === 'restaurant') ? 'bg-amber-400' : 'bg-indigo-400'} ${s.places.length > 1 ? 'ring-2 ring-inset ring-white/70' : ''}`}
              style={{ left: x(s.arrive), width: w(Math.max(10, s.leave - s.arrive)) }} />
          </div>
        ))}
        {tl && <div className="absolute inset-y-2 bg-[repeating-linear-gradient(90deg,#d6d3d1_0_3px,transparent_3px_6px)]" style={{ left: x(tl.end - tl.back.minutes), width: w(tl.back.minutes) }} />}
        {tl && <div className="absolute -inset-y-1 w-0.5 bg-orange-600" style={{ left: x(tl.maghrib.at) }} />}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-stone-500"><span>8</span><span>11</span><span>2 pm</span><span className="font-semibold text-orange-700">{tl ? `🌅 ${clock(tl.maghrib.at)}` : '🌅'}</span><span>7</span><span>10</span></div>
      {tl && tl.steps.length > 0 && (
        <p className={`mt-1 text-xs ${tl.maghrib.ok ? 'text-emerald-800' : 'text-orange-800'}`}>
          🚪 {clock(tl.start)} → 🏯 {clock(tl.end)} · {tl.maghrib.ok ? (tl.maghrib.where === 'hotel' ? 'Maghrib at hotel ✓' : `Maghrib at ${tl.maghrib.room?.name ?? 'prayer room'} ✓`) : '⚠️ out at Maghrib, no prayer room nearby'}
          <span className="text-stone-400"> · tap for details</span>
        </p>
      )}
    </button>
  )
}

/** Full photo timeline (read-only, or editable with ＋ Add here / 🔗 / ✕). */
export function TimelineView({ tl, photoUrls, onOpen, edit }: {
  tl: Timeline; photoUrls: Record<string, string>; onOpen?: (p: Place) => void
  edit?: { together: (index: number) => void; remove: (index: number, id: string) => void; move: (index: number, dir: -1 | 1) => void; active?: { index: number; together?: boolean } | null }
}) {
  return (
    <div className="space-y-1">
      {tl.steps.map((s, i) => {
        const big = s.places.some((p) => p.kind !== 'restaurant')
        return (
          <div key={i} className="space-y-1">
            <p className="ml-12 text-xs text-stone-500">{i === 0 ? '🏯 ' : ''}{legText(s.leg)}</p>
            <div className="flex gap-2">
              <span className="w-10 shrink-0 pt-1 text-right text-[11px] text-stone-500">{clock(s.arrive)}</span>
              <div className="min-w-0 flex-1">
                <div className={`flex gap-1 ${big ? 'h-28' : 'h-16'}`}>
                  {s.places.map((p) => (
                    <div key={p.id} className="relative min-w-0 flex-1 overflow-hidden rounded-2xl">
                      <button onClick={() => onOpen?.(p)} className="block h-full w-full"><Thumb place={p} photoUrls={photoUrls} className="h-full w-full rounded-2xl" /></button>
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-ink/60 px-2 py-1 text-xs font-semibold text-white">{p.kind === 'restaurant' ? '🍜 ' : catOf(p) === 'shopping' ? '🛍️ ' : ''}{p.name}</span>
                      {edit && <button aria-label={`Remove ${p.name}`} onClick={() => edit.remove(i, p.id)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow"><X className="h-3.5 w-3.5" /></button>}
                    </div>
                  ))}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone-500">
                  <span>⏱ {dur(s.leave - s.arrive)}{s.places.length > 1 ? ' · 🔗 together' : ''}</span>
                  {edit && (
                    <span className="ml-auto flex gap-1.5">
                      {i > 0 && <button aria-label="Move earlier" onClick={() => edit.move(i, -1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-iris text-lg font-bold text-white shadow">↑</button>}
                      {i < tl.steps.length - 1 && <button aria-label="Move later" onClick={() => edit.move(i, 1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-iris text-lg font-bold text-white shadow">↓</button>}
                      <button aria-label="Add something to do at the same time" onClick={() => edit.together(i)}
                        className={`flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold shadow ${edit.active?.together && edit.active.index === i ? 'bg-torii text-white' : 'border-2 border-iris bg-white'}`}><Link2 className="h-4 w-4" />together</button>
                    </span>
                  )}
                </div>
                {s.prayers.map((pr) => (
                  <p key={pr.name} className={`mt-1 rounded-lg px-2 py-1 text-[11px] ${pr.name === 'Maghrib' ? 'bg-orange-50 text-orange-900' : 'bg-emerald-50 text-emerald-900'}`}>
                    {pr.name === 'Maghrib' ? '🌅' : '🕌'} {pr.name} ~{clock(pr.at)}{pr.room ? ` · ${pr.room.name} (${Math.round(pr.room.d * 1000)} m)` : ''}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )
      })}
      <p className="ml-12 text-xs text-stone-500">{legText(tl.back)} → 🏯 {clock(tl.end)}</p>
      <p className={`ml-12 rounded-lg px-2 py-1 text-[11px] ${tl.maghrib.ok ? 'bg-orange-50 text-orange-900' : 'bg-red-50 text-red-800'}`}>
        🌅 Maghrib {clock(tl.maghrib.at)} · {tl.maghrib.where === 'hotel' ? 'at the hotel ✓' : tl.maghrib.where === 'room' ? `${tl.maghrib.room?.name} ✓` : tl.maghrib.where === 'moving' ? '⚠️ on the train' : '⚠️ no prayer room nearby'}
      </p>
    </div>
  )
}

export function DayBuilder({ title, hotel, date, places, voteCount, photoUrls, initial, days, saveLabel, onSave, onBack, extra }: {
  title: string; hotel: HotelId; date: string; places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>
  initial: Layout | null; days: PlannedDay[]; saveLabel: string
  onSave: (layout: Layout, activityIds: string[]) => Promise<string | null>; onBack: () => void; extra?: React.ReactNode
}) {
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const [start, setStart] = useState(initial?.start ?? 9 * 60)
  const [steps, setSteps] = useState<Place[][]>(() => (initial?.steps ?? []).map((g) => g.map((id) => byId.get(id)).filter((p): p is Place => !!p)).filter((g) => g.length))
  const [tab, setTab] = useState<'do' | 'food' | 'day'>(initial?.steps.length ? 'day' : 'do')
  const [at, setAt] = useState<{ index: number; together?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const region = HOTELS[hotel].region
  const tl = useMemo(() => (steps.length ? buildTimeline(steps, hotel, start, date) : null), [steps, hotel, start, date])
  const inDay = new Set(steps.flat().map((p) => p.id))
  const pool = useMemo(() => places.filter((p) => p.lat != null && regionOf(p) === region && (tab === 'food'
    ? p.kind === 'restaurant' && (p.halal === 'Halal certified' || p.halal === 'Muslim friendly')
    : p.kind === 'activity')), [places, region, tab])
  const costs = useMemo(() => tab === 'day' ? [] : pool.map((p) => ({ p, c: p.full_day && !at?.together ? null : addCost(steps, p, hotel, start, date, at ?? undefined) }))
    .sort((a, b) => Number(inDay.has(a.p.id)) - Number(inDay.has(b.p.id)) || (voteCount[b.p.id] ?? 0) - (voteCount[a.p.id] ?? 0)), [pool, steps, hotel, start, date, at, tab, voteCount]) // eslint-disable-line react-hooks/exhaustive-deps
  const ids = activityIds(steps)
  const dup = ids.length ? days.find((d) => d.date !== date && d.source === 'plan' && d.acts.length && [...d.acts.map((p) => p.id)].sort().join('+') === [...ids].sort().join('+')) : null

  const add = (p: Place) => {
    if (inDay.has(p.id)) return
    if (p.full_day && !at?.together) { setSteps([[p]]); setAt(null); return }
    const c = addCost(steps, p, hotel, start, date, at ?? undefined)
    setSteps(c.steps); setAt(null)
  }
  const edit = {
    active: at,
    together: (index: number) => { setAt(at?.together && at.index === index ? null : { index, together: true }); setTab('do') },
    remove: (i: number, id: string) => setSteps(steps.map((g, k) => (k === i ? g.filter((p) => p.id !== id) : g)).filter((g) => g.length)),
    move: (i: number, dir: -1 | 1) => { const s = [...steps]; const j = i + dir; [s[i], s[j]] = [s[j], s[i]]; setSteps(s) },
  }
  const label = at ? (at.together ? `🔗 With ${steps[at.index]?.[0]?.name ?? 'that stop'}` : at.index === 0 ? '＋ At the start' : `＋ After ${steps[at.index - 1]?.[0]?.name ?? 'that stop'}`) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="Back" className="flex h-10 items-center gap-1 rounded-full bg-white pl-2 pr-3 text-sm font-medium shadow-sm"><ChevronLeft className="h-5 w-5" />Back</button>
        <h2 className="min-w-0 flex-1 truncate font-display text-xl">{title}</h2>
        <label className="sr-only" htmlFor="start">Leave at</label>
        <select id="start" value={start} onChange={(e) => setStart(+e.target.value)} className="h-10 rounded-full border border-stone-300 bg-white px-3 text-sm font-semibold">
          {[8, 9, 10, 11, 12, 13, 14, 15].map((h) => <option key={h} value={h * 60}>🚪 {clock(h * 60)}</option>)}
        </select>
      </div>

      <DayBar tl={tl} onClick={() => setTab('day')} />
      {dup && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠️ Same activities as the plan for {new Date(dup.date + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric' })}. Swap one.</p>}

      <div className="grid grid-cols-3 gap-1.5">
        {([['do', '🎢 Do'], ['food', '🍜 Food'], ['day', `📋 My day${steps.length ? ` · ${steps.flat().length}` : ''}`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`h-10 rounded-full text-sm ${tab === k ? 'border-2 border-iris bg-white font-semibold' : 'border border-stone-300 bg-white'}`}>{l}</button>
        ))}
      </div>

      {label && tab !== 'day' && (
        <div className="flex items-center gap-2 rounded-xl bg-iris px-3 py-2 text-sm text-white">
          <span className="flex-1 truncate">{label}</span>
          <button onClick={() => setAt(null)} aria-label="Any spot" className="rounded-full bg-white/15 p-1"><X className="h-4 w-4" /></button>
        </div>
      )}

      {tab === 'day' ? (
        tl ? <TimelineView tl={tl} photoUrls={photoUrls} edit={edit} /> : <p className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">Nothing yet. Pick from 🎢 Do or 🍜 Food.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {costs.map(({ p, c }) => {
            const used = inDay.has(p.id)
            return (
              <button key={p.id} onClick={() => add(p)} disabled={used} className={`relative h-32 overflow-hidden rounded-2xl text-left ${used ? 'opacity-40' : ''}`}>
                <Thumb place={p} photoUrls={photoUrls} className="h-full w-full rounded-2xl" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-ink/60 px-2 py-1 text-xs font-medium text-white">{p.name}</span>
                <span className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${used ? 'bg-white text-stone-600' : !c ? 'bg-red-100 text-red-800' : c.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-900'}`}>
                  {used ? '✓ in day' : !c ? '☀️ whole day' : `+${dur(Math.max(0, c.added))}${c.ok ? '' : ' ⚠️'}`}
                </span>
                {(voteCount[p.id] ?? 0) > 0 && <span className="absolute right-1.5 top-1.5 rounded-full bg-iris px-1.5 text-[10px] text-white">👍{voteCount[p.id]}</span>}
                {isActivity(p) && c?.together && <span className="absolute right-1.5 top-7 rounded-full bg-white/90 px-1.5 text-[10px]">🔗</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="pointer-events-none sticky bottom-20 z-10 space-y-2 pt-2 [&>*]:pointer-events-auto">
        <button disabled={!steps.length || busy || !!dup} onClick={async () => {
          setBusy(true); setMsg(null)
          const err = await onSave({ start, steps: steps.map((g) => g.map((p) => p.id)) }, ids)
          setBusy(false); setMsg(err ?? '✓ Saved')
        }} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-torii py-3.5 text-base font-semibold text-white shadow-lg disabled:bg-stone-400">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}{saveLabel}
        </button>
        {extra}
        {msg && <p className="mx-auto w-fit rounded-full bg-ink/85 px-3 py-1 text-center text-sm text-white">{msg}</p>}
      </div>
      <p className="pb-2 text-center text-[11px] text-stone-400">Earliest start {clock(EARLIEST)} · evenings are fine · be at the hotel or near a prayer room at Maghrib</p>
    </div>
  )
}
