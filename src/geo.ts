import { useCallback, useState } from 'react'

/**
 * Trip-only tool (📍 Near me) switch themselves on from 24 Dec 2026 to 10 Jan 2027, Japan time.
 * To test early on one phone: localStorage.setItem('jf-trip-tools', '1')
 */
export const TRIP_TOOLS_FROM = Date.UTC(2026, 11, 24) - 9 * 3600e3 // 24 Dec 00:00 JST
export const TRIP_TOOLS_UNTIL = Date.UTC(2027, 0, 11) - 9 * 3600e3 // end of 10 Jan JST
export function tripToolsOn(now = Date.now()) {
  try { if (localStorage.getItem('jf-trip-tools') === '1') return true } catch { /* ignore */ }
  return now >= TRIP_TOOLS_FROM && now < TRIP_TOOLS_UNTIL
}

export type Pos = { lat: number; lng: number; accuracy: number; at: number }

/**
 * Japan as 5 boxes tracing the islands (excludes Korea, Jeju, Vladivostok, Taiwan).
 */
export const JAPAN_BOXES: [number, number, number, number][] = [
  // [minLat, maxLat, minLng, maxLng]
  [24.0, 31.0, 122.9, 131.5], // Okinawa / Ryukyu
  [31.0, 34.0, 128.5, 132.0], // Kyushu
  [32.7, 36.0, 130.8, 137.0], // western Honshu + Shikoku
  [34.0, 41.6, 135.0, 142.2], // central + eastern Honshu (Osaka, Kyoto, Tokyo, Fuji)
  [41.3, 45.6, 139.3, 146.0], // Hokkaido
]
export const inJapan = (lat: number, lng: number) =>
  JAPAN_BOXES.some(([a, b, c, d]) => lat >= a && lat <= b && lng >= c && lng <= d)

/**
 * "Near me": ONE location fix when you ask for it (no background tracking, kind to the battery).
 * Re-uses a fix from the last 2 minutes instead of waking the GPS again.
 */
export function useMyPosition() {
  const [pos, setPos] = useState<Pos | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const locate = useCallback(() => new Promise<Pos | null>((resolve) => {
    if (!('geolocation' in navigator)) { setErr('This phone can’t share its location.'); return resolve(null) }
    setBusy(true); setErr(null)
    navigator.geolocation.getCurrentPosition(
      (g) => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude, accuracy: Math.round(g.coords.accuracy), at: Date.now() }
        setPos(p); setBusy(false); resolve(p)
      },
      (e) => {
        setBusy(false)
        setErr(e.code === e.PERMISSION_DENIED ? 'Location is blocked. Allow it for this site in your browser settings.' : 'Couldn’t get your location. Try again outside or near a window.')
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 },
    )
  }), [])
  return { pos, busy, err, locate }
}
