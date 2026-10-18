import { type LucideIcon, Check, ChevronUp, Clock, Globe, Hotel, Hourglass, Info, MapPin, Pencil, PencilLine, TrainFront, Users, Wallet } from 'lucide-react'
import Thumb from './Thumb'
import { HOTELS, displayName, fmtMin, fmtYen, fmtZar, halalTone, missingFields, safeUrl, tint, type Member, type Place } from '../lib'

type IconT = LucideIcon
/** 0 = cheapest/closest/shortest in its group, 1 = priciest/furthest/longest; null = not comparable */
export type Ranks = { price: number | null; travel: number | null; wait: number | null }

export default function PlaceCard({ place: p, rank, voters, addedBy, mine, going, imGoing, canEdit, photoUrls, ranks, onVote, onVisited, onEdit, onImIn, onGoing }: {
  place: Place; rank?: number; voters: Member[]; addedBy?: Member; mine: boolean; canEdit: boolean; photoUrls: Record<string, string>
  going: { total: number; text: string }; imGoing: boolean; ranks: Ranks
  onVote: () => void; onVisited: () => void; onEdit: () => void; onImIn: () => void; onGoing: () => void
}) {
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${p.visited ? 'border-emerald-300' : 'border-stone-200'}`}>
      <div className="flex gap-3">
        <Thumb place={p} photoUrls={photoUrls} className={`h-20 w-20 shrink-0 ${p.visited ? 'opacity-70' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {rank != null && rank <= 3 && voters.length > 0 && (
              <span className="text-xs font-semibold text-torii">#{rank}</span>
            )}
            <h3 className={`font-display text-lg leading-snug ${p.visited ? 'text-stone-500' : ''}`}>{p.name}</h3>
          </div>
          {p.description && <p className="mt-0.5 text-sm text-stone-600">{p.description}</p>}
        </div>
        {/* Upvote */}
        <button onClick={onVote} aria-pressed={mine} aria-label={mine ? 'Remove my vote' : 'Upvote'} data-sound={mine ? 'unvote' : 'vote'}
          className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition active:scale-90 ${mine ? 'border-torii bg-torii text-white' : 'border-stone-300 text-stone-700'}`}>
          <ChevronUp className="h-5 w-5" strokeWidth={2.5} />{voters.length}
        </button>
      </div>

      {/* Key facts — tinted green (cheaper/quicker) → red (pricier/longer) compared with the other places */}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Fact icon={Wallet} label="Price per person" value={fmtYen(p.price_jpy)} sub={fmtZar(p.price_jpy)} r={ranks.price} />
        <Fact icon={TrainFront} label="Travel from hotel" value={fmtMin(p.travel_minutes)} sub={p.travel_text ?? ''} r={ranks.travel} />
        <Fact icon={Hourglass} label="Wait" value={fmtMin(p.wait_minutes)} sub={p.wait_text ?? ''} r={ranks.wait} />
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {p.kind === 'restaurant' && <span className={`rounded-full px-2 py-1 ${halalTone(p.halal)}`}>☪︎ {p.halal ?? 'Unknown'}</span>}
        {p.taste && <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{p.taste === 'sweet' ? '🍡' : p.taste === 'savory' ? '🧂' : '🍡🧂'}</span>}
        {p.visit_minutes != null && <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-stone-700"><Clock className="h-3 w-3" />{fmtMin(p.visit_minutes)}</span>}
        {p.nearest_hotels.map((h) => (
          <a key={h} href={HOTELS[h].maps} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-sky-800">
            <Hotel className="h-3 w-3" />{HOTELS[h].short}
          </a>
        ))}
      </div>
      {p.long_line && <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-500"><Users className="mt-px h-3.5 w-3.5 shrink-0" />{p.long_line}</p>}

      {/* Who's going */}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-stone-50 p-2">
        <button onClick={onImIn} data-sound="pop"
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${imGoing ? 'bg-emerald-600 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>
          {imGoing && <Check className="h-4 w-4" />}I’m in
        </button>
        <button onClick={onGoing} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-stone-600">
          <Users className="h-4 w-4 shrink-0" /><span className="truncate">{going.total ? going.text : 'Nobody yet'}</span>
          <PencilLine className="ml-auto h-3.5 w-3.5 shrink-0 text-torii" />
        </button>
      </div>
      {canEdit && missingFields(p).length > 0 && (
        <button onClick={onEdit} className="mt-2 flex items-center gap-1 text-left text-xs text-amber-700">
          <Pencil className="h-3 w-3" /> Needs: {missingFields(p).join(', ')}
        </button>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-sm" title="Visited">
          <input type="checkbox" checked={p.visited} onChange={onVisited} data-sound={p.visited ? 'tap' : 'bell'} className="h-5 w-5 accent-emerald-600" />
          <span className={p.visited ? 'text-emerald-700' : 'text-stone-500'}>{p.visited ? 'Been ✓' : 'Been?'}</span>
        </label>
        <div className="ml-1 flex -space-x-1" title={voters.map(displayName).join(', ')}>
          {voters.map((v) => <span key={v.id} className="text-base">{v.emoji}</span>)}
        </div>
        <div className="ml-auto flex gap-1.5">
          <IconBtn onClick={onEdit} label={canEdit ? 'Edit' : 'Details'} icon={canEdit ? Pencil : Info} />
          {safeUrl(p.website_url) && <IconLink href={safeUrl(p.website_url)!} label="Website" icon={Globe} />}
          {safeUrl(p.maps_url) && <IconLink href={safeUrl(p.maps_url)!} label="Open in Google Maps" icon={MapPin} dark />}
        </div>
      </div>
      {addedBy && <p className="mt-2 text-[11px] text-stone-400">Added by {addedBy.emoji} {displayName(addedBy)}</p>}
    </article>
  )
}

function Fact({ icon: Icon, label, value, sub, r }: { icon: IconT; label: string; value: string; sub: string; r: number | null }) {
  const t = tint(r)
  return (
    <div className="rounded-xl px-2 py-2 transition-colors" style={{ background: t.bg }} title={label}>
      <dt className="flex justify-center text-stone-500"><Icon className="h-4 w-4" strokeWidth={2} /><span className="sr-only">{label}</span></dt>
      <dd className="font-semibold" style={{ color: t.fg }}>{value}</dd>
      {sub && <dd className="truncate text-[11px] text-stone-500" title={sub}>{sub}</dd>}
    </div>
  )
}

const btn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg'
function IconBtn({ onClick, label, icon: Icon }: { onClick: () => void; label: string; icon: IconT }) {
  return <button onClick={onClick} aria-label={label} title={label} className={`${btn} text-stone-500 hover:bg-stone-100`}><Icon className="h-4 w-4" /></button>
}
function IconLink({ href, label, icon: Icon, dark }: { href: string; label: string; icon: IconT; dark?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}
      className={`${btn} ${dark ? 'bg-ink text-white' : 'border border-stone-300 text-stone-700'}`}><Icon className="h-4 w-4" /></a>
  )
}
