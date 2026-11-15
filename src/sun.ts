/**
 * Sunset (→ Maghrib) for a date + place, NOAA solar equations (good to ~1 min). Japan time (UTC+9).
 * Maghrib = sunset + 3 min (common timetable offset). Minutes after midnight JST.
 */
const rad = Math.PI / 180
export function sunsetMinutes(dateIso: string, lat: number, lng: number, tz = 9): number {
  const [y, m, d] = dateIso.split('-').map(Number)
  const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5) // day of year
  const g = (2 * Math.PI / 365) * (n - 1 + 0.5) // fractional year at noon
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad
  return 720 - 4 * (lng - ha) - eqt + tz * 60
}
export const maghribAt = (dateIso: string, lat: number, lng: number) => Math.round(sunsetMinutes(dateIso, lat, lng) + 3)
