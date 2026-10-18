import { describe, expect, it } from 'vitest'
import { SALAH, buildDayPlans, buildPlans, combos, eveningShopping, hotelLeg, interleave, varied } from '../planner'
import { place } from './fixtures'

const tokyo = { lat: 35.668, lng: 139.752 } // ~200 m from Toranomon Hills
const opts = { voteCount: {} as Record<string, number>, hotel: 'toranomon' as const, budget: 20000, backBy: SALAH.backBy, startMin: 540,
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
    expect(buildPlans({ ...opts, places: [long, cheap], backBy: 14 * 60 }).plans).toHaveLength(0)
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

describe('salah rules', () => {
  const at = (h: number, m = 0) => h * 60 + m
  const meal = place({ id: 'meal', kind: 'restaurant', halal: 'Halal certified', ...tokyo, price_jpy: 1500 })
  const a1 = place({ id: 'a1', ...tokyo, price_jpy: 1000 })
  const a2 = place({ id: 'a2', ...tokyo, price_jpy: 1000 })
  const base = { ...opts, nAct: 2, nShop: 0, nMeal: 1 }

  it('never gets home after 17:30, even if asked to', () => {
    const r = buildPlans({ ...base, places: [a1, a2, meal], startMin: at(13), backBy: at(23) })
    expect(r.plans).toHaveLength(0) // 13:00 + ~4.5h of stops > 17:30
  })
  it('adds exactly one Dhuhr stop inside 12:00–14:00', () => {
    const p = buildPlans({ ...base, places: [a1, a2, meal] }).plans[0]
    const d = p.stops.flatMap((s) => s.prayers).filter((x) => x.name === 'Dhuhr')
    expect(d).toHaveLength(1)
    expect(d[0].at).toBeGreaterThanOrEqual(SALAH.dhuhr.from)
    expect(d[0].at + SALAH.prayMinutes).toBeLessThanOrEqual(SALAH.dhuhr.to)
  })
  it('home by 16:30 → no Asr stop (Asr + Maghrib back to back)', () => {
    const p = buildPlans({ ...base, places: [a1, a2, meal] }).plans[0]
    expect(p.minutes + 540).toBeLessThanOrEqual(SALAH.maghrib)
    expect(p.asrOut).toBe(false)
    expect(p.stops.flatMap((s) => s.prayers).map((x) => x.name)).not.toContain('Asr')
  })
  it('out past 16:30 → Asr stop inside 14:00–16:00', () => {
    const long = place({ id: 'long', ...tokyo, visit_minutes: 210 })
    const p = buildPlans({ ...base, nAct: 2, places: [long, a2, meal], startMin: at(10) }).plans[0]
    expect(p.minutes + at(10)).toBeGreaterThan(SALAH.maghrib)
    expect(p.minutes + at(10)).toBeLessThanOrEqual(SALAH.backBy)
    const asr = p.stops.flatMap((s) => s.prayers).find((x) => x.name === 'Asr')!
    expect(asr.at).toBeGreaterThanOrEqual(SALAH.asr.from)
    expect(asr.at + SALAH.prayMinutes).toBeLessThanOrEqual(SALAH.asr.to)
  })
  it('timeline still adds up with prayer stops', () => {
    const p = buildPlans({ ...base, places: [a1, a2, meal] }).plans[0]
    const sum = p.stops.reduce((s, x) => s + x.travel + (x.leave - x.arrive), 0) + p.back
    expect(sum).toBe(p.minutes)
  })
  it('evening shopping suggests shops not already in the day', () => {
    const s1 = place({ id: 's1', category: 'shopping', ...tokyo }), s2 = place({ id: 's2', category: 'shopping', ...tokyo })
    const day = buildDayPlans({ ...opts, places: [a1, meal, s1, s2], shape: 'shop' }).plans[0]
    const used = day.stops.map((x) => x.p.id)
    const eve = eveningShopping({ places: [a1, meal, s1, s2], voteCount: {}, hotel: 'toranomon', unvisited: true }, day)
    expect(eve.map((e) => e.p.id).some((id) => used.includes(id))).toBe(false)
    expect(eve).toHaveLength(1)
  })
})

describe('food optional, human travel, light fallback', () => {
  const a1 = place({ id: 'a1', ...tokyo, price_jpy: 1000 })
  const a2 = place({ id: 'a2', ...tokyo, price_jpy: 1000 })
  const meal = place({ id: 'meal', kind: 'restaurant', halal: 'Halal certified', ...tokyo, price_jpy: 1500 })
  const { nAct: _a, nShop: _s, nMeal: _m, ...base } = opts
  it('no restaurant → still plans 2 activities (no food stop)', () => {
    const r = buildDayPlans({ ...base, places: [a1, a2], shape: 'acts' })
    expect(r.plans[0].stops.map((s) => s.p.id).sort()).toEqual(['a1', 'a2'])
  })
  it('plans with a food stop rank above ones without', () => {
    const r = buildDayPlans({ ...base, places: [a1, a2, meal], shape: 'acts', goal: 'cheap' })
    expect(r.plans[0].stops.some((s) => s.p.kind === 'restaurant')).toBe(true)
  })
  it('family-entered travel time to this hotel beats the distance estimate', () => {
    const far = place({ id: 'far', lat: 35.9, lng: 139.75, travel_minutes: 40, nearest_hotels: ['toranomon'], auto_fields: [] })
    expect(hotelLeg('toranomon', far)).toBe(40)
    expect(hotelLeg('toranomon', { ...far, auto_fields: ['travel'] })).toBeGreaterThan(40)
    expect(hotelLeg('jw_tokyo', far)).toBeGreaterThan(40) // entered time was for a different hotel
  })
  it('falls back to a light 1-activity day when no full day fits', () => {
    const r = buildDayPlans({ ...base, places: [a1, meal], shape: 'either' })
    expect(r.light).toBe(true)
    expect(r.plans[0].light).toBe(true)
    expect(r.plans[0].stops.map((s) => s.p.id)).toEqual(['a1', 'meal'])
  })
})

describe('varied', () => {
  it('different activities beat restaurant swaps', () => {
    const mk = (...ids: string[]) => ({ stops: ids.map((id) => ({ p: place({ id, kind: id.startsWith('m') ? 'restaurant' : 'activity' }), travel: 0, arrive: 0, leave: 0, prayers: [] })), cost: 0, minutes: 0, votes: 0, back: 0, asrOut: false })
    const ranked = [mk('a', 'm1'), mk('a', 'm2'), mk('a', 'm3'), mk('b')]
    expect(varied(ranked).map((p) => p.stops.map((s) => s.p.id).join('+'))).toEqual(['a+m1', 'b', 'a+m2'])
  })
})
