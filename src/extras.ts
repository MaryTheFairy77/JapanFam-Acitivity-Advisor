import { useEffect, useState } from 'react'

/**
 * Small free extras for the map (no keys, no accounts, nothing paid):
 * - Weather: Open-Meteo (open-meteo.com), today's rain chance + max/min for the city on screen. Cached 1 h per city, shown offline too.
 */

function cacheGet<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { at, v } = JSON.parse(raw) as { at: number; v: T }
    return Date.now() - at < maxAgeMs ? v : null
  } catch { return null }
}
function cacheSet<T>(key: string, v: T) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), v })) } catch { /* full or blocked: fine */ }
}

// ───────────── Weather ─────────────

export type Weather = { rain: number | null; max: number; min: number; date: string }
export const WEATHER_SPOTS = {
  kanto: { label: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  kansai: { label: 'Osaka', lat: 34.6937, lng: 135.5023 },
} as const

export function useWeather(city: keyof typeof WEATHER_SPOTS | null) {
  const [w, setW] = useState<Weather | null>(null)
  useEffect(() => {
    if (!city) { setW(null); return }
    const key = `jf-weather-${city}`
    const fresh = cacheGet<Weather>(key, 3600e3)
    const stale = cacheGet<Weather>(key, 7 * 864e5)
    setW(fresh ?? stale)
    if (fresh) return
    const { lat, lng } = WEATHER_SPOTS[city]
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=1'
    let alive = true
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => {
      const d = j?.daily
      if (!d?.time?.length) return
      const v: Weather = {
        date: d.time[0],
        max: Math.round(d.temperature_2m_max[0]),
        min: Math.round(d.temperature_2m_min[0]),
        rain: d.precipitation_probability_max?.[0] ?? null,
      }
      cacheSet(key, v)
      if (alive) setW(v)
    }).catch(() => { /* offline: keep the cached one */ })
    return () => { alive = false }
  }, [city])
  return w
}

// ───────────── Stations ─────────────

/** Google Maps walking directions to a spot (opens the Maps app on phones). */
export const walkTo = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`
