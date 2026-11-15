import { HOTELS, catOf, regionOf, tripDays, type HotelId, type Place, type TripDay } from './lib'
import { DEFAULT_VISIT, SALAH, hopLeg, hotelLeg, type Prayer, type PrayerName } from './planner'

/**
 * 🗓 Trip plan v2 (design agreed with Maryam 15 Nov 2026, project doc claude/trip-plan-v2-spec.md).
 * - Anchors = activities (Do → activities). Fillers (food, shops, stations, prayer rooms) are interchangeable, picked nearby.
 * - A day = the unordered SET of its activities. No two days may have the same set (single places may repeat).
 * - Planners set/lock days (day_plans). Everyone else suggests one 💡 idea per hotel (day_ideas).
 * - Days with no plan are a faded DRAFT from the normal 👍 votes. Recomputed in the app, never stored.
 * Stats analogy: within a hotel the days are exchangeable, so an idea fits any open date at that hotel.
 */
export type DayPlanRow = { day: string; activity_ids: string[]; food_id: string | null; locked: boolean; idea_id: string | null }
export type IdeaRow = { id: string; member_id: string; hotel: HotelId; half_day: boolean; activity_ids: string[]; created_at: string }

export type Leg = { minutes: number; walk: boolean }
export type ChainStop = { p: Place; role: 'activity' | 'food'; leg: Leg; arrive: number; leave: number; prayers: Prayer[] }
export type Chain = { stops: ChainStop[]; back: Leg; startMin: number; endMin: number; fits: boolean }
export type PlannedDay = TripDay & {
  kind: 'arrival' | 'moving' | 'normal' | 'flight'
  half: boolean
  source: 'plan' | 'draft' | 'none'
  locked: boolean
  acts: Place[]
  food: Place | null
  chain: Chain | null
  supper: Place | null
}

export const FULL_START = 9 * 60
export const HALF_START = 14 * 60
const WALK_KM = 1.2

export const comboKey = (ids: string[]) => [...new Set(ids)].sort().join('+')
const isActivity = (p: Place) => p.kind === 'activity' && catOf(p) === 'activity'
const isHalalFood = (p: Place) => p.kind === 'restaurant' && (p.halal === 'Halal certified' || p.halal === 'Muslim friendly') && p.lat != null
const visit = (p: Place) => p.visit_minutes ?? (p.kind === 'restaurant' ? DEFAULT_VISIT.restaurant : DEFAULT_VISIT.activity)
const km = (a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }) => {
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return 99
  const R = 6371, r = Math.PI / 180
  const d = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(d))
}

/** Halal food near a point, nearest first (the 🔄 Swap button walks down this list). */
export function foodNear(places: Place[], at: { lat: number | null; lng: number | null }, region: string, n = 6) {
  return places.filter((p) => isHalalFood(p) && regionOf(p) === region)
    .map((p) => ({ p, d: km(at, p) })).sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.p)
}

/** Hotel → stops in order → hotel, with leg times, arrival times and salah stops (same rules as the day planner). */
export function buildChain(order: { p: Place; role: 'activity' | 'food' }[], hotel: HotelId, startMin: number): Chain {
  let t = startMin
  let prev: Place | null = null
  const done = new Set<PrayerName>()
  const stops: ChainStop[] = []
  for (const { p, role } of order) {
    const minutes = prev ? hopLeg(hotel, prev, p) : hotelLeg(hotel, p)
    const walk = (prev ? km(prev, p) : km(HOTELS[hotel], p)) <= WALK_KM
    t += minutes
    const arrive = t
    t += (p.wait_minutes ?? 0) + visit(p)
    const prayers: Prayer[] = []
    for (const [name, w] of [['Dhuhr', SALAH.dhuhr], ['Asr', SALAH.asr]] as const) {
      const at = Math.max(arrive, w.from)
      if (!done.has(name) && at <= t && at + SALAH.prayMinutes <= w.to) { prayers.push({ name, at }); done.add(name); t += SALAH.prayMinutes }
    }
    stops.push({ p, role, leg: { minutes, walk }, arrive, leave: t, prayers })
    prev = p
  }
  const backMin = prev ? hotelLeg(hotel, prev) : 0
  const back = { minutes: backMin, walk: prev ? km(prev, HOTELS[hotel]) <= WALK_KM : true }
  const endMin = t + backMin
  return { stops, back, startMin, endMin, fits: endMin <= SALAH.backBy }
}

/** Activities + one food stop (after the 1st activity, or after the only one). Full-day: no lunch stop, supper after Maghrib. */
export function chainFor(acts: Place[], food: Place | null, hotel: HotelId, half: boolean) {
  // half days (arrival / move days) start at 2 pm: no lunch stop, food becomes supper after Maghrib
  const full = (acts.length === 1 && acts[0].full_day) || half
  const order: { p: Place; role: 'activity' | 'food' }[] = acts.map((p) => ({ p, role: 'activity' as const }))
  if (food && !full) order.splice(Math.min(1, order.length), 0, { p: food, role: 'food' })
  return buildChain(order, hotel, half ? HALF_START : FULL_START)
}

