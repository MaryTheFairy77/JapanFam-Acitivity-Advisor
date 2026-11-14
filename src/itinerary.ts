import { HOTELS, tripDays, type HotelId, type Place, type TripDay } from './lib'
import { buildDayPlans, simulate, type Plan } from './planner'

/**
 * 🗓 Trip plan: an automatic DRAFT itinerary for 26 Dec – 8 Jan, built from everyone's votes (cousin's idea, 14 Nov 2026).
 * Recomputed in the app every time, never stored, so it always reflects the latest votes:
 *  - place votes (👍 on Food / Do) pick what goes in;
 *  - per-day stop votes (👍/👎 on a stop for that day) nudge it: 2+ 👎 and more 👎 than 👍 = swapped out of that day;
 *  - 📌 planner locks put a place on a fixed day (and keep it off every other day).
 * Each day reuses the day planner's rules: 2 activities, or activity + shopping, or ☀️ full day, + 1 food stop,
 * home by 17:30 for Maghrib with Dhuhr/Asr stops. A place is used at most once across the trip.
 */
export type StopVote = { day: string; place_id: string; member_id: string; value: 1 | -1 }
export type DayPin = { place_id: string; day: string }
export type DraftDay = TripDay & {
  kind: 'normal' | 'arrival' | 'moving' | 'flight'
  plan: Plan | null
  /** why a day is empty / light (shown to the family) */
  note?: string
}

export const ARRIVAL_START = 14 * 60 // first day + moving days: afternoon only (morning = flights / trains / check-in)
export const NORMAL_START = 9 * 60
const PIN_BOOST = 10000

export function stopTally(stopVotes: StopVote[], day: string, placeId: string) {
  let up = 0, down = 0
  for (const v of stopVotes) if (v.day === day && v.place_id === placeId) { if (v.value > 0) up++; else down++ }
  return { up, down }
}
export const vetoed = (t: { up: number; down: number }) => t.down >= 2 && t.down > t.up

export function draftItinerary(places: Place[], voteCount: Record<string, number>, stopVotes: StopVote[], pins: DayPin[], days = tripDays()): DraftDay[] {
  const used = new Set<string>()
  const pinnedDay = new Map(pins.map((p) => [p.place_id, p.day]))
  // pinned places are reserved for their day from the start
  for (const p of pins) used.add(p.place_id)
  const byId = new Map(places.map((p) => [p.id, p]))

  return days.map((d, i): DraftDay => {
    const kind: DraftDay['kind'] = d.last ? 'flight' : i === 0 ? 'arrival' : d.moving ? 'moving' : 'normal'
    if (kind === 'flight' || !d.hotel) return { ...d, kind, plan: null, note: '✈️ Flying home' }
    const hotel = d.hotel as HotelId
    const mine = pins.filter((p) => p.day === d.date).map((p) => byId.get(p.place_id)).filter((p): p is Place => !!p)
    const mineIds = new Set(mine.map((p) => p.id))
    // pool = unused places not vetoed for this day, plus this day's pins
    const pool = places.filter((p) => !p.visited && (mineIds.has(p.id) || (!used.has(p.id) && !vetoed(stopTally(stopVotes, d.date, p.id)))))
    // score = place votes + this day's 👍/👎, pins boosted so they always make the cut and rank first
    const score: Record<string, number> = {}
    for (const p of pool) {
      const t = stopTally(stopVotes, d.date, p.id)
      score[p.id] = (voteCount[p.id] ?? 0) + t.up - t.down + (mineIds.has(p.id) ? PIN_BOOST : 0)
    }
    const startMin = kind === 'normal' ? NORMAL_START : ARRIVAL_START
    const { plans } = buildDayPlans({
      places: pool, voteCount: score, hotel, budget: 1e9, backBy: 17 * 60 + 30, startMin,
      shape: 'either', halalOnly: true, unvisited: true, goal: 'votes',
    })
    const ids = (pl: Plan) => new Set([...pl.stops.map((s) => s.p.id), ...(pl.supper ? [pl.supper.p.id] : [])])
    let plan = plans.find((pl) => mine.every((m) => ids(pl).has(m.id))) ?? null
    // pins that don't fit the usual day shape: just do the pinned places in order
    if (!plan && mine.length) plan = simulate(mine, hotel, { startMin, backBy: 17 * 60 + 30, voteCount: score }) ?? null
    if (!plan && !mine.length) plan = plans[0] ?? null
    if (plan) for (const id of ids(plan)) used.add(id)
    const note = kind === 'arrival' ? `Arrival day: afternoon only, near ${HOTELS[hotel].short}`
      : kind === 'moving' ? `🚄 Moving day: ${d.from ? HOTELS[d.from].short : ''} → ${HOTELS[hotel].short}, afternoon only`
      : !plan ? `Not enough voted places near ${HOTELS[hotel].city} yet` : undefined
    return { ...d, kind, plan, note }
  })
}

/** Is this place locked on another day than `day`? (for the "move" menu) */
export const pinnedElsewhere = (pins: DayPin[], placeId: string, day: string) =>
  pins.some((p) => p.place_id === placeId && p.day !== day)
