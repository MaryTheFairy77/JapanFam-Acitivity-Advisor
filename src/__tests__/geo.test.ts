import { describe, expect, it } from 'vitest'
import { inJapan, nextJapanMidnight, tripToolsOn } from '../geo'
import { MOSQUES, mosquesNear } from '../mosques'

describe('family finder privacy rules', () => {
  it('only treats Japan as Japan', () => {
    expect(inJapan(35.6671, 139.7496)).toBe(true) // Toranomon
    expect(inJapan(34.7029, 135.4951)).toBe(true) // Osaka
    expect(inJapan(-33.92, 18.42)).toBe(false) // Cape Town
    expect(inJapan(37.57, 126.98)).toBe(false) // Seoul
    expect(inJapan(35.18, 129.08)).toBe(false) // Busan
    expect(inJapan(33.5, 126.53)).toBe(false) // Jeju
    expect(inJapan(43.12, 131.89)).toBe(false) // Vladivostok
    expect(inJapan(35.0116, 135.7681)).toBe(true) // Kyoto
    expect(inJapan(35.36, 138.73)).toBe(true) // Mt Fuji
    expect(inJapan(33.59, 130.40)).toBe(true) // Fukuoka
  })
  it('sharing stops at the next midnight Japan time', () => {
    // 2026-12-01 10:00 UTC = 19:00 JST → next JST midnight = 2026-12-01 15:00 UTC
    expect(new Date(nextJapanMidnight(Date.UTC(2026, 11, 1, 10))).toISOString()).toBe('2026-12-01T15:00:00.000Z')
    // 2026-12-01 16:00 UTC = 01:00 JST on the 2nd → next midnight = 2026-12-02 15:00 UTC
    expect(new Date(nextJapanMidnight(Date.UTC(2026, 11, 1, 16))).toISOString()).toBe('2026-12-02T15:00:00.000Z')
  })
})

describe('mosques', () => {
  it('all pins are in Japan', () => {
    for (const m of MOSQUES) expect(inJapan(m.lat, m.lng)).toBe(true)
  })
  it('finds a prayer place near our Osaka hotel', () => {
    const [m] = mosquesNear({ lat: 34.7029, lng: 135.4951 }, 1)
    expect(m.d).toBeLessThan(1)
  })
})

describe('trip-only tools', () => {
  it('are on 24 Dec – 10 Jan (Japan time) and off otherwise', () => {
    expect(tripToolsOn(Date.UTC(2026, 10, 8))).toBe(false) // today, 8 Nov
    expect(tripToolsOn(Date.UTC(2026, 11, 23, 14, 59))).toBe(false) // 23 Dec 23:59 JST
    expect(tripToolsOn(Date.UTC(2026, 11, 23, 15, 0))).toBe(true) // 24 Dec 00:00 JST
    expect(tripToolsOn(Date.UTC(2027, 0, 10, 14, 59))).toBe(true) // 10 Jan 23:59 JST
    expect(tripToolsOn(Date.UTC(2027, 0, 10, 15, 0))).toBe(false) // 11 Jan 00:00 JST
  })
})
