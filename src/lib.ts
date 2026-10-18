import { createClient } from '@supabase/supabase-js'

// The publishable key is safe to ship in the browser (access is controlled by RLS).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://bbquqkxsggzzbzocsias.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_qhxAf2IcE5hycZoSZNgl6w_o6yRei3f'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export type Kind = 'restaurant' | 'activity'
export type HotelId = 'osaka' | 'toranomon' | 'jw_tokyo'
export type Region = 'kansai' | 'kanto'
/** Fields filled automatically (shown with a yellow ✨ until a person types over them). */
export type AutoField = 'pin' | 'nearest_hotels' | 'travel' | 'website_url' | 'halal' | 'price' | 'wait'

export type Group = 'adult' | 'teen' | 'kid'
export interface Member { id: string; name: string; nickname: string | null; emoji: string; grp: Group; is_admin: boolean; created_at: string }
export interface Attendee { member_id: string; place_id: string }
export const displayName = (m: Pick<Member, 'name' | 'nickname'>) => m.nickname?.trim() || m.name
export const GROUPS: { key: Group; label: string; one: string; many: string }[] = [
  { key: 'adult', label: 'Adults', one: 'adult', many: 'adults' },
  { key: 'teen', label: 'Teens', one: 'teen', many: 'teens' },
  { key: 'kid', label: 'Kids', one: 'kid', many: 'kids' },
]
export const EMOJIS = ['🌸', '🍣', '🍜', '🍡', '🍵', '🗻', '⛩️', '🎎', '🐼', '🦊', '🐱', '🐰', '🐥', '🐉', '🦖', '🎮', '🌙', '🪷', '🌺', '🎌', '🐟', '🍙', '🧋', '🎏']

/** Make sure this device has an (anonymous) session — needed for the family-code gate. */
export async function ensureSession() {
  const { data } = await supabase.auth.getSession()
  if (data.session) return null
  const { error } = await supabase.auth.signInAnonymously()
  return error ? error.message : null
}
export async function isFamily() {
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) return false
  const { data, error } = await supabase.rpc('is_family')
  return !error && data === true
}
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
  website_url: string | null
  image_url: string | null
  auto_fields: AutoField[]
  auto_sources: string | null
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

/** Only allow plain web links in hrefs (blocks javascript:/data: links). */
export const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : undefined)

/** Tidy a typed link: add https:// if missing. Returns null for empty, false if it isn't a usable web link. */
export function normalizeUrl(u: string): string | null | false {
  const t = u.trim()
  if (!t) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : false
  } catch { return false }
}

/** Trip-planner code, kept in memory only for this session (never saved on the phone). */
let plannerCode: string | null = null
export const getPlannerCode = () => plannerCode
export const setPlannerCode = (c: string | null) => { plannerCode = c }

export const LIMITS = { name: 120, description: 500, short: 200, longLine: 300, url: 2000, nickname: 20 } as const

// ── Photos ─────────────────────────────────────────────
export const PHOTO_BUCKET = 'place-photos'
export const isStoragePhoto = (u: string | null | undefined): u is string => !!u && u.startsWith('storage:')

/** Shrink a phone photo to ≤1280px JPEG (keeps uploads small and strips EXIF/location data). */
export async function compressImage(file: File, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that photo'))), 'image/jpeg', 0.82))
}

/** Upload → returns the value to store in places.image_url ("storage:<path>"). */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await compressImage(file)
  if (blob.size > 3 * 1024 * 1024) throw new Error('Photo is too big, even after shrinking')
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return `storage:${path}`
}

export async function claimMember(id: string) {
  await supabase.rpc('claim_member', { member: id })
}

// ── Comparative tints ──────────────────────────────────
/** Where `v` sits among `all` (0 = cheapest/shortest, 1 = priciest/longest), or null if not comparable. */
export function rankOf(v: number | null | undefined, all: number[]): number | null {
  if (v == null || all.length < 2) return null
  const below = all.filter((x) => x < v).length, equal = all.filter((x) => x === v).length
  return (below + (equal - 1) / 2) / (all.length - 1)
}

