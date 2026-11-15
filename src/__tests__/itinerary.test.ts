import { describe, expect, it } from 'vitest'
import { activityIds, addCost, buildTimeline, comboKey, ideaScore, openDates, planTrip, sameComboDay, type DayPlanRow } from '../itinerary'
import { place } from './fixtures'

const tk = { lat: 35.667, lng: 139.75 }
const os = { lat: 34.703, lng: 135.496 }
const all = [
  place({ id: 't1', ...tk, visit_minutes: 90 }), place({ id: 't2', ...tk, visit_minutes: 90 }),
  place({ id: 't3', ...tk, visit_minutes: 90 }), place({ id: 't4', ...tk, visit_minutes: 60 }),
  place({ id: 'tshop', ...tk, category: 'shopping' }),
  place({ id: 'tm1', kind: 'restaurant', halal: 'Halal certified', ...tk }),
  place({ id: 'tm2', kind: 'restaurant', halal: 'Pork-free', ...tk }),
  place({ id: 'o1', ...os, visit_minutes: 90 }), place({ id: 'o2', ...os, visit_minutes: 90 }), place({ id: 'o3', ...os, visit_minutes: 90 }),
  place({ id: 'om1', kind: 'restaurant', halal: 'Muslim friendly', ...os }),
]
const P = (id: string) => all.find((p) => p.id === id)!
const votes = { t1: 5, t2: 4, t3: 1, o1: 3 }

describe('trip plan v2 timeline', () => {
  it('14 days; flight empty; arrival + move days start at 2 pm', () => {
    const d = planTrip(all, votes, [])
    expect(d).toHaveLength(14)
    expect(d[0]).toMatchObject({ kind: 'arrival', start: 14 * 60 })
    expect(d[13]).toMatchObject({ kind: 'flight', source: 'none' })
  })
  it('drafts never repeat an activity combination; shops never anchors; Osaka only on Osaka nights', () => {
    const d = planTrip(all, votes, [])
    const keys = d.filter((x) => x.acts.length).map((x) => comboKey(x.acts.map((p) => p.id)))
    expect(new Set(keys).size).toBe(keys.length)
    for (const x of d) for (const p of x.acts) {
      expect(p.id).not.toBe('tshop')
      expect(p.id.startsWith('o')).toBe(x.hotel === 'osaka')
    }
  })
  it('drafts keep Maghrib OK', () => {
    for (const x of planTrip(all, votes, [])) if (x.timeline) expect(x.timeline.maghrib.ok).toBe(true)
  })
  it('free-form layout with a 🔗 together step: duration = longest, not the sum', () => {
    const solo = buildTimeline([[P('t1')]], 'toranomon', 9 * 60, '2026-12-27')
    const both = buildTimeline([[P('t1'), P('t4')]], 'toranomon', 9 * 60, '2026-12-27')
    expect(both.end).toBe(solo.end)
  })
  it('evenings allowed, but out at Maghrib with no prayer room nearby = not OK', () => {
    const long = [[P('t1')], [P('t2')], [P('t3')], [P('tm1')], [P('t4')]]
    const tl = buildTimeline(long, 'toranomon', 11 * 60, '2026-12-27')
    expect(tl.end).toBeGreaterThan(17 * 60)
    expect(tl.maghrib.ok).toBe(false)
  })
  it('addCost finds the cheapest slot and reports minutes added', () => {
    const c = addCost([[P('t1')]], P('t2'), 'toranomon', 9 * 60, '2026-12-27')
    expect(c.added).toBeGreaterThan(80)
    expect(c.ok).toBe(true)
    const t = addCost([[P('t1')]], P('t4'), 'toranomon', 9 * 60, '2026-12-27', { index: 0, together: true })
    expect(t.added).toBe(0)
  })
  it('planner layout wins; its activity set is blocked for drafts; ideas score from normal votes', () => {
    const plan: DayPlanRow = { day: '2026-12-27', activity_ids: ['t3', 't4'], food_id: null, locked: true, idea_id: null, layout: { start: 10 * 60, steps: [['t3', 't4'], ['tm1']] } }
    const d = planTrip(all, votes, [plan])
    const day = d.find((x) => x.date === '2026-12-27')!
    expect(day).toMatchObject({ source: 'plan', locked: true, start: 600 })
    expect(activityIds(day.steps).sort()).toEqual(['t3', 't4'])
    expect(sameComboDay(d, ['t4', 't3'])?.date).toBe('2026-12-27')
    expect(openDates(d, 'toranomon').map((x) => x.date)).toEqual(['2026-12-26', '2026-12-28'])
    expect(ideaScore({ id: 'i', member_id: 'm', hotel: 'toranomon', half_day: false, activity_ids: ['t1', 't2'], created_at: '' }, votes)).toBe(9)
  })
})
