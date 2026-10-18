import { describe, expect, it } from 'vitest'
import { buildPlans, combos, interleave } from '../planner'
import { place } from './fixtures'

const tokyo = { lat: 35.668, lng: 139.752 } // ~200 m from Toranomon Hills
const opts = { voteCount: {} as Record<string, number>, hotel: 'toranomon' as const, budget: 20000, hours: 12, startMin: 540,
  nAct: 1, nMeal: 1, halalOnly: true, unvisited: true, goal: 'votes' as const }

describe('combos', () => {
  it('n choose k', () => {
    expect(combos([1, 2, 3, 4], 2)).toHaveLength(6)
    expect(combos([1, 2], 0)).toEqual([[]])
    expect(combos([1], 2)).toEqual([])
  })
})

describe('interleave', () => {
  it('activity first when equal, meal first when more meals', () => {
    const a = place({ id: 'a' }), m1 = place({ id: 'm1', kind: 'restaurant' }), m2 = place({ id: 'm2', kind: 'restaurant' })
    expect(interleave([a], [m1]).map((p) => p.id)).toEqual(['a', 'm1'])
    expect(interleave([a], [m1, m2]).map((p) => p.id)).toEqual(['m1', 'a', 'm2'])
  })
})

describe('buildPlans', () => {
  const act = place({ id: 'act', ...tokyo, price_jpy: 5000 })
  const cheap = place({ id: 'cheap', kind: 'restaurant', halal: 'Halal certified', ...tokyo, price_jpy: 1000 })
  const pricey = place({ id: 'pricey', kind: 'restaurant', halal: 'Muslim friendly', ...tokyo, price_jpy: 9000 })
  const notHalal = place({ id: 'nh', kind: 'restaurant', halal: 'Not halal', ...tokyo, price_jpy: 500 })
  const osaka = place({ id: 'osaka', lat: 34.67, lng: 135.43 })

  it('respects budget', () => {
    const r = buildPlans({ ...opts, places: [act, cheap, pricey], budget: 7000 })
    expect(r.plans).toHaveLength(1)
    expect(r.plans[0].stops.map((s) => s.p.id)).toEqual(['act', 'cheap'])
    expect(r.plans[0].cost).toBe(6000)
  })
  it('respects time', () => {
    const long = place({ id: 'long', ...tokyo, visit_minutes: 600 })
    expect(buildPlans({ ...opts, places: [long, cheap], hours: 5 }).plans).toHaveLength(0)
  })
  it('halal filter excludes non-halal meals', () => {
    const ids = buildPlans({ ...opts, places: [act, notHalal, cheap] }).plans.flatMap((p) => p.stops.map((s) => s.p.id))
    expect(ids).not.toContain('nh')
  })
  it('only uses places in the hotel region', () => {
    expect(buildPlans({ ...opts, places: [osaka, cheap] }).short).toMatch(/no activities/)
  })
  it('skips visited when asked', () => {
    expect(buildPlans({ ...opts, places: [{ ...act, visited: true }, cheap] }).plans).toHaveLength(0)
    expect(buildPlans({ ...opts, places: [{ ...act, visited: true }, cheap], unvisited: false }).plans).toHaveLength(1)
  })
  it('ranks by votes, then cheapest', () => {
    const r = buildPlans({ ...opts, places: [act, cheap, pricey], voteCount: { pricey: 3 } })
    expect(r.plans[0].stops[1].p.id).toBe('pricey')
    expect(buildPlans({ ...opts, places: [act, cheap, pricey], voteCount: { pricey: 3 }, goal: 'cheap' }).plans[0].stops[1].p.id).toBe('cheap')
  })
  it('timeline adds up: start + legs + waits + visits = total', () => {
    const p = buildPlans({ ...opts, places: [act, cheap] }).plans[0]
    const sum = p.stops.reduce((s, x) => s + x.travel + (x.leave - x.arrive), 0) + p.back
    expect(sum).toBe(p.minutes)
  })
})