/** Soft pastel wash: green (low) → neutral cream (middle) → pink-red (high). Only a tint, to stay on theme. */
export function tint(r: number | null): { bg: string; fg: string } {
  if (r == null) return { bg: '#faf8f5', fg: '#1f1a17' }
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
  const lo = [226, 244, 233], mid = [250, 247, 241], hi = [253, 228, 230] // #e2f4e9 · #faf7f1 · #fde4e6
  const [a, b, t] = r < 0.5 ? [lo, mid, r / 0.5] : [mid, hi, (r - 0.5) / 0.5]
  const c = a.map((x, i) => lerp(x, b[i], t))
  return { bg: `rgb(${c.join(',')})`, fg: r < 0.34 ? '#1f6b45' : r > 0.66 ? '#9f1d2c' : '#1f1a17' }
}

export const isKid = (m: Pick<Member, 'grp'>) => m.grp === 'kid'

// ── Free look-up (OpenStreetMap / Nominatim) ───────────
export interface Lookup { lat: number; lng: number; label: string; website?: string; halal?: string }

/** Find a place in Japan by name. Also picks up the website and halal tags when OpenStreetMap has them. */
export async function lookupPlace(name: string, cityHint?: string): Promise<Lookup | null> {
  const tries = cityHint ? [`${name}, ${cityHint}`, name] : [name]
  for (const q of tries) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp&extratags=1&q=${encodeURIComponent(q)}`)
    if (!res.ok) continue
    const [hit] = await res.json()
    if (!hit) continue
    const tags: Record<string, string> = hit.extratags ?? {}
    const web = safeUrl(tags.website ?? tags['contact:website'])
    const diet = tags['diet:halal']
    return {
      lat: +hit.lat, lng: +hit.lon, label: String(hit.display_name ?? '').split(',').slice(0, 2).join(','),
      website: web, halal: diet === 'only' ? 'Halal certified' : diet === 'yes' ? 'Muslim friendly' : undefined,
    }
  }
  return null
}

// ── Estimates for empty numbers (never stored; shown yellow) ──
export interface Estimates { price: Record<Kind, number>; wait: Record<Kind, number>; visit: Record<Kind, number> }
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
/** Family's typical value per kind (median of what people entered), with sensible fallbacks. */
export function estimates(places: Place[]): Estimates {
  const by = (kind: Kind, k: 'price_jpy' | 'wait_minutes' | 'visit_minutes') =>
    median(places.filter((p) => p.kind === kind && p[k] != null).map((p) => p[k] as number))
  return {
    price: { restaurant: by('restaurant', 'price_jpy') ?? 2000, activity: by('activity', 'price_jpy') ?? 3000 },
    wait: { restaurant: by('restaurant', 'wait_minutes') ?? 15, activity: by('activity', 'wait_minutes') ?? 30 },
    visit: { restaurant: by('restaurant', 'visit_minutes') ?? 60, activity: by('activity', 'visit_minutes') ?? 120 },
  }
}
/** Same place with empty price/wait/visit filled from estimates — for stats, tints and the planner. */
export const withEstimates = (p: Place, e: Estimates): Place => ({
  ...p,
  price_jpy: p.price_jpy ?? e.price[p.kind],
  wait_minutes: p.wait_minutes ?? e.wait[p.kind],
  visit_minutes: p.visit_minutes ?? e.visit[p.kind],
})
export const YELLOW = { bg: '#fdf4c8', fg: '#7a5b00' }

/** Fill a saved place's blanks from a look-up (never overwrites). Returns the full updated row + what was auto-filled. */
export function autoFillPlace(p: Place, lk: Lookup): { row: Place; added: AutoField[] } {
  const near = nearestHotel(lk)!, est = estimateTravel(near.km)
  const row: Place = { ...p, auto_fields: [...(p.auto_fields ?? [])] }
  const added: AutoField[] = []
  if (row.lat == null || row.lng == null) { row.lat = lk.lat; row.lng = lk.lng; added.push('pin') }
  if (!row.nearest_hotels.length) { row.nearest_hotels = [near.id]; added.push('nearest_hotels') }
  if (row.travel_minutes == null && !row.travel_text) { row.travel_minutes = est.minutes; row.travel_text = est.text; added.push('travel') }
  if (!row.website_url && lk.website) { row.website_url = lk.website; added.push('website_url') }
  if (row.kind === 'restaurant' && (!row.halal || row.halal === 'Unknown') && lk.halal) { row.halal = lk.halal; added.push('halal') }
  row.auto_fields = [...new Set([...row.auto_fields, ...added])]
  return { row, added }
}
