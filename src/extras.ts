import { useEffect, useState } from 'react'
import { supabase } from './lib'

/**
 * Small free extras for the map (no keys, no accounts, nothing paid):
 * - Weather: Open-Meteo (open-meteo.com), today's rain chance + max/min for the city on screen. Cached 1 h per city, shown offline too.
 * - Stations: OpenStreetMap (via the "stations" edge function + stations_cache table), near our hotels + places.
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

export type Station = { id: number; name: string; lat: number; lng: number }

/**
 * Stations within ~700 m of each anchor (hotel or place).
 * Read from public.stations_cache (filled by the "stations" edge function, which asks OpenStreetMap server-side:
 * Overpass often blocks browsers when busy). Refreshed when the set of places changes. Cached on the phone for offline.
 */
export function useStations(active: boolean, anchors: { lat: number; lng: number }[]) {
  const [list, setList] = useState<Station[]>(() => cacheGet<Station[]>('jf-stations-v2', 30 * 864e5) ?? [])
  const pts = Array.from(new Set(anchors.map((a) => `${a.lat.toFixed(3)},${a.lng.toFixed(3)}`))).sort()
  const sig = pts.join(';')
  useEffect(() => {
    if (!active || !pts.length) return
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('stations_cache').select('sig, data').eq('id', 1).maybeSingle()
      if (data?.data && alive) { setList(data.data as Station[]); cacheSet('jf-stations-v2', data.data) }
      if (data?.sig === sig) return
      const points = pts.map((p) => p.split(',').map(Number))
      const r = await supabase.functions.invoke('stations', { body: { points, sig } })
      const st = (r.data as { stations?: Station[] } | null)?.stations
      if (st && alive) { setList(st); cacheSet('jf-stations-v2', st) }
    })().catch(() => { /* offline: keep the phone's copy */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sig])
  return active ? list : []
}

/** Google Maps walking directions to a spot (opens the Maps app on phones). */
export const walkTo = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`
