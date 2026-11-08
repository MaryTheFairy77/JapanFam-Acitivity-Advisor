import { useState } from 'react'
import { Building2, Clock, Globe, Images, MapPin, Phone, TrainFront, X } from 'lucide-react'
import Thumb from './Thumb'
import { CATEGORIES, HOTELS, catOf, fmtMin, nearestHotel, travelFromPin, type HotelId, type Place } from '../lib'

/** Facts written in our own words from the hotels' official pages + booking sites (checked 8 Nov 2026). */
export const HOTEL_INFO: Record<HotelId, {
  blurb: string; address: string; station: string; building: string; checkin: string; phone: string; website?: string
  /** header photo link chosen by Maryam (hot-linked, not copied); falls back to the drawing if it breaks */
  photo?: string
}> = {
  osaka: {
    blurb: 'Marriott’s Autograph Collection hotel, opened July 2024 high up in JP Tower Osaka, on the spot where Osaka’s very first station stood. Rooms are big for Japan (mostly ~40 m²) with views over Umeda. You can walk straight in from the station.',
    address: '3-2-2 Umeda, Kita-ku, Osaka 530-0001',
    station: 'Directly connected to JR Osaka Station (West Gate). Reception is on 29F: use the hotel lift inside KITTE Osaka, or the main entrance at night (KITTE side closes 00:00–04:50).',
    building: 'JP Tower Osaka · rooms on 30F–38F · 418 rooms · no pool',
    checkin: 'Check-in 15:00 · check-out 12:00',
    phone: '+81 6-6105-1874',
    website: 'https://www.marriott.com/OSAAK',
    photo: 'https://cache.marriott.com/is/image/marriotts7prod/ak-osaak-frontdesk-25272:Feature-Hor?wid=1920&fit=constrain',
  },
  toranomon: {
    blurb: 'Hyatt’s Unbound Collection hotel inside the new Toranomon Hills Station Tower (opened 2023), designed by Space Copenhagen. Calm, Scandinavian-meets-Japanese style. It sits right on top of a metro station, and teamLab Borderless and Tokyo Tower are both about 12–15 min away on foot.',
    address: 'Toranomon Hills Station Tower, Toranomon 2-chome, Minato-ku, Tokyo',
    station: 'Toranomon Hills Station (Hibiya line) is 1–2 min away, underground link. Toranomon Station (Ginza line) ~5 min.',
    building: 'Station Tower · 1F + 11F–14F · 205 rooms (standard ~27–34 m²)',
    checkin: 'Check-in 15:00 · check-out 12:00',
    phone: '+81 3-6834-5678',
    photo: 'https://lh3.googleusercontent.com/gps-cs-s/ANWiy9SnhIQMeq-Bazwyy8RA-_pXL9dfO8XBQTPPtWLoRwzrnl0QpJAF0tfwCex-yvEzjL-j8Fag0iRu_9BK6m3uMTv5-O1b6ghgZYcHQZ7QN-5i1Hc7p3Ud55oGV7BwuuNSS2iPv2uI=s680-w680-h510-rw',
  },
  jw_tokyo: {
    blurb: 'The first JW Marriott in Tokyo, opened October 2025 at the top of a tower in Takanawa Gateway City, the new district built where Japan’s first railway ran. Quiet, Zen-inspired design, an indoor pool and spa, and easy access to Haneda (~14 km) and Shinagawa’s shinkansen.',
    address: '2-21-2 Takanawa, Minato-ku, Tokyo 108-0074',
    station: 'Takanawa Gateway Station (JR Yamanote line) is 1 min away, connected. Shinagawa (shinkansen) is next door.',
    building: 'Takanawa Gateway City · upper floors · 200 rooms · 25 m indoor pool + spa',
    checkin: 'Check-in 15:00 · check-out 12:00',
    phone: '+81 3-3434-7070',
    website: 'https://www.marriott.com/TYOJW',
    photo: 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/750269912.jpg?k=e04b77cae02d11e6c1217b951aa46b35c6c32decfc3425fd762905674278d47d&o=',
  },
}

