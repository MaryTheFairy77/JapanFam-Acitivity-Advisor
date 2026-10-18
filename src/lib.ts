import { createClient } from '@supabase/supabase-js'

// The publishable key is safe to ship in the browser (access is controlled by RLS).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://bbquqkxsggzzbzocsias.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_qhxAf2IcE5hycZoSZNgl6w_o6yRei3f'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export type Kind = 'restaurant' | 'activity'
export type HotelId = 'osaka' | 'toranomon' | 'jw_tokyo'
export type Region = 'kansai' | 'kanto'

export interface Member { id: string; name: string; emoji: string; created_at: string }
export interface Vote { member_id: string; place_id: string }
export interface Place {
  id: string
  kind: Kind
  name: string
  description: string | null
  price_jpy: number | null
  halal: string | null
  nearest_hotels: HotelId[]
  travel_text: string | null
  travel_minutes: number | null
  wait_text: string | null
  wait_minutes: number | null
  long_line: string | null
  taste: 'sweet' | 'savory' | 'both' | null
  maps_url: string | null
  lat: number | null
  lng: number | null
  visit_minutes: number | null
  visited: boolean
  visited_at: string | null
  created_by: string | null
  created_at: string
}

export const HOTELS: Record<HotelId, { name: string; short: string; city: string; region: Region; lat: number; lng: number; maps: string }> = {
  osaka: {
    name: 'The Osaka Station Hotel (Marriott)', short: 'Osaka Station', city: 'Osaka', region: 'kansai',
    lat: 34.7029, lng: 135.4951,
    maps: 'https://www.google.com/maps/search/?api=1&query=The+Osaka+Station+Hotel+Autograph+Collection',
  },
  toranomon: {
    name: 'Hotel Toranomon Hills (Hyatt)', short: 'Toranomon Hills', city: 'Tokyo', region: 'kanto',
    lat: 35.6671, lng: 139.7496,
    maps: 'https://www.google.com/maps/search/?api=1&query=Hotel+Toranomon+Hills+Unbound+Collection+by+Hyatt',
  },
  jw_tokyo: {
    name: 'JW Marriott Hotel Tokyo', short: 'JW Tokyo', city: 'Tokyo', region: 'kanto',
    lat: 35.6362, lng: 139.7403,
    maps: 'https://www.google.com/maps/search/?api=1&query=JW+Marriott+Hotel+Tokyo',
  },
}
export const HOTEL_IDS = Object.keys(HOTELS) as HotelId[]

export const REGIONS: Record<Region, { label: string; center: [number, number]; zoom: number }> = {
  kansai: { label: 'Osaka & Kyoto', center: [34.75, 135.55], zoom: 10 },
  kanto: { label: 'Tokyo & Fuji', center: [35.6, 139.5], zoom: 9 },
}

export const HALAL_OPTIONS = ['Halal certified', 'Muslim friendly', 'Pork-free', 'Not halal', 'Unknown'] as const

// Rough conversion for display only — tweak as the rate moves.
export const ZAR_PER_JPY = 0.12

export const fmtYen = (n: number | null) => (n == null ? '—' : `¥${n.toLocaleString()}`)
export const fmtZar = (n: number | null) => (n == null ? '' : `≈ R${Math.round(n * ZAR_PER_JPY).toLocaleString()}`)
export const fmtMin = (n: number | null) => {
  if (n == null) return '—'
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60), m = n % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** "1 hr 42 min drive" → 102, "~60-90 min" → 75 (midpoint). */
export function parseMinutes(s: string): number | null {
  const t = s.toLowerCase()
  const hr = t.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour)/)
  const range = t.match(/(\d+)\s*[-–]\s*(\d+)\s*(m|min)/)
  const min = t.match(/(\d+)\s*(m|min)/)
  let total = 0, found = false
  if (hr) { total += parseFloat(hr[1]) * 60; found = true }
  if (range) { total += (parseInt(range[1]) + parseInt(range[2])) / 2; found = true }
  else if (min) { total += parseInt(min[1]); found = true }
  return found ? Math.round(total) : null
}

/** Pull coordinates out of a full Google Maps URL (…!3dLAT!4dLNG or …@LAT,LNG). */
export function parseLatLng(url: string): { lat: number; lng: number } | null {
  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (pin) return { lat: +pin[1], lng: +pin[2] }
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (at) return { lat: +at[1], lng: +at[2] }
  const q = url.match(/[?&](?:q|query)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (q) return { lat: +q[1], lng: +q[2] }
  return null
}

/** Great-circle distance in km. */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toR = Math.PI / 180
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Rough door-to-door estimate in Japan:
 * walk ≤1.2 km at ~13 min/km, otherwise train ≈ 12 min overhead + 2.2 min/km (roads wind, so ×1.3).
 */
export function estimateTravel(distKm: number): { minutes: number; text: string } {
  if (distKm <= 1.2) {
    const m = Math.max(2, Math.round(distKm * 13))
    return { minutes: m, text: `~${m} min walk (est.)` }
  }
  const m = Math.round(12 + distKm * 1.3 * 2.2)
  return { minutes: m, text: `~${fmtMin(m)} by train/car (est., ${distKm.toFixed(1)} km)` }
}

export function nearestHotel(p: { lat: number | null; lng: number | null }) {
  if (p.lat == null || p.lng == null) return null
  return HOTEL_IDS
    .map((id) => ({ id, km: km(p as { lat: number; lng: number }, HOTELS[id]) }))
    .sort((a, b) => a.km - b.km)[0]
}

export const regionOf = (p: { lng: number | null; nearest_hotels?: HotelId[] }): Region | null =>
  p.lng != null ? (p.lng < 137 ? 'kansai' : 'kanto')
  : p.nearest_hotels?.length ? HOTELS[p.nearest_hotels[0]].region : null

/** Fields still worth filling in (used for the "needs info" nudges). */
export function missingFields(p: Place): string[] {
  const m: string[] = []
  if (p.price_jpy == null) m.push('price')
  if (p.travel_minutes == null) m.push('travel time')
  if (p.wait_minutes == null && !p.wait_text) m.push('wait')
  if (p.lat == null) m.push('map pin')
  if (!p.maps_url) m.push('Maps link')
  if (p.kind === 'restaurant' && (!p.halal || p.halal === 'Unknown')) m.push('halal status')
  if (p.kind === 'restaurant' && !p.taste) m.push('sweet/savoury')
  return m
}

export const halalTone = (h: string | null) =>
  h === 'Halal certified' ? 'bg-emerald-100 text-emerald-800'
  : h === 'Muslim friendly' ? 'bg-teal-100 text-teal-800'
  : h === 'Pork-free' ? 'bg-amber-100 text-amber-800'
  : h === 'Not halal' ? 'bg-rose-100 text-rose-800'
  : 'bg-stone-100 text-stone-600'

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
