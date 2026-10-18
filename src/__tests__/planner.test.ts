import { describe, expect, it } from 'vitest'
import { buildDayPlans, buildPlans, combos, interleave } from '../planner'
import { place } from './fixtures'

const tokyo = { lat: 35.668, lng: 139.752 } // ~200 m from Toranomon Hills
const opts = { voteCount: {} as Record<string, number>, hotel: 'toranomon' as const, budget: 20000, hours: 12, startMin: 540,
  nAct: 1, nShop: 0, nMeal: 1, halalOnly: true, unvisited: true, goal: 'votes' as const }

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

describe('day shapes (1 food + 2 activities | activity + shopping)', () => {
  const { nAct: _a, nShop: _s, nMeal: _m, ...base } = opts
  const a1 = place({ id: 'a1', ...tokyo, price_jpy: 2000 })
  const a2 = place({ id: 'a2', ...tokyo, price_jpy: 3000 })
  const shop = place({ id: 'shop', category: 'shopping', ...tokyo, price_jpy: 0 })
  const meal = place({ id: 'meal', kind: 'restaurant', halal: 'Halal certified', ...tokyo, price_jpy: 1500 })
  const places = [a1, a2, shop, meal]

  it('two activities: activity → food → activity, no shopping', () => {
    const p = buildDayPlans({ ...base, places, shape: 'acts' }).plans[0]
    expect(p.stops.map((s) => s.p.kind)).toEqual(['activity', 'restaurant', 'activity'])
    expect(p.stops.map((s) => s.p.id)).not.toContain('shop')
  })
  it('activity + shopping: exactly one meal, shopping last', () => {
    const p = buildDayPlans({ ...base, places, shape: 'shop' }).plans[0]
    expect(p.stops).toHaveLength(3)
    expect(p.stops.filter((s) => s.p.kind === 'restaurant')).toHaveLength(1)
    expect(p.stops[2].p.id).toBe('shop')
  })
  it('either: mixes both shapes and ranks them together', () => {
    const r = buildDayPlans({ ...base, places, shape: 'either', goal: 'cheap' })
    expect(r.plans[0].stops.map((s) => s.p.id)).toContain('shop') // free shop makes it cheapest
    expect(r.plans.some((p) => !p.stops.some((s) => s.p.id === 'shop'))).toBe(true)
  })
  it('says when there is no shopping yet', () => {
    expect(buildDayPlans({ ...base, places: [a1, meal], shape: 'shop' }).short).toMatch(/no shopping/)
  })
})
