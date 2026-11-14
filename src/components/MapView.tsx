import { useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, Umbrella, X } from 'lucide-react'
import { inJapan, tripToolsOn, useMyPosition } from '../geo'
import { useStations, useWeather, walkTo } from '../extras'
import { MOSQUES, mosqueLink, mosquesNear, type Mosque } from '../mosques'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CATEGORIES, catOf, HOTELS, HOTEL_IDS, REGIONS, estimateTravel, fmtMin, fmtYen, km, nearestHotel, isStoragePhoto, regionOf, safeUrl, type HotelId, type Member, type Place, type Region } from '../lib'

type View = Region | 'all'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/** Washi-pastel palette applied on top of OpenFreeMap's minimal "Positron" style. */
const PASTEL = {
  land: '#fbf3e6', water: '#bfdcf3', waterLine: '#a7cbea', park: '#dcecd2', wood: '#d3e7c8',
  building: '#f2e6d6', road: '#ffffff', major: '#f8dfe4', rail: '#e7d3c3', boundary: '#d9b8c4',
  label: '#6b5e57', halo: '#fffaf3', waterLabel: '#5b88b0',
}

export function pastelize(style: StyleSpecification): StyleSpecification {
  for (const l of style.layers) {
    const id = l.id.toLowerCase()
    const layer = l as { paint?: Record<string, unknown> }
    const p = (layer.paint ??= {})
    if (l.type === 'background') p['background-color'] = PASTEL.land
    else if (l.type === 'fill') {
      if (/water|ocean|lake|river/.test(id)) p['fill-color'] = PASTEL.water
      else if (/wood|forest/.test(id)) p['fill-color'] = PASTEL.wood
      else if (/park|grass|landcover|landuse|green|pitch|cemetery/.test(id)) p['fill-color'] = PASTEL.park
      else if (/building/.test(id)) p['fill-color'] = PASTEL.building
      else if (/land|earth/.test(id)) p['fill-color'] = PASTEL.land
    } else if (l.type === 'line') {
      if (/waterway|river|stream|canal/.test(id)) p['line-color'] = PASTEL.waterLine
      else if (/motorway|trunk|primary|major/.test(id)) p['line-color'] = PASTEL.major
      else if (/rail|transit/.test(id)) p['line-color'] = PASTEL.rail
      else if (/boundary|admin/.test(id)) p['line-color'] = PASTEL.boundary
      else if (/road|highway|street|minor|path|bridge|tunnel|transportation/.test(id)) p['line-color'] = PASTEL.road
    } else if (l.type === 'symbol') {
      p['text-color'] = /water|ocean|sea|lake|river/.test(id) ? PASTEL.waterLabel : PASTEL.label
      p['text-halo-color'] = PASTEL.halo
    }
  }
  return style
}

const ll = (lat: number, lng: number): [number, number] => [lng, lat]

/** Round emoji bubble used for pins (DOM element, no innerHTML with user data).
 *  The OUTER element is handed to MapLibre, which positions it absolutely — so never style its `position`. */
function bubble(emoji: string, ring: string, size: number, badge?: number, faded?: boolean, generated?: boolean) {
  const outer = document.createElement('div')
  const el = document.createElement('div')
  outer.appendChild(el)
  Object.assign(el.style, {
    width: `${size}px`, height: `${size}px`, borderRadius: '9999px', background: '#fff', border: `3px solid ${ring}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${size * 0.5}px`,
    boxShadow: '0 3px 8px rgba(0,0,0,.18)', position: 'relative', cursor: 'pointer',
    opacity: faded ? '0.55' : '1', filter: faded ? 'grayscale(.6)' : 'none',
  })
  el.textContent = emoji
  if (generated) {
    el.title = 'Location found automatically (✨ not yet confirmed)'
    const g = document.createElement('span')
    Object.assign(g.style, { position: 'absolute', bottom: '-7px', right: '-7px', fontSize: '12px', lineHeight: '1', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))' })
    g.textContent = '✨'
    el.appendChild(g)
  }
  if (badge) {
    const b = document.createElement('span')
    Object.assign(b.style, {
      position: 'absolute', top: '-6px', right: '-6px', background: '#c8102e', color: '#fff', font: '600 10px Inter,sans-serif',
      borderRadius: '9999px', minWidth: '16px', height: '16px', padding: '0 4px', display: 'flex', alignItems: 'center',
      justifyContent: 'center', border: '2px solid #fff',
    })
    b.textContent = String(badge)
    el.appendChild(b)
  }
  return outer
}

