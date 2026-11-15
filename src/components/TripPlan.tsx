import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Loader2, X } from 'lucide-react'
import { HOTELS, fmtYen, getPlannerCode, setPlannerCode, supabase, type HotelId, type Member, type Place, type Vote } from '../lib'
import { mosquesNear } from '../mosques'
import { chainFor, foodNear, ideaScore, planTrip, sameComboDay, type DayPlanRow, type IdeaRow, type PlannedDay } from '../itinerary'
import Thumb from './Thumb'
import Face from './Face'

const RouteMap = lazy(() => import('./RouteMap'))

/**
 * 🗓 Trip plan v2 (Maryam's approved mockups A1 overview + A2 one day, 15 Nov 2026).
 * Pictures first, few words. Same 👍 votes as Food / Do. Planners lock / place ideas / edit; everyone else views + suggests.
 */
export const clock = (m: number) => {
  const h = Math.floor(m / 60) % 24, mm = Math.round((m % 60) / 15) * 15
  const hh = mm === 60 ? h + 1 : h
  return `${((hh + 11) % 12) + 1}${mm % 60 ? `:${String(mm % 60).padStart(2, '0')}` : ''} ${hh < 12 ? 'am' : 'pm'}`
}
export const dayLabel = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', ...o })
export const legText = (l: { minutes: number; walk: boolean }) => `${l.walk ? '🚶' : '🚆'} ${l.minutes} min`
export const STAY_TINT: Record<HotelId, string> = { toranomon: 'bg-rose-100 text-rose-900', osaka: 'bg-sky-100 text-sky-900', jw_tokyo: 'bg-violet-100 text-violet-900' }

/** day_plans + day_ideas, refreshed every 20 s while visible. */
export function usePlanData() {
  const [plans, setPlans] = useState<DayPlanRow[]>([])
  const [ideas, setIdeas] = useState<IdeaRow[]>([])
  const [err, setErr] = useState(false)
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('day_plans').select('day, activity_ids, food_id, locked, idea_id'),
      supabase.from('day_ideas').select('id, member_id, hotel, half_day, activity_ids, created_at'),
    ])
    if (a.error || b.error) { setErr(true); return }
    setErr(false); setPlans(a.data as DayPlanRow[]); setIdeas(b.data as IdeaRow[])
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 20000)
    return () => clearInterval(id)
  }, [load])
  return { plans, ideas, err, load }
}

