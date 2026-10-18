import { HOTELS, displayName, fmtMin, fmtYen, fmtZar, halalTone, missingFields, type Member, type Place } from '../lib'

export default function PlaceCard({ place: p, rank, voters, addedBy, mine, going, imGoing, onVote, onVisited, onEdit, onImIn, onGoing }: {
  place: Place; rank?: number; voters: Member[]; addedBy?: Member; mine: boolean
  going: { total: number; text: string }; imGoing: boolean
  onVote: () => void; onVisited: () => void; onEdit: () => void; onImIn: () => void; onGoing: () => void
}) {
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${p.visited ? 'border-emerald-300' : 'border-stone-200'}`}>
      <div className="flex gap-3">
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
        <button onClick={onVote} aria-pressed={mine}
          className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition active:scale-90 ${mine ? 'border-torii bg-torii text-white' : 'border-stone-300 text-stone-700'}`}>
          <span className="text-base leading-none">▲</span>{voters.length}
        </button>
      </div>

      {/* Key facts */}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Fact label="Per person" value={fmtYen(p.price_jpy)} sub={fmtZar(p.price_jpy)} />
        <Fact label="Travel" value={fmtMin(p.travel_minutes)} sub={p.travel_text ?? ''} />
        <Fact label="Wait" value={fmtMin(p.wait_minutes)} sub={p.wait_text ?? ''} />
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {p.kind === 'restaurant' && <span className={`rounded-full px-2 py-1 ${halalTone(p.halal)}`}>{p.halal ?? 'Halal: unknown'}</span>}
        {p.taste && <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{p.taste === 'sweet' ? '🍡 Sweet' : p.taste === 'savory' ? '🧂 Savoury' : '🍡🧂 Both'}</span>}
        {p.nearest_hotels.map((h) => (
          <a key={h} href={HOTELS[h].maps} target="_blank" rel="noreferrer" className="rounded-full bg-sky-50 px-2 py-1 text-sky-800">🏨 {HOTELS[h].short}</a>
        ))}
      </div>
      {p.long_line && <p className="mt-2 text-xs text-stone-500"><b>Lines:</b> {p.long_line}</p>}
      {/* Who's going */}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-stone-50 p-2">
        <button onClick={onImIn}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${imGoing ? 'bg-emerald-600 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>
          {imGoing ? '✓ I’m in' : 'I’m in'}
        </button>
        <button onClick={onGoing} className="min-w-0 flex-1 truncate text-left text-xs text-stone-600">
          👥 {going.total ? going.text : 'Nobody yet'} <span className="text-torii">· edit</span>
        </button>
      </div>
      {missingFields(p).length > 0 && (
        <button onClick={onEdit} className="mt-2 block text-left text-xs text-amber-700">
          ✏️ Needs: {missingFields(p).join(', ')}
        </button>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={p.visited} onChange={onVisited} className="h-5 w-5 accent-emerald-600" />
          <span className={p.visited ? 'text-emerald-700' : 'text-stone-600'}>{p.visited ? 'Visited ✓' : 'Visited?'}</span>
        </label>
        <div className="ml-1 flex -space-x-1" title={voters.map(displayName).join(', ')}>
          {voters.map((v) => <span key={v.id} className="text-base">{v.emoji}</span>)}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={onEdit} className="rounded-lg px-2.5 py-1.5 text-sm text-stone-500 hover:bg-stone-100">Edit</button>
          {p.website_url && (
            <a href={p.website_url} target="_blank" rel="noreferrer" className="whitespace-nowrap rounded-lg border border-stone-300 px-3 py-1.5 text-sm">🌐 Info</a>
          )}
          {p.maps_url && (
            <a href={p.maps_url} target="_blank" rel="noreferrer"
              className="whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white">📍 Maps</a>
          )}
        </div>
      </div>
      {addedBy && <p className="mt-2 text-[11px] text-stone-400">Added by {addedBy.emoji} {displayName(addedBy)}</p>}
    </article>
  )
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
      {sub && <dd className="truncate text-[11px] text-stone-500" title={sub}>{sub}</dd>}
    </div>
  )
}