/** Draft activities for an open day: most-voted unused combination that fits before Maghrib. */
function draftActs(pool: Place[], votes: Record<string, number>, hotel: HotelId, half: boolean, usedCombos: Set<string>, usedActs: Set<string>, places: Place[]): Place[] {
  const score = (p: Place) => (votes[p.id] ?? 0) * 10 - (usedActs.has(p.id) ? 50 : 0) - hotelLeg(hotel, p) / 10
  const ranked = [...pool].sort((a, b) => score(b) - score(a)).slice(0, 10)
  const region = HOTELS[hotel].region
  const options: Place[][] = []
  if (half) for (const a of ranked) if (!a.full_day) options.push([a])
  if (!half) {
    for (const a of ranked) if (a.full_day) options.push([a])
    for (let i = 0; i < ranked.length; i++) for (let j = i + 1; j < ranked.length; j++) {
      if (!ranked[i].full_day && !ranked[j].full_day) options.push([ranked[i], ranked[j]])
    }
    for (const a of ranked) if (!a.full_day) options.push([a])
  }
  const value = (o: Place[]) => o.reduce((s, p) => s + score(p), 0) + (o.length === 2 ? 5 : 0)
  options.sort((a, b) => value(b) - value(a))
  for (const o of options) {
    if (usedCombos.has(comboKey(o.map((p) => p.id)))) continue
    const food = foodNear(places, o[0], region, 1)[0] ?? null
    if (chainFor(o, food, hotel, half).fits) return o
  }
  return []
}

export function planTrip(places: Place[], votes: Record<string, number>, plans: DayPlanRow[], days = tripDays()): PlannedDay[] {
  const byId = new Map(places.map((p) => [p.id, p]))
  const planByDay = new Map(plans.map((r) => [r.day, r]))
  // combos already decided by planners can't be reused by drafts
  const usedCombos = new Set(plans.filter((r) => r.activity_ids.length).map((r) => comboKey(r.activity_ids)))
  const usedActs = new Set(plans.flatMap((r) => r.activity_ids))
  return days.map((d, i): PlannedDay => {
    const kind: PlannedDay['kind'] = d.last ? 'flight' : i === 0 ? 'arrival' : d.moving ? 'moving' : 'normal'
    const base = { ...d, kind, half: kind === 'arrival' || kind === 'moving', locked: false, acts: [] as Place[], food: null as Place | null, chain: null as Chain | null, supper: null as Place | null }
    if (kind === 'flight' || !d.hotel) return { ...base, source: 'none' }
    const hotel = d.hotel
    const region = HOTELS[hotel].region
    const row = planByDay.get(d.date)
    let acts: Place[]
    let source: PlannedDay['source']
    if (row) {
      acts = row.activity_ids.map((id) => byId.get(id)).filter((p): p is Place => !!p)
      source = 'plan'
    } else {
      const pool = places.filter((p) => isActivity(p) && !p.visited && p.lat != null && regionOf(p) === region)
      acts = draftActs(pool, votes, hotel, base.half, usedCombos, usedActs, places)
      source = acts.length ? 'draft' : 'none'
      if (acts.length) { usedCombos.add(comboKey(acts.map((p) => p.id))); acts.forEach((p) => usedActs.add(p.id)) }
    }
    const anchor = acts[0] ?? HOTELS[hotel]
    const chosen = row?.food_id ? byId.get(row.food_id) ?? null : null
    const food = chosen ?? (acts.length ? foodNear(places, anchor, region, 1)[0] ?? null : null)
    const full = (acts.length === 1 && acts[0].full_day) || base.half
    const supper = full && acts.length ? (chosen ?? foodNear(places, HOTELS[hotel], region, 1)[0] ?? null) : null
    return { ...base, source, locked: !!row?.locked, acts, food: full ? null : food, supper, chain: acts.length ? chainFor(acts, full ? null : food, hotel, base.half) : null }
  })
}

/** Score of an idea = the normal 👍 votes of its activities (no extra voting system). */
export const ideaScore = (idea: IdeaRow, votes: Record<string, number>) => idea.activity_ids.reduce((s, id) => s + (votes[id] ?? 0), 0)

/** Which planned day (if any) already uses exactly this set of activities. */
export function sameComboDay(days: PlannedDay[], ids: string[], exceptDate?: string) {
  const k = comboKey(ids)
  return days.find((d) => d.date !== exceptDate && d.source === 'plan' && d.acts.length && comboKey(d.acts.map((p) => p.id)) === k) ?? null
}

/** Open dates at a hotel (not locked) that an idea could go on. */
export const openDates = (days: PlannedDay[], hotel: HotelId, half: boolean) =>
  days.filter((d) => d.hotel === hotel && !d.locked && d.kind !== 'flight' && d.half === half)

/** "Directions" link: Apple Maps on iPhone/iPad, Google Maps elsewhere (public transport). */
export function directionsUrl(lat: number, lng: number, name?: string) {
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  return ios
    ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=r${name ? `&q=${encodeURIComponent(name)}` : ''}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`
}