/** Build popup content with textContent only (place names are user input). */
function popupFor(p: Place, votes: number, photo: string | undefined, onOpen: () => void) {
  const root = document.createElement('div')
  root.style.minWidth = '170px'
  if (photo) {
    const img = document.createElement('img')
    img.src = photo; img.alt = ''; img.referrerPolicy = 'no-referrer'
    Object.assign(img.style, { width: '100%', height: '96px', objectFit: 'cover', borderRadius: '10px', marginBottom: '6px', display: 'block' })
    img.onerror = () => img.remove()
    root.appendChild(img)
  }
  const line = (text: string, style: Partial<CSSStyleDeclaration> = {}) => {
    const d = document.createElement('div'); d.textContent = text; Object.assign(d.style, style); root.appendChild(d)
  }
  line(`${p.name}${p.visited ? ' ✓' : ''}`, { fontWeight: '600', fontSize: '14px' })
  if (p.description) line(p.description, { color: '#57534e' })
  line(`${fmtYen(p.price_jpy)} · 🚗 ${fmtMin(p.travel_minutes)} · ⏱ ${fmtMin(p.wait_minutes)}`)
  const h = nearestHotel(p)
  if (h) line(`${h.km.toFixed(1)} km from ${HOTELS[h.id].short}`, { color: '#57534e' })
  line(`▲ ${votes} votes`)
  const links = document.createElement('div')
  Object.assign(links.style, { display: 'flex', gap: '10px', marginTop: '4px' })
  const a = (label: string, href?: string) => {
    if (!href) return
    const el = document.createElement('a'); el.textContent = label; el.href = href; el.target = '_blank'; el.rel = 'noreferrer'; links.appendChild(el)
  }
  a('📍 Maps', safeUrl(p.maps_url)); a('🌐 Info', safeUrl(p.website_url))
  const more = document.createElement('a'); more.textContent = 'Details →'; more.href = '#'
  more.onclick = (e) => { e.preventDefault(); onOpen() }
  links.appendChild(more)
  root.appendChild(links)
  return root
}

/** Small DOM popup: title, sub line, and a walking-directions link (all textContent, no user HTML). */
function simplePopup(title: string, sub: string, lat: number, lng: number, href?: string, linkText = '🚶 Walking directions') {
  const root = document.createElement('div')
  root.style.minWidth = '150px'
  const t = document.createElement('div'); t.textContent = title; Object.assign(t.style, { fontWeight: '600', fontSize: '14px' }); root.appendChild(t)
  const s = document.createElement('div'); s.textContent = sub; s.style.color = '#57534e'; root.appendChild(s)
  const a = document.createElement('a'); a.textContent = linkText; a.target = '_blank'; a.rel = 'noreferrer'
  a.href = href ?? `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=walking`
  a.style.display = 'block'; a.style.marginTop = '4px'; root.appendChild(a)
  return root
}

