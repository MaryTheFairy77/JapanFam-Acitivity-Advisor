import { HOTELS, catOf, regionOf, tripDays, type HotelId, type Place, type TripDay } from './lib'
import { DEFAULT_VISIT, SALAH, hopLeg, hotelLeg, type PrayerName } from './planner'
import { mosquesNear, type Mosque } from './mosques'
import { maghribAt } from './sun'

/**
 * 🗓 Trip plan v2 (agreed with Maryam 15 Nov 2026, project doc claude/trip-plan-v2-spec.md).
 * A day = start time + ordered STEPS; a step = one or more places done together (🔗 kimono + temple).
 * - Free order: activities and food in any order. Start no earlier than 8 am. Evenings allowed.
 * - Maghrib (real sunset per date + city): be at the hotel, or within ~400 m of a mosque / prayer room.
 * - A day's identity = the unordered SET of its activities; no two days may share it. Food/shops are filler.
 * - Planners set/lock days (day_plans). Everyone suggests one 💡 idea per hotel (day_ideas). Other days = faded draft.
 */
export type Layout = { start: number; steps: string[][] }
export type DayPlanRow = { day: string; activity_ids: string[]; food_id: string | null; locked: boolean; idea_id: string | null; layout?: Layout | null }
export type IdeaRow = { id: string; member_id: string; hotel: HotelId; half_day: boolean; activity_ids: string[]; created_at: string; layout?: Layout | null }

export type Leg = { minutes: number; walk: boolean; car?: boolean }
export type Pray = { name: PrayerName | 'Maghrib'; at: number; room: (Mosque & { d: number }) | null }
export type Step = { places: Place[]; leg: Leg; arrive: number; leave: number; prayers: Pray[] }
export type Timeline = {
  steps: Step[]; back: Leg; start: number; end: number
  maghrib: { at: number; ok: boolean; where: 'hotel' | 'room' | 'moving' | 'away'; room: (Mosque & { d: number }) | null }
}
export type PlannedDay = TripDay & {
  kind: 'arrival' | 'moving' | 'normal' | 'flight'
  half: boolean
  source: 'plan' | 'draft' | 'none'
  locked: boolean
  start: number
  steps: Place[][]
  acts: Place[]
  timeline: Timeline | null
  supper: Place | null
}

export const EARLIEST = 8 * 60
export const FULL_START = 9 * 60
export const HALF_START = 14 * 60
export const LATEST_END = 22 * 60
export const ROOM_KM = 0.4
const WALK_KM = 1.2
const MAGHRIB_MIN = 10
/** 🚕 Taxi / car estimate (city ~27 km/h + 6 min to get one). Used when it beats the train guess by 5+ min (Maryam: "a 50 min walk could be a 10 min drive"). */
export const carMinutes = (d: number) => Math.round(6 + d * 2.2)
const human = (hotel: HotelId, p: Place) => p.travel_minutes != null && !(p.auto_fields ?? []).includes('travel') && (p.nearest_hotels ?? []).includes(hotel)
function legOf(minutes: number, d: number, fixed: boolean): Leg {
  if (d <= WALK_KM) return { minutes, walk: true }
  const car = carMinutes(d)
  return !fixed && d <= 15 && car <= minutes - 5 ? { minutes: car, walk: false, car: true } : { minutes, walk: false }
}

export const isActivity = (p: Place) => p.kind === 'activity' && catOf(p) === 'activity'
const isHalalFood = (p: Place) => p.kind === 'restaurant' && (p.halal === 'Halal certified' || p.halal === 'Muslim friendly') && p.lat != null
const visit = (p: Place) => p.visit_minutes ?? (p.kind === 'restaurant' ? DEFAULT_VISIT.restaurant : catOf(p) === 'shopping' ? DEFAULT_VISIT.shopping : DEFAULT_VISIT.activity)
export const km = (a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }) => {
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return 99
  const R = 6371, r = Math.PI / 180
  const d = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(d))
}
export const comboKey = (ids: string[]) => [...new Set(ids)].sort().join('+')
export const activityIds = (steps: Place[][]) => [...new Set(steps.flat().filter(isActivity).map((p) => p.id))]
const roomNear = (p: { lat: number | null; lng: number | null }) => {
  if (p.lat == null || p.lng == null) return null
  const m = mosquesNear({ lat: p.lat, lng: p.lng }, 1)[0]
  return m && m.d <= ROOM_KM ? m : null
}

/** Halal food near a point, nearest first. */
export function foodNear(places: Place[], at: { lat: number | null; lng: number | null }, region: string, n = 6) {
  return places.filter((p) => isHalalFood(p) && regionOf(p) === region)
    .map((p) => ({ p, d: km(at, p) })).sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.p)
}

