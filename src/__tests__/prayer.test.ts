import { describe, expect, it } from 'vitest'
import { hhmm, nextPrayer, prayerTimes } from '../prayer'

// HalalTrip, Muslim World League method, Tokyo, Monday 9 November 2026:
// Fajr 04:43, Sunrise 06:10, Zuhr 11:25, Asr 14:18, Maghrib 16:39, Isha 18:01 (Maghrib there = sunset; ours adds 3 min like the planner)
const min = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }

describe('prayer times (MWL, Shafi\'i Asr)', () => {
  const t = prayerTimes('2026-11-09', 35.6895, 139.6917)
  it('match a published Tokyo timetable within 2 minutes', () => {
    expect(Math.abs(t.fajr - min('04:43'))).toBeLessThanOrEqual(2)
    expect(Math.abs(t.sunrise - min('06:10'))).toBeLessThanOrEqual(2)
    expect(Math.abs(t.dhuhr - min('11:25'))).toBeLessThanOrEqual(2)
    expect(Math.abs(t.asr - min('14:18'))).toBeLessThanOrEqual(2)
    expect(Math.abs(t.maghrib - (min('16:39') + 3))).toBeLessThanOrEqual(2)
    expect(Math.abs(t.isha - min('18:01'))).toBeLessThanOrEqual(2)
  })
  it('stay in a sensible order on the trip dates', () => {
    for (const d of ['2026-12-26', '2026-12-31', '2027-01-07']) {
      const p = prayerTimes(d, 34.7029, 135.4951)
      expect(p.fajr < p.sunrise && p.sunrise < p.dhuhr && p.dhuhr < p.asr && p.asr < p.maghrib && p.maghrib < p.isha).toBe(true)
    }
  })
  it('finds the next prayer', () => {
    expect(nextPrayer(t, min('13:00'))?.label).toBe('Asr')
    expect(nextPrayer(t, min('05:00'))?.label).toBe('Dhuhr')
    expect(nextPrayer(t, min('23:00'))).toBeNull()
    expect(hhmm(min('09:05'))).toBe('09:05')
  })
})
