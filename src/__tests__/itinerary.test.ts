import { describe, expect, it } from 'vitest'
import { draftItinerary, stopTally, vetoed, type StopVote } from '../itinerary'
import { place } from './fixtures'

// near Toranomon (Tokyo) and near Osaka Station
const tk = { lat: 35.667, lng: 139.75 }
const os = { lat: 34.703, lng: 135.496 }
const tokyo = [
  place({ id: 't1', ...tk, visit_minutes: 90 }), place({ id: 't2', ...tk, visit_minutes: 90 }),
  place({ id: 't3', ...tk, visit_minutes: 90 }), place({ id: 't4', ...tk, visit_minutes: 90 }),
  place({ id: 'tm1', kind: 'restaurant', halal: 'Halal certified', ...tk }),
  place({ id: 'tm2', kind: 'restaurant', halal: 'Muslim friendly', ...tk }),
]
const osaka = [
  place({ id: 'o1', ...os, visit_minutes: 90 }), place({ id: 'o2', ...os, visit_minutes: 90 }),
  place({ id: 'om1', kind: 'restaurant', halal: 'Halal certified', ...os }),
]
const all = [...tokyo, ...osaka]
const votes = { t1: 5, t2: 4, t3: 1, o1: 3 }

describe('trip plan draft', () => {
  it('covers every day, flight day empty, moving days marked', () => {
    const d = draftItinerary(all, votes, [], [])
    expect(d).toHaveLength(14)
    expect(d[0].kind).toBe('arrival')
    expect(d.find((x) => x.date === '2026-12-29')!.kind).toBe('moving')
    expect(d.find((x) => x.date === '2027-01-03')!.kind).toBe('moving')
    expect(d[13]).toMatchObject({ kind: 'flight', plan: null })
  })
  it('uses each place at most once, and Osaka places only on Osaka nights', () => {
    const d = draftItinerary(all, votes, [], [])
    const ids = d.flatMap((x) => x.plan ? x.plan.stops.map((s) => s.p.id) : [])
    expect(new Set(ids).size).toBe(ids.length)
    for (const x of d) for (const s of x.plan?.stops ?? []) {
      expect(s.p.id.startsWith('o')).toBe(x.hotel === 'osaka')
    }
  })
  it('most-voted places come first', () => {
    const d = draftItinerary(all, votes, [], [])
    const first = d.find((x) => x.plan)!
    expect(first.plan!.stops.map((s) => s.p.id)).toContain('t1')
  })
  it('two 👎 on a day swaps the stop out of that day', () => {
    const base = draftItinerary(all, votes, [], [])
    const day = base.find((x) => x.plan?.stops.some((s) => s.p.id === 't1'))!
    const sv: StopVote[] = [
      { day: day.date, place_id: 't1', member_id: 'a', value: -1 },
      { day: day.date, place_id: 't1', member_id: 'b', value: -1 },
    ]
    expect(vetoed(stopTally(sv, day.date, 't1'))).toBe(true)
    const after = draftItinerary(all, votes, sv, []).find((x) => x.date === day.date)!
    expect(after.plan?.stops.map((s) => s.p.id) ?? []).not.toContain('t1')
  })
  it('a 📌 pin puts the place on its day and nowhere else', () => {
    const d = draftItinerary(all, votes, [], [{ place_id: 't3', day: '2026-12-28' }])
    const where = d.filter((x) => x.plan?.stops.some((s) => s.p.id === 't3')).map((x) => x.date)
    expect(where).toEqual(['2026-12-28'])
  })
})