/** Hotel → steps → hotel with leg times, salah stops and the Maghrib check. */
export function buildTimeline(steps: Place[][], hotel: HotelId, start: number, date: string): Timeline {
  const H = HOTELS[hotel]
  const maghrib = maghribAt(date, H.lat, H.lng)
  let t = Math.max(EARLIEST, start)
  const t0 = t
  let prev: Place | null = null
  const done = new Set<string>()
  const out: Step[] = []
  let mg: Timeline['maghrib'] | null = maghrib <= t ? { at: maghrib, ok: true, where: 'hotel', room: null } : null
  for (const group of steps.filter((g) => g.length)) {
    const lead = group[0]
    const leg = legOf(prev ? hopLeg(hotel, prev, lead) : hotelLeg(hotel, lead), prev ? km(prev, lead) : km(H, lead), !prev && human(hotel, lead))
    const minutes = leg.minutes
    const legStart = t
    t += minutes
    const arrive = t
    if (!mg && maghrib >= legStart && maghrib < arrive) {
      // on the move at Maghrib: OK only if we arrive within ~5 min next to a prayer room
      const r = roomNear(lead)
      mg = arrive - maghrib <= 5 && r ? { at: maghrib, ok: true, where: 'room', room: r } : { at: maghrib, ok: false, where: 'moving', room: null }
    }
    t += Math.max(...group.map((p) => (p.wait_minutes ?? 0) + visit(p)))
    const prayers: Pray[] = []
    for (const [name, w] of [['Dhuhr', SALAH.dhuhr], ['Asr', SALAH.asr]] as const) {
      const at = Math.max(arrive, w.from)
      if (!done.has(name) && at <= t && at + SALAH.prayMinutes <= w.to) { prayers.push({ name, at, room: roomNear(lead) }); done.add(name); t += SALAH.prayMinutes }
    }
    if (!mg && maghrib >= arrive && maghrib <= t) {
      const r = roomNear(lead)
      mg = { at: maghrib, ok: !!r, where: r ? 'room' : 'away', room: r }
      if (r) { prayers.push({ name: 'Maghrib', at: maghrib, room: r }); t += MAGHRIB_MIN }
    }
    out.push({ places: group, leg, arrive, leave: t, prayers })
    prev = lead
  }
  const back = prev ? legOf(hotelLeg(hotel, prev), km(prev, H), human(hotel, prev)) : { minutes: 0, walk: true }
  const backMin = back.minutes
  if (!mg && maghrib > t && maghrib < t + backMin) mg = { at: maghrib, ok: false, where: 'moving', room: null }
  const end = t + backMin
  if (!mg) mg = { at: maghrib, ok: true, where: 'hotel', room: null }
  return { steps: out, back, start: t0, end, maghrib: mg }
}

const fits = (tl: Timeline) => tl.maghrib.ok && tl.end <= LATEST_END

/** What adding place p would cost: best spot (or a given spot), minutes added, and whether Maghrib still works. */
export function addCost(steps: Place[][], p: Place, hotel: HotelId, start: number, date: string, at?: { index: number; together?: boolean }) {
  const base = buildTimeline(steps, hotel, start, date)
  const tries: { steps: Place[][]; index: number; together: boolean }[] = []
  if (at?.together) tries.push({ steps: steps.map((g, i) => (i === at.index ? [...g, p] : g)), index: at.index, together: true })
  else if (at) tries.push({ steps: [...steps.slice(0, at.index), [p], ...steps.slice(at.index)], index: at.index, together: false })
  else for (let i = 0; i <= steps.length; i++) tries.push({ steps: [...steps.slice(0, i), [p], ...steps.slice(i)], index: i, together: false })
  let best: { added: number; ok: boolean; index: number; together: boolean; steps: Place[][] } | null = null
  for (const x of tries) {
    const tl = buildTimeline(x.steps, hotel, start, date)
    const cand = { added: tl.end - base.end, ok: fits(tl), index: x.index, together: x.together, steps: x.steps }
    if (!best || (cand.ok && !best.ok) || (cand.ok === best.ok && cand.added < best.added)) best = cand
  }
  return best!
}

/** Draft for an open day: most-voted unused activity combination, food after the 1st activity on full days.
 *  Prefers combos that keep Maghrib OK (trying an earlier start too); if none fit, still drafts the best one (shown ⚠️). */
