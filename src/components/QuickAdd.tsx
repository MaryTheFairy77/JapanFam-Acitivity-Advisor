import { useState } from 'react'
import { Check, ChevronLeft, Loader2, X } from 'lucide-react'
import {
  HOTELS, autoFillPlace, isInstagramLink, lookupPlace, normalizeUrl, readInstagram, resolveMapsLink, searchBranches, supabase, travelFromPin,
  type Branch, type Category, type PlaceBranch, type Kind, type Lookup, type Member, type Place,
} from '../lib'

/**
 * "Add a place", one big question at a time (Maryam picked mockup B, 14 Nov 2026).
 * 1. Paste a Google Maps / Instagram link, or type "name, area" → we find it (OpenStreetMap; Instagram via Gemini free tier)
 * 2. Food or something to do?   3. Is it halal? (food)   4. Sweet or savoury? (food)   → saved.
 * Everything found automatically is ✨ (auto_fields) so a person can confirm or overwrite it later. Price is never guessed.
 */
type Found = { name: string; lat: number | null; lng: number | null; exactPin: boolean; area: string | null
  mapsUrl: string | null; description: string | null; kind: Kind | 'shopping' | null; halal: string | null; source: string | null; website?: string
  brand?: string; branches?: PlaceBranch[] }
type Step = 'find' | 'kind' | 'halal' | 'taste'

const isMapsLink = (s: string) => /^https?:\/\/([a-z.]*google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s.trim())
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Ticked branches → place cards (Maryam, 17 Nov 2026): votes are for the place, not the branch, so one card per city
 * (Tokyo / Osaka-Kyoto), max two. The card's pin = its branch closest to a hotel (picks are already sorted that way);
 * every branch is kept in `branches` and gets its own map pin.
 */
export function cardsFor<T extends { name: string; lat: number | null; lng: number | null; area: string | null; brand?: string; branches?: PlaceBranch[] }>(picks: T[]): T[] {
  const city = (p: T) => ((p.lng ?? 0) > 137 ? 'Tokyo' : 'Osaka/Kyoto')
  const groups = new Map<string, T[]>()
  for (const p of picks) groups.set(city(p), [...(groups.get(city(p)) ?? []), p])
  return [...groups].map(([c, g]) => g.length === 1 ? g[0] : {
    ...g[0], name: `${g[0].brand ?? g[0].name} (${c})`,
    branches: g.filter((x) => x.lat != null && x.lng != null).map((x) => ({ lat: x.lat!, lng: x.lng!, area: x.area ?? c })),
  })
}

