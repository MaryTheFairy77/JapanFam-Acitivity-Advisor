import { describe, expect, it } from 'vitest'
import { comboKey, ideaScore, openDates, planTrip, sameComboDay, type DayPlanRow } from '../itinerary'
import { place } from './fixtures'

const tk = { lat: 35.667, lng: 139.75 }
const os = { lat: 34.703, lng: 135.496 }
const all = [
  place({ id: 't1', ...tk, visit_minutes: 90 }), place({ id: 't2', ...tk, visit_minutes: 90 }),
  place({ id: 't3', ...tk, visit_minutes: 90 }), place({ id: 't4', ...tk, visit_minutes: 90 }),
  place({ id: 'tshop', ...tk, category: 'shopping' }),
  place({ id: 'tm1', kind: 'restaurant', halal: 'Halal certified', ...tk }),
  place({ id: 'tm2', kind: 'restaurant', halal: 'Pork-free', ...tk }),
  place({ id: 'o1', ...os, visit_minutes: 90 }), place({ id: 'o2', ...os, visit_minutes: 90 }), place({ id: 'o3', ...os, visit_minutes: 90 }),
  place({ id: 'om1', kind: 'restaurant', halal: 'Muslim friendly', ...os }),
]
const votes = { t1: 5, t2: 4, t3: 1, o1: 3 }

describe('trip plan v2', () => {
  it('14 days; flight day empty; arrival + move days are half days', () => {
    const d = planTrip(all, votes, [])
    expect(d).toHaveLength(14)
    expect(d[0]).toMatchObject({ kind: 'arrival', half: true })
    expect(d.find((x) => x.date === '2026-12-29')).toMatchObject({ kind: 'moving', half: true })
    expect(d[13]).toMatchObject({ kind: 'flight', source: 'none', chain: null })
  })
  it('drafts never repeat an activity combination; shops are never anchors', () => {
    const d = planTrip(all, votes, [])
    const keys = d.filter((x) => x.acts.length).map((x) => comboKey(x.acts.map((p) => p.id)))
    expect(new Set(keys).size).toBe(keys.length)
    expect(d.flatMap((x) => x.acts).some((p) => p.id === 'tshop')).toBe(false)
  })
  it('Osaka nights only use Osaka activities; food is halal (not just pork-free)', () => {
    const d = planTrip(all, votes, [])
    for (const x of d) {
      for (const p of x.acts) expect(p.id.startsWith('o')).toBe(x.hotel === 'osaka')
      if (x.food) expect(['tm1', 'om1']).toContain(x.food.id)
    }
  })
  it('a planner day wins over the draft, and its combo is blocked for drafts', () => {
    const plan: DayPlanRow = { day: '2026-12-27', activity_ids: ['t3', 't4'], food_id: null, locked: true, idea_id: null }
    const d = planTrip(all, votes, [plan])
    const day = d.find((x) => x.date === '2026-12-27')!
    expect(day).toMatchObject({ source: 'plan', locked: true })
    expect(day.acts.map((p) => p.id)).toEqual(['t3', 't4'])
    const others = d.filter((x) => x.date !== '2026-12-27' && x.acts.length).map((x) => comboKey(x.acts.map((p) => p.id)))
    expect(others).not.toContain(comboKey(['t3', 't4']))
    expect(sameComboDay(d, ['t4', 't3'])?.date).toBe('2026-12-27')
  })
  it('chain has legs, food after the first activity, and is back before Maghrib', () => {
    const d = planTrip(all, votes, []).find((x) => x.kind === 'normal' && x.acts.length === 2)!
    expect(d.chain!.stops.map((s) => s.role)).toEqual(['activity', 'food', 'activity'])
    expect(d.chain!.fits).toBe(true)
    expect(d.chain!.stops[0].leg.minutes).toBeGreaterThan(0)
  })
  it('idea score = normal votes; open dates skip locked days', () => {
    expect(ideaScore({ id: 'i', member_id: 'm', hotel: 'toranomon', half_day: false, activity_ids: ['t1', 't2'], created_at: '' }, votes)).toBe(9)
    const d = planTrip(all, votes, [{ day: '2026-12-27', activity_ids: ['t1'], food_id: null, locked: true, idea_id: null }])
    expect(openDates(d, 'toranomon', false).map((x) => x.date)).toEqual(['2026-12-28'])
  })
})
