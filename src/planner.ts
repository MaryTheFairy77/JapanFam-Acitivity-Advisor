import { HOTELS, catOf, estimateTravel, km, regionOf, type HotelId, type Place } from './lib'

export type Goal = 'votes' | 'cheap' | 'time'
/** Day shape: always 1 food stop + either 2 activities, or 1 activity + shopping (or let the planner pick). */
export type Shape = 'acts' | 'shop' | 'either'
export const SHAPES: Record<Exclude<Shape, 'either'>, { nAct: number; nShop: number; nMeal: number }> = {
  acts: { nAct: 2, nShop: 0, nMeal: 1 },
  shop: { nAct: 1, nShop: 1, nMeal: 1 },
}
export type PrayerName = 'Dhuhr' | 'Asr'
export interface Prayer { name: PrayerName; at: number }
export interface Stop { p: Place; travel: number; arrive: number; leave: number; prayers: Prayer[] }
export interface Plan {
  stops: Stop[]; cost: number; minutes: number; votes: number; back: number
  /** true = home after Maghrib starts, so Asr was prayed while out; false = Asr + Maghrib back to back at the hotel */
  asrOut: boolean
}

/**
 * Salah rules for a day out (minutes after midnight). Edit here if the times change.
 * - Home by BACK_BY (17:30) at the latest to make Maghrib.
 * - Out during Dhuhr (12:00–14:00) → a 15-min prayer stop in that window.
 * - Home after Maghrib starts (16:30) → also an Asr stop (14:00–16:00); otherwise Asr + Maghrib back to back at the hotel.
 */
export const SALAH = {
  dhuhr: { from: 12 * 60, to: 14 * 60 },
  asr: { from: 14 * 60, to: 16 * 60 },
  maghrib: 16 * 60 + 30,
  backBy: 17 * 60 + 30,
  prayMinutes: 15,
} as const
export interface PlanOptions {
  places: Place[]
  voteCount: Record<string, number>
  hotel: HotelId
  budget: number      // ¥ per person
  backBy: number      // latest time home (minutes after midnight), default SALAH.backBy
  startMin: number    // minutes after midnight
  nAct: number
  nShop: number
  nMeal: number
  halalOnly: boolean
  unvisited: boolean
  goal: Goal
}

export const DEFAULT_VISIT = { restaurant: 60, activity: 120, shopping: 90 } as const
const visitOf = (p: Place) => p.visit_minutes ?? (p.kind === 'restaurant' ? DEFAULT_VISIT.restaurant : DEFAULT_VISIT[catOf(p)])
export const CANDIDATES_PER_KIND = 14

/** All k-sized subsets (n choose k). */
export function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  const out: T[][] = []
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) { out.push(cur.slice()); return }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop() }
  }
  rec(0, [])
  return out
}

type Pt = { lat: number | null; lng: number | null; travel_minutes?: number | null }
/** Travel minutes between two points: distance estimate if both pinned, else the place's own travel time, else 30. */
export function leg(a: Pt, b: Pt): number {
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null)
    return estimateTravel(km({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng })).minutes
  return b.travel_minutes ?? a.travel_minutes ?? 30
}

/** Alternate activity → meal → activity … (start with a meal if there are more meals). */
export function interleave(acts: Place[], meals: Place[]): Place[] {
  const a = [...acts], m = [...meals], order: Place[] = []
  let mealTurn = m.length > a.length
  while (a.length || m.length) {
    const next = (mealTurn && m.length) || !a.length ? m.shift()! : a.shift()!
    order.push(next); mealTurn = !mealTurn
  }
  return order
}

/**
 * Brute-force "knapsack with two constraints": try every combo of nAct activities × nMeal meals
 * from the top candidates near the hotel, keep the ones within budget AND time, rank by goal.
 */
