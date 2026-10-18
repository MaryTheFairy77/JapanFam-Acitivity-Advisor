import { describe, expect, it } from 'vitest'
import { HOTELS, estimateTravel, km, missingFields, nearestHotel, normalizeUrl, parseLatLng, parseMinutes, regionOf, safeUrl } from '../lib'
import { place } from './fixtures'

describe('parseMinutes', () => {
  it.each([
    ['1 hr 42 min drive', 102], ['45 min drive', 45], ['~60-90min', 75], ['10–30 min', 20],
    ['2 hours', 120], ['1.5h', 90], ['Prebooked', null], ['', null],
  ])('%s → %s', (s, want) => expect(parseMinutes(s)).toBe(want))
})

describe('parseLatLng', () => {
  it('prefers the exact pin (!3d!4d) over the camera (@)', () => {
    const u = 'https://www.google.com/maps/place/X/@35.44,138.47,10z/data=!3m5!8m2!3d35.5248227!4d138.7299428!16s'
    expect(parseLatLng(u)).toEqual({ lat: 35.5248227, lng: 138.7299428 })
  })
  it('falls back to @lat,lng', () => expect(parseLatLng('https://maps.google.com/@34.7,135.5,15z')).toEqual({ lat: 34.7, lng: 135.5 }))
  it('reads ?q=lat,lng', () => expect(parseLatLng('https://maps.google.com/?q=34.1,135.2')).toEqual({ lat: 34.1, lng: 135.2 }))
  it('returns null for short links', () => expect(parseLatLng('https://maps.app.goo.gl/abc')).toBeNull())
})

describe('distance + nearest hotel', () => {
  it('Osaka → Tokyo is ~400 km', () => expect(km(HOTELS.osaka, HOTELS.toranomon)).toBeGreaterThan(390))
  it('Art Aquarium (Ginza) is nearest Toranomon Hills', () => expect(nearestHotel({ lat: 35.6708, lng: 139.7661 })?.id).toBe('toranomon'))
  it('Super Nintendo World is nearest Osaka', () => expect(nearestHotel({ lat: 34.668, lng: 135.43 })?.id).toBe('osaka'))
  it('no coords → null', () => expect(nearestHotel({ lat: null, lng: null })).toBeNull())
  it('short hop is a walk, long hop is train', () => {
    expect(estimateTravel(0.5).text).toMatch(/walk/)
    expect(estimateTravel(10).text).toMatch(/train/)
    expect(estimateTravel(10).minutes).toBeGreaterThan(estimateTravel(5).minutes)
  })
  it('regions by longitude', () => {
    expect(regionOf({ lng: 135.5 })).toBe('kansai')
    expect(regionOf({ lng: 139.7 })).toBe('kanto')
    expect(regionOf({ lng: null, nearest_hotels: ['osaka'] })).toBe('kansai')
    expect(regionOf({ lng: null, nearest_hotels: [] })).toBeNull()
  })
})

describe('link safety', () => {
  it('blocks javascript: and data: links', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeUrl(' JaVaScRiPt:alert(1)')).toBeUndefined()
    expect(safeUrl('data:text/html,hi')).toBeUndefined()
    expect(safeUrl('https://ok.jp')).toBe('https://ok.jp')
  })
  it('normalizeUrl adds https and rejects other schemes', () => {
    expect(normalizeUrl('example.jp/x')).toBe('https://example.jp/x')
    expect(normalizeUrl('  ')).toBeNull()
    expect(normalizeUrl('javascript:alert(1)')).toBe(false)
    expect(normalizeUrl('ftp://x.jp')).toBe(false)
  })
})

describe('missingFields', () => {
  it('flags restaurant-only gaps', () => {
    expect(missingFields(place({ kind: 'restaurant' }))).toEqual(expect.arrayContaining(['halal status', 'sweet/savoury']))
  })
  it('a complete activity needs nothing', () => expect(missingFields(place())).toEqual([]))
})

import { rankOf, tint } from '../lib'
describe('comparative tints', () => {
  it('ranks within the group', () => {
    expect(rankOf(100, [100, 200, 300])).toBe(0)
    expect(rankOf(300, [100, 200, 300])).toBe(1)
    expect(rankOf(200, [100, 200, 300])).toBe(0.5)
  })
  it('ties share the middle rank', () => expect(rankOf(5, [5, 5])).toBe(0.5))
  it('not comparable → null', () => {
    expect(rankOf(null, [1, 2])).toBeNull()
    expect(rankOf(1, [1])).toBeNull()
  })
  it('cheap is green-ish, pricey is red-ish, middle is neutral', () => {
    expect(tint(0).fg).toBe('#1f6b45')
    expect(tint(1).fg).toBe('#9f1d2c')
    expect(tint(0.5).bg).toBe('rgb(250,247,241)')
  })
})

import { estimates, withEstimates } from '../lib'
import { place as mk } from './fixtures'
describe('estimates for empty fields', () => {
  it('uses the family median per kind', () => {
    const e = estimates([mk({ kind: 'restaurant', price_jpy: 1000 }), mk({ kind: 'restaurant', price_jpy: 3000 }), mk({ kind: 'restaurant', price_jpy: 2000 }), mk({ price_jpy: 9000 })])
    expect(e.price.restaurant).toBe(2000)
    expect(e.price.activity).toBe(9000)
  })
  it('falls back to defaults when nobody entered anything', () => expect(estimates([]).wait.activity).toBe(30))
  it('never overwrites a real value', () => {
    const e = estimates([])
    expect(withEstimates(mk({ price_jpy: 500 }), e).price_jpy).toBe(500)
    expect(withEstimates(mk({ price_jpy: null }), e).price_jpy).toBe(3000)
  })
})

import { autoFillPlace } from '../lib'
describe('autoFillPlace', () => {
  const lk = { lat: 35.6708, lng: 139.7661, label: 'Ginza', website: 'https://ok.jp', halal: 'Muslim friendly' }
  it('fills only blanks and marks them ✨', () => {
    const { row, added } = autoFillPlace(mk({ kind: 'restaurant', lat: null, lng: null, travel_minutes: null, halal: 'Unknown' }), lk)
    expect(row.lat).toBe(35.6708)
    expect(row.nearest_hotels).toEqual(['toranomon'])
    expect(added).toEqual(['pin', 'nearest_hotels', 'travel', 'website_url', 'halal'])
    expect(row.auto_fields).toEqual(added)
  })
  it('never overwrites what a person entered', () => {
    const { row, added } = autoFillPlace(mk({ kind: 'restaurant', lat: null, lng: null, travel_minutes: 7, halal: 'Not halal', website_url: 'https://mine.jp', nearest_hotels: ['jw_tokyo'] }), lk)
    expect(row.travel_minutes).toBe(7)
    expect(row.halal).toBe('Not halal')
    expect(row.website_url).toBe('https://mine.jp')
    expect(row.nearest_hotels).toEqual(['jw_tokyo'])
    expect(added).toEqual(['pin'])
  })
})
