/**
 * Daily prayer times worked out on the phone (no service, works offline). Added 20 Nov 2026 (Phase 2, Home).
 * Muslim World League method: Fajr 18° and Isha 17° below the horizon; Asr = Shafi'i (shadow = object + noon shadow).
 * Maghrib = sunset + 3 min, the same as the trip planner (sun.ts), so Home and the plan never disagree.
 * NOAA solar equations (good to about a minute). Times are minutes after midnight, Japan time (UTC+9).
 * Checked against HalalTrip's MWL timetable for Tokyo (see src/__tests__/prayer.test.ts). Mosque timetables may differ by a few minutes.
 */
import { maghribAt } from './sun'

const rad = Math.PI / 180
export type PrayerTimes = { fajr: number; sunrise: number; dhuhr: number; asr: number; maghrib: number; isha: number }
export const PRAYER_NAMES: { key: keyof PrayerTimes; label: string; prayer: boolean }[] = [
  { key: 'fajr', label: 'Fajr', prayer: true },
  { key: 'sunrise', label: 'Sunrise', prayer: false },
  { key: 'dhuhr', label: 'Dhuhr', prayer: true },
  { key: 'asr', label: 'Asr', prayer: true },
  { key: 'maghrib', label: 'Maghrib', prayer: true },
  { key: 'isha', label: 'Isha', prayer: true },
]

function sun(dateIso: string) {
  const [y, m, d] = dateIso.split('-').map(Number)
  const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5)
  const g = (2 * Math.PI / 365) * (n - 1 + 0.5)
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  return { eqt, decl }
}

/** Minutes from solar noon until the sun reaches `altitude` degrees (negative = below the horizon). */
function hourAngle(altitude: number, lat: number, decl: number) {
  const x = (Math.sin(altitude * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl))
  return (Math.acos(Math.max(-1, Math.min(1, x))) / rad) * 4
}

export function prayerTimes(dateIso: string, lat: number, lng: number, tz = 9): PrayerTimes {
  const { eqt, decl } = sun(dateIso)
  const noon = 720 - 4 * lng - eqt + tz * 60
  const asrAlt = Math.atan(1 / (1 + Math.tan(Math.abs(lat * rad - decl)))) / rad
  return {
    fajr: Math.round(noon - hourAngle(-18, lat, decl)),
    sunrise: Math.round(noon - hourAngle(-0.833, lat, decl)),
    dhuhr: Math.round(noon + 1),
    asr: Math.round(noon + hourAngle(asrAlt, lat, decl)),
    maghrib: maghribAt(dateIso, lat, lng),
    isha: Math.round(noon + hourAngle(-17, lat, decl)),
  }
}

/** The next prayer at `nowMin` (minutes after midnight, Japan time), or null after Isha. Sunrise is skipped. */
export function nextPrayer(t: PrayerTimes, nowMin: number) {
  return PRAYER_NAMES.filter((p) => p.prayer).map((p) => ({ ...p, at: t[p.key] })).find((p) => p.at >= nowMin) ?? null
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`