/** Planner actions need the trip-planner code once per session: returns a runner + the small code box. */
export function usePlannerCode() {
  const [pending, setPending] = useState<null | ((c: string) => Promise<boolean>)>(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const run = useCallback(async (fn: (c: string) => Promise<boolean>) => {
    const c = getPlannerCode()
    if (c && await fn(c)) return true
    setPlannerCode(null); setPending(() => fn); return false
  }, [])
  const box = pending && (
    <div className="fixed inset-x-3 bottom-24 z-[950] mx-auto max-w-md rounded-2xl border border-stone-300 bg-white p-3 shadow-xl">
      <label className="text-sm font-medium" htmlFor="pc">⭐ Trip-planner code</label>
      <div className="mt-1 flex gap-2">
        <input id="pc" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoCorrect="off" className="h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-3" />
        <button className="h-11 rounded-xl bg-ink px-4 text-sm font-medium text-white" onClick={async () => {
          if (await pending(code)) { setPlannerCode(code); setPending(null); setCode(''); setMsg(null) } else setMsg('Wrong code, or no internet.')
        }}>OK</button>
        <button aria-label="Cancel" className="h-11 rounded-xl border border-stone-300 px-3" onClick={() => { setPending(null); setMsg(null) }}><X className="h-4 w-4" /></button>
      </div>
      {msg && <p className="mt-1 text-xs text-torii">{msg}</p>}
    </div>
  )
  return { run, box }
}

export async function setDay(code: string, day: string, acts: string[], food: string | null, lock: boolean, idea: string | null) {
  const { data, error } = await supabase.rpc('planner_set_day', { on_day: day, acts, food, lock, idea, code })
  return !error && data === true
}
async function clearDay(code: string, day: string) {
  const { data, error } = await supabase.rpc('planner_clear_day', { on_day: day, code })
  return !error && data === true
}

export default function TripPlan({ me, members, places, votes, voteCount, photoUrls, onOpen }: {
  me: Member; members: Member[]; places: Place[]; votes: Vote[]; voteCount: Record<string, number>
  photoUrls: Record<string, string>; onOpen: (p: Place) => void
}) {
  const { plans, ideas, err, load } = usePlanData()
  const { run, box } = usePlannerCode()
  const days = useMemo(() => planTrip(places, voteCount, plans), [places, voteCount, plans])
  const [city, setCity] = useState<'all' | 'kanto' | 'kansai'>('all')
  const [openIdeas, setOpenIdeas] = useState<HotelId | null>(null)
  const [holding, setHolding] = useState<IdeaRow | null>(null) // idea picked up by a planner (tap, then tap a day)
  const [open, setOpen] = useState<string | null>(null)
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const planner = !!me.is_admin

  // stays = runs of consecutive days at the same hotel
  const stays = useMemo(() => {
    const out: { hotel: HotelId; days: PlannedDay[] }[] = []
    for (const d of days) {
      const h = d.hotel ?? out[out.length - 1]?.hotel
      if (!h) continue
      if (out.length && out[out.length - 1].hotel === h) out[out.length - 1].days.push(d)
      else out.push({ hotel: h, days: [d] })
    }
    return out.filter((s) => city === 'all' || HOTELS[s.hotel].region === city)
  }, [days, city])

  async function place(idea: IdeaRow, d: PlannedDay) {
    if (!planner || d.locked || d.hotel !== idea.hotel) return
    setHolding(null)
    await run((c) => setDay(c, d.date, idea.activity_ids, null, false, idea.id))
    load()
  }

  const day = days.find((d) => d.date === open) ?? null
  if (err) return <div className="m-4 rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">The trip plan couldn't load. Check your internet.</div>

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Trip plan</h2>
        <div className="flex gap-1.5">
          {([['all', 'All'], ['kanto', '🗼'], ['kansai', '🦌']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setCity(k)} aria-pressed={city === k}
              className={`h-9 min-w-9 rounded-full px-3 text-sm ${city === k ? 'bg-ink font-medium text-white' : 'border border-stone-300 bg-white'}`}>{l}</button>
          ))}
        </div>
      </div>

      {holding && (
        <div className="sticky top-16 z-20 flex items-center gap-2 rounded-2xl bg-ink px-3 py-2 text-sm text-white shadow-lg">
          <span className="flex-1">👆 Tap an open {HOTELS[holding.hotel].short} day to place this idea</span>
          <button onClick={() => setHolding(null)} aria-label="Cancel" className="rounded-full bg-white/15 p-1.5"><X className="h-4 w-4" /></button>
        </div>
      )}

      {stays.map((s) => {
        const hotelIdeas = ideas.filter((i) => i.hotel === s.hotel).sort((a, b) => ideaScore(b, voteCount) - ideaScore(a, voteCount))
        return (
          <section key={s.hotel + s.days[0].date} className="space-y-2">
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${STAY_TINT[s.hotel]}`}>
              🏯 {HOTELS[s.hotel].short}
              <span className="font-normal opacity-80">· {dayLabel(s.days[0].date, { day: 'numeric', month: 'short' })} – {dayLabel(s.days[s.days.length - 1].date, { day: 'numeric', month: 'short' })}</span>
              {hotelIdeas.length > 0 && (
                <button onClick={() => setOpenIdeas(openIdeas === s.hotel ? null : s.hotel)} className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs">💡 {hotelIdeas.length} {hotelIdeas.length === 1 ? 'idea' : 'ideas'}</button>
              )}
            </div>

            {openIdeas === s.hotel && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {hotelIdeas.map((i) => {
                  const who = membersById.get(i.member_id)
                  const acts = i.activity_ids.map((id) => byId.get(id)).filter((p): p is Place => !!p)
                  const dup = sameComboDay(days, i.activity_ids)
                  return (
                    <button key={i.id} draggable={planner} onDragStart={(e) => { e.dataTransfer.setData('text/plain', i.id); setHolding(i) }}
                      onClick={() => planner && setHolding(holding?.id === i.id ? null : i)}
                      className={`relative w-36 shrink-0 rounded-2xl bg-white p-1.5 text-left shadow-sm ${holding?.id === i.id ? 'ring-4 ring-torii' : ''} ${dup ? 'opacity-50' : ''}`}>
                      <div className="flex h-16 gap-1">{acts.map((p) => <Thumb key={p.id} place={p} photoUrls={photoUrls} className="h-full flex-1 rounded-xl" />)}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs">
                        {who && <Face m={who} inButton className="h-6 w-6 rounded-full bg-stone-100 text-sm" />}
                        <span className="flex-1">{i.half_day ? '🚄 ½' : ''}</span>
                        <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] text-white">👍{ideaScore(i, voteCount)}</span>
                      </div>
                      {dup && <span className="absolute left-2 top-2 rounded-full bg-white px-1.5 text-[10px]">✓ {dayLabel(dup.date, { weekday: 'short' })}</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {s.days.map((d) => {
              const target = holding && holding.hotel === d.hotel && !d.locked && d.kind !== 'flight'
              const stops = d.chain?.stops ?? []
              return (
                <div key={d.date}
                  onDragOver={(e) => { if (planner && !d.locked) e.preventDefault() }}
                  onDrop={(e) => { const i = ideas.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (i) place(i, d) }}>
                  {d.kind === 'moving' && <p className="mb-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">🚄 {d.from ? HOTELS[d.from].short : ''} → {HOTELS[d.hotel!].short}</p>}
                  <button onClick={() => target ? place(holding!, d) : d.kind !== 'flight' && setOpen(d.date)}
                    className={`flex w-full items-center gap-2 rounded-2xl p-2 text-left transition ${d.source === 'none' ? 'border-2 border-dashed border-stone-300' : 'bg-white shadow-sm'} ${target ? 'ring-4 ring-torii/60' : ''}`}>
                    <div className="w-10 shrink-0 text-center leading-tight">
                      <div className="text-[11px] text-stone-500">{dayLabel(d.date, { weekday: 'short' })}</div>
                      <div className="text-xl font-semibold">{dayLabel(d.date, { day: 'numeric' })}</div>
                      {d.locked && <div className="text-xs">🔒</div>}
                    </div>
                    {d.kind === 'flight' ? <span className="flex-1 py-3 text-sm text-stone-500">✈️ Fly home</span>
                      : d.source === 'none' ? <span className="flex-1 py-3 text-center text-sm text-stone-400">{target ? '👆 Place idea here' : 'Open · 💡 ideas welcome'}</span>
                      : (
                        <div className={`flex flex-1 items-center gap-1.5 ${d.source === 'draft' ? 'opacity-55' : ''}`}>
                          {stops.filter((x) => x.role === 'activity').map((x, k) => (
                            <div key={x.p.id} className="relative">
                              <Thumb place={x.p} photoUrls={photoUrls} className={`${k === 0 ? 'h-16 w-24' : 'h-16 w-16'} rounded-xl`} />
                              {x.p.full_day && <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-1.5 text-[10px] font-semibold">☀️ all day</span>}
                            </div>
                          ))}
                          {(d.food ?? d.supper) && <Thumb place={(d.food ?? d.supper)!} photoUrls={photoUrls} className="h-12 w-12 shrink-0 rounded-full border-2 border-white shadow" />}
                          {d.source === 'draft' && <span className="ml-auto self-start rounded-full bg-stone-100 px-1.5 text-[10px] text-stone-500">draft</span>}
                        </div>
                      )}
                  </button>
                </div>
              )
            })}
          </section>
        )
      })}

      {day && (
        <DaySheet day={day} me={me} members={members} places={places} votes={votes} photoUrls={photoUrls} days={days}
          onClose={() => setOpen(null)} onOpen={onOpen} run={run} reload={load} />
      )}
      {box}
    </div>
  )
}

function DaySheet({ day, me, members, places, votes, photoUrls, days, onClose, onOpen, run, reload }: {
  day: PlannedDay; me: Member; members: Member[]; places: Place[]; votes: Vote[]; photoUrls: Record<string, string>; days: PlannedDay[]
  onClose: () => void; onOpen: (p: Place) => void; run: (fn: (c: string) => Promise<boolean>) => Promise<boolean>; reload: () => void
}) {
  const planner = !!me.is_admin
  const hotel = day.hotel!
  const region = HOTELS[hotel].region
  const [swap, setSwap] = useState(0) // local 🔄 for everyone; planners can keep it
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [map, setMap] = useState(false)
  const anchor = day.acts[0] ?? HOTELS[hotel]
  const foodOptions = useMemo(() => foodNear(places, anchor, region, 6), [places, anchor, region])
  const food = swap === 0 ? day.food : foodOptions.filter((f) => f.id !== day.food?.id)[(swap - 1) % Math.max(1, foodOptions.length - 1)] ?? day.food
  // swapping food changes the travel legs, so rebuild the chain with the new stop
  const chain = useMemo(() => (swap && day.acts.length && food)
    ? chainFor(day.acts, food, hotel, day.half)
    : day.chain, [day, swap, food, hotel])
  const voters = (id: string) => votes.filter((v) => v.place_id === id).map((v) => members.find((m) => m.id === v.member_id)).filter((m): m is Member => !!m)

  async function save(acts: string[], lock: boolean, foodId: string | null = day.food?.id ?? null) {
    setBusy(true)
    await run((c) => setDay(c, day.date, acts, foodId, lock, null))
    setBusy(false); reload()
  }
  const ids = day.acts.map((p) => p.id)
  const move = (i: number, dir: -1 | 1) => { const a = [...ids]; const j = i + dir; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(a, day.locked) }
  const addable = places.filter((p) => p.kind === 'activity' && (p.category ?? 'activity') !== 'shopping' && p.lat != null && !ids.includes(p.id) && (p.lng! < 137 ? 'kansai' : 'kanto') === region)
  const dup = day.source === 'plan' ? sameComboDay(days, ids, day.date) : null

  return (
    <div className="fixed inset-0 z-[700] flex flex-col bg-washi" role="dialog" aria-modal="true" aria-label={`Plan for ${dayLabel(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}`}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
        <header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-washi/95 px-4 py-3 backdrop-blur">
          <button onClick={onClose} aria-label="Back to all days" className="flex h-11 items-center gap-1 rounded-full bg-white pl-2 pr-3 text-sm font-medium shadow-sm"><ChevronLeft className="h-5 w-5" />All days</button>
          <h2 className="flex-1 font-display text-2xl">{dayLabel(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</h2>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STAY_TINT[hotel]}`}>🏯 {HOTELS[hotel].short}</span>
          {day.locked && <span className="text-lg" title="Locked by a planner">🔒</span>}
        </header>

        {dup && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠️ Same activities as {dayLabel(dup.date, { weekday: 'short', day: 'numeric' })}</p>}

        {chain ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-stone-600">
              <span className="rounded-full border border-stone-200 bg-white px-3 py-1">🚪 {clock(chain.startMin)}</span>
              <span className="h-0.5 flex-1 bg-stone-200" />
              <span className={`rounded-full border px-3 py-1 ${chain.fits ? 'border-stone-200 bg-white' : 'border-red-300 bg-red-50 text-red-800'}`}>🏯 back {clock(chain.endMin)}{chain.fits ? '' : ' ⚠️ after Maghrib'}</span>
            </div>
            {chain.stops.map((s, k) => {
              const isFood = s.role === 'food'
              const p = isFood ? food ?? s.p : s.p
              const ai = ids.indexOf(s.p.id)
              const pray = s.prayers.length ? mosquesNear(p.lat != null ? { lat: p.lat, lng: p.lng! } : HOTELS[hotel], 1)[0] : null
              return (
                <div key={s.p.id + k}>
                  <p className="py-1 pl-5 text-xs text-stone-500"><span className="mr-2 inline-block h-4 w-0.5 bg-stone-300 align-middle" />{legText(s.leg)}</p>
                  {isFood ? (
                    <div className="flex gap-2">
                      <button onClick={() => onOpen(p)} className="relative h-24 flex-1 overflow-hidden rounded-2xl">
                        <Thumb place={p} photoUrls={photoUrls} className="h-full w-full rounded-2xl" />
                        <span className="absolute inset-x-0 bottom-0 bg-ink/60 px-3 py-1.5 text-left text-sm font-semibold text-white">🍜 {p.name}</span>
                      </button>
                      {foodOptions.length > 1 && (
                        <button onClick={() => setSwap(swap + 1)} aria-label="Swap for another nearby halal place"
                          className="flex w-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-stone-300 bg-white text-xs font-semibold text-stone-700">
                          <span className="text-2xl">🔄</span>Swap
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <button onClick={() => onOpen(p)} className="relative block h-40 w-full overflow-hidden rounded-3xl shadow-md">
                        <Thumb place={p} photoUrls={photoUrls} className="h-full w-full rounded-3xl" />
                        <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-ink/60 px-3 py-2 text-left text-white">
                          <span className="flex-1 font-semibold">{p.name}</span>
                          <span className="text-xs">{p.price_jpy == null ? '' : fmtYen(p.price_jpy)}</span>
                        </span>
                        {day.locked && <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold">📌</span>}
                      </button>
                      {planner && (
                        <div className="absolute right-2 top-2 flex gap-1">
                          {ai > 0 && <button aria-label="Move earlier" onClick={() => move(ai, -1)} className="h-9 w-9 rounded-full bg-white/90 text-sm shadow">↑</button>}
                          {ai >= 0 && ai < ids.length - 1 && <button aria-label="Move later" onClick={() => move(ai, 1)} className="h-9 w-9 rounded-full bg-white/90 text-sm shadow">↓</button>}
                          <button aria-label="Remove from this day" onClick={() => save(ids.filter((x) => x !== p.id), day.locked)} className="h-9 w-9 rounded-full bg-white/90 text-sm shadow">✕</button>
                        </div>
                      )}
                      <div className="flex items-center gap-1 px-2 pt-1">{voters(p.id).slice(0, 6).map((m) => <Face key={m.id} m={m} className="h-7 w-7 rounded-full text-base" />)}</div>
                    </div>
                  )}
                  {pray && s.prayers.map((pr) => (
                    <p key={pr.name} className="mt-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">🕌 {pr.name} ~{clock(pr.at)} · {pray.name} ({pray.d < 1 ? `${Math.round(pray.d * 1000)} m` : `${pray.d.toFixed(1)} km`})</p>
                  ))}
                </div>
              )
            })}
            <p className="py-1 pl-5 text-xs text-stone-500"><span className="mr-2 inline-block h-4 w-0.5 bg-stone-300 align-middle" />{legText(chain.back)} → 🏯</p>
            {day.supper && (
              <button onClick={() => onOpen(day.supper!)} className="relative mt-2 block h-24 w-full overflow-hidden rounded-2xl">
                <Thumb place={day.supper} photoUrls={photoUrls} className="h-full w-full rounded-2xl" />
                <span className="absolute inset-x-0 bottom-0 bg-ink/60 px-3 py-1.5 text-left text-sm font-semibold text-white">🌙 Supper after Maghrib · {day.supper.name}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">Nothing planned yet</div>
        )}

        {planner && (
          <div className="mt-4 space-y-2 rounded-2xl border border-stone-200 bg-white p-3">
            <p className="text-xs font-semibold text-stone-500">⭐ Planner</p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => save(ids, !day.locked, (swap ? food?.id : day.food?.id) ?? null)} className="h-11 rounded-xl border border-stone-300 text-sm font-medium">{day.locked ? '🔓 Unlock' : '🔒 Lock day'}</button>
              <button disabled={busy || ids.length >= 3} onClick={() => setAdding(!adding)} className="h-11 rounded-xl border border-stone-300 text-sm font-medium">＋ Add activity</button>
              {day.source === 'draft' && <button disabled={busy} onClick={() => save(ids, false)} className="col-span-2 h-11 rounded-xl bg-ink text-sm font-medium text-white">📌 Keep this draft</button>}
              {swap > 0 && food && <button disabled={busy} onClick={() => { save(ids, day.locked, food.id); setSwap(0) }} className="col-span-2 h-11 rounded-xl bg-ink text-sm font-medium text-white">Keep {food.name}</button>}
              {day.source === 'plan' && !day.locked && <button disabled={busy} onClick={async () => { setBusy(true); await run((c) => clearDay(c, day.date)); setBusy(false); reload() }} className="col-span-2 h-10 rounded-xl text-xs text-stone-500 underline">Clear back to draft</button>}
            </div>
            {busy && <p className="flex items-center gap-2 text-xs text-stone-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</p>}
            {adding && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {addable.slice(0, 12).map((p) => (
                  <button key={p.id} onClick={() => { setAdding(false); save([...ids, p.id], day.locked) }} className="relative h-20 overflow-hidden rounded-xl">
                    <Thumb place={p} photoUrls={photoUrls} className="h-full w-full rounded-xl" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-ink/60 px-1 text-[10px] text-white">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {chain && (
          <button onClick={() => setMap(true)} className="mt-4 h-12 rounded-2xl bg-ink text-base font-semibold text-white">🗺️ Show route</button>
        )}
        <button onClick={onClose} className="mt-2 h-12 rounded-2xl border border-stone-300 bg-white text-base font-medium">← All days</button>
      </div>
      {map && chain && (
        <Suspense fallback={null}>
          <RouteMap day={day} food={food} places={places} photoUrls={photoUrls} onClose={() => setMap(false)} />
        </Suspense>
      )}
    </div>
  )
}