/** Overview of one hotel: what it is, how to get in, and what's closest to it. */
export default function HotelSheet({ id, places, photoUrls, onClose, onOpenPlace }: {
  id: HotelId; places: Place[]; photoUrls: Record<string, string>; onClose: () => void; onOpenPlace: (p: Place) => void
}) {
  const h = HOTELS[id], info = HOTEL_INFO[id]
  const [all, setAll] = useState(false)
  const [photoBroken, setPhotoBroken] = useState(false)
  // places whose closest hotel is this one, nearest first
  const near = places
    .map((p) => ({ p, n: nearestHotel(p) }))
    .filter((x) => x.n?.id === id)
    .sort((a, b) => a.n!.km - b.n!.km)
  const count = (pred: (p: Place) => boolean) => near.filter((x) => pred(x.p)).length
  const fact = (Icon: typeof Clock, text: string) => (
    <li className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" /><span>{text}</span></li>
  )
  return (
    <div className="fixed inset-0 z-[800] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-washi sm:rounded-3xl">
        <div className="relative">
          {info.photo && !photoBroken
            ? <img src={info.photo} alt={h.name} referrerPolicy="no-referrer" onError={() => setPhotoBroken(true)} className="h-52 w-full rounded-t-3xl object-cover" />
            : <HotelArt city={h.city} className="h-44 w-full rounded-t-3xl" />}
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow"><X className="h-5 w-5" /></button>
          <span className="absolute bottom-3 left-4 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium">🏯 Home base · {h.city}</span>
        </div>
        <div className="p-5 pt-4">
          <h2 className="font-display text-2xl leading-tight">{h.name}</h2>
          <p className="mt-2 text-sm text-stone-700">{info.blurb}</p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={h.maps} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink py-2.5 text-sm font-medium text-white"><Images className="h-4 w-4" />Photos & map</a>
            <a href={info.website ?? `https://www.google.com/search?q=${encodeURIComponent(h.name + ' official site')}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-2.5 text-sm"><Globe className="h-4 w-4" />Website</a>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-stone-500">More photos open in Google Maps</p>

          <ul className="mt-4 space-y-2 rounded-2xl bg-white p-3 text-sm text-stone-700">
            {fact(TrainFront, info.station)}
            {fact(Clock, info.checkin)}
            {fact(Building2, info.building)}
            {fact(MapPin, info.address)}
            {fact(Phone, info.phone)}
          </ul>

          <h3 className="mt-5 font-display text-lg">Closest to here</h3>
          <p className="text-xs text-stone-500">
            🍜 {count((p) => p.kind === 'restaurant')} food · {CATEGORIES.activity.emoji} {count((p) => p.kind === 'activity' && catOf(p) === 'activity')} activities · {CATEGORIES.shopping.emoji} {count((p) => p.kind === 'activity' && catOf(p) === 'shopping')} shops
          </p>
          <div className="mt-2 space-y-1.5">
            {near.length === 0 && <p className="text-sm text-stone-500">Nothing pinned near this hotel yet.</p>}
            {(all ? near : near.slice(0, 8)).map(({ p }) => {
              const t = travelFromPin({ ...p, nearest_hotels: [id] })
              return (
                <button key={p.id} onClick={() => onOpenPlace(p)} className="flex w-full items-center gap-3 rounded-xl bg-white p-2 text-left">
                  <Thumb place={p} photoUrls={photoUrls} className="h-11 w-11 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.kind === 'restaurant' ? '🍜' : CATEGORIES[catOf(p)].emoji} {p.name}</span>
                    <span className="block text-xs text-stone-500">{t ? `${t.km.toFixed(1)} km · ~${fmtMin(t.minutes)}` : ''}{p.visited ? ' · Been ✓' : ''}</span>
                  </span>
                </button>
              )
            })}
            {near.length > 8 && (
              <button onClick={() => setAll(!all)} className="w-full rounded-xl py-2 text-sm text-torii">{all ? 'Show fewer' : `Show all ${near.length}`}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Original illustration (no photos): skyline + sun, Osaka gets its castle, Tokyo gets its tower. */
function HotelArt({ city, className = '' }: { city: string; className?: string }) {
  const osaka = city === 'Osaka'
  return (
    <svg viewBox="0 0 400 176" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="ht-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={osaka ? '#fde2e4' : '#e0e7ff'} />
          <stop offset="1" stopColor="#fdf6ec" />
        </linearGradient>
      </defs>
      <rect width="400" height="176" fill="url(#ht-sky)" />
      <circle cx="310" cy="58" r="30" fill="#c8102e" opacity=".85" />
      {/* back skyline */}
      <g fill={osaka ? '#f9c5cf' : '#c7d2fe'}>
        <rect x="10" y="96" width="34" height="80" /><rect x="50" y="80" width="26" height="96" /><rect x="84" y="104" width="40" height="72" />
        <rect x="236" y="90" width="30" height="86" /><rect x="272" y="108" width="44" height="68" /><rect x="350" y="86" width="36" height="90" />
      </g>
      {osaka ? (
        /* castle */
        <g fill="#7c3aed" opacity=".75">
          <rect x="150" y="126" width="80" height="50" />
          <path d="M140 128 L240 128 L224 116 L156 116 Z" />
          <rect x="162" y="96" width="56" height="20" />
          <path d="M152 98 L228 98 L214 86 L166 86 Z" />
          <rect x="174" y="70" width="32" height="16" />
          <path d="M164 72 L216 72 L202 58 L178 58 Z" />
        </g>
      ) : (
        /* tower */
        <g fill="none" stroke="#c8102e" strokeWidth="3" opacity=".85">
          <path d="M190 30 L172 176 M190 30 L208 176" />
          <path d="M180 100 L200 100 M176 132 L204 132 M184 70 L196 70" />
          <path d="M174 160 Q190 140 206 160" />
        </g>
      )}
      {/* hotel tower in front, with lit windows */}
      <rect x={osaka ? 262 : 230} y="40" width="44" height="136" rx="3" fill="#1c1917" opacity=".85" />
      {Array.from({ length: 8 }).map((_, r) => [0, 1, 2].map((c) => (
        <rect key={`${r}-${c}`} x={(osaka ? 268 : 236) + c * 13} y={50 + r * 15} width="7" height="8" fill={(r + c) % 3 ? '#fde68a' : '#57534e'} />
      )))}
      <rect y="166" width="400" height="10" fill="#93c5fd" opacity=".55" />
    </svg>
  )
}
