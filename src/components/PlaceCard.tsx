import { type LucideIcon, Check, ChevronUp, Clock, Globe, Hotel, Hourglass, MapPin, Pencil, PencilLine, TrainFront, Users, Wallet, X } from 'lucide-react'
import Thumb from './Thumb'
import { CATEGORIES, HOTELS, catOf, displayName, fmtMin, fmtYen, fmtZar, halalTone, missingFields, safeUrl, tint, travelFromPin, YELLOW, type Estimates, type Member, type Place } from '../lib'

type IconT = LucideIcon
/** 0 = cheapest/closest/shortest in its group, 1 = priciest/furthest/longest; null = not comparable */
export type Ranks = { price: number | null; travel: number | null; wait: number | null }

/** The three key numbers for a place, worked out the same way everywhere (card, tile, details). */
function facts(p: Place, est: Estimates) {
  const auto = new Set(p.auto_fields ?? [])
  const pinTravel = travelFromPin(p) // distance from the pin to the closest hotel
  return {
    auto, pinTravel,
    price: p.price_jpy,
    wait: p.wait_minutes ?? est.wait[p.kind],
    waitGuess: p.wait_minutes == null || auto.has('wait'),
    travel: p.travel_minutes ?? pinTravel?.minutes ?? null,
    travelGuess: p.travel_minutes == null ? pinTravel != null : auto.has('travel'),
  }
}

/** Small emoji badges: halal / category / full day / taste. Symbols first, words only where they matter. */
function Badges({ p, small }: { p: Place; small?: boolean }) {
  const auto = new Set(p.auto_fields ?? [])
  const pad = small ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'
  return (
    <>
      {p.kind === 'restaurant' && <span className={`rounded-full ${pad} ${halalTone(p.halal)}`} title={`Halal: ${p.halal ?? 'Unknown'}`}>☪︎ {p.halal ?? 'Unknown'}{auto.has('halal') && ' ✨'}</span>}
      {p.kind === 'activity' && p.full_day && <span className={`rounded-full bg-amber-100 ${pad} text-amber-800`} title="Takes the whole day">☀️{small ? '' : ' Full day'}</span>}
      {p.taste && <span className={`rounded-full bg-stone-100 ${pad}`} title={p.taste}>{p.taste === 'sweet' ? '🍡' : p.taste === 'savory' ? '🧂' : '🍡🧂'}</span>}
    </>
  )
}

