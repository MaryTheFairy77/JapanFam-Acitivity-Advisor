import { useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, X } from 'lucide-react'
import { ago, inJapan, useFamilySpots, useLocationSharing, useMyPosition } from '../geo'
import { MOSQUES, mosqueLink, mosquesNear, type Mosque } from '../mosques'
import maplibregl, { type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { CATEGORIES, catOf, HOTELS, HOTEL_IDS, REGIONS, displayName, estimateTravel, fmtMin, fmtYen, km, nearestHotel, isStoragePhoto, regionOf, safeUrl, type HotelId, type Member, type Place, type Region } from '../lib'

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
function meDot() {
  const outer = document.createElement('div')
  const el = document.createElement('div')
  outer.appendChild(el)
  Object.assign(el.style, { width: '18px', height: '18px', borderRadius: '9999px', background: '#3b82f6', border: '3px solid #fff', boxShadow: '0 0 0 6px rgba(59,130,246,.25), 0 2px 6px rgba(0,0,0,.3)' })
  return outer
}

export default function MapView({ me, members, places, voteCount, photoUrls, onOpen, onHotel }: {
  me: Member; members: Member[]
  places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>; onOpen: (p: Place) => void; onHotel: (id: HotelId) => void
}) {
  // 📍 Places mode (pins) or 👨‍👩‍👧 Family mode (where is everyone)
  const [mode, setMode] = useState<'places' | 'family'>('places')
  const { pos, busy, err: posErr, locate } = useMyPosition()
  const [nearOpen, setNearOpen] = useState(false)
  const share = useLocationSharing(me.id, mode === 'family')
  const spots = useFamilySpots(mode === 'family')
  const [mosquesOn, setMosquesOn] = useState<boolean>(() => { try { return localStorage.getItem('jf-mosques') !== '0' } catch { return true } })
  const toggleMosques = () => setMosquesOn((v) => { try { localStorage.setItem('jf-mosques', v ? '0' : '1') } catch { /* ignore */ } return !v })
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
  const [show, setShow] = useState<'all' | 'restaurant' | 'activity'>('all')
  // shopping is hidden by default (there are lots of shops); remembered per phone
  const [shops, setShops] = useState<boolean>(() => { try { return localStorage.getItem('japanfam.mapShops') === '1' } catch { return false } })
  const toggleShops = () => setShops((v) => { try { localStorage.setItem('japanfam.mapShops', v ? '0' : '1') } catch { /* ignore */ } return !v })
  const nShops = pinned.filter((p) => p.category === 'shopping').length
  const visible = useMemo(() => pinned.filter((p) => (show === 'all' || p.kind === show) && (shops || p.category !== 'shopping')), [pinned, show, shops])
  // mosques/prayer rooms within 2 km of any of our places or hotels (not every mosque in Japan)
  const mosques = useMemo<Mosque[]>(() => {
    const anchors = [...pinned.map((p) => ({ lat: p.lat!, lng: p.lng! })), ...HOTEL_IDS.map((h) => HOTELS[h])]
    return MOSQUES.filter((q) => anchors.some((a) => km(a, q) <= 2))
  }, [pinned])
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
      m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
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
    if (mode === 'family') {
      for (const s of spots) {
        const mem = members.find((x) => x.id === s.member_id)
        if (!mem) continue
        const pin = bubble(mem.emoji, s.member_id === me.id ? '#3b82f6' : '#10b981', 40)
        const sub = `${ago(s.updated_at)}${s.accuracy_m ? ` · ±${s.accuracy_m} m` : ''}`
        add(pin, s.lat, s.lng, new maplibregl.Popup({ offset: 22, closeButton: false }).setDOMContent(simplePopup(displayName(mem), sub, s.lat, s.lng)))
      }
    }
    if (mode === 'places' && mosquesOn) {
      for (const q of mosques) {
        add(bubble(q.kind === 'prayer_room' ? '🤲' : '🕌', '#059669', 28), q.lat, q.lng, new maplibregl.Popup({ offset: 16, closeButton: false })
          .setDOMContent(simplePopup(q.name, `${q.kind === 'prayer_room' ? 'Prayer room' : 'Mosque'}${q.note ? ` · ${q.note}` : ''}`, q.lat, q.lng,
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
    for (const id of HOTEL_IDS) {
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
  }, [visible, voteCount, photoUrls, ready, mode, spots, members, me.id, mosques, mosquesOn, pos])

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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2 p-3">
        <div className="pointer-events-auto flex gap-2 overflow-x-auto">
          <button data-sound="tab" className={chip(view === 'kansai')} onClick={() => setView('kansai')}>🦌 {REGIONS.kansai.label}</button>
          <button data-sound="tab" className={chip(view === 'kanto')} onClick={() => setView('kanto')}>🗼 {REGIONS.kanto.label}</button>
          <button data-sound="tab" className={chip(view === 'all')} onClick={() => setView('all')}>🗾 All</button>
        </div>
        <div className="pointer-events-auto flex w-fit rounded-full border border-indigo-300 bg-white/95 p-0.5 text-sm shadow-sm">
          <button data-sound="tab" onClick={() => setMode('places')} className={`rounded-full px-3 py-1 ${mode === 'places' ? 'bg-indigo-500 text-white' : 'text-indigo-500'}`}>📍 Places</button>
          <button data-sound="tab" onClick={() => { setMode('family'); setNearOpen(false) }} className={`rounded-full px-3 py-1 ${mode === 'family' ? 'bg-indigo-500 text-white' : 'text-indigo-500'}`}>👨‍👩‍👧 Family</button>
        </div>
        {mode === 'places' && <div className="pointer-events-auto flex gap-2 overflow-x-auto">
          <button className={chip(show === 'all')} onClick={() => setShow('all')}>Everything</button>
          <button className={chip(show === 'restaurant')} onClick={() => setShow('restaurant')}>🍜 Food</button>
          <button className={chip(show === 'activity')} onClick={() => setShow('activity')}>🎢 Activities</button>
          {nShops > 0 && show !== 'restaurant' && (
            <button className={chip(shops)} onClick={toggleShops} title={shops ? 'Hide shopping' : 'Show shopping'}>
              🛍️ {shops ? '' : `+${nShops}`}
            </button>
          )}
          {mosques.length > 0 && (
            <button className={chip(mosquesOn)} onClick={toggleMosques} title={mosquesOn ? 'Hide mosques' : 'Show mosques'}>🕌</button>
          )}
        </div>}
      </div>

      {/* 📍 Near me */}
      <button onClick={async () => {
          const p = await locate()
          if (!p || !map.current) return
          map.current.flyTo({ center: ll(p.lat, p.lng), zoom: 15, duration: 900 })
          if (mode === 'places') setNearOpen(true)
        }}
        aria-label="Near me" title="Show where I am"
        className={`absolute right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-indigo-300 bg-white shadow-lg ${busy ? 'animate-pulse' : ''}`}>
        <LocateFixed className="h-5 w-5 text-indigo-600" />
      </button>
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

      {/* Family mode: share toggle + who's where */}
      {mode === 'family' && (
        <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl bg-white/97 p-3 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{me.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{share.sharing ? 'You’re sharing your spot' : 'Your spot is private'}</p>
              <p className="text-[11px] text-stone-500">{share.sharing
                ? `${share.status ?? 'Starting…'} · only while the app is open · stops at midnight Japan time`
                : 'Japan only · only while the app is open · auto-off at midnight'}</p>
            </div>
            <button onClick={() => (share.sharing ? share.stop() : share.start())}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${share.sharing ? 'border border-stone-300 bg-white text-stone-700' : 'bg-emerald-600 text-white'}`}>
              {share.sharing ? 'Stop' : 'Share'}
            </button>
          </div>
          <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
            {spots.length === 0 && <p className="text-xs text-stone-500">Nobody is sharing right now. In Japan, tap Share so the family can find you.</p>}
            {spots.map((s) => {
              const mem = members.find((x) => x.id === s.member_id)
              if (!mem) return null
              return (
                <button key={s.member_id} onClick={() => map.current?.flyTo({ center: ll(s.lat, s.lng), zoom: 16, duration: 800 })}
                  className="flex shrink-0 flex-col items-center rounded-xl bg-stone-50 px-2.5 py-1.5">
                  <span className="text-xl">{mem.emoji}</span>
                  <span className="max-w-[4.5rem] truncate text-[11px] font-medium">{displayName(mem)}</span>
                  <span className="text-[10px] text-stone-500">{ago(s.updated_at)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {unpinned > 0 && mode === 'places' && !nearOpen && (
        <div className="absolute bottom-3 left-3 right-12 z-10 rounded-xl bg-white/95 px-3 py-2 text-xs text-stone-600 shadow">
          📌 {unpinned} place{unpinned === 1 ? '' : 's'} not on the map yet. Open one and tap <b>Find pin</b>.
        </div>
      )}
    </div>
  )
}
