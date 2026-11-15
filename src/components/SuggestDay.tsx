import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { HOTELS, HOTEL_IDS, regionOf, supabase, type HotelId, type Member, type Place } from '../lib'
import { SALAH } from '../planner'
import { chainFor, foodNear, openDates, planTrip, sameComboDay, type IdeaRow } from '../itinerary'
import Thumb from './Thumb'
import { clock, dayLabel, legText, setDay, usePlanData, usePlannerCode } from './TripPlan'

/**
 * B · 💡 Suggest a day (Maryam's approved mockup, 15 Nov 2026). Replaces "Plan one day".
 * One idea per person per hotel. Pick hotel → full / half day → tap (or drag) activity photos into the day.
 * Food, shops and prayer stops are filled in nearby. Shows legs + "back before Maghrib". Planners can set it on a date.
 */
export default function SuggestDay({ me, places, voteCount, photoUrls }: {
  me: Member; places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>
}) {
  const { plans, ideas, err, load } = usePlanData()
  const { run, box } = usePlannerCode()
  const days = useMemo(() => planTrip(places, voteCount, plans), [places, voteCount, plans])
  const mine = (h: HotelId) => ideas.find((i) => i.member_id === me.id && i.hotel === h) ?? null
  const fullyLocked = (h: HotelId) => days.filter((d) => d.hotel === h && d.kind !== 'flight').every((d) => d.locked)
  const [hotel, setHotel] = useState<HotelId>(() => HOTEL_IDS.find((h) => !fullyLocked(h)) ?? 'toranomon')
  const existing = mine(hotel)
  const [half, setHalf] = useState(existing?.half_day ?? false)
  const [picked, setPicked] = useState<string[]>(existing?.activity_ids ?? [])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const max = half ? 1 : 2

  const switchHotel = (h: HotelId) => {
    const e = mine(h)
    setHotel(h); setHalf(e?.half_day ?? false); setPicked(e?.activity_ids ?? []); setMsg(null); setDate('')
  }
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const region = HOTELS[hotel].region
  const tray = useMemo(() => places
    .filter((p) => p.kind === 'activity' && (p.category ?? 'activity') !== 'shopping' && p.lat != null && regionOf(p) === region && (!half || !p.full_day))
    .sort((a, b) => (voteCount[b.id] ?? 0) - (voteCount[a.id] ?? 0)), [places, region, half, voteCount])
  const acts = picked.map((id) => byId.get(id)).filter((p): p is Place => !!p)
  const full = acts.length === 1 && acts[0].full_day
  const food = acts.length ? foodNear(places, acts[0], region, 1)[0] ?? null : null
  const chain = acts.length ? chainFor(acts, full ? null : food, hotel, half) : null
  const dup = acts.length ? sameComboDay(days, picked) : null
  const locked = fullyLocked(hotel)
  const dates = openDates(days, hotel, half)

  const add = (id: string) => {
    if (picked.includes(id)) { setPicked(picked.filter((x) => x !== id)); return }
    const p = byId.get(id)
    if (p?.full_day) { setPicked([id]); return }
    setPicked([...picked.filter((x) => !byId.get(x)?.full_day), id].slice(-max))
  }

  async function send() {
    setBusy(true); setMsg(null)
    const row = { member_id: me.id, hotel, half_day: half, activity_ids: picked }
    const { error } = await supabase.from('day_ideas').upsert(row, { onConflict: 'member_id,hotel' })
    setBusy(false)
    if (error) setMsg('Couldn’t send. Check your internet.')
    else { setMsg('💡 Sent! Planners can see it now.'); load() }
  }
  async function setAsPlan() {
    if (!date) return
    setBusy(true)
    const ok = await run((c) => setDay(c, date, picked, null, false, existing?.id ?? null))
    setBusy(false)
    if (ok) { setMsg(`📌 Set for ${dayLabel(date, { weekday: 'short', day: 'numeric' })}`); load() }
  }

  if (err) return <div className="m-4 rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">Couldn't load. Check your internet.</div>

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <div>
        <h2 className="font-display text-2xl">💡 Suggest a day</h2>
        <p className="text-sm text-stone-500">One idea per hotel. Tap pictures to build the day.</p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {HOTEL_IDS.map((h) => {
          const done = mine(h), shut = fullyLocked(h)
          return (
            <button key={h} onClick={() => !shut && switchHotel(h)} disabled={shut} aria-pressed={hotel === h}
              className={`h-14 rounded-2xl text-xs font-semibold leading-tight ${hotel === h ? 'bg-ink text-white' : shut ? 'border border-dashed border-stone-300 bg-stone-100 text-stone-400' : 'border border-stone-300 bg-white'}`}>
              {HOTELS[h].short}
              <span className="block font-normal opacity-80">{shut ? '🔒 all locked' : done ? '✓ sent' : `${days.filter((d) => d.hotel === h && !d.locked && d.kind !== 'flight').length} open days`}</span>
            </button>
          )
        })}
      </div>

      {locked ? <p className="rounded-2xl bg-stone-100 p-4 text-center text-sm text-stone-500">🔒 Planners have locked every day at {HOTELS[hotel].short}.</p> : (
        <>
          <div className="flex gap-1.5">
            {([[false, 'Full day'], [true, '🚄 Half day']] as const).map(([v, l]) => (
              <button key={l} onClick={() => { setHalf(v); setPicked(picked.slice(0, v ? 1 : 2)) }} aria-pressed={half === v}
                className={`h-9 rounded-full px-4 text-sm ${half === v ? 'border-2 border-ink bg-white font-semibold' : 'border border-stone-300 bg-white'}`}>{l}</button>
            ))}
          </div>

          <div className="space-y-1 rounded-3xl bg-white p-3 shadow-sm"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('text/plain'); if (id) add(id) }}>
            {chain?.stops.length ? chain.stops.map((s, k) => (
              <div key={s.p.id + k}>
                <p className="py-0.5 pl-4 text-xs text-stone-500">{k === 0 ? '🏯 ' : ''}{legText(s.leg)}</p>
                {s.role === 'food' ? (
                  <div className="flex items-center gap-2 rounded-2xl bg-stone-50 p-1.5 text-xs text-stone-600">
                    <Thumb place={s.p} photoUrls={photoUrls} className="h-10 w-10 rounded-full" />🍜 + 🛍️ + 🕌 picked nearby
                  </div>
                ) : (
                  <button onClick={() => add(s.p.id)} className="relative block h-24 w-full overflow-hidden rounded-2xl" aria-label={`Remove ${s.p.name}`}>
                    <Thumb place={s.p} photoUrls={photoUrls} className="h-full w-full rounded-2xl" />
                    <span className="absolute inset-x-0 bottom-0 flex items-center bg-ink/60 px-3 py-1 text-sm font-semibold text-white"><span className="flex-1 truncate text-left">{s.p.name}</span><X className="h-4 w-4" /></span>
                  </button>
                )}
              </div>
            )) : null}
            {!full && acts.length < max && (
              <div className="flex h-16 items-center justify-center rounded-2xl border-[3px] border-dashed border-torii/70 bg-rose-50 text-sm font-semibold text-torii">
                {acts.length ? '＋ Tap one more below' : 'Tap a picture below'}
              </div>
            )}
            {chain && (
              <div className="pt-2">
                <p className="pb-1 pl-4 text-xs text-stone-500">{legText(chain.back)} → 🏯</p>
                <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
                  <div className={`h-full ${chain.fits ? 'bg-emerald-600' : 'bg-red-500'}`} style={{ width: `${Math.min(100, ((chain.endMin - chain.startMin) / (SALAH.backBy - chain.startMin)) * 100)}%` }} />
                </div>
                <p className={`mt-1 text-xs ${chain.fits ? 'text-emerald-800' : 'text-red-700'}`}>
                  Back ~{clock(chain.endMin)} · {chain.fits ? 'fits before Maghrib ✓' : 'too packed: back after Maghrib'}
                </p>
              </div>
            )}
          </div>

          {dup && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠️ That's already the plan for {dayLabel(dup.date, { weekday: 'short', day: 'numeric' })}. Try another mix.</p>}

          <div>
            <p className="mb-1.5 text-sm font-semibold">Near {HOTELS[hotel].city} <span className="font-normal text-stone-500">· most 👍 first</span></p>
            <div className="grid grid-cols-3 gap-2">
              {tray.map((p) => (
                <button key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)} onClick={() => add(p.id)}
                  className={`relative h-24 overflow-hidden rounded-2xl ${picked.includes(p.id) ? 'opacity-35' : ''}`} aria-pressed={picked.includes(p.id)}>
                  <Thumb place={p} photoUrls={photoUrls} className="h-full w-full rounded-2xl" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-ink/55 px-1.5 py-0.5 text-left text-[11px] text-white">{p.name}</span>
                  {(voteCount[p.id] ?? 0) > 0 && <span className="absolute right-1 top-1 rounded-full bg-ink px-1.5 text-[10px] text-white">👍{voteCount[p.id]}</span>}
                  {p.full_day && <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] font-semibold">☀️ all day</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="sticky bottom-20 space-y-2 rounded-3xl bg-washi/95 pt-2 backdrop-blur">
            <button disabled={!acts.length || busy || !!dup} onClick={send}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-torii py-3.5 text-base font-semibold text-white disabled:opacity-40">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}💡 {existing ? 'Update' : 'Send'} my {HOTELS[hotel].city} idea
            </button>
            {me.is_admin && acts.length > 0 && (
              <div className="flex gap-2">
                <select value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="h-11 flex-1 rounded-xl border border-stone-300 bg-white px-2 text-sm">
                  <option value="">⭐ Pick a date…</option>
                  {dates.map((d) => <option key={d.date} value={d.date}>{dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}
                </select>
                <button disabled={!date || busy || !!dup} onClick={setAsPlan} className="h-11 rounded-xl bg-ink px-4 text-sm font-medium text-white disabled:opacity-40">📌 Set as plan</button>
              </div>
            )}
            {msg && <p className="text-center text-sm text-stone-600">{msg}</p>}
          </div>
        </>
      )}
      {box}
    </div>
  )
}

export type { IdeaRow }
