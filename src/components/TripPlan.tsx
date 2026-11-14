import { useCallback, useEffect, useMemo, useState } from 'react'
import { HOTELS, catOf, fmtMin, fmtYen, getPlannerCode, setPlannerCode, supabase, type Member, type Place } from '../lib'
import { draftItinerary, stopTally, type DayPin, type StopVote } from '../itinerary'
import { SALAH } from '../planner'

/**
 * 🗓 Trip plan: day-by-day draft built from votes (Maryam picked this mockup 14 Nov 2026).
 * Everyone: 👍/👎 a stop for that day (enough 👎 swaps it out). ⭐ Planners: 📌 lock a stop, or move it to another day.
 */
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })
const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

export default function TripPlan({ me, places, voteCount, onOpen }: {
  me: Member; places: Place[]; voteCount: Record<string, number>; onOpen: (p: Place) => void
}) {
  const [stopVotes, setStopVotes] = useState<StopVote[]>([])
  const [pins, setPins] = useState<DayPin[]>([])
  const [loadErr, setLoadErr] = useState(false)
  const [askCode, setAskCode] = useState<null | (() => Promise<void>)>(null)
  const [code, setCode] = useState('')
  const [codeErr, setCodeErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [v, p] = await Promise.all([
      supabase.from('stop_votes').select('day, place_id, member_id, value'),
      supabase.from('day_pins').select('place_id, day'),
    ])
    if (v.error || p.error) { setLoadErr(true); return }
    setLoadErr(false)
    setStopVotes(v.data as StopVote[]); setPins(p.data as DayPin[])
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 20000)
    return () => clearInterval(id)
  }, [load])

  const days = useMemo(() => draftItinerary(places, voteCount, stopVotes, pins), [places, voteCount, stopVotes, pins])
  const [sel, setSel] = useState(() => {
    const t = todayJst()
    return days.some((d) => d.date === t) ? t : days[0]?.date
  })
  const day = days.find((d) => d.date === sel) ?? days[0]
  const pinnedHere = new Set(pins.filter((p) => p.day === day.date).map((p) => p.place_id))

  async function vote(placeId: string, value: 1 | -1) {
    const mineNow = stopVotes.find((v) => v.day === day.date && v.place_id === placeId && v.member_id === me.id)
    const others = stopVotes.filter((v) => !(v.day === day.date && v.place_id === placeId && v.member_id === me.id))
    if (mineNow?.value === value) {
      setStopVotes(others)
      const { error } = await supabase.from('stop_votes').delete().match({ day: day.date, place_id: placeId, member_id: me.id })
      if (error) load()
    } else {
      setStopVotes([...others, { day: day.date, place_id: placeId, member_id: me.id, value }])
      const { error } = await supabase.from('stop_votes').upsert({ day: day.date, place_id: placeId, member_id: me.id, value })
      if (error) { alert('Couldn’t save your vote. Check your internet.'); load() }
    }
  }

  /** Planner actions need the trip-planner code once per session. */
  async function asPlanner(placeId: string, onDay: string | null) {
    const run = async () => {
      const c = getPlannerCode() ?? code
      const { data, error } = await supabase.rpc('planner_pin', { place: placeId, on_day: onDay, code: c })
      if (error) { setCodeErr('Couldn’t save. Check your internet.'); return }
      if (data !== true) { setPlannerCode(null); setCodeErr('Wrong trip-planner code.'); setAskCode(() => run); return }
      setPlannerCode(c); setAskCode(null); setCode(''); setCodeErr(null)
      load()
    }
    if (!getPlannerCode()) { setAskCode(() => run); return }
    await run()
  }

  if (loadErr) {
    return <div className="m-4 rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">The trip plan couldn’t load. Check your internet and try again.</div>
  }

  const stopRow = (p: Place, time: string, sub: string, locked: boolean) => {
    const t = stopTally(stopVotes, day.date, p.id)
    const mine = stopVotes.find((v) => v.day === day.date && v.place_id === p.id && v.member_id === me.id)?.value
    return (
      <div key={p.id} className={`rounded-2xl bg-white p-3 shadow-sm ${locked ? 'border-2 border-ink' : 'border border-stone-200'}`}>
        <div className="flex items-start gap-2">
          <span className="w-11 shrink-0 pt-0.5 text-sm text-stone-500">{time}</span>
          <button onClick={() => onOpen(p)} className="min-w-0 flex-1 text-left">
            <p className="font-semibold leading-snug">{p.kind === 'restaurant' ? '🍜' : catOf(p) === 'shopping' ? '🛍' : '🎢'} {p.name}</p>
            <p className="text-xs text-stone-500">{sub}</p>
          </button>
          {locked && <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold">📌 Locked</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-[3.25rem]">
          <button onClick={() => vote(p.id, 1)} aria-pressed={mine === 1} aria-label="Good for this day"
            className={`h-9 rounded-full px-3 text-sm ${mine === 1 ? 'border-2 border-ink bg-white font-semibold' : 'border border-stone-300 bg-white'}`}>👍 {t.up}</button>
          <button onClick={() => vote(p.id, -1)} aria-pressed={mine === -1} aria-label="Not this day"
            className={`h-9 rounded-full px-3 text-sm ${mine === -1 ? 'border-2 border-ink bg-white font-semibold' : 'border border-stone-300 bg-white'}`}>👎 {t.down}</button>
          {me.is_admin && (
            <>
              <button onClick={() => asPlanner(p.id, locked ? null : day.date)} className="h-9 rounded-full border border-stone-300 bg-white px-3 text-sm">
                {locked ? 'Unlock' : '📌 Lock'}
              </button>
              <select aria-label="Move to another day" value="" onChange={(e) => e.target.value && asPlanner(p.id, e.target.value)}
                className="h-9 rounded-full border border-stone-300 bg-white px-2 text-sm">
                <option value="">Move…</option>
                {days.filter((d) => d.hotel && d.date !== day.date).map((d) => (
                  <option key={d.date} value={d.date}>{dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {HOTELS[d.hotel!].short}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    )
  }

  const plan = day.plan
  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Trip plan</h2>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">✨ Draft</span>
      </div>
      <p className="-mt-2 text-xs text-stone-500">Built from everyone's votes. It reshuffles as you vote.</p>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {days.map((d) => {
          const on = d.date === day.date
          const special = d.kind === 'moving' || d.kind === 'flight'
          return (
            <button key={d.date} onClick={() => setSel(d.date)} aria-pressed={on}
              className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-[11px] leading-tight ${on ? 'border-2 border-ink bg-ink text-white'
                : special ? 'border border-dashed border-teal-600 bg-teal-50 text-teal-800' : 'border border-stone-300 bg-white'}`}>
              {d.kind === 'moving' ? 'Move' : d.kind === 'flight' ? '✈️' : dayLabel(d.date, { weekday: 'short' })}
              <span className="text-base font-semibold">{dayLabel(d.date, { day: 'numeric' })}</span>
            </button>
          )
        })}
      </div>

      <p className="text-sm text-stone-600">
        <b>{dayLabel(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</b>
        {day.hotel && <> · from 🏯 {HOTELS[day.hotel].short} · back by {clock(SALAH.backBy)} for Maghrib</>}
      </p>
      {day.note && <p className="rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-900">{day.note}</p>}

      {askCode && (
        <div className="rounded-2xl border border-stone-300 bg-white p-3">
          <label className="text-sm font-medium" htmlFor="pc">⭐ Trip-planner code</label>
          <div className="mt-1 flex gap-2">
            <input id="pc" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoCorrect="off"
              className="h-10 min-w-0 flex-1 rounded-xl border border-stone-300 px-3" />
            <button onClick={() => askCode()} className="h-10 rounded-xl bg-ink px-4 text-sm font-medium text-white">OK</button>
            <button onClick={() => { setAskCode(null); setCodeErr(null) }} className="h-10 rounded-xl border border-stone-300 px-3 text-sm">Cancel</button>
          </div>
          {codeErr && <p className="mt-1 text-xs text-torii">{codeErr}</p>}
        </div>
      )}

      {plan ? (
        <div className="space-y-2">
          {plan.stops.map((s) => (
            <div key={s.p.id} className="space-y-2">
              {stopRow(s.p, clock(s.arrive),
                `${s.p.price_jpy == null ? '❓ price' : s.p.price_jpy === 0 ? 'Free' : fmtYen(s.p.price_jpy)} · ~${fmtMin(s.travel)} to get there${s.p.kind === 'restaurant' && s.p.halal ? ` · ${s.p.halal}` : ''}`,
                pinnedHere.has(s.p.id))}
              {s.prayers.map((pr) => (
                <div key={pr.name} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">
                  <span className="w-11">{clock(pr.at)}</span><span>🕌 {pr.name} · {SALAH.prayMinutes} min · nearest prayer room</span>
                </div>
              ))}
            </div>
          ))}
          <p className="px-1 text-xs text-stone-500">🏯 Back at the hotel ~{clock((day.kind === 'normal' ? 9 * 60 : 14 * 60) + plan.minutes)}</p>
          {plan.supper && stopRow(plan.supper.p, 'Supper', `After Maghrib · ~${fmtMin(plan.supper.travel)} from the hotel`, pinnedHere.has(plan.supper.p.id))}
        </div>
      ) : day.kind !== 'flight' && (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Nothing planned yet. Vote 👍 on places near {day.hotel ? HOTELS[day.hotel].city : 'the hotel'} in Food and Do, and this day fills itself in.
        </div>
      )}

      <p className="pb-4 text-center text-xs text-stone-500">
        {me.is_admin ? '⭐ Planners: 📌 lock a stop or move it to another day. ' : ''}Two or more 👎 (and more 👎 than 👍) swaps a stop for the next favourite.
      </p>
    </div>
  )
}
