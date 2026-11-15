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
 * The day's stops as numbered photo pins 🏯 ① ② ③; 🚶/🚕 legs follow real roads (red), 🚆 legs a straight blue line; other halal food (faded) joined by faint grey MST lines;
 * 🚉 stations, 🕌 prayer rooms nearby. Tap a pin → card → "Directions": Apple Maps on iPhone, Google Maps elsewhere.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
/** Road route between two points (OpenStreetMap routing, free, no key). null if it fails: caller draws a straight line. */
const ROUTE_CACHE = new Map<string, [number, number][] | null>()
async function roadRoute(a: [number, number], b: [number, number], mode: 'foot' | 'car') {
  const k = `${mode}:${a.map((x) => x.toFixed(5))};${b.map((x) => x.toFixed(5))}`
  if (ROUTE_CACHE.has(k)) return ROUTE_CACHE.get(k)!
  let out: [number, number][] | null = null
  try {
    const r = await fetch(`https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(6000) })
    const j = r.ok ? await r.json() : null
    out = j?.routes?.[0]?.geometry?.coordinates ?? null
  } catch { out = null }
  ROUTE_CACHE.set(k, out)
  return out
}
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
      // NB: never set `position` on a marker element: maplibre positions it (position:absolute + transform).
      // Overriding it made the photo pins drift when zooming. The badge sits in an inner relative box.
      const round = (src: string | null | undefined, size: number, border: string, label?: string, faded = false) => {
        const el = document.createElement('div')
        Object.assign(el.style, { width: `${size}px`, height: `${size}px`, cursor: 'pointer', opacity: faded ? '0.8' : '1' })
        const inner = document.createElement('div')
        Object.assign(inner.style, { position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: '999px', border, background: '#d6d3d1 center/cover no-repeat',
          backgroundImage: src ? `url("${src.replace(/"/g, '%22')}")` : '', boxShadow: '0 2px 6px rgba(0,0,0,.25)' })
        if (label) {
          const b = document.createElement('span'); b.textContent = label
          Object.assign(b.style, { position: 'absolute', top: '-6px', left: '-6px', width: '18px', height: '18px', borderRadius: '999px', background: '#c8102e', color: '#fff',
            font: '700 11px Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' })
          inner.appendChild(b)
        }
        el.appendChild(inner)
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
      for (const p of others) add(round(photo(p), 26, '2px solid #fff', undefined, true), p.lat!, p.lng!, { key: p.id, name: p.name, lat: p.lat!, lng: p.lng!, sub: `Other halal food · ${p.halal}`, photo: photo(p) })
      for (const st of STATIONS.filter((s) => near(s, 0.9))) add(small('🚉', '#0f766e', '6px'), st.lat, st.lng, { key: 'st' + st.name + st.lat, name: `${st.name} station`, lat: st.lat, lng: st.lng, sub: st.ja })
      for (const mo of MOSQUES.filter((x) => near(x, 1.5))) add(small(mo.kind === 'mosque' ? '🕌' : '🤲', '#059669', '999px'), mo.lat, mo.lng, { key: 'mo' + mo.name, name: mo.name, lat: mo.lat, lng: mo.lng, sub: mo.kind === 'mosque' ? 'Mosque' : 'Prayer room' })
      // hotel + numbered stops on top
      const h = document.createElement('div'); h.textContent = '🏯'
      Object.assign(h.style, { width: '44px', height: '44px', borderRadius: '999px', background: '#fff', border: '4px solid #c8102e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', cursor: 'pointer' })
      add(h, hotel.lat, hotel.lng, { key: 'hotel', name: hotel.name, lat: hotel.lat, lng: hotel.lng, sub: `Start ${clock(tl.start)} · back ${clock(tl.end)}` })
      stops.forEach((s, i) => add(round(photo(s.p), 40, s.food ? '3px solid #1f1a17' : '3px solid #fff', String(i + 1)), s.p.lat!, s.p.lng!,
        { key: s.p.id, name: `${i + 1} · ${s.names}`, lat: s.p.lat!, lng: s.p.lng!, sub: `${legText(s.leg)} · arrive ~${clock(s.arrive)}`, photo: photo(s.p) }))
      const b = new maplibregl.LngLatBounds()
      pts.forEach((p) => b.extend([p.lng, p.lat]))
      const fit = () => { m.resize(); m.fitBounds(b, { padding: { top: 64, bottom: 40, left: 44, right: 44 }, maxZoom: 15, duration: 0 }) }
      fit()
      // the sheet may still be settling (iPhone toolbars, slide-up): re-measure whenever the box changes size
      const ro = new ResizeObserver(() => fit())
      if (box.current) ro.observe(box.current)
      stopResize = () => ro.disconnect()
      m.on('load', async () => {
        fit()
        // 🚶/🚕 legs follow real roads (free OpenStreetMap routing, fallback: straight); 🚆 legs = straight blue line
        const legs = [...stops.map((s, i) => ({ a: i === 0 ? hotel : stops[i - 1].p, b: s.p, leg: s.leg })), ...(stops.length ? [{ a: stops[stops.length - 1].p, b: hotel, leg: tl.back }] : [])]
          .map((l) => ({ a: [l.a.lng!, l.a.lat!] as [number, number], b: [l.b.lng!, l.b.lat!] as [number, number], leg: l.leg }))
        const road = await Promise.all(legs.map((l) => l.leg.walk || l.leg.car ? roadRoute(l.a, l.b, l.leg.walk ? 'foot' : 'car') : Promise.resolve(null)))
        if (cancelled) return
        const feat = (coords: [number, number][], kind: string) => ({ type: 'Feature' as const, properties: { kind }, geometry: { type: 'LineString' as const, coordinates: coords } })
        const lines = legs.map((l, i) => feat(road[i] ?? [l.a, l.b], l.leg.walk || l.leg.car ? (road[i] ? 'road' : 'straight') : 'train'))
        // other halal food joined to the route like a minimum spanning tree (Prim's, the route counts as already connected)
        const tree: ReturnType<typeof feat>[] = []
        const inTree: [number, number][] = [[hotel.lng, hotel.lat], ...stops.map((s) => [s.p.lng!, s.p.lat!] as [number, number])]
        const left = others.map((p) => [p.lng!, p.lat!] as [number, number])
        const d = (x: [number, number], y: [number, number]) => km({ lat: x[1], lng: x[0] }, { lat: y[1], lng: y[0] })
        while (left.length) {
          let bi = 0, bj = 0, bd = Infinity
          left.forEach((q, i) => inTree.forEach((t, j) => { const dd = d(q, t); if (dd < bd) { bd = dd; bi = i; bj = j } }))
          tree.push(feat([inTree[bj], left[bi]], 'mst')); inTree.push(left[bi]); left.splice(bi, 1)
        }
        m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [...tree, ...lines] } })
        const before = m.getStyle().layers?.find((l) => l.type === 'symbol')?.id
        m.addLayer({ id: 'mst', type: 'line', source: 'route', filter: ['==', ['get', 'kind'], 'mst'], paint: { 'line-color': '#a8a29e', 'line-width': 1.5, 'line-opacity': 0.55 } }, before)
        m.addLayer({ id: 'train', type: 'line', source: 'route', filter: ['==', ['get', 'kind'], 'train'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.8 } }, before)
        m.addLayer({ id: 'road', type: 'line', source: 'route', filter: ['in', ['get', 'kind'], ['literal', ['road', 'straight']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c8102e', 'line-width': 4, 'line-opacity': 0.85 } }, before)
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
        <div className="relative min-h-0 flex-1">
          {/* maplibre sets position:relative on its container, so the container can't be the absolute layer itself */}
          <div className="absolute inset-0"><div ref={box} className="h-full w-full" /></div>
          <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5 text-[11px]">
            <span className="rounded-full border border-stone-200 bg-white/95 px-2 py-1 font-semibold"><span className="text-torii">━</span> walk/taxi · <span className="text-blue-600">━</span> train</span>
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
