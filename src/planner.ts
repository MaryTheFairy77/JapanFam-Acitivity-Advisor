import { HOTELS, estimateTravel, km, regionOf, type HotelId, type Place } from './lib'

export type Goal = 'votes' | 'cheap' | 'time'
export interface Stop { p: Place; travel: number; arrive: number; leave: number }
export interface Plan { stops: Stop[]; cost: number; minutes: number; votes: number; back: number }
export interface PlanOptions {
  places: Place[]
  voteCount: Record<string, number>
  hotel: HotelId
  budget: number      // ¥ per person
  hours: number       // total time out
  startMin: number    // minutes after midnight
  nAct: number
  nMeal: number
  halalOnly: boolean
  unvisited: boolean
  goal: Goal
}

export const DEFAULT_VISIT = { restaurant: 60, activity: 120 } as const
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
  const top = (kind: Place['kind']) => pool
    .filter((p) => p.kind === kind)
    .filter((p) => kind !== 'restaurant' || !o.halalOnly || p.halal === 'Halal certified' || p.halal === 'Muslim friendly')
    .sort((a, b) => (o.voteCount[b.id] ?? 0) - (o.voteCount[a.id] ?? 0) || (a.price_jpy ?? 0) - (b.price_jpy ?? 0))
    .slice(0, CANDIDATES_PER_KIND)
  const acts = top('activity'), meals = top('restaurant')

  const valid: Plan[] = []
  let checked = 0
  for (const A of combos(acts, o.nAct)) for (const M of combos(meals, o.nMeal)) {
    checked++
    let t = o.startMin, cost = 0, votes = 0, prev: Pt = base
    const stops: Stop[] = []
    for (const p of interleave(A, M)) {
      const tr = leg(prev, p); t += tr
      const arrive = t
      t += (p.wait_minutes ?? 0) + (p.visit_minutes ?? DEFAULT_VISIT[p.kind])
      stops.push({ p, travel: tr, arrive, leave: t })
      cost += p.price_jpy ?? 0; votes += o.voteCount[p.id] ?? 0; prev = p
    }
    const back = leg(prev, base); t += back
    const minutes = t - o.startMin
    if (cost <= o.budget && minutes <= o.hours * 60) valid.push({ stops, cost, minutes, votes, back })
  }
  valid.sort((x, y) =>
    o.goal === 'votes' ? y.votes - x.votes || x.cost - y.cost
    : o.goal === 'cheap' ? x.cost - y.cost || y.votes - x.votes
    : x.minutes - y.minutes || y.votes - x.votes)

  const short = [
    acts.length < o.nAct && (acts.length ? `only ${acts.length} activit${acts.length === 1 ? 'y' : 'ies'}` : 'no activities'),
    meals.length < o.nMeal && `${meals.length ? `only ${meals.length}` : 'no'} ${o.halalOnly ? 'halal-friendly ' : ''}restaurant${meals.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' and ')

  return { plans: valid.slice(0, 3), considered: acts.length + meals.length, checked, short }
}
