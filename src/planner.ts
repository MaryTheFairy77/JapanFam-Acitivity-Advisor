import { HOTELS, catOf, estimateTravel, km, regionOf, type HotelId, type Place } from './lib'

export type Goal = 'votes' | 'cheap' | 'time'
/** Day shape: 2 activities, 1 activity + shopping, or a ☀️ full-day activity (+ supper), or let the planner pick. */
export type Shape = 'acts' | 'shop' | 'full' | 'either'
export const SHAPES: Record<'acts' | 'shop', { nAct: number; nShop: number; nMeal: number }> = {
  acts: { nAct: 2, nShop: 0, nMeal: 1 },
  shop: { nAct: 1, nShop: 1, nMeal: 1 },
}
export type PrayerName = 'Dhuhr' | 'Asr'
export interface Prayer { name: PrayerName; at: number }
export interface Stop { p: Place; travel: number; arrive: number; leave: number; prayers: Prayer[] }
export interface Plan {
  stops: Stop[]; cost: number; minutes: number; votes: number; back: number
  /** 'light' = fallback 1-activity day, shown only when no full day fits */
  light?: boolean
  /** ☀️ full-day activity: the only daytime stop; food = supper after Maghrib */
  fullDay?: boolean
  supper?: { p: Place; travel: number }
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

/**
 * Hotel ↔ place leg. A family-entered travel time (not ✨ auto) to this hotel wins over the distance estimate
 * (golden rule: human input wins; the straight-line formula overestimates long trips like Osaka → Kyoto).
 */
export function hotelLeg(hotel: HotelId, p: Place): number {
  const human = p.travel_minutes != null && !(p.auto_fields ?? []).includes('travel') && (p.nearest_hotels ?? []).includes(hotel)
  return human ? p.travel_minutes! : leg(HOTELS[hotel], p)
}

/**
 * Place → place leg, capped at "back via the hotel" (place → hotel → place) using the hotel legs above.
 * Fixes long hops the distance formula overestimates (e.g. Kyoto → Osaka ≈ 2h20 → 60 + 23 min).
 */
export function hopLeg(hotel: HotelId, a: Place, b: Place): number {
  return Math.min(leg(a, b), hotelLeg(hotel, a) + hotelLeg(hotel, b))
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
/** Top candidates near the hotel, by kind. Full-day activities are kept apart (they never share a day). */
export function candidates(o: Pick<PlanOptions, 'places' | 'hotel' | 'unvisited' | 'halalOnly' | 'voteCount'>) {
  const region = HOTELS[o.hotel].region
  const pool = o.places.filter((p) => regionOf(p) === region && (!o.unvisited || !p.visited))
  const top = (kind: Place['kind'] | 'shopping' | 'full') => pool
    .filter((p) => kind === 'restaurant' ? p.kind === 'restaurant'
      : kind === 'full' ? p.kind === 'activity' && catOf(p) === 'activity' && !!p.full_day
      : p.kind === 'activity' && catOf(p) === kind && !(kind === 'activity' && p.full_day))
    .filter((p) => kind !== 'restaurant' || !o.halalOnly || p.halal === 'Halal certified' || p.halal === 'Muslim friendly')
    .sort((a, b) => (o.voteCount[b.id] ?? 0) - (o.voteCount[a.id] ?? 0) || (a.price_jpy ?? 0) - (b.price_jpy ?? 0))
    .slice(0, CANDIDATES_PER_KIND)
  return { acts: top('activity'), meals: top('restaurant'), shops: top('shopping'), fulls: top('full') }
}

export function buildPlans(o: PlanOptions) {
  const { acts, meals, shops } = candidates(o)

  const valid: Plan[] = []
  let checked = 0
  for (const A of combos(acts, o.nAct)) for (const M of combos(meals, o.nMeal)) for (const S of combos(shops, o.nShop)) {
    checked++
    // shopping goes last: it's the flexible stop you can cut short or stretch
    const plan = simulate([...interleave(A, M), ...S], o.hotel, o)
    if (plan && plan.cost <= o.budget) valid.push(plan)
  }
  valid.sort(rank(o.goal))

  const short = [
    acts.length < o.nAct && (acts.length ? `only ${acts.length} activit${acts.length === 1 ? 'y' : 'ies'}` : 'no activities'),
    shops.length < o.nShop && (shops.length ? `only ${shops.length} shopping spot${shops.length === 1 ? '' : 's'}` : 'no shopping spots'),
    meals.length < o.nMeal && `${meals.length ? `only ${meals.length}` : 'no'} ${o.halalOnly ? 'halal-friendly ' : ''}restaurant${meals.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' and ')

  return { plans: valid, considered: acts.length + meals.length + shops.length, checked, short }
}

/**
 * Walk the day in order. A prayer happens at whichever stop you're at when its window opens
 * (or the first stop you reach inside the window) and adds 15 min there.
 * Tries the day without an Asr stop first: if you're home by Maghrib (16:30), Asr + Maghrib are prayed
 * back to back at the hotel. Otherwise Asr must be prayed out. Returns null if the day misses a prayer
 * or gets home after the back-by time (17:30 at the latest).
 */
export function simulate(order: Place[], hotel: HotelId, o: Pick<PlanOptions, 'startMin' | 'backBy' | 'voteCount'>): Plan | null {
  const noAsr = walk(order, hotel, o, false)
  if (noAsr && noAsr.minutes + o.startMin <= SALAH.maghrib) return noAsr
  return walk(order, hotel, o, true)
}

function walk(order: Place[], hotel: HotelId, o: Pick<PlanOptions, 'startMin' | 'backBy' | 'voteCount'>, asrOut: boolean): Plan | null {
  const backBy = Math.min(o.backBy, SALAH.backBy)
  let t = o.startMin, cost = 0, votes = 0, prev: Place | null = null
  const done = new Set<PrayerName>()
  const stops: Stop[] = []
  const windows = asrOut ? [['Dhuhr', SALAH.dhuhr], ['Asr', SALAH.asr]] as const : [['Dhuhr', SALAH.dhuhr]] as const
  for (const p of order) {
    const tr = prev ? hopLeg(hotel, prev, p) : hotelLeg(hotel, p); t += tr
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
  const back = prev ? hotelLeg(hotel, prev) : 0; t += back
  if (t > backBy) return null
  // out for the whole Dhuhr window without a prayer stop → not allowed (home in time = pray at the hotel)
  if (!done.has('Dhuhr') && o.startMin < SALAH.dhuhr.to - SALAH.prayMinutes && t > SALAH.dhuhr.to - SALAH.prayMinutes) return null
  if (asrOut && !done.has('Asr')) return null
  return { stops, cost, minutes: t - o.startMin, votes, back, asrOut }
}

/** Evening (after Maghrib, adults only): best shopping spots near the hotel that aren't already in the day. */
export function eveningShopping(o: Pick<PlanOptions, 'places' | 'voteCount' | 'hotel' | 'unvisited'>, plan: Plan, n = 2) {
  const used = new Set(plan.stops.map((s) => s.p.id))
  return o.places
    .filter((p) => p.kind === 'activity' && catOf(p) === 'shopping' && !used.has(p.id)
      && regionOf(p) === HOTELS[o.hotel].region && (!o.unvisited || !p.visited))
    .map((p) => ({ p, travel: hotelLeg(o.hotel, p) }))
    .sort((a, b) => (o.voteCount[b.p.id] ?? 0) - (o.voteCount[a.p.id] ?? 0) || a.travel - b.travel)
    .slice(0, n)
}

const rank = (goal: Goal) => (x: Plan, y: Plan) =>
  goal === 'votes' ? y.votes - x.votes || x.cost - y.cost
  : goal === 'cheap' ? x.cost - y.cost || y.votes - x.votes
  : x.minutes - y.minutes || y.votes - x.votes

/** Keep the ranking, but show plans with different activities before ones that only swap the restaurant. */
export function varied(ps: Plan[], n = 3): Plan[] {
  const key = (p: Plan) => p.stops.filter((s) => s.p.kind !== 'restaurant').map((s) => s.p.id).sort().join('|')
  const seen = new Set<string>(), first: Plan[] = [], rest: Plan[] = []
  for (const p of ps) (seen.has(key(p)) ? rest : (seen.add(key(p)), first)).push(p)
  return [...first, ...rest].slice(0, n)
}

/**
 * ☀️ Full-day days: the full-day activity alone (with prayers inside it, home by 17:30),
 * then supper after Maghrib at a halal restaurant near the hotel (supper counts toward budget).
 */
export function buildFullDayPlans(o: Omit<PlanOptions, 'nAct' | 'nShop' | 'nMeal'>) {
  const { fulls, meals } = candidates(o)
  const valid: Plan[] = []
  let checked = 0
  for (const F of fulls) {
    const day = simulate([F], o.hotel, o)
    checked += Math.max(1, meals.length)
    if (!day) continue
    if (!meals.length) { if (day.cost <= o.budget) valid.push({ ...day, fullDay: true }); continue }
    for (const M of meals) {
      const plan: Plan = { ...day, fullDay: true, supper: { p: M, travel: hotelLeg(o.hotel, M) },
        cost: day.cost + (M.price_jpy ?? 0), votes: day.votes + (o.voteCount[M.id] ?? 0) }
      if (plan.cost <= o.budget) valid.push(plan)
    }
  }
  valid.sort(rank(o.goal))
  return { plans: valid, considered: fulls.length + meals.length, checked, short: fulls.length ? '' : 'no ☀️ full-day activities' }
}

const hasMeal = (p: Plan) => !!p.supper || p.stops.some((s) => s.p.kind === 'restaurant')

/**
 * Day = (2 activities | activity + shopping), ideally with 1 food stop. Food is preferred, not required
 * (snack at the place / konbini): plans with a meal rank first, no-meal plans fill the gaps.
 * If nothing fits at all, falls back to a 'light' 1-activity day so the planner never comes back empty for no reason.
 */
export function buildDayPlans(o: Omit<PlanOptions, 'nAct' | 'nShop' | 'nMeal'> & { shape: Shape }) {
  const shapes = o.shape === 'either' ? [SHAPES.acts, SHAPES.shop] : o.shape === 'full' ? [] : [SHAPES[o.shape]]
  const withFull = o.shape === 'either' || o.shape === 'full'
  const run = (list: { nAct: number; nShop: number; nMeal: number }[], full = false) => [
    ...list.flatMap((sh) => [sh, { ...sh, nMeal: 0 }]).map((sh) => buildPlans({ ...o, ...sh })),
    ...(full ? [buildFullDayPlans(o)] : []),
  ]
  // full (2-stop / ☀️) days first, then days with food, then the goal; light 1-activity days only fill gaps
  const sort = (ps: Plan[]) => varied(ps.sort((x, y) =>
    Number(!!x.light) - Number(!!y.light) || Number(hasMeal(y)) - Number(hasMeal(x)) || rank(o.goal)(x, y)))
  const lightRun = () => run([{ nAct: 1, nShop: 0, nMeal: 1 }]).map((r) => ({ ...r, plans: r.plans.map((p) => ({ ...p, light: true })) }))
  let results = run(shapes, withFull)
  const short = results.map((r) => r.short).filter(Boolean)[0] ?? ''
  let pool = results.flatMap((r) => r.plans)
  if (o.shape === 'either' || !pool.length) {
    const extra = lightRun()
    results = [...results, ...extra]
    pool = [...pool, ...extra.flatMap((r) => r.plans)]
  }
  const plans = sort(pool).slice(0, 3)
  const light = plans.length > 0 && plans.every((p) => p.light)
  return {
    plans,
    considered: Math.max(...results.map((r) => r.considered)),
    checked: results.reduce((n, r) => n + r.checked, 0),
    short,
    light,
  }
}
