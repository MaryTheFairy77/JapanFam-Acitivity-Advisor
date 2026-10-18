import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { HOTELS, HOTEL_IDS, REGIONS, fmtMin, fmtYen, nearestHotel, regionOf, safeUrl, type Place, type Region } from '../lib'

type View = Region | 'all'

const bubble = (emoji: string, ring: string, size: number, badge?: number, faded?: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#fff;border:3px solid ${ring};
      display:flex;align-items:center;justify-content:center;font-size:${size * 0.5}px;box-shadow:0 3px 8px rgba(0,0,0,.18);
      position:relative;${faded ? 'opacity:.55;filter:grayscale(.6);' : ''}">${emoji}${
      badge ? `<span style="position:absolute;top:-6px;right:-6px;background:#c8102e;color:#fff;font:600 10px Inter,sans-serif;
        border-radius:9999px;min-width:16px;height:16px;padding:0 4px;display:flex;align-items:center;justify-content:center;border:2px solid #fff">${badge}</span>` : ''
    }</div>`,
  })

function Fly({ view }: { view: View }) {
  const map = useMap()
  useEffect(() => {
    if (view === 'all') map.flyTo([35.4, 137.6], 7, { duration: 0.8 })
    else map.flyTo(REGIONS[view].center, REGIONS[view].zoom, { duration: 0.8 })
  }, [view, map])
  return null
}

export default function MapView({ places, voteCount, onOpen }: {
  places: Place[]; voteCount: Record<string, number>; onOpen: (p: Place) => void
}) {
  const pinned = places.filter((p) => p.lat != null && p.lng != null)
  const unpinned = places.length - pinned.length
  const [view, setView] = useState<View>(() => {
    const k = pinned.filter((p) => regionOf(p) === 'kansai').length
    return k > pinned.length - k ? 'kansai' : 'kanto'
  })
  const [show, setShow] = useState<'all' | 'restaurant' | 'activity'>('all')

  const visible = useMemo(() => pinned.filter((p) => show === 'all' || p.kind === show), [pinned, show])

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm shadow-sm ${on ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white/95 text-stone-700'}`

  return (
    <div className="relative h-[calc(100dvh-8rem)]">
      <MapContainer center={REGIONS.kanto.center} zoom={9} zoomControl={false} className="japan-map h-full w-full">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />
        <Fly view={view} />

        {/* dashed "string" from each place back to its home base */}
        {visible.map((p) => {
          const h = nearestHotel(p)
          return h ? (
            <Polyline key={`l-${p.id}`} positions={[[p.lat!, p.lng!], [HOTELS[h.id].lat, HOTELS[h.id].lng]]}
              pathOptions={{ color: p.kind === 'restaurant' ? '#c8102e' : '#4f46e5', weight: 1.5, opacity: 0.35, dashArray: '4 6' }} />
          ) : null
        })}

        {HOTEL_IDS.map((id) => (
          <Marker key={id} position={[HOTELS[id].lat, HOTELS[id].lng]} icon={bubble('🏯', '#c8102e', 44)} zIndexOffset={1000}>
            <Popup>
              <b>🏠 Home base</b><br />{HOTELS[id].name}<br />
              <a href={HOTELS[id].maps} target="_blank" rel="noreferrer">Open in Google Maps</a>
            </Popup>
          </Marker>
        ))}

        {visible.map((p) => {
          const h = nearestHotel(p)
          return (
            <Marker key={p.id} position={[p.lat!, p.lng!]}
              icon={bubble(p.kind === 'restaurant' ? '🍜' : '🎢', p.kind === 'restaurant' ? '#f59e0b' : '#6366f1', 34, voteCount[p.id], p.visited)}>
              <Popup>
                <div style={{ minWidth: 170 }}>
                  <b style={{ fontSize: 14 }}>{p.name}</b>{p.visited && ' ✓'}<br />
                  {p.description && <span style={{ color: '#57534e' }}>{p.description}<br /></span>}
                  {fmtYen(p.price_jpy)} · 🚗 {fmtMin(p.travel_minutes)} · ⏱ {fmtMin(p.wait_minutes)}<br />
                  {h && <span style={{ color: '#57534e' }}>{h.km.toFixed(1)} km from {HOTELS[h.id].short}<br /></span>}
                  ▲ {voteCount[p.id] ?? 0} votes<br />
                  <span style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    {safeUrl(p.maps_url) && <a href={safeUrl(p.maps_url)} target="_blank" rel="noreferrer">📍 Maps</a>}
                    {safeUrl(p.website_url) && <a href={safeUrl(p.website_url)} target="_blank" rel="noreferrer">🌐 Info</a>}
                    <a href="#" onClick={(e) => { e.preventDefault(); onOpen(p) }}>Details →</a>
                  </span>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* overlay controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] space-y-2 p-3">
        <div className="pointer-events-auto flex gap-2 overflow-x-auto">
          <button className={chip(view === 'kansai')} onClick={() => setView('kansai')}>🦌 {REGIONS.kansai.label}</button>
          <button className={chip(view === 'kanto')} onClick={() => setView('kanto')}>🗼 {REGIONS.kanto.label}</button>
          <button className={chip(view === 'all')} onClick={() => setView('all')}>🗾 All</button>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button className={chip(show === 'all')} onClick={() => setShow('all')}>Everything</button>
          <button className={chip(show === 'restaurant')} onClick={() => setShow('restaurant')}>🍜 Food</button>
          <button className={chip(show === 'activity')} onClick={() => setShow('activity')}>🎢 Activities</button>
        </div>
      </div>
      {unpinned > 0 && (
        <div className="absolute inset-x-3 bottom-3 z-[500] rounded-xl bg-white/95 px-3 py-2 text-xs text-stone-600 shadow">
          📌 {unpinned} place{unpinned === 1 ? '' : 's'} not on the map yet. Open one and tap <b>Find pin</b>.
        </div>
      )}
    </div>
  )
}
