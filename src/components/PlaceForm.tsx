import { useRef, useState } from 'react'
import Thumb from './Thumb'
import { HALAL_OPTIONS, HOTELS, HOTEL_IDS, LIMITS, estimateTravel, getPlannerCode, normalizeUrl, setPlannerCode, uploadPhoto, displayName, lookupPlace, nearestHotel, parseLatLng, type AutoField, type Lookup, parseMinutes, supabase, type HotelId, type Kind, type Member, type Place } from '../lib'

export default function PlaceForm({ me, canDelete, canEdit, creator, photoUrls, kind, place, onClose, onSaved }: {
  me: Member; canDelete: boolean; canEdit: boolean; creator?: Member; photoUrls: Record<string, string>
  kind: Kind; place: Place | null; onClose: () => void; onSaved: () => void
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
    image_url: place?.image_url ?? '',
    lat: place?.lat ?? null as number | null,
    lng: place?.lng ?? null as number | null,
    visit_minutes: place?.visit_minutes?.toString() ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [finding, setFinding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pinMsg, setPinMsg] = useState<string | null>(null)
  const [askCode, setAskCode] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const readOnly = !!place && !canEdit
  const isMine = !!place && place.created_by === me.id
  // planners editing someone else's place go through the planner code
  const needsPlannerCode = !!place && !isMine && me.is_admin

  async function onPickPhoto(file?: File) {
    if (!file) return
    setUploading(true); setErr(null)
    try { set('image_url', await uploadPhoto(file)) }
    catch (e) { setErr('Couldn’t upload that photo: ' + (e as Error).message) }
    setUploading(false)
  }
  const [code, setCode] = useState('')
  // ✨ fields filled automatically; typing into one makes it "yours" and clears the yellow
  const [auto, setAuto] = useState<Set<AutoField>>(new Set(place?.auto_fields ?? []))
  const GROUP: Partial<Record<keyof typeof f, AutoField>> = {
    nearest_hotels: 'nearest_hotels', travel_text: 'travel', travel_minutes: 'travel', website_url: 'website_url', halal: 'halal',
  }
  const set = (k: keyof typeof f, v: unknown) => {
    setF((s) => ({ ...s, [k]: v }))
    const g = GROUP[k]
    if (g) setAuto((a) => { const n = new Set(a); n.delete(g); return n })
  }
  const yellow = (g: AutoField) => (auto.has(g) ? ' !bg-[#fdf4c8] !border-amber-300' : '')
  const AutoHint = ({ g }: { g: AutoField }) => auto.has(g) ? <span className="ml-1 text-[11px] font-normal text-amber-700">✨ auto-filled, type to confirm</span> : null

  type F = typeof f
  /** Fill blanks from a pin (and look-up tags). Never overwrites what a person typed. */
  function fillFrom(s: F, lat: number, lng: number, lk: Partial<Lookup> | null, pinIsAuto: boolean): { next: F; added: AutoField[] } {
    const near = nearestHotel({ lat, lng })!
    const est = estimateTravel(near.km)
    const added: AutoField[] = pinIsAuto ? ['pin'] : []
    const next = { ...s, lat, lng }
    if (!s.nearest_hotels.length) { next.nearest_hotels = [near.id]; added.push('nearest_hotels') }
    if (!s.travel_minutes && !s.travel_text) { next.travel_text = est.text; next.travel_minutes = String(est.minutes); added.push('travel') }
    if (!s.website_url && lk?.website) { next.website_url = lk.website; added.push('website_url') }
    if (kind === 'restaurant' && (!s.halal || s.halal === 'Unknown') && lk?.halal) { next.halal = lk.halal; added.push('halal') }
    return { next, added }
  }
  function applyPin(lat: number, lng: number, source: string, lk: Lookup | null, pinIsAuto: boolean) {
    const { next, added } = fillFrom(f, lat, lng, lk, pinIsAuto)
    setF(next)
    setAuto((a) => { const n = new Set(a); if (!pinIsAuto) n.delete('pin'); added.forEach((x) => n.add(x)); return n })
    const near = nearestHotel({ lat, lng })!
    setPinMsg(`📌 Pinned (${source}) · ${near.km.toFixed(1)} km from ${HOTELS[near.id].short}`)
  }

  function onMapsUrl(url: string) {
    set('maps_url', url)
    const c = parseLatLng(url)
    if (c) applyPin(c.lat, c.lng, 'from your link', null, false)
  }

  const cityHint = () => (f.nearest_hotels.length ? `${HOTELS[f.nearest_hotels[0]].city}, Japan` : undefined)

  async function findPin() {
    if (!f.name.trim()) return
    setFinding(true); setPinMsg(null)
    try {
      const lk = await lookupPlace(f.name.trim(), cityHint())
      if (lk) applyPin(lk.lat, lk.lng, lk.label, lk, true)
      else setPinMsg('Couldn’t find it by name. Paste the full Google Maps link (open the short link, then copy the URL from the address bar).')
    } catch { setPinMsg('Search failed. Try again in a moment.') }
    setFinding(false)
  }
  const num = (s: string) => (s.trim() === '' ? null : Math.round(Number(s.replace(/[^\d.]/g, ''))))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f.name.trim() || readOnly) return
    const maps = normalizeUrl(f.maps_url), web = normalizeUrl(f.website_url)
    const img = f.image_url.startsWith('storage:') ? f.image_url : normalizeUrl(f.image_url)
    if (maps === false || web === false || img === false) { setErr('Links must be normal web links (https://…).'); return }
    if (needsPlannerCode && !getPlannerCode() && !code) { setAskCode(true); setErr('Enter the trip-planner code to save changes to someone else’s place.'); return }
    setBusy(true); setErr(null)
    // ✨ Free auto-fill on save: if there's no pin yet, look the place up by name (OpenStreetMap)
    let F2 = f, autoNow = new Set(auto)
    if (F2.lat == null) {
      try {
        const lk = await lookupPlace(F2.name.trim(), cityHint())
        if (lk) { const r = fillFrom(F2, lk.lat, lk.lng, lk, true); F2 = r.next; r.added.forEach((x) => autoNow.add(x)) }
      } catch { /* offline or not found: save anyway */ }
    }
    const fv = F2
    const stillFilled: Record<AutoField, boolean> = {
      pin: fv.lat != null, nearest_hotels: fv.nearest_hotels.length > 0, travel: !!(fv.travel_minutes || fv.travel_text),
      website_url: !!fv.website_url, halal: !!fv.halal && fv.halal !== 'Unknown',
    }
    autoNow = new Set([...autoNow].filter((x) => stillFilled[x]))
    const row = {
      kind,
      name: fv.name.trim(),
      description: fv.description.trim() || null,
      price_jpy: num(fv.price_jpy),
      halal: kind === 'restaurant' ? fv.halal || null : null,
      taste: kind === 'restaurant' ? fv.taste || null : null,
      nearest_hotels: fv.nearest_hotels,
      travel_text: fv.travel_text.trim() || null,
      travel_minutes: num(fv.travel_minutes),
      wait_text: fv.wait_text.trim() || null,
      wait_minutes: num(fv.wait_minutes),
      long_line: fv.long_line.trim() || null,
      maps_url: maps,
      website_url: fv.website_url ? (normalizeUrl(fv.website_url) || null) : null,
      lat: fv.lat,
      lng: fv.lng,
      visit_minutes: num(fv.visit_minutes),
      image_url: img,
      auto_fields: [...autoNow],
    }
    if (needsPlannerCode) {
      const c = getPlannerCode() ?? code
      const { data, error } = await supabase.rpc('planner_update_place', { place: place!.id, data: row, code: c })
      setBusy(false)
      if (error) setErr(friendly(error.message))
      else if (data !== true) { setPlannerCode(null); setErr('Wrong trip-planner code.') }
      else { setPlannerCode(c); onSaved() }
      return
    }
    const { error } = place
      ? await supabase.from('places').update(row).eq('id', place.id).select('id').single()
      : await supabase.from('places').insert({ ...row, created_by: me.id })
    setBusy(false)
    if (error) setErr(/0 rows|PGRST116/.test(error.message + error.code) ? 'Only the person who added this (or a trip planner) can change it.' : friendly(error.message)); else onSaved()
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
          <h2 className="font-display text-2xl">{readOnly ? '' : place ? 'Edit ' : 'Add '}{kind === 'restaurant' ? (readOnly ? 'Restaurant' : 'restaurant') : (readOnly ? 'Activity' : 'activity')}</h2>
          <button type="button" onClick={onClose} className="text-2xl text-stone-400">×</button>
        </div>

        {/* Photo */}
        <div className="mb-4 flex items-center gap-3">
          <Thumb place={{ id: place?.id ?? 'new', kind, image_url: f.image_url || null }} photoUrls={photoUrls} className="h-24 w-24 shrink-0" />
          {!readOnly && (
            <div className="min-w-0 flex-1 space-y-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickPhoto(e.target.files?.[0])} />
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm disabled:opacity-50">{uploading ? 'Uploading…' : '📷 Add photo'}</button>
                {f.image_url && <button type="button" onClick={() => set('image_url', '')} className="rounded-xl px-3 py-2 text-sm text-stone-500">Remove</button>}
              </div>
              <input maxLength={LIMITS.url} inputMode="url" placeholder="…or paste an image link" className={input + ' text-sm'}
                value={f.image_url.startsWith('storage:') ? '' : f.image_url} onChange={(e) => set('image_url', e.target.value)} />
            </div>
          )}
        </div>
        {!readOnly && !place && (
          <p className="mb-3 rounded-xl bg-[#fdf4c8]/60 p-2.5 text-xs text-amber-800">✨ Just the name is enough. On save we look it up and fill the pin, nearest hotel and travel time (shown yellow until someone confirms).</p>
        )}
        {readOnly && (
          <p className="mb-4 rounded-xl bg-white p-3 text-sm text-stone-600">
            🔒 Only {creator ? `${creator.emoji} ${displayName(creator)}` : 'the person who added this'} or a trip planner ⭐ can change this place.
          </p>
        )}
        <fieldset disabled={readOnly} className="space-y-3 disabled:opacity-80">
          <label className={label}>Name *<input autoFocus maxLength={LIMITS.name} className={input} value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className={label}>Specialty / description<input maxLength={LIMITS.description} className={input} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label className={label}>📍 Google Maps link
            <input maxLength={LIMITS.url} inputMode="url" className={input} value={f.maps_url} onChange={(e) => onMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
          </label>
          <label className={label}>🌐 Website (to find out more)<AutoHint g="website_url" />
            <input maxLength={LIMITS.url} className={input + yellow('website_url')} value={f.website_url} onChange={(e) => set('website_url', e.target.value)} placeholder="https://…" inputMode="url" />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={findPin} disabled={finding || !f.name.trim()}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm disabled:opacity-40">
              {finding ? 'Searching…' : f.lat != null ? '🔄 Re-find pin by name' : '🔎 Find pin by name'}
            </button>
            {f.lat != null && (auto.has('pin')
              ? <span className="rounded-md bg-[#fdf4c8] px-1.5 py-0.5 text-xs text-amber-800">✨ pin found automatically</span>
              : <span className="text-xs text-emerald-700">✓ on map</span>)}
          </div>
          {pinMsg && <p className="text-xs text-stone-600">{pinMsg}</p>}
          <label className={label}>Price per person (¥)<input inputMode="numeric" className={input} value={f.price_jpy} onChange={(e) => set('price_jpy', e.target.value)} placeholder="e.g. 2500" /></label>

          {kind === 'restaurant' && (
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>Halal-ness<AutoHint g="halal" />
                <select className={input + yellow('halal')} value={f.halal} onChange={(e) => set('halal', e.target.value)}>
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
            <span className={label}>Nearest hotel(s)<AutoHint g="nearest_hotels" /></span>
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
            <label className={label}>Distance from hotel<AutoHint g="travel" />
              <input maxLength={LIMITS.short} className={input + yellow('travel')} value={f.travel_text} placeholder="e.g. 15 min walk"
                onChange={(e) => { set('travel_text', e.target.value); const m = parseMinutes(e.target.value); if (m != null) set('travel_minutes', String(m)) }} />
            </label>
            <label className={label}>Minutes<input inputMode="numeric" className={input + yellow('travel')} value={f.travel_minutes} onChange={(e) => set('travel_minutes', e.target.value)} /></label>
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
        </fieldset>
        {askCode && !getPlannerCode() && (
          <label className="mt-4 block rounded-xl bg-white p-3 text-sm font-medium text-stone-700">⭐ Trip-planner code (needed to delete)
            <input type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} className={input} />
          </label>
        )}
        {err && <p className="mt-3 text-sm text-torii">{err}</p>}
        <div className="mt-5 flex gap-2">
          {place && canDelete && <button type="button" onClick={remove} className="rounded-xl px-4 py-3 text-sm text-torii hover:bg-torii/10">Delete</button>}
          {!readOnly && <button disabled={busy || uploading || !f.name.trim()} className="ml-auto flex-1 rounded-xl bg-torii py-3 font-medium text-white disabled:opacity-40 sm:flex-none sm:px-8">
            {busy ? 'Saving…' : 'Save'}
          </button>}
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
