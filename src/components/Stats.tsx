import { useState } from 'react'
import { displayName, fmtMin, fmtYen, type Kind, type Member, type Place, type Vote } from '../lib'

/** Super-basic comparative analytics: leaderboard + "best by metric" picks + progress. */
export default function Stats({ places, votes, members, voteCount }: {
  places: Place[]; votes: Vote[]; members: Member[]; voteCount: Record<string, number>
}) {
  const [kind, setKind] = useState<Kind>('restaurant')
  const ps = places.filter((p) => p.kind === kind)
  const todo = ps.filter((p) => !p.visited)
  const visited = ps.length - todo.length
  const top = [...ps].sort((a, b) => (voteCount[b.id] ?? 0) - (voteCount[a.id] ?? 0)).slice(0, 8)
  const max = Math.max(1, ...top.map((p) => voteCount[p.id] ?? 0))

  const best = (key: 'price_jpy' | 'travel_minutes' | 'wait_minutes') =>
    todo.filter((p) => p[key] != null).sort((a, b) => a[key]! - b[key]!)[0]

  // "Value score": votes per ¥1000 — a quick crowd-pleaser-for-the-money metric
  const value = todo
    .filter((p) => p.price_jpy && (voteCount[p.id] ?? 0) > 0)
    .map((p) => ({ p, s: (voteCount[p.id] ?? 0) / (p.price_jpy! / 1000) }))
    .sort((a, b) => b.s - a.s)[0]

  const picks: { label: string; p?: Place; v: string }[] = [
    { label: '¥ Cheapest', p: best('price_jpy'), v: fmtYen(best('price_jpy')?.price_jpy ?? null) },
    { label: '🚗 Closest', p: best('travel_minutes'), v: fmtMin(best('travel_minutes')?.travel_minutes ?? null) },
    { label: '⏱ Shortest wait', p: best('wait_minutes'), v: fmtMin(best('wait_minutes')?.wait_minutes ?? null) },
    { label: '💎 Best value', p: value?.p, v: value ? `${value.s.toFixed(1)} votes / ¥1k` : '—' },
  ]

  return (
    <div className="space-y-5 px-4 pt-4">
      <div className="grid grid-cols-2 rounded-xl bg-stone-200/70 p-1 text-sm font-medium">
        {(['restaurant', 'activity'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-lg py-1.5 ${kind === k ? 'bg-white shadow-sm' : 'text-stone-600'}`}>
            {k === 'restaurant' ? 'Food' : 'Activities'}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg">Progress</h2>
          <span className="text-sm text-stone-500">{visited} / {ps.length} visited</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${ps.length ? (visited / ps.length) * 100 : 0}%` }} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg">Quick picks <span className="text-sm font-normal text-stone-500">(not yet visited)</span></h2>
        <div className="grid grid-cols-2 gap-2">
          {picks.map((x) => (
            <div key={x.label} className="rounded-2xl border border-stone-200 bg-white p-3">
              <p className="text-xs text-stone-500">{x.label}</p>
              <p className="mt-0.5 truncate font-medium">{x.p?.name ?? '—'}</p>
              <p className="text-sm text-torii">{x.p ? x.v : ''}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 font-display text-lg">Vote leaderboard</h2>
        {top.length === 0 && <p className="text-sm text-stone-500">No places yet.</p>}
        <ol className="space-y-2">
          {top.map((p) => {
            const n = voteCount[p.id] ?? 0
            return (
              <li key={p.id} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-2 text-sm">
                <span className={`truncate ${p.visited ? 'text-stone-400 line-through' : ''}`}>{p.name}</span>
                <span className="h-3 rounded-full bg-stone-100">
                  <span className="block h-full rounded-full bg-torii" style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="text-right font-semibold">{n}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 font-display text-lg">Who's voted</h2>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const n = votes.filter((v) => v.member_id === m.id && ps.some((p) => p.id === v.place_id)).length
            return <span key={m.id} className="rounded-full bg-stone-100 px-3 py-1 text-sm">{m.emoji} {displayName(m)} · <b>{n}</b></span>
          })}
        </div>
      </section>
    </div>
  )
}
