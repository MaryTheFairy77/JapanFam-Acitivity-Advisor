import { createClient } from '@supabase/supabase-js'

// The publishable key is safe to ship in the browser (access is controlled by RLS).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://bbquqkxsggzzbzocsias.supabase.co'
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_qhxAf2IcE5hycZoSZNgl6w_o6yRei3f'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export type Kind = 'restaurant' | 'activity'
export type HotelId = 'osaka' | 'toranomon' | 'jw_tokyo'

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
  visited: boolean
  visited_at: string | null
  created_by: string | null
  created_at: string
}

export const HOTELS: Record<HotelId, { name: string; short: string; city: string; maps: string }> = {
  osaka: {
    name: 'The Osaka Station Hotel (Marriott)',
    short: 'Osaka Station',
    city: 'Osaka',
    maps: 'https://www.google.com/maps/search/?api=1&query=The+Osaka+Station+Hotel+Autograph+Collection',
  },
  toranomon: {
    name: 'Hotel Toranomon Hills (Hyatt)',
    short: 'Toranomon Hills',
    city: 'Tokyo',
    maps: 'https://www.google.com/maps/search/?api=1&query=Hotel+Toranomon+Hills+Unbound+Collection+by+Hyatt',
  },
  jw_tokyo: {
    name: 'JW Marriott Hotel Tokyo',
    short: 'JW Tokyo',
    city: 'Tokyo',
    maps: 'https://www.google.com/maps/search/?api=1&query=JW+Marriott+Hotel+Tokyo',
  },
}
export const HOTEL_IDS = Object.keys(HOTELS) as HotelId[]

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

export const halalTone = (h: string | null) =>
  h === 'Halal certified' ? 'bg-emerald-100 text-emerald-800'
  : h === 'Muslim friendly' ? 'bg-teal-100 text-teal-800'
  : h === 'Pork-free' ? 'bg-amber-100 text-amber-800'
  : h === 'Not halal' ? 'bg-rose-100 text-rose-800'
  : 'bg-stone-100 text-stone-600'