export default function QuickAdd({ me, defaultKind, defaultCategory, onClose, onSaved, onManual }: {
  me: Member; defaultKind: Kind; defaultCategory: Category
  onClose: () => void; onSaved: (id: string) => void; onManual: () => void
}) {
  const [step, setStep] = useState<Step>('find')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  const [kind, setKind] = useState<Kind | 'shopping'>(defaultKind === 'activity' ? defaultCategory : 'restaurant')
  const [halal, setHalal] = useState<string | null>(null)
  // 🔎 several branches found (e.g. "Round1"): tick the ones to add, closest to a hotel first (17 Nov 2026)
  const [branches, setBranches] = useState<Branch[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [picks, setPicks] = useState<Found[]>([])

  const food = kind === 'restaurant'
  const total = food ? 4 : 2
  const num = { find: 1, kind: 2, halal: 3, taste: 4 }[step]

  async function pinFor(name: string, area: string | null): Promise<(Lookup & { exact: boolean }) | null> {
    const a = area ? await lookupPlace(name, area).catch(() => null) : await lookupPlace(name).catch(() => null)
    if (a) return { ...a, exact: true }
    if (area) { await pause(1000); const b = await lookupPlace(area).catch(() => null); if (b) return { ...b, exact: false } }
    return null
  }

  async function find() {
    const text = q.trim()
    if (!text) return
    setMsg(null); setFound(null); setBranches(null); setChosen(new Set()); setPicks([])
    try {
      if (isInstagramLink(text)) {
        setBusy('Opening the Instagram post…')
        const slow = setTimeout(() => setBusy('Working out which place it is…'), 5000)
        const r = await readInstagram(text).finally(() => clearTimeout(slow))
        if (r.error || !r.name) {
          setMsg({
            no_caption: 'Instagram didn’t let us read that post.',
            no_place: 'That post doesn’t name a place we could find.',
            no_key: 'Instagram reading isn’t switched on yet.',
            busy: 'The free Instagram reader is busy right now.',
            timeout: 'Instagram took too long to answer.',
          }[r.error ?? ''] ?? 'Couldn’t read that post.')
          setQ(''); setBusy(null)
          return
        }
        setBusy('Finding it on the map…')
        const pin = await pinFor(r.name, r.area ?? null)
        setFound({ name: r.name, lat: pin?.lat ?? null, lng: pin?.lng ?? null, exactPin: !!pin?.exact, area: r.area ?? null,
          mapsUrl: null, description: r.description ? `✨ From Instagram: ${r.description}` : null,
          kind: (r.kind as Found['kind']) ?? null, halal: r.halal ?? null, source: r.source ?? text, website: pin?.website })
        if (r.kind) setKind(r.kind as Kind | 'shopping')
        if (r.halal) setHalal(r.halal)
      } else if (isMapsLink(text)) {
        setBusy('Opening the Google Maps link…')
        const r = await resolveMapsLink(text)
        if (!r) { setMsg('Couldn’t read that Google Maps link. Try typing the name and area.'); setQ(''); setBusy(null); return }
        setFound({ name: r.name ?? '', lat: r.lat, lng: r.lng, exactPin: r.exact, area: null, mapsUrl: normalizeUrl(text) || null,
          description: null, kind: null, halal: null, source: null })
      } else if (/^https?:\/\//i.test(text)) {
        setMsg('We can read Google Maps and Instagram links. For other sites, type the place’s name and area.')
        setBusy(null); return
      } else {
        setBusy(text.includes(',') ? 'Looking it up…' : 'Searching Tokyo and Osaka/Kyoto…')
        if (!text.includes(',')) {
          const list = await searchBranches(text).catch(() => [])
          if (list.length > 1) { setBranches(list); setBusy(null); return }
          if (list.length === 1) {
            const b = list[0]
            setFound({ name: b.name, lat: b.lat, lng: b.lng, exactPin: true, area: b.area, mapsUrl: null, description: null, kind: null,
              halal: b.halal ?? null, source: null, website: b.website })
            if (b.halal) setHalal(b.halal)
            setBusy(null); return
          }
        }
        const [name, ...rest] = text.split(',')
        const area = rest.join(',').trim() || null
        const pin = await pinFor(name.trim(), area)
        setFound({ name: name.trim(), lat: pin?.lat ?? null, lng: pin?.lng ?? null, exactPin: !!pin?.exact, area,
          mapsUrl: null, description: null, kind: null, halal: pin?.halal ?? null, source: null, website: pin?.website })
        if (pin?.halal) setHalal(pin.halal)
      }
    } catch {
      setMsg('Something went wrong. Check your internet and try again.')
    }
    setBusy(null)
  }

  const back = () => {
    setMsg(null)
    if (step === 'find') onClose()
    else if (step === 'kind') { setStep('find'); if (picks.length) { setFound(null); setPicks([]) } }
    else if (step === 'halal') setStep('kind')
    else setStep('halal')
  }
  const near = found?.lat != null ? travelFromPin({ lat: found.lat, lng: found.lng }) : null
  const big = 'flex min-h-16 w-full flex-col justify-center rounded-2xl border bg-white px-5 py-3 text-left text-[17px] font-semibold active:scale-[.99]'
  const pick = (on: boolean) => `${big} ${on ? 'border-2 border-iris' : 'border-stone-300'}`
  const sub = 'block text-[13px] font-normal text-stone-500'

  return (
    <div className="fixed inset-0 z-[800] flex flex-col bg-washi" role="dialog" aria-modal="true" aria-label="Add a place">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 py-3">
          <button onClick={back} aria-label={step === 'find' ? 'Close' : 'Back'} className="flex h-11 w-11 items-center justify-center rounded-full">
            {step === 'find' ? <X className="h-5 w-5" /> : <ChevronLeft className="h-6 w-6" />}
          </button>
          <p className="flex-1 text-sm text-stone-500">Add a place · step {num} of {found ? total : '…'}</p>
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${found ? total : 4}, minmax(0, 1fr))` }}>
          {Array.from({ length: found ? total : 4 }, (_, i) => <div key={i} className={`h-1.5 rounded-full ${i < num ? 'bg-torii' : 'bg-stone-200'}`} />)}
        </div>

        {step !== 'find' && found && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{picks.length > 1 ? `${picks[0].brand ?? picks[0].name} · ${picks.length} branches` : found.name}</p>
              <p className="truncate text-[13px] text-stone-500">{picks.length > 1 ? picks.map((x) => x.area).join(' · ') : near ? `~${near.text} from ${HOTELS[near.hotel].short}` : 'Not on the map yet'}</p>
            </div>
          </div>
        )}

        {step === 'find' && (
          <div className="mt-6 flex flex-col gap-3">
            <h1 className="font-display text-3xl leading-tight">What's the place?</h1>
            <label htmlFor="qa" className="text-[15px] text-stone-600">Paste a Google Maps or Instagram link, or type the name and area. For a chain (like “Round1”), type just its name to see every branch in Tokyo and Osaka/Kyoto.</label>
            <input id="qa" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') find() }}
              placeholder="e.g. Ramen Ouka, Shinjuku" autoCapitalize="sentences" enterKeyHint="search"
              className="h-14 rounded-2xl border-2 border-iris bg-white px-4 text-base outline-none" />
            <button onClick={find} disabled={!q.trim() || !!busy}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-iris text-[17px] font-semibold text-white disabled:opacity-40">
              {busy ? <><Loader2 className="h-5 w-5 animate-spin" />{busy}</> : 'Find it'}
            </button>
            {msg && <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg} Type the place’s name and area instead, e.g. “Halal ramen, Asakusa”.</p>}

            {found && (
              <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <span className="w-fit rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">{found.lat != null ? '✨ Found it' : 'Not found on the map'}</span>
                <label className="text-xs text-stone-500" htmlFor="qa-name">Name</label>
                <input id="qa-name" value={found.name} onChange={(e) => setFound({ ...found, name: e.target.value })} placeholder="Type the place's name"
                  className="-mt-2 h-12 rounded-xl border border-stone-300 px-3 text-lg font-semibold" />
                <p className="text-sm text-stone-600">
                  {near ? <>🏯 Closest hotel: <b>{HOTELS[near.hotel].short}</b> · 🚆 ~{near.text}{!found.exactPin && ' (rough pin)'}</>
                    : 'We couldn’t pin it. You can still add it and fix the pin later.'}
                </p>
                {found.description && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{found.description}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setFound(null); setQ('') }} className="h-12 rounded-xl border border-stone-300 bg-white font-medium">No, try again</button>
                  <button onClick={() => setStep('kind')} disabled={!found.name.trim()} className="h-12 rounded-xl bg-torii font-semibold text-white disabled:opacity-40">Yes, that's it</button>
                </div>
              </div>
            )}
            {branches && !found && (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-[15px] font-semibold">✨ Found {branches.length} in Tokyo and Osaka/Kyoto. Tick the ones to add:</p>
                <p className="-mt-1 text-[13px] text-stone-500">Closest to one of our hotels first.</p>
                {branches.map((b) => {
                  const on = chosen.has(b.id), t = travelFromPin({ lat: b.lat, lng: b.lng })
                  return (
                    <button key={b.id} onClick={() => { const n = new Set(chosen); if (on) n.delete(b.id); else n.add(b.id); setChosen(n) }} aria-pressed={on}
                      className={`flex items-center gap-3 rounded-2xl border bg-white p-3 text-left ${on ? 'border-2 border-iris' : 'border-stone-300'}`}>
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${on ? 'border-iris bg-iris text-white' : 'border-stone-300'}`}>{on && <Check className="h-4 w-4" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{b.name} <span className="font-normal text-stone-600">({b.area})</span></span>
                        <span className="block text-[13px] text-stone-500">🏯 {HOTELS[b.hotel].short} · {b.km < 1 ? `${Math.round(b.km * 1000)} m` : `${b.km.toFixed(1)} km`}{t ? ` · 🚆 ~${t.text}` : ''}</span>
                      </span>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded-full px-2 py-1 text-xs text-iris underline">Map</a>
                    </button>
                  )
                })}
                <div className="sticky bottom-0 grid grid-cols-2 gap-2 bg-washi pt-2">
                  <button onClick={() => { setBranches(null); setQ('') }} className="h-12 rounded-xl border border-stone-300 bg-white font-medium">Search again</button>
                  <button disabled={!chosen.size} onClick={() => {
                    const ps: Found[] = branches.filter((b) => chosen.has(b.id)).map((b) => ({ name: `${b.name} (${b.area})`, lat: b.lat, lng: b.lng, exactPin: true,
                      area: b.area, mapsUrl: null, description: null, kind: null, halal: b.halal ?? null, source: null, website: b.website, brand: b.name }))
                    setPicks(ps); setFound(ps[0]); setStep('kind')
                  }} className="h-12 rounded-xl bg-torii font-semibold text-white disabled:opacity-40">
                    {chosen.size ? `Add ${chosen.size} branch${chosen.size === 1 ? '' : 'es'}` : 'Tick some first'}
                  </button>
                </div>
              </div>
            )}
            {!found && !branches && <button onClick={onManual} className="mt-4 text-sm text-stone-500 underline">Fill in everything myself</button>}
          </div>
        )}

        {step === 'kind' && (
          <div className="mt-6 flex flex-col gap-3">
            <h1 className="mb-1 font-display text-3xl leading-tight">What kind of place?</h1>
            {([['restaurant', '🍜 Food', 'Restaurant, café, snacks'], ['activity', '🎢 Something to do', 'Sights, museums, parks, fun'], ['shopping', '🛍️ Shopping', 'Shops, malls, markets']] as const).map(([k, l, d]) => (
              <button key={k} onClick={() => { setKind(k); if (k === 'restaurant') setStep('halal'); else void saveAs(k, null) }}
                className={pick(kind === k && !!found?.kind)} disabled={!!busy}>{l}<span className={sub}>{d}</span></button>
            ))}
            {busy && <p className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />{busy}</p>}
            {msg && <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg}</p>}
          </div>
        )}

        {step === 'halal' && (
          <div className="mt-6 flex flex-col gap-3">
            <h1 className="mb-1 font-display text-3xl leading-tight">Is it halal?</h1>
            {found?.halal && <p className="text-sm text-amber-800">✨ {found.source ? 'The post' : 'The map'} says “{found.halal}”. Tap to confirm.</p>}
            {([['Halal certified', 'It has a halal certificate'], ['Muslim friendly', 'Halal options, no certificate'], ['Pork-free', 'No pork, but not halal meat']] as const).map(([h, d]) => (
              <button key={h} onClick={() => { setHalal(h); setStep('taste') }} className={pick(halal === h)}>{h}<span className={sub}>{d}</span></button>
            ))}
            <button onClick={() => { setHalal('Unknown'); setStep('taste') }} className={`${big} border-2 border-dashed border-stone-300 bg-transparent text-stone-600`}>I'm not sure</button>
          </div>
        )}

        {step === 'taste' && (
          <div className="mt-6 flex flex-col gap-3">
            <h1 className="mb-1 font-display text-3xl leading-tight">Sweet or savoury?</h1>
            {([['savory', '🍜 Savoury'], ['sweet', '🍡 Sweet'], ['both', '🍱 Both']] as const).map(([t, l]) => (
              <button key={t} onClick={() => saveAs('restaurant', t)} disabled={!!busy} className={pick(false)}>{l}</button>
            ))}
            {busy && <p className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />{busy}</p>}
            {msg && <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg}</p>}
          </div>
        )}

        {step !== 'find' && <p className="mt-auto pt-6 text-center text-[13px] text-stone-500">Price, wait and photos are optional. Add them later from the place.</p>}
      </div>
    </div>
  )

  /** Save with the kind passed in (React state updates are async, so the tapped kind is passed directly). */
  async function saveAs(k: Kind | 'shopping', taste: Place['taste']) {
    if (!found) return
    const all = picks.length > 1 ? cardsFor(picks) : [found]
    setBusy(all.length > 1 ? `Adding ${all.length} places…` : 'Adding…'); setMsg(null)
    let first: string | null = null
    for (const f of all) {
      const r = await saveOne(f, k, taste)
      if ('error' in r) { setBusy(null); setMsg(r.error); return }
      first ??= r.id
    }
    setBusy(null)
    onSaved(first!)
  }

  async function saveOne(f: Found, k: Kind | 'shopping', taste: Place['taste']): Promise<{ id: string } | { error: string }> {
    const kk: Kind = k === 'restaurant' ? 'restaurant' : 'activity'
    let row = {
      kind: kk, name: f.name.trim(), description: f.description, price_jpy: null,
      halal: kk === 'restaurant' ? (picks.length > 1 ? f.halal ?? halal ?? 'Unknown' : halal ?? 'Unknown') : null, taste: kk === 'restaurant' ? taste : null,
      nearest_hotels: [], travel_text: null, travel_minutes: null, wait_text: null, wait_minutes: null, long_line: null,
      maps_url: f.mapsUrl, website_url: null, lat: null, lng: null, visit_minutes: null, image_url: null,
      category: kk === 'activity' ? (k === 'shopping' ? 'shopping' : 'activity') : null, full_day: false,
      auto_fields: [], auto_sources: f.source, branches: f.branches ?? null,
    } as unknown as Place
    if (f.lat != null && f.lng != null) {
      row = autoFillPlace(row, { lat: f.lat, lng: f.lng, label: f.area ?? '', website: f.website }).row
      if (f.exactPin && f.mapsUrl) row.auto_fields = row.auto_fields.filter((x) => x !== 'pin')
    }
    const { id: _i, created_at: _c, visited: _v, visited_at: _va, created_by: _cb, co_owners: _co, ...insert } = row as Place
    const { data, error } = await supabase.from('places').insert({ ...insert, created_by: me.id }).select('id').single()
    if (error) return { error: /permission denied|row-level/i.test(error.message) ? 'Not allowed. Re-open the app and enter the family code.' : 'Couldn’t save. Check your internet and try again.' }
    return { id: data.id as string }
  }
}
