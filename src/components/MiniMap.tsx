import { useEffect, useRef, useState } from 'react'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { STYLE_URL, pastelize } from '../mapStyle'
import { HOTELS, HOTEL_IDS, REGIONS, type HotelId, type Place, type Region } from '../lib'

/**
 * Home's big map card (Maryam's sketch, 20 Nov 2026): the real map, front and centre, but still — tap it to open the full map.
 * Dots: 🍜 food amber, 🎢 activities purple, 🏯 hotels red (bigger). Not interactive, so a scroll over it scrolls the page.
 */
export default function MiniMap({ places, region, hotel }: { places: Place[]; region: Region; hotel: HotelId }) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    let map: maplibregl.Map | null = null
    fetch(STYLE_URL).then((r) => r.json()).then((style: StyleSpecification) => {
      if (cancelled || !box.current) return
      const h = HOTELS[hotel], r = REGIONS[region]
      map = new maplibregl.Map({
        container: box.current, style: pastelize(style), interactive: false, attributionControl: false,
        center: [h.lng, h.lat], zoom: r.zoom + 0.6,
      })
      map.on('load', () => {
        const dots = places.filter((p) => p.lat != null && p.lng != null).map((p) => ({
          type: 'Feature' as const, properties: { c: p.kind === 'restaurant' ? '#f59e0b' : '#6a4cae' },
          geometry: { type: 'Point' as const, coordinates: [p.lng!, p.lat!] },
        }))
        const hotels = HOTEL_IDS.map((id) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [HOTELS[id].lng, HOTELS[id].lat] } }))
        map!.addSource('dots', { type: 'geojson', data: { type: 'FeatureCollection', features: dots } })
        map!.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': 6, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
        map!.addSource('hotels', { type: 'geojson', data: { type: 'FeatureCollection', features: hotels } })
        map!.addLayer({ id: 'hotels', type: 'circle', source: 'hotels', paint: { 'circle-radius': 10, 'circle-color': '#c8102e', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })
      })
    }).catch(() => setFailed(true))
    return () => { cancelled = true; map?.remove() }
  }, [places, region, hotel])
  return failed ? <div className="flex h-full w-full items-center justify-center bg-[#fbf3e6] text-6xl">🗾</div> : <div ref={box} className="h-full w-full" aria-hidden />
}