/** Blue "you are here" dot. */
/** Small teal station marker (tap for the name + walking directions). */
function stationPin() {
  const outer = document.createElement('div')
  const el = document.createElement('div')
  outer.appendChild(el)
  Object.assign(el.style, { width: '22px', height: '22px', borderRadius: '6px', background: '#fff', border: '2px solid #0f766e',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.2)' })
  el.textContent = '🚉'
  return outer
}

function meDot() {
  const outer = document.createElement('div')
  const el = document.createElement('div')
  outer.appendChild(el)
  Object.assign(el.style, { width: '18px', height: '18px', borderRadius: '9999px', background: '#3b82f6', border: '3px solid #fff', boxShadow: '0 0 0 6px rgba(59,130,246,.25), 0 2px 6px rgba(0,0,0,.3)' })
  return outer
}

export default function MapView({ places, voteCount, photoUrls, onOpen, onHotel }: {
  me: Member; members: Member[]
  places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>; onOpen: (p: Place) => void; onHotel: (id: HotelId) => void
}) {
  const { pos, busy, err: posErr, locate } = useMyPosition()
  const mode = 'places' as const
  const [nearOpen, setNearOpen] = useState(false)
  // trip-only tool (Near me) appears 26 Dec – 8 Jan
  const trip = tripToolsOn()
  // legend strip = the key AND the on/off switches (remembered per phone)
  type Layer = 'food' | 'act' | 'shop' | 'mosque' | 'station'
  const [layers, setLayers] = useState<Record<Layer, boolean>>(() => {
    const def = { food: true, act: true, shop: false, mosque: true, station: true }
    try { return { ...def, ...JSON.parse(localStorage.getItem('jf-map-layers') ?? '{}') } } catch { return def }
  })
  const saveLayers = (n: Record<Layer, boolean>) => { try { localStorage.setItem('jf-map-layers', JSON.stringify(n)) } catch { /* ignore */ } return n }
  const toggle = (k: Layer) => setLayers((l) => saveLayers({ ...l, [k]: !l[k] }))
  const everything = layers.food && layers.act && layers.shop && layers.mosque && layers.station
  // 🎌 Everything: turn every layer on (tap again to go back to the usual view without shops)
  const toggleEverything = () => setLayers(() => saveLayers(everything
    ? { food: true, act: true, shop: false, mosque: true, station: true }
    : { food: true, act: true, shop: true, mosque: true, station: true }))
  const mosquesOn = layers.mosque
  const [noteHidden, setNoteHidden] = useState(() => { try { return sessionStorage.getItem('jf-pin-note') === '1' } catch { return false } })
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  const hotelRef = useRef(onHotel)
  hotelRef.current = onHotel
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const pinned = useMemo(() => places.filter((p) => p.lat != null && p.lng != null), [places])
  const unpinned = places.length - pinned.length
  const [view, setView] = useState<View>(() => {
    const k = pinned.filter((p) => regionOf(p) === 'kansai').length
    return k > pinned.length - k ? 'kansai' : 'kanto'
  })
  const visible = useMemo(() => pinned.filter((p) =>
    p.kind === 'restaurant' ? layers.food : catOf(p) === 'shopping' ? layers.shop : layers.act), [pinned, layers])
  // mosques/prayer rooms within 2 km of any of our places or hotels (not every mosque in Japan)
  const mosques = useMemo<Mosque[]>(() => {
    const anchors = [...pinned.map((p) => ({ lat: p.lat!, lng: p.lng! })), ...HOTEL_IDS.map((h) => HOTELS[h])]
    return MOSQUES.filter((q) => q.popular || anchors.some((a) => km(a, q) <= 2))
  }, [pinned])
  // 🚉 stations near our hotels + places (OpenStreetMap, cached on the phone)
  const stationAnchors = useMemo(() => [...pinned.map((p) => ({ lat: p.lat!, lng: p.lng! })), ...HOTEL_IDS.map((h) => HOTELS[h])], [pinned])
  const stations = useStations(layers.station, stationAnchors)
  // ☂ today's weather for the city on screen (Open-Meteo, free)
  const weather = useWeather(view === 'all' ? null : view)
  // nearest places to me (for the 📍 card)
  const nearest = useMemo(() => pos ? visible.map((p) => ({ p, d: km(pos, { lat: p.lat!, lng: p.lng! }) })).sort((a, b) => a.d - b.d).slice(0, 5) : [], [pos, visible])
  const nearestMosque = useMemo(() => pos ? mosquesNear(pos, 1)[0] ?? null : null, [pos])

  // create the map once
  useEffect(() => {
    let cancelled = false
    const start = REGIONS[view === 'all' ? 'kanto' : view]
    fetch(STYLE_URL).then((r) => r.json()).then((style: StyleSpecification) => {
      if (cancelled || !box.current) return
      const m = new maplibregl.Map({
        container: box.current, style: pastelize(style),
        center: ll(...start.center), zoom: start.zoom - 0.5, attributionControl: false,
      })
      // compact ⓘ credit (OpenStreetMap licence requires visible credit; full list is in T&Cs → References)
      m.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right')
      // start collapsed as a small ⓘ (MapLibre opens it on first load)
      const collapse = () => box.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      m.once('idle', collapse); setTimeout(collapse, 50)
      m.on('load', () => {
        m.addSource('strings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        m.addLayer({ id: 'strings', type: 'line', source: 'strings',
          paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.45, 'line-dasharray': [2, 3] } })
        setReady(true)
      })
      map.current = m
    }).catch(() => setFailed(true))
    return () => { cancelled = true; map.current?.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // fly between regions
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    if (view === 'all') m.flyTo({ center: ll(35.4, 137.6), zoom: 6.3, duration: 900 })
    else m.flyTo({ center: ll(...REGIONS[view].center), zoom: REGIONS[view].zoom - 0.5, duration: 900 })
  }, [view, ready])

  // (re)draw pins + dashed "strings" back to the nearest hotel
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    markers.current.forEach((mk) => mk.remove())
    markers.current = []
    const add = (el: HTMLElement, lat: number, lng: number, popup?: maplibregl.Popup) => {
      const mk = new maplibregl.Marker({ element: el }).setLngLat(ll(lat, lng))
      if (popup) mk.setPopup(popup)
      markers.current.push(mk.addTo(m))
    }

    if (pos) add(meDot(), pos.lat, pos.lng, new maplibregl.Popup({ offset: 12, closeButton: false }).setText(`You are here (±${pos.accuracy} m)`))
    if (layers.station) {
      for (const st of stations) {
        add(stationPin(), st.lat, st.lng, new maplibregl.Popup({ offset: 12, closeButton: false })
          .setDOMContent(simplePopup(`🚉 ${st.name}`, 'Station', st.lat, st.lng, walkTo(st.lat, st.lng))))
      }
    }
    if (mode === 'places' && mosquesOn) {
      for (const q of mosques) {
        const pin = bubble(q.kind === 'prayer_room' ? '🤲' : '🕌', '#059669', q.popular ? 36 : 28)
        if (q.popular) {
          const star = document.createElement('span')
          Object.assign(star.style, { position: 'absolute', top: '-8px', right: '-8px', fontSize: '14px', lineHeight: '1', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.3))' })
          star.textContent = '⭐'
          pin.firstElementChild?.appendChild(star)
        }
        add(pin, q.lat, q.lng, new maplibregl.Popup({ offset: 16, closeButton: false })
          .setDOMContent(simplePopup(`${q.popular ? '⭐ ' : ''}${q.name}`, `${q.popular ? 'Popular mosque' : q.kind === 'prayer_room' ? 'Prayer room' : 'Mosque'}${q.note ? ` · ${q.note}` : ''}`, q.lat, q.lng,
            mosqueLink(q), q.search ? '📍 Find it on Google Maps' : '🚶 Walking directions')))
      }
    }
    for (const p of mode === 'places' ? visible : []) {
      const popup = new maplibregl.Popup({ offset: 18, closeButton: false })
      popup.setDOMContent(popupFor(p, voteCount[p.id] ?? 0,
        isStoragePhoto(p.image_url) ? photoUrls[p.image_url.slice(8)] : safeUrl(p.image_url), () => { popup.remove(); openRef.current(p) }))
      add(bubble(p.kind === 'restaurant' ? '🍜' : CATEGORIES[catOf(p)].emoji, p.kind === 'restaurant' ? '#f59e0b' : '#6366f1', 34,
        voteCount[p.id], p.visited, (p.auto_fields ?? []).includes('pin')),
        p.lat!, p.lng!, popup)
    }
    for (const id of HOTEL_IDS) { // hotels are always shown
      const h = HOTELS[id]
      // tapping a hotel opens its overview sheet (photos link, how to get in, what's closest)
      const pin = bubble('🏯', '#c8102e', 44)
      pin.style.cursor = 'pointer'; pin.title = h.name
      pin.addEventListener('click', (e) => { e.stopPropagation(); hotelRef.current(id) })
      add(pin, h.lat, h.lng)
    }
    const src = m.getSource('strings') as maplibregl.GeoJSONSource | undefined
    src?.setData({
      type: 'FeatureCollection',
      features: (mode === 'places' ? visible : []).flatMap((p) => {
        const h = nearestHotel(p)
        return h ? [{ type: 'Feature' as const, properties: { color: p.kind === 'restaurant' ? '#c8102e' : '#4f46e5' },
          geometry: { type: 'LineString' as const, coordinates: [ll(p.lat!, p.lng!), ll(HOTELS[h.id].lat, HOTELS[h.id].lng)] } }] : []
      }),
    })
  }, [visible, voteCount, photoUrls, ready, mode, mosques, mosquesOn, pos, stations, layers.station])

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm shadow-sm ${on ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white/95 text-stone-700'}`

  return (
    <div className="relative h-[calc(100dvh-8rem)]">
      <div ref={box} className="japan-map h-full w-full" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-stone-500">
          The map couldn't load. Check your connection and reopen the Map tab.
        </div>
      )}

      {/* Top: one small city switch */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
        <div className="pointer-events-auto flex rounded-full border border-stone-300 bg-white/95 p-0.5 text-sm shadow-sm">
          {([['kanto', '🗼 Tokyo'], ['kansai', '🦌 Osaka'], ['all', '🗾 All']] as const).map(([k, label]) => (
            <button key={k} data-sound="tab" onClick={() => setView(k)}
              className={`rounded-full px-3 py-1 ${view === k ? 'bg-ink text-white' : 'text-stone-600'}`}>{label}</button>
          ))}
        </div>
        {weather && view !== 'all' && (
          <div aria-label={`${view === 'kanto' ? 'Tokyo' : 'Osaka'} today: ${weather.rain ?? '?'}% chance of rain, high ${weather.max}°, low ${weather.min}°`}
            className="flex items-center gap-1 rounded-full border border-stone-200/80 bg-white/80 px-2 py-0.5 text-[11px] text-stone-700 backdrop-blur-sm">
            <Umbrella className="h-3 w-3 text-blue-600" aria-hidden />
            {weather.rain != null && <span>{weather.rain}%</span>}
            <span className="text-stone-400">·</span><span className="font-semibold">{weather.max}°</span><span>/ {weather.min}°</span>
          </div>
        )}
      </div>

      {/* Bottom: legend strip = the key AND the on/off switches */}
      {mode === 'places' && !nearOpen && (
        <div className="absolute inset-x-3 bottom-3 z-10 flex justify-around rounded-2xl border border-stone-200 bg-white/95 px-1 py-1.5 shadow-lg" role="group" aria-label="Map legend: tap to show or hide">
          {([
            ['food', '🍜', 'Food', '#f59e0b'],
            ['act', '🎢', 'Do', '#6366f1'],
            ['shop', '🛍️', 'Shops', '#6366f1'],
            ['mosque', '🕌', 'Mosques', '#059669'],
            ['station', '🚉', 'Stations', '#0f766e'],
          ] as const).map(([k, icon, label, ring]) => (
            <button key={k} onClick={() => toggle(k)} aria-pressed={layers[k]} data-sound="tap"
              title={`${layers[k] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
              className={`flex min-w-[3rem] flex-col items-center gap-0.5 rounded-xl px-1 py-0.5 text-[11px] transition ${layers[k] ? 'text-stone-800' : 'text-stone-400'}`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-base"
                style={layers[k] ? { border: `3px solid ${ring}` } : { border: '2px dashed #d6d3d1', filter: 'grayscale(1)', opacity: 0.55 }}>{icon}</span>
              {label}
            </button>
          ))}
          <button onClick={toggleEverything} aria-pressed={everything} data-sound="tap" title={everything ? 'Back to the usual view' : 'Show everything'}
            className={`flex min-w-[3rem] flex-col items-center gap-0.5 rounded-xl px-1 py-0.5 text-[11px] transition ${everything ? 'text-stone-800' : 'text-stone-500'}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-base ${everything ? 'bg-ink text-white' : 'border-2 border-stone-300 bg-white'}`}>🎌</span>
            Everything
          </button>
        </div>
      )}

      {/* 📍 Near me (trip only) */}
      {trip && <button onClick={async () => {
          const p = await locate()
          if (!p || !map.current) return
          map.current.flyTo({ center: ll(p.lat, p.lng), zoom: 15, duration: 900 })
          if (mode === 'places') setNearOpen(true)
        }}
        aria-label="Near me" title="Show where I am"
        className={`absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-indigo-300 bg-white shadow-lg ${busy ? 'animate-pulse' : ''}`}>
        <LocateFixed className="h-5 w-5 text-indigo-600" />
      </button>}
      {posErr && <div className="absolute right-16 top-1/2 z-10 -translate-y-1/2 max-w-[70%] rounded-xl bg-white/95 px-3 py-2 text-xs text-torii shadow">{posErr}</div>}

      {/* Nearest places to me */}
      {mode === 'places' && nearOpen && pos && (
        <div className="absolute inset-x-3 bottom-3 z-20 max-h-[45%] overflow-y-auto rounded-2xl bg-white/97 p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg">Near you</p>
            <button onClick={() => setNearOpen(false)} aria-label="Close" className="text-stone-400"><X className="h-5 w-5" /></button>
          </div>
          {!inJapan(pos.lat, pos.lng) && <p className="text-xs text-amber-700">You’re not in Japan yet, so these are far away. This works best on the trip.</p>}
          <div className="mt-1 space-y-1">
            {nearest.map(({ p, d }) => (
              <button key={p.id} onClick={() => onOpen(p)} className="flex w-full items-center gap-2 rounded-xl px-1 py-1.5 text-left hover:bg-stone-50">
                <span className="text-lg">{p.kind === 'restaurant' ? '🍜' : CATEGORIES[catOf(p)].emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <span className="shrink-0 text-xs text-stone-500">{d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`} · ~{fmtMin(estimateTravel(d).minutes)}</span>
              </button>
            ))}
            {nearestMosque && (
              <a href={mosqueLink(nearestMosque)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-xl bg-emerald-50 px-1 py-1.5 text-sm">
                <span className="text-lg">🕌</span><span className="min-w-0 flex-1 truncate">{nearestMosque.name}</span>
                <span className="shrink-0 text-xs text-emerald-800">{nearestMosque.d < 1 ? `${Math.round(nearestMosque.d * 1000)} m` : `${nearestMosque.d.toFixed(1)} km`}</span>
              </a>
            )}
          </div>
        </div>
      )}

      {unpinned > 0 && mode === 'places' && !nearOpen && !noteHidden && (
        <div className="absolute bottom-[5.25rem] left-3 right-3 z-10 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-1.5 text-xs text-stone-600 shadow">
          <span className="flex-1">📌 {unpinned} place{unpinned === 1 ? '' : 's'} not on the map yet. Open one and tap <b>Find pin</b>.</span>
          <button onClick={() => { setNoteHidden(true); try { sessionStorage.setItem('jf-pin-note', '1') } catch { /* ignore */ } }} aria-label="Dismiss" className="text-stone-400"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  )
}
