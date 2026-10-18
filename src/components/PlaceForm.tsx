import { useState } from 'react'
import { HALAL_OPTIONS, HOTELS, HOTEL_IDS, LIMITS, estimateTravel, getPlannerCode, normalizeUrl, setPlannerCode, nearestHotel, parseLatLng, parseMinutes, supabase, type HotelId, type Kind, type Member, type Place } from '../lib'

export default function PlaceForm({ me, canDelete, kind, place, onClose, onSaved }: {
  me: Member; canDelete: boolean; kind: Kind; place: Place | null; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({
    name: place?.name ?? '',
    description: place?.description ?? '',
    price_jpy: place?.price_jpy?.toString() ?? '',
    halal: place?.halal ?? (kind === 'restaurant' ? 'Unknown' : ''),
    taste: place?.taste ?? '',
    nearest_hotels: place?.nearest_hotels ?? ([] as HotelId[]),
    travel_text: place?.travel_text ?? '',
    travel_minutes: place?.travel_minutes?.toString() ?? '',
    wait_text: place?.wait_text ?? '',
    wait_minutes: place?.wait_minutes?.toString() ?? '',
    long_line: place?.long_line ?? '',
    maps_url: place?.maps_url ?? '',
    website_url: place?.website_url ?? '',
    lat: place?.lat ?? null as number | null,
    lng: place?.lng ?? null as number | null,
    visit_minutes: place?.visit_minutes?.toString() ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [finding, setFinding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pinMsg, setPinMsg] = useState<string | null>(null)
  const [askCode, setAskCode] = useState(false)
  const [code, setCode] = useState('')
  const set = (k: keyof typeof f, v: unknown) => setF((s) => ({ ...s, [k]: v }))

  /** When we learn coordinates: auto-pick nearest hotel + estimate travel if those are blank. */
  function applyPin(lat: number, lng: number, source: string) {
    const near = nearestHotel({ lat, lng })!
    const est = estimateTravel(near.km)
    setF((s) => ({
      ...s, lat, lng,
      nearest_hotels: s.nearest_hotels.length ? s.nearest_hotels : [near.id],
      travel_text: s.travel_text || est.text,
      travel_minutes: s.travel_minutes || String(est.minutes),
    }))
    setPinMsg(`📌 Pinned (${source}) · ${near.km.toFixed(1)} km from ${HOTELS[near.id].short} · ${est.text}`)
  }

  function onMapsUrl(url: string) {
    set('maps_url', url)
    const c = parseLatLng(url)
    if (c) applyPin(c.lat, c.lng, 'from link')
  }

  async function findPin() {
    if (!f.name.trim()) return
    setFinding(true); setPinMsg(null)
    try {
      const q = encodeURIComponent(f.name.trim())
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${q}`)
      const [hit] = await res.json()
      if (hit) applyPin(+hit.lat, +hit.lon, hit.display_name.split(',').slice(0, 2).join(','))
      else setPinMsg('Couldn’t find it by name. Paste the full Google Maps link (open the short link, then copy the URL from the address bar).')
    } catch { setPinMsg('Search failed. Try again in a moment.') }
    setFinding(false)
  }
  const num = (s: string) => (s.trim() === '' ? null : Math.round(Number(s.replace(/[^\d.]/g, ''))))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return
    const maps = normalizeUrl(f.maps_url), web = normalizeUrl(f.website_url)
    if (maps === false || web === false) { setErr('Links must be normal web links (https://…).'); return }
    setBusy(true); setErr(null)
    const row = {
      kind,
      name: f.name.trim(),
      description: f.description.trim() || null,
      price_jpy: num(f.price_jpy),
      halal: kind === 'restaurant' ? f.halal || null : null,
      taste: kind === 'restaurant' ? f.taste || null : null,
      nearest_hotels: f.nearest_hotels,
      travel_text: f.travel_text.trim() || null,
      travel_minutes: num(f.travel_minutes),
      wait_text: f.wait_text.trim() || null,
      wait_minutes: num(f.wait_minutes),
      long_line: f.long_line.trim() || null,
      maps_url: maps,
      website_url: web,
      lat: f.lat,
      lng: f.lng,
      visit_minutes: num(f.visit_minutes),
    }
    const { error } = place
      ? await supabase.from('places').update(row).eq('id', place.id)
      : await supabase.from('places').insert({ ...row, created_by: me.id })
    setBusy(false)
    if (error) setErr(friendly(error.message)); else onSaved()
  }

  async function remove() {
    if (!place) return
    const c = getPlannerCode() ?? (askCode ? code : null)
    if (!c) { setAskCode(true); return }
    if (!confirm(`Delete "${place.name}" for everyone?`)) return
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('planner_delete_place', { place: place.id, code: c })
    setBusy(false)
    if (error) setErr(friendly(error.message))
    else if (data !== true) { setPlannerCode(null); setErr('Wrong trip-planner code.') }
    else { setPlannerCode(c); onSaved() }
  }

  const input = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-torii'
  const label = 'block text-sm font-medium text-stone-700'

  return (
    <div className="fixed inset-0 z-[800] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-washi p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">{place ? 'Edit' : 'Add'} {kind === 'restaurant' ? 'restaurant' : 'activity'}</h2>
          <button type="button" onClick={onClose} className="text-2xl text-stone-400">×</button>
        </div>

        <div className="space-y-3">
          <label className={label}>Name *<input autoFocus maxLength={LIMITS.name} className={input} value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className={label}>Specialty / description<input maxLength={LIMITS.description} className={input} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label className={label}>📍 Google Maps link
            <input maxLength={LIMITS.url} inputMode="url" className={input} value={f.maps_url} onChange={(e) => onMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
          </label>
          <label className={label}>🌐 Website (to find out more)
            <input maxLength={LIMITS.url} className={input} value={f.website_url} onChange={(e) => set('website_url', e.target.value)} placeholder="https://…" inputMode="url" />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={findPin} disabled={finding || !f.name.trim()}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm disabled:opacity-40">
              {finding ? 'Searching…' : f.lat != null ? '🔄 Re-find pin by name' : '🔎 Find pin by name'}
            </button>
            {f.lat != null && <span className="text-xs text-emerald-700">✓ on map</span>}
          </div>
          {pinMsg && <p className="text-xs text-stone-600">{pinMsg}</p>}
          <label className={label}>Price per person (¥)<input inputMode="numeric" className={input} value={f.price_jpy} onChange={(e) => set('price_jpy', e.target.value)} placeholder="e.g. 2500" /></label>

          {kind === 'restaurant' && (
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>Halal-ness
                <select className={input} value={f.halal} onChange={(e) => set('halal', e.target.value)}>
                  {HALAL_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
              <label className={label}>Sweet / savoury
                <select className={input} value={f.taste} onChange={(e) => set('taste', e.target.value)}>
                  <option value="">—</option><option value="savory">Savoury</option><option value="sweet">Sweet</option><option value="both">Both</option>
                </select>
              </label>
            </div>
          )}

          <div>
            <span className={label}>Nearest hotel(s)</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {HOTEL_IDS.map((h) => {
                const on = f.nearest_hotels.includes(h)
                return (
                  <button type="button" key={h}
                    onClick={() => set('nearest_hotels', on ? f.nearest_hotels.filter((x) => x !== h) : [...f.nearest_hotels, h])}
                    className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white'}`}>
                    {HOTELS[h].short} <span className="opacity-60">· {HOTELS[h].city}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <label className={label}>Distance from hotel
              <input maxLength={LIMITS.short} className={input} value={f.travel_text} placeholder="e.g. 15 min walk"
                onChange={(e) => { set('travel_text', e.target.value); const m = parseMinutes(e.target.value); if (m != null) set('travel_minutes', String(m)) }} />
            </label>
            <label className={label}>Minutes<input inputMode="numeric" className={input} value={f.travel_minutes} onChange={(e) => set('travel_minutes', e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <label className={label}>Estimated wait
              <input maxLength={LIMITS.short} className={input} value={f.wait_text} placeholder="e.g. 30–60 min"
                onChange={(e) => { set('wait_text', e.target.value); const m = parseMinutes(e.target.value); if (m != null) set('wait_minutes', String(m)) }} />
            </label>
            <label className={label}>Minutes<input inputMode="numeric" className={input} value={f.wait_minutes} onChange={(e) => set('wait_minutes', e.target.value)} /></label>
          </div>
          <label className={label}>Time spent there (min)
            <input inputMode="numeric" className={input} value={f.visit_minutes} onChange={(e) => set('visit_minutes', e.target.value)}
              placeholder={kind === 'restaurant' ? 'default 60' : 'default 120'} />
          </label>
          <label className={label}>Long line? / notes<input maxLength={LIMITS.longLine} className={input} value={f.long_line} onChange={(e) => set('long_line', e.target.value)} placeholder="e.g. Yes – go before 11am" /></label>
        </div>

        {askCode && !getPlannerCode() && (
          <label className="mt-4 block rounded-xl bg-white p-3 text-sm font-medium text-stone-700">⭐ Trip-planner code (needed to delete)
            <input type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} className={input} />
          </label>
        )}
        {err && <p className="mt-3 text-sm text-torii">{err}</p>}
        <div className="mt-5 flex gap-2">
          {place && canDelete && <button type="button" onClick={remove} className="rounded-xl px-4 py-3 text-sm text-torii hover:bg-torii/10">Delete</button>}
          <button disabled={busy || !f.name.trim()} className="ml-auto flex-1 rounded-xl bg-torii py-3 font-medium text-white disabled:opacity-40 sm:flex-none sm:px-8">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Turn database errors into plain English. */
function friendly(msg: string) {
  if (/places_urls/.test(msg)) return 'Links must be normal web links (https://…).'
  if (/price_range/.test(msg)) return 'Price looks wrong. Use a yen amount between 0 and 10,000,000.'
  if (/minutes_range/.test(msg)) return 'Minutes must be between 0 and 1440 (24h).'
  if (/_len/.test(msg)) return 'One of the fields is too long.'
  if (/Too many wrong tries/.test(msg)) return 'Too many wrong codes. Wait 15 minutes.'
  if (/permission denied|row-level security/i.test(msg)) return 'Not allowed. Re-open the app and enter the family code.'
  return msg
}