function draftSteps(pool: Place[], votes: Record<string, number>, hotel: HotelId, start: number, date: string, half: boolean, usedCombos: Set<string>, usedActs: Set<string>, places: Place[]): { steps: Place[][]; start: number } {
  const region = HOTELS[hotel].region
  const score = (p: Place) => (votes[p.id] ?? 0) * 10 - (usedActs.has(p.id) ? 50 : 0) - hotelLeg(hotel, p) / 10
  const ranked = [...pool].sort((a, b) => score(b) - score(a)).slice(0, 16)
  const options: Place[][] = []
  if (!half) for (const a of ranked) if (a.full_day) options.push([a])
  if (!half) for (let i = 0; i < ranked.length; i++) for (let j = i + 1; j < ranked.length; j++) if (!ranked[i].full_day && !ranked[j].full_day) options.push([ranked[i], ranked[j]])
  for (const a of ranked) if (!a.full_day) options.push([a])
  const value = (o: Place[]) => o.reduce((s, p) => s + score(p), 0) + (o.length === 2 ? 5 : 0)
  options.sort((a, b) => value(b) - value(a))
  const stepsFor = (o: Place[]) => {
    const lunch = !half && !o[0].full_day ? foodNear(places, o[0], region, 1)[0] : undefined
    return lunch ? [[o[0]], [lunch], ...o.slice(1).map((p) => [p])] : o.map((p) => [p])
  }
  const fresh = options.filter((o) => !usedCombos.has(comboKey(o.map((p) => p.id))))
  for (const st of half ? [start] : [start, EARLIEST]) for (const o of fresh) {
    const steps = stepsFor(o)
    if (fits(buildTimeline(steps, hotel, st, date))) return { steps, start: st }
  }
  const pick = fresh.find((o) => o.length === 1 && !o[0].full_day) ?? fresh[0]
  return pick ? { steps: stepsFor(pick), start } : { steps: [], start } // best single activity = shortest day
}

export function planTrip(places: Place[], votes: Record<string, number>, plans: DayPlanRow[], days = tripDays()): PlannedDay[] {
  const byId = new Map(places.map((p) => [p.id, p]))
  const planByDay = new Map(plans.map((r) => [r.day, r]))
  const stepsOf = (r: DayPlanRow): Place[][] => {
    if (r.layout?.steps) return r.layout.steps.map((g) => g.map((id) => byId.get(id)).filter((p): p is Place => !!p)).filter((g) => g.length)
    const acts = r.activity_ids.map((id) => byId.get(id)).filter((p): p is Place => !!p).map((p) => [p])
    const food = r.food_id ? byId.get(r.food_id) : undefined
    return food ? [...acts.slice(0, 1), [food], ...acts.slice(1)] : acts
  }
  const usedCombos = new Set(plans.map((r) => comboKey(r.activity_ids)).filter(Boolean))
  const usedActs = new Set(plans.flatMap((r) => r.activity_ids))
  return days.map((d, i): PlannedDay => {
    const kind: PlannedDay['kind'] = d.last ? 'flight' : i === 0 ? 'arrival' : d.moving ? 'moving' : 'normal'
    const half = kind === 'arrival' || kind === 'moving'
    const base = { ...d, kind, half, locked: false, start: half ? HALF_START : FULL_START, steps: [] as Place[][], acts: [] as Place[], timeline: null as Timeline | null, supper: null as Place | null }
    if (kind === 'flight' || !d.hotel) return { ...base, source: 'none' }
    const hotel = d.hotel
    const region = HOTELS[hotel].region
    const row = planByDay.get(d.date)
    let steps: Place[][]
    let start = base.start
    let source: PlannedDay['source']
    if (row) {
      steps = stepsOf(row); source = 'plan'
      if (row.layout?.start) start = row.layout.start
    } else {
      const pool = places.filter((p) => isActivity(p) && !p.visited && p.lat != null && regionOf(p) === region)
      const dr = draftSteps(pool, votes, hotel, start, d.date, half, usedCombos, usedActs, places)
      steps = dr.steps; start = dr.start
      source = steps.length ? 'draft' : 'none'
      const ids = activityIds(steps)
      if (ids.length) { usedCombos.add(comboKey(ids)); ids.forEach((x) => usedActs.add(x)) }
    }
    const acts = steps.flat().filter(isActivity)
    const hasFood = steps.flat().some((p) => p.kind === 'restaurant')
    const supper = steps.length && !hasFood ? foodNear(places, HOTELS[hotel], region, 1)[0] ?? null : null
    return { ...base, source, locked: !!row?.locked, start, steps, acts, supper, timeline: steps.length ? buildTimeline(steps, hotel, start, d.date) : null }
  })
}

/** Score of an idea = the normal 👍 votes of its activities (no extra voting). */
export const ideaScore = (idea: IdeaRow, votes: Record<string, number>) => idea.activity_ids.reduce((s, id) => s + (votes[id] ?? 0), 0)

/** Which planned day (if any) already uses exactly this set of activities. */
export function sameComboDay(days: PlannedDay[], ids: string[], exceptDate?: string) {
  if (!ids.length) return null
  const k = comboKey(ids)
  return days.find((d) => d.date !== exceptDate && d.source === 'plan' && d.acts.length && comboKey(d.acts.map((p) => p.id)) === k) ?? null
}

/** Open (unlocked) dates at a hotel. */
export const openDates = (days: PlannedDay[], hotel: HotelId) => days.filter((d) => d.hotel === hotel && !d.locked && d.kind !== 'flight')

/** "Directions" link: Apple Maps on iPhone/iPad, Google Maps elsewhere (public transport). */
export function directionsUrl(lat: number, lng: number, name?: string) {
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  return ios
    ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=r${name ? `&q=${encodeURIComponent(name)}` : ''}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`
}