function VoteBtn({ mine, n, onVote, size = 'md' }: { mine: boolean; n: number; onVote: () => void; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'h-11 w-10 text-xs' : 'h-14 w-12 text-sm'
  return (
    <button onClick={(e) => { e.stopPropagation(); onVote() }} aria-pressed={mine} aria-label={mine ? 'Remove my vote' : 'Upvote'} data-sound={mine ? 'unvote' : 'vote'}
      className={`flex ${s} shrink-0 flex-col items-center justify-center rounded-xl border font-semibold transition active:scale-90 ${mine ? 'border-torii bg-torii text-white' : 'border-stone-300 bg-white/90 text-stone-700'}`}>
      <ChevronUp className="h-5 w-5" strokeWidth={2.5} />{n}
    </button>
  )
}

/** Tiny tinted number pill for the overview (green = cheaper/quicker, red = pricier/longer, yellow = estimate). */
function Pill({ icon: Icon, value, r, guess, unknown, label }: { icon: IconT; value: string; r: number | null; guess?: boolean; unknown?: boolean; label: string }) {
  if (unknown) return <span title={`${label}: not known yet`} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 px-1.5 py-0.5 text-xs text-stone-500"><Icon className="h-3 w-3" />❓</span>
  const t = guess ? YELLOW : tint(r)
  return (
    <span title={guess ? `${label} (estimate)` : label} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-semibold" style={{ background: t.bg, color: t.fg }}>
      <Icon className="h-3 w-3 opacity-70" />{guess && value !== '—' && value !== 'Free' ? '~' : ''}{value}
    </span>
  )
}

/** OVERVIEW row: photo, name, symbols, 3 numbers, vote. Tap anywhere → details. */
export default function PlaceCard({ place: p, rank, votes, mine, imGoing, ranks, est, photoUrls, onVote, onOpen }: {
  place: Place; rank?: number; votes: number; mine: boolean; imGoing: boolean; ranks: Ranks; est: Estimates
  photoUrls: Record<string, string>; onVote: () => void; onOpen: () => void
}) {
  const f = facts(p, est)
  return (
    <article onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white p-2.5 shadow-sm transition active:scale-[0.99] ${p.visited ? 'border-emerald-300' : 'border-stone-200'}`}>
      <div className="relative shrink-0">
        <Thumb place={p} photoUrls={photoUrls} className={`h-20 w-20 ${p.visited ? 'opacity-70' : ''}`} />
        {p.visited && <span className="absolute -right-1 -top-1 rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">Been ✓</span>}
        {rank != null && rank <= 3 && votes > 0 && <span className="absolute -left-1 -top-1 rounded-full bg-torii px-1.5 text-[10px] font-semibold text-white">#{rank}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={`truncate font-display text-base leading-snug ${p.visited ? 'text-stone-500' : ''}`}>{p.name}</h3>
        <div className="mt-1 flex flex-wrap gap-1"><Badges p={p} small />{imGoing && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">✓ I’m in</span>}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Pill icon={Wallet} label="Price per person" value={f.price == null ? '' : fmtYen(f.price)} unknown={f.price == null} r={ranks.price} guess={f.auto.has('price')} />
          <Pill icon={TrainFront} label="Travel from closest hotel" value={fmtMin(f.travel)} r={ranks.travel} guess={f.travelGuess} />
          <Pill icon={Hourglass} label="Wait" value={fmtMin(f.wait)} r={ranks.wait} guess={f.waitGuess} />
        </div>
      </div>
      <VoteBtn mine={mine} n={votes} onVote={onVote} size="sm" />
    </article>
  )
}

/** ZOOMED-OUT gallery tile: big photo, name, vote. */
export function PlaceTile({ place: p, votes, mine, photoUrls, onVote, onOpen }: {
  place: Place; votes: number; mine: boolean; photoUrls: Record<string, string>; onVote: () => void; onOpen: () => void
}) {
  return (
    <article onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={`relative cursor-pointer overflow-hidden rounded-2xl border bg-white shadow-sm transition active:scale-[0.98] ${p.visited ? 'border-emerald-300' : 'border-stone-200'}`}>
      <Thumb place={p} photoUrls={photoUrls} className={`aspect-square w-full rounded-none ${p.visited ? 'opacity-70' : ''}`} />
      <div className="absolute right-1.5 top-1.5"><VoteBtn mine={mine} n={votes} onVote={onVote} size="sm" /></div>
      {p.visited && <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">Been ✓</span>}
      <div className="p-2">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</h3>
        <div className="mt-1 flex flex-wrap gap-1"><Badges p={p} small /></div>
      </div>
    </article>
  )
}

/** DETAILS ON DEMAND: everything about one place, read-first. Editing is one tap away. */
export function PlaceDetail({ place: p, votes, mine, voters, owners, going, imGoing, canEdit, photoUrls, ranks, est, kidMode, onClose, onVote, onVisited, onEdit, onImIn, onGoing }: {
  place: Place; votes: number; mine: boolean; voters: Member[]; owners: Member[]; canEdit: boolean; photoUrls: Record<string, string>
  going: { total: number; text: string }; imGoing: boolean; ranks: Ranks; est: Estimates; kidMode: boolean
  onClose: () => void; onVote: () => void; onVisited: () => void; onEdit: () => void; onImIn: () => void; onGoing: () => void
}) {
  const f = facts(p, est)
  const missing = canEdit ? missingFields(p) : []
  return (
    <div className="fixed inset-0 z-[800] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-washi sm:rounded-3xl">
        <div className="relative">
          <Thumb place={p} photoUrls={photoUrls} className="h-52 w-full rounded-none rounded-t-3xl" />
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow"><X className="h-5 w-5" /></button>
          <div className="absolute -bottom-6 right-4"><VoteBtn mine={mine} n={votes} onVote={onVote} /></div>
        </div>
        <div className="p-5 pt-3">
          <h2 className="pr-14 font-display text-2xl leading-tight">{p.name}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.kind === 'activity' && <span className="rounded-full bg-stone-100 px-2 py-1 text-xs">{CATEGORIES[catOf(p)].emoji} {CATEGORIES[catOf(p)].label}</span>}
            <Badges p={p} />
            {p.visit_minutes != null && <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-xs"><Clock className="h-3 w-3" />{fmtMin(p.visit_minutes)} there</span>}
          </div>
          {p.description && <p className="mt-3 text-sm text-stone-700">{p.description}</p>}

          {/* Key facts, tinted green (cheaper/quicker) → red (pricier/longer) compared with the others */}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {f.price == null
              ? <Unknown icon={Wallet} label="Price per person" sub={canEdit ? 'tap Edit to add' : 'not known yet'} onClick={canEdit ? onEdit : undefined} />
              : <Fact icon={Wallet} label="Price per person" value={fmtYen(f.price)} sub={f.auto.has('price') ? 'found online' : f.price ? fmtZar(f.price) : 'entry'} r={ranks.price} guess={f.auto.has('price')} />}
            <Fact icon={TrainFront} label="Travel from closest hotel" value={fmtMin(f.travel)} sub={f.travelGuess && f.pinTravel ? `from pin · ${f.pinTravel.km.toFixed(1)} km` : p.travel_text ?? ''} r={ranks.travel} guess={f.travelGuess} />
            <Fact icon={Hourglass} label="Wait" value={fmtMin(f.wait)} sub={p.wait_minutes == null ? 'typical wait (avg)' : f.auto.has('wait') ? 'found online' : ''} r={ranks.wait} guess={f.waitGuess} />
          </dl>
          {p.wait_text && <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-600"><Hourglass className="mt-px h-3.5 w-3.5 shrink-0" />{p.wait_text}</p>}
          {p.long_line && <p className="mt-1 flex items-start gap-1.5 text-xs text-stone-600"><Users className="mt-px h-3.5 w-3.5 shrink-0" />{p.long_line}</p>}
          {p.nearest_hotels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {p.nearest_hotels.map((h) => (
                <a key={h} href={HOTELS[h].maps} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${f.auto.has('nearest_hotels') ? 'bg-[#fdf4c8] text-amber-900' : 'bg-sky-50 text-sky-800'}`}>
                  <Hotel className="h-3 w-3" />{HOTELS[h].short}
                </a>
              ))}
            </div>
          )}

          {/* Links */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {safeUrl(p.maps_url) && <a href={safeUrl(p.maps_url)!} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ink py-2.5 text-sm font-medium text-white"><MapPin className="h-4 w-4" />Google Maps</a>}
            {safeUrl(p.website_url) && <a href={safeUrl(p.website_url)!} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-2.5 text-sm"><Globe className="h-4 w-4" />Website</a>}
          </div>

          {/* Who's going + been */}
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white p-2">
            <button onClick={onImIn} data-sound="pop"
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${imGoing ? 'bg-emerald-600 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>
              {imGoing && <Check className="h-4 w-4" />}I’m in
            </button>
            <button onClick={onGoing} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-stone-600">
              <Users className="h-4 w-4 shrink-0" /><span className="truncate">{going.total ? going.text : 'Nobody yet'}</span>
              <PencilLine className="ml-auto h-3.5 w-3.5 shrink-0 text-torii" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {kidMode
              ? (p.visited && <span className="text-sm text-emerald-700">Been ✓</span>)
              : (
                <label className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm">
                  <input type="checkbox" checked={p.visited} onChange={onVisited} data-sound={p.visited ? 'tap' : 'bell'} className="h-5 w-5 accent-emerald-600" />
                  <span className={p.visited ? 'text-emerald-700' : 'text-stone-600'}>{p.visited ? 'Been ✓' : 'Been here?'}</span>
                </label>
              )}
            {voters.length > 0 && <span className="ml-auto truncate text-xs text-stone-500" title={voters.map(displayName).join(', ')}>👍 {voters.map((v) => v.emoji).join('')}</span>}
          </div>

          {/* Who suggested it = who can edit it */}
          {owners.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
              Idea by
              {owners.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-0.5 pl-1 pr-2 text-stone-700"><span className="text-base leading-none">{m.emoji}</span>{displayName(m)}</span>
              ))}
            </div>
          )}
          {missing.length > 0 && <p className="mt-2 text-xs text-amber-700">Still missing: {missing.join(', ')}</p>}
          {!kidMode && (
            <button onClick={onEdit} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-stone-300 bg-white py-3 text-sm">
              <Pencil className="h-4 w-4" />{canEdit ? 'Edit' : 'All details & sources'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Fact({ icon: Icon, label, value, sub, r, guess }: { icon: IconT; label: string; value: string; sub: string; r: number | null; guess?: boolean }) {
  // estimated / auto-filled values get a yellow wash instead of the comparison tint
  const t = guess ? YELLOW : tint(r)
  return (
    <div className="relative rounded-xl px-2 py-2 transition-colors" style={{ background: t.bg }} title={guess ? `${label} (estimate, not confirmed)` : label}>
      {guess && <span className="absolute right-1.5 top-1 text-[10px]">✨</span>}
      <dt className="flex justify-center text-stone-500"><Icon className="h-4 w-4" strokeWidth={2} /><span className="sr-only">{label}</span></dt>
      <dd className="font-semibold" style={{ color: t.fg }}>{guess && value !== '—' && value !== 'Free' ? '~' : ''}{value}</dd>
      {sub && <dd className="truncate text-[11px] text-stone-500" title={sub}>{sub}</dd>}
    </div>
  )
}

/** Price nobody knows yet: shown honestly (no made-up average), with a nudge to fill it in. */
function Unknown({ icon: Icon, label, sub, onClick }: { icon: IconT; label: string; sub: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} title={`${label}: not known yet`}
      className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-2 py-2 text-center">
      <span className="flex justify-center text-stone-400"><Icon className="h-4 w-4" strokeWidth={2} /><span className="sr-only">{label}</span></span>
      <span className="block font-semibold text-stone-500">❓</span>
      <span className="block truncate text-[11px] text-stone-500">{sub}</span>
    </button>
  )
}
