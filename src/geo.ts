import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib'

/**
 * Trip-only tools (📍 Near me + 👨‍👩‍👧 Family finder) switch themselves on from 24 Dec 2026 to 10 Jan 2027, Japan time.
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
 * The SAME boxes are a CHECK constraint in the database (public.in_japan), so the server refuses anything else.
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

// ───────────────────────── Family finder ─────────────────────────

export type FamilySpot = { member_id: string; lat: number; lng: number; accuracy_m: number | null; updated_at: string }
const SHARE_KEY = 'jf-share-until'

/** Sharing always switches itself off at the next midnight in Japan (JST = UTC+9). */
export function nextJapanMidnight(now = Date.now()) {
  const jst = new Date(now + 9 * 3600e3)
  const midnightJstAsUtc = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + 1) - 9 * 3600e3
  return midnightJstAsUtc
}

/**
 * Opt-in location sharing for the family finder.
 * - Only while the app is open on screen (browsers can't track in the background anyway, which is good for privacy + battery)
 * - Only inside Japan (also enforced by the database)
 * - Uploads at most once a minute, or sooner if you moved > 75 m
 * - Precise GPS only while the Family map is open; otherwise low-power fixes
 * - Turns itself off at midnight Japan time; turning it off deletes your spot
 */
export function useLocationSharing(memberId: string, precise: boolean) {
  const [until, setUntil] = useState<number | null>(() => {
    try { const v = Number(localStorage.getItem(SHARE_KEY)); return v > Date.now() ? v : null } catch { return null }
  })
  const [status, setStatus] = useState<string | null>(null)
  const last = useRef<{ lat: number; lng: number; t: number } | null>(null)
  const sharing = until != null && until > Date.now()

  const stop = useCallback(async () => {
    setUntil(null); last.current = null
    try { localStorage.removeItem(SHARE_KEY) } catch { /* ignore */ }
    await supabase.from('locations').delete().eq('member_id', memberId)
    setStatus(null)
  }, [memberId])

  const start = useCallback(() => {
    const u = nextJapanMidnight()
    setUntil(u)
    try { localStorage.setItem(SHARE_KEY, String(u)) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!sharing) return
    // auto-off at midnight JST
    const off = setTimeout(stop, Math.max(0, until! - Date.now()))
    let watch: number | null = null
    const upload = async (g: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = g.coords
      if (!inJapan(lat, lng)) { setStatus('Not in Japan: your spot isn’t shared (Japan only).'); return }
      const prev = last.current, now = Date.now()
      const moved = prev ? Math.hypot((lat - prev.lat) * 111000, (lng - prev.lng) * 91000) : Infinity
      if (prev && now - prev.t < 60000 && moved < 75) return
      last.current = { lat, lng, t: now }
      const { error } = await supabase.from('locations').upsert({ member_id: memberId, lat, lng, accuracy_m: Math.round(accuracy) })
      setStatus(error ? 'Couldn’t share your spot (offline?)' : 'Sharing your spot with the family')
    }
    const begin = () => {
      if (watch != null || document.visibilityState !== 'visible' || !('geolocation' in navigator)) return
      watch = navigator.geolocation.watchPosition(upload, () => setStatus('Location blocked or unavailable'),
        { enableHighAccuracy: precise, maximumAge: precise ? 15000 : 60000, timeout: 30000 })
    }
    const end = () => { if (watch != null) navigator.geolocation.clearWatch(watch); watch = null }
    const onVis = () => (document.visibilityState === 'visible' ? begin() : end())
    begin()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(off); end(); document.removeEventListener('visibilitychange', onVis) }
  }, [sharing, until, precise, memberId, stop])

  return { sharing, until, status, start, stop }
}

/** Everyone's latest spots, polled every 30 s only while the Family map is open. */
export function useFamilySpots(active: boolean) {
  const [spots, setSpots] = useState<FamilySpot[]>([])
  useEffect(() => {
    if (!active) return
    let alive = true
    supabase.rpc('purge_old_locations').then(() => {}, () => {})
    const load = async () => {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.from('locations').select('member_id, lat, lng, accuracy_m, updated_at')
      if (alive && data) setSpots(data as FamilySpot[])
    }
    load()
    const id = setInterval(load, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [active])
  return spots
}

export function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`
}
