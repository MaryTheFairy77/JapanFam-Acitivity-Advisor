import { useState } from 'react'
import { HALAL_OPTIONS, HOTELS, HOTEL_IDS, parseMinutes, supabase, type HotelId, type Kind, type Member, type Place } from '../lib'

export default function PlaceForm({ me, kind, place, onClose, onSaved }: {
  me: Member; kind: Kind; place: Place | null; onClose: () => void; onSaved: () => void
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
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: unknown) => setF((s) => ({ ...s, [k]: v }))
  const num = (s: string) => (s.trim() === '' ? null : Math.round(Number(s.replace(/[^\d.]/g, ''))))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return
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
      maps_url: f.maps_url.trim() || null,
    }
    const { error } = place
      ? await supabase.from('places').update(row).eq('id', place.id)
      : await supabase.from('places').insert({ ...row, created_by: me.id })
    setBusy(false)
    if (error) setErr(error.message); else onSaved()
  }

  async function remove() {
    if (!place || !confirm(`Delete "${place.name}" for everyone?`)) return
    const { error } = await supabase.from('places').delete().eq('id', place.id)
    if (error) setErr(error.message); else onSaved()
  }

  const input = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-torii'
  const label = 'block text-sm font-medium text-stone-700'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-washi p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">{place ? 'Edit' : 'Add'} {kind === 'restaurant' ? 'restaurant' : 'activity'}</h2>
          <button type="button" onClick={onClose} className="text-2xl text-stone-400">×</button>
        </div>

        <div className="space-y-3">
          <label className={label}>Name *<input autoFocus className={input} value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className={label}>Specialty / description<input className={input} value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label className={label}>📍 Google Maps link
            <input className={input} value={f.maps_url} onChange={(e) => set('maps_url', e.target.value)} placeholder="https://maps.app.goo.gl/…" />
          </label>
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
              <input className={input} value={f.travel_text} placeholder="e.g. 15 min walk"
                onChange={(e) => { set('travel_text', e.target.value); const m = parseMinutes(e.target.value); if (m != null) set('travel_minutes', String(m)) }} />
            </label>
            <label className={label}>Minutes<input inputMode="numeric" className={input} value={f.travel_minutes} onChange={(e) => set('travel_minutes', e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <label className={label}>Estimated wait
              <input className={input} value={f.wait_text} placeholder="e.g. 30–60 min"
                onChange={(e) => { set('wait_text', e.target.value); const m = parseMinutes(e.target.value); if (m != null) set('wait_minutes', String(m)) }} />
            </label>
            <label className={label}>Minutes<input inputMode="numeric" className={input} value={f.wait_minutes} onChange={(e) => set('wait_minutes', e.target.value)} /></label>
          </div>
          <label className={label}>Long line? / notes<input className={input} value={f.long_line} onChange={(e) => set('long_line', e.target.value)} placeholder="e.g. Yes – go before 11am" /></label>
        </div>

        {err && <p className="mt-3 text-sm text-torii">{err}</p>}
        <div className="mt-5 flex gap-2">
          {place && <button type="button" onClick={remove} className="rounded-xl px-4 py-3 text-sm text-torii hover:bg-torii/10">Delete</button>}
          <button disabled={busy || !f.name.trim()} className="ml-auto flex-1 rounded-xl bg-torii py-3 font-medium text-white disabled:opacity-40 sm:flex-none sm:px-8">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