export function buildPlans(o: PlanOptions) {
  const base = { lat: HOTELS[o.hotel].lat, lng: HOTELS[o.hotel].lng }
  const region = HOTELS[o.hotel].region
  const pool = o.places.filter((p) => regionOf(p) === region && (!o.unvisited || !p.visited))
  const top = (kind: Place['kind'] | 'shopping') => pool
    .filter((p) => kind === 'restaurant' ? p.kind === 'restaurant' : p.kind === 'activity' && catOf(p) === kind)
    .filter((p) => kind !== 'restaurant' || !o.halalOnly || p.halal === 'Halal certified' || p.halal === 'Muslim friendly')
    .sort((a, b) => (o.voteCount[b.id] ?? 0) - (o.voteCount[a.id] ?? 0) || (a.price_jpy ?? 0) - (b.price_jpy ?? 0))
    .slice(0, CANDIDATES_PER_KIND)
  const acts = top('activity'), meals = top('restaurant'), shops = top('shopping')

  const valid: Plan[] = []
  let checked = 0
  for (const A of combos(acts, o.nAct)) for (const M of combos(meals, o.nMeal)) for (const S of combos(shops, o.nShop)) {
    checked++
    // shopping goes last: it's the flexible stop you can cut short or stretch
    const plan = simulate([...interleave(A, M), ...S], base, o)
    if (plan && plan.cost <= o.budget) valid.push(plan)
  }
  valid.sort(rank(o.goal))

  const short = [
    acts.length < o.nAct && (acts.length ? `only ${acts.length} activit${acts.length === 1 ? 'y' : 'ies'}` : 'no activities'),
    shops.length < o.nShop && (shops.length ? `only ${shops.length} shopping spot${shops.length === 1 ? '' : 's'}` : 'no shopping spots'),
    meals.length < o.nMeal && `${meals.length ? `only ${meals.length}` : 'no'} ${o.halalOnly ? 'halal-friendly ' : ''}restaurant${meals.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' and ')

  return { plans: valid.slice(0, 3), considered: acts.length + meals.length + shops.length, checked, short }
}

/**
 * Walk the day in order. A prayer happens at whichever stop you're at when its window opens
 * (or the first stop you reach inside the window) and adds 15 min there.
 * Tries the day without an Asr stop first: if you're home by Maghrib (16:30), Asr + Maghrib are prayed
 * back to back at the hotel. Otherwise Asr must be prayed out. Returns null if the day misses a prayer
 * or gets home after the back-by time (17:30 at the latest).
 */
export function simulate(order: Place[], base: Pt, o: Pick<PlanOptions, 'startMin' | 'backBy' | 'voteCount'>): Plan | null {
  const noAsr = walk(order, base, o, false)
  if (noAsr && noAsr.minutes + o.startMin <= SALAH.maghrib) return noAsr
  return walk(order, base, o, true)
}

function walk(order: Place[], base: Pt, o: Pick<PlanOptions, 'startMin' | 'backBy' | 'voteCount'>, asrOut: boolean): Plan | null {
  const backBy = Math.min(o.backBy, SALAH.backBy)
  let t = o.startMin, cost = 0, votes = 0, prev: Pt = base
  const done = new Set<PrayerName>()
  const stops: Stop[] = []
  const windows = asrOut ? [['Dhuhr', SALAH.dhuhr], ['Asr', SALAH.asr]] as const : [['Dhuhr', SALAH.dhuhr]] as const
  for (const p of order) {
    const tr = leg(prev, p); t += tr
    const arrive = t
    t += (p.wait_minutes ?? 0) + visitOf(p)
    const prayers: Prayer[] = []
    for (const [name, w] of windows) {
      const at = Math.max(arrive, w.from)
      if (!done.has(name) && at <= t && at + SALAH.prayMinutes <= w.to) {
        prayers.push({ name, at }); done.add(name); t += SALAH.prayMinutes
      }
    }
    stops.push({ p, travel: tr, arrive, leave: t, prayers })
    cost += p.price_jpy ?? 0; votes += o.voteCount[p.id] ?? 0; prev = p
  }
  const back = leg(prev, base); t += back
  if (t > backBy) return null
  // out for the whole Dhuhr window without a prayer stop → not allowed (home in time = pray at the hotel)
  if (!done.has('Dhuhr') && o.startMin < SALAH.dhuhr.to - SALAH.prayMinutes && t > SALAH.dhuhr.to - SALAH.prayMinutes) return null
  if (asrOut && !done.has('Asr')) return null
  return { stops, cost, minutes: t - o.startMin, votes, back, asrOut }
}

/** Evening (after Maghrib, adults only): best shopping spots near the hotel that aren't already in the day. */
export function eveningShopping(o: Pick<PlanOptions, 'places' | 'voteCount' | 'hotel' | 'unvisited'>, plan: Plan, n = 2) {
  const used = new Set(plan.stops.map((s) => s.p.id))
  const base = { lat: HOTELS[o.hotel].lat, lng: HOTELS[o.hotel].lng }
  return o.places
    .filter((p) => p.kind === 'activity' && catOf(p) === 'shopping' && !used.has(p.id)
      && regionOf(p) === HOTELS[o.hotel].region && (!o.unvisited || !p.visited))
    .map((p) => ({ p, travel: leg(base, p) }))
    .sort((a, b) => (o.voteCount[b.p.id] ?? 0) - (o.voteCount[a.p.id] ?? 0) || a.travel - b.travel)
    .slice(0, n)
}

const rank = (goal: Goal) => (x: Plan, y: Plan) =>
  goal === 'votes' ? y.votes - x.votes || x.cost - y.cost
  : goal === 'cheap' ? x.cost - y.cost || y.votes - x.votes
  : x.minutes - y.minutes || y.votes - x.votes

/** 1 food stop + (2 activities | activity + shopping). 'either' runs both shapes and keeps the best 3 overall. */
export function buildDayPlans(o: Omit<PlanOptions, 'nAct' | 'nShop' | 'nMeal'> & { shape: Shape }) {
  if (o.shape !== 'either') return buildPlans({ ...o, ...SHAPES[o.shape] })
  const a = buildPlans({ ...o, ...SHAPES.acts }), b = buildPlans({ ...o, ...SHAPES.shop })
  const plans = [...a.plans, ...b.plans].sort(rank(o.goal)).slice(0, 3)
  return {
    plans,
    considered: Math.max(a.considered, b.considered),
    checked: a.checked + b.checked,
    short: plans.length ? '' : (a.short && b.short ? b.short : ''),
  }
}
