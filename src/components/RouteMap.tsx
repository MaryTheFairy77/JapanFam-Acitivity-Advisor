import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { HOTELS, isStoragePhoto, km, safeUrl, type HotelId, type Place } from '../lib'
import { STATIONS } from '../stations'
import { MOSQUES } from '../mosques'
import { directionsUrl, foodNear, type Timeline } from '../itinerary'
import { pastelize } from './MapView'
import { dayLabel } from './TripPlan'
import { clock, legText } from './DayBuilder'

/**
 * A3 · route map popup (Maryam's approved mockup, 15 Nov 2026).
 * The day as a directed graph: 🏯 → ① → ② → ③ → 🏯 with arrows + leg times; photo pins; other halal food (faded),
 * 🚉 stations, 🕌 prayer rooms nearby. Tap a pin → card → "Directions": Apple Maps on iPhone, Google Maps elsewhere.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
type Pin = { key: string; name: string; lat: number; lng: number; sub: string; photo?: string | null }

export default function RouteMap({ date, hotelId, tl, places, photoUrls, onClose }: {
  date: string; hotelId: HotelId; tl: Timeline; places: Place[]; photoUrls: Record<string, string>; onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<Pin | null>(null)
  const hotel = HOTELS[hotelId]
  const photo = (p: Place) => isStoragePhoto(p.image_url) ? photoUrls[p.image_url.slice(8)] : safeUrl(p.image_url)
  const stops = useMemo(() => tl.steps.map((s) => ({ ...s, p: s.places[0], food: s.places.every((x) => x.kind === 'restaurant'), names: s.places.map((x) => x.name).join(' + ') }))
    .filter((s) => s.p.lat != null), [tl])

  useEffect(() => {
    let map: maplibregl.Map | null = null
    let cancelled = false
    let stopResize = () => {}
    const pts = [{ lat: hotel.lat, lng: hotel.lng }, ...stops.map((s) => ({ lat: s.p.lat!, lng: s.p.lng! }))]
    const near = (q: { lat: number; lng: number }, r: number) => pts.some((p) => km(p, q) <= r)
    fetch(STYLE_URL).then((r) => r.json()).then((style: StyleSpecification) => {
      if (cancelled || !box.current) return
      map = new maplibregl.Map({ container: box.current, style: pastelize(style), center: [hotel.lng, hotel.lat], zoom: 12, attributionControl: false })
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
      const m = map
      const add = (el: HTMLElement, lat: number, lng: number, pin: Pin) => {
        el.addEventListener('click', (e) => { e.stopPropagation(); setSel(pin) })
        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m)
      }
      const round = (src: string | null | undefined, size: number, border: string, label?: string, faded = false) => {
        const el = document.createElement('div')
        Object.assign(el.style, { width: `${size}px`, height: `${size}px`, borderRadius: '999px', border, background: '#d6d3d1 center/cover no-repeat',
          backgroundImage: src ? `url("${src.replace(/"/g, '%22')}")` : '', boxShadow: '0 3px 10px rgba(0,0,0,.25)', cursor: 'pointer', position: 'relative', opacity: faded ? '0.8' : '1' })
        if (label) {
          const b = document.createElement('span'); b.textContent = label
          Object.assign(b.style, { position: 'absolute', top: '-6px', left: '-6px', width: '22px', height: '22px', borderRadius: '999px', background: '#c8102e', color: '#fff',
            font: '700 12px Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' })
          el.appendChild(b)
        }
        return el
      }
      const small = (txt: string, color: string, radius: string) => {
        const el = document.createElement('div'); el.textContent = txt
        Object.assign(el.style, { width: '24px', height: '24px', borderRadius: radius, background: '#fff', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', cursor: 'pointer' })
        return el
      }
        // other halal food nearby (faded), stations, prayer rooms
      const usedIds = new Set(stops.map((s) => s.p.id))
      const region = hotel.region
      const others = stops.length ? foodNear(places, stops[0].p, region, 8).filter((p) => !usedIds.has(p.id) && near({ lat: p.lat!, lng: p.lng! }, 2)) : []
      for (const p of others) add(round(photo(p), 34, '3px solid #fff', undefined, true), p.lat!, p.lng!, { key: p.id, name: p.name, lat: p.lat!, lng: p.lng!, sub: `Other halal food · ${p.halal}`, photo: photo(p) })
      for (const st of STATIONS.filter((s) => near(s, 0.9))) add(small('🚉', '#0f766e', '6px'), st.lat, st.lng, { key: 'st' + st.name + st.lat, name: `${st.name} station`, lat: st.lat, lng: st.lng, sub: st.ja })
      for (const mo of MOSQUES.filter((x) => near(x, 1.5))) add(small(mo.kind === 'mosque' ? '🕌' : '🤲', '#059669', '999px'), mo.lat, mo.lng, { key: 'mo' + mo.name, name: mo.name, lat: mo.lat, lng: mo.lng, sub: mo.kind === 'mosque' ? 'Mosque' : 'Prayer room' })
      // hotel + numbered stops on top
      const h = document.createElement('div'); h.textContent = '🏯'
      Object.assign(h.style, { width: '44px', height: '44px', borderRadius: '999px', background: '#fff', border: '4px solid #c8102e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', cursor: 'pointer' })
      add(h, hotel.lat, hotel.lng, { key: 'hotel', name: hotel.name, lat: hotel.lat, lng: hotel.lng, sub: `Start ${clock(tl.start)} · back ${clock(tl.end)}` })
      stops.forEach((s, i) => add(round(photo(s.p), 60, s.food ? '4px solid #1f1a17' : '4px solid #fff', String(i + 1)), s.p.lat!, s.p.lng!,
        { key: s.p.id, name: `${i + 1} · ${s.names}`, lat: s.p.lat!, lng: s.p.lng!, sub: `${legText(s.leg)} · arrive ~${clock(s.arrive)}`, photo: photo(s.p) }))
      const b = new maplibregl.LngLatBounds()
      pts.forEach((p) => b.extend([p.lng, p.lat]))
      const fit = () => { m.resize(); m.fitBounds(b, { padding: { top: 64, bottom: 40, left: 44, right: 44 }, maxZoom: 15, duration: 0 }) }
      fit()
      // the sheet may still be settling (iPhone toolbars, slide-up): re-measure whenever the box changes size
      const ro = new ResizeObserver(() => fit())
      if (box.current) ro.observe(box.current)
      stopResize = () => ro.disconnect()
      // route lines + arrows need the map style, so they wait for 'load'
      m.on('load', () => {
        fit()
        const coords = [[hotel.lng, hotel.lat], ...stops.map((s) => [s.p.lng!, s.p.lat!]), [hotel.lng, hotel.lat]]
        const legs = coords.slice(1).map((c, i) => ({ type: 'Feature' as const, properties: { home: i === coords.length - 2 ? 1 : 0 }, geometry: { type: 'LineString' as const, coordinates: [coords[i], c] } }))
          .filter((f) => km({ lat: f.geometry.coordinates[0][1], lng: f.geometry.coordinates[0][0] }, { lat: f.geometry.coordinates[1][1], lng: f.geometry.coordinates[1][0] }) > 0.02)
        m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: legs } })
        m.addLayer({ id: 'route', type: 'line', source: 'route', filter: ['==', ['get', 'home'], 0], layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#c8102e', 'line-width': 4, 'line-opacity': 0.85 } })
        // last leg back to the hotel: dashed (dasharray can't depend on data, so it's its own layer)
        m.addLayer({ id: 'route-home', type: 'line', source: 'route', filter: ['==', ['get', 'home'], 1], layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#c8102e', 'line-width': 4, 'line-opacity': 0.7, 'line-dasharray': [0.5, 2] } })
        // direction arrows drawn ON the lines by the map itself (always point the way you travel, at any zoom/rotation)
        const c = document.createElement('canvas'); c.width = 24; c.height = 24
        const g = c.getContext('2d')!
        g.fillStyle = '#c8102e'; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.lineJoin = 'round'
        g.beginPath(); g.moveTo(5, 4); g.lineTo(20, 12); g.lineTo(5, 20); g.lineTo(9, 12); g.closePath(); g.stroke(); g.fill()
        m.addImage('arrow', g.getImageData(0, 0, 24, 24), { pixelRatio: 2 })
        m.addLayer({ id: 'route-arrows', type: 'symbol', source: 'route',
          layout: { 'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'arrow', 'icon-size': 1.6, 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } })
        // leg times: a small chip at each leg's middle (not rotated)
        const times = [...stops.map((s) => legText(s.leg)), legText(tl.back)]
        coords.slice(1).forEach((c2, i) => {
          const a = coords[i]
          if (km({ lat: a[1], lng: a[0] }, { lat: c2[1], lng: c2[0] }) < 0.15) return // too short to label without covering the pins
          const el = document.createElement('div')
          el.textContent = times[i]
          Object.assign(el.style, { background: '#fff', borderRadius: '999px', padding: '1px 7px', font: '600 11px Inter, sans-serif', boxShadow: '0 1px 3px rgba(0,0,0,.25)', whiteSpace: 'nowrap', pointerEvents: 'none' })
          new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([(a[0] + c2[0]) / 2, (a[1] + c2[1]) / 2]).addTo(m)
        })
      })
    })
    return () => { cancelled = true; stopResize(); map?.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops])

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col justify-end bg-ink/45" onClick={onClose}>
      <div className="mx-auto flex h-[92vh] h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Route map">
        <div className="flex items-center gap-2 px-4 py-3">
          <h3 className="flex-1 font-display text-xl">{dayLabel(date, { weekday: 'short', day: 'numeric' })} · route</h3>
          <button onClick={onClose} aria-label="Close map" className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="relative flex-1">
          <div ref={box} className="absolute inset-0" />
          <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5 text-[11px]">
            <span className="rounded-full border border-stone-200 bg-white/95 px-2 py-1 font-semibold">🔴 Today's route</span>
            <span className="rounded-full border border-stone-200 bg-white/95 px-2 py-1">○ Other halal food</span>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-stone-200 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {sel ? (
            <>
              {sel.photo ? <img src={sel.photo} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-xl object-cover" /> : <span className="text-3xl">📍</span>}
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{sel.name}</p><p className="truncate text-xs text-stone-500">{sel.sub}</p></div>
              <a href={directionsUrl(sel.lat, sel.lng, sel.name)} target="_blank" rel="noreferrer" className="flex h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white">Directions ↗</a>
            </>
          ) : <p className="flex-1 py-2 text-center text-sm text-stone-500">Tap a picture for directions</p>}
        </div>
      </div>
    </div>
  )
}
