import { describe, expect, it } from 'vitest'
import { sunsetMinutes } from '../sun'

describe('sunset', () => {
  it('Tokyo 26 Dec ≈ 16:35, Osaka 30 Dec ≈ 16:57 (±4 min)', () => {
    expect(Math.abs(sunsetMinutes('2026-12-26', 35.667, 139.75) - (16 * 60 + 35))).toBeLessThanOrEqual(4)
    expect(Math.abs(sunsetMinutes('2026-12-30', 34.703, 135.495) - (16 * 60 + 57))).toBeLessThanOrEqual(4)
  })
})
