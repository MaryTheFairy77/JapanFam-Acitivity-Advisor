import { useMemo, useState } from 'react'
import { displayName, fmtMin, fmtYen, rankOf, tint, YELLOW, type Kind, type Member, type Place, type Vote } from '../lib'
import Thumb from './Thumb'

type Metric = 'votes' | 'price' | 'travel' | 'wait' | 'value'

const METRICS: { key: Metric; label: string; explain: string; lowIsGood: boolean }[] = [
  { key: 'votes', label: '👍 Votes', explain: 'Most loved first. Each face is one family vote.', lowIsGood: false },
  { key: 'price', label: '💴 Price', explain: 'Cheapest per person first.', lowIsGood: true },
  { key: 'travel', label: '🚆 Travel', explain: 'Closest to the nearest hotel first.', lowIsGood: true },
  { key: 'wait', label: '⏳ Wait', explain: 'Shortest queue first.', lowIsGood: true },
  { key: 'value', label: '💎 Value', explain: 'Votes per ¥1,000: crowd favourites that don’t cost much.', lowIsGood: false },
]
const MEDALS = ['🥇', '🥈', '🥉']

/** Compare: pick what matters → everything ranked by it. */
export default function Stats({ places, raw, votes, members, voteCount, photoUrls, onOpen }: {
  places: Place[]          // with estimates filled in
  raw: Place[]             // as entered (to know what's an estimate)
  votes: Vote[]; members: Member[]; voteCount: Record<string, number>
  photoUrls: Record<string, string>; onOpen: (p: Place) => void
}) {
  const [kind, setKind] = useState<Kind>('restaurant')
  const [metric, setMetric] = useState<Metric>('votes')
  const [skipVisited, setSkipVisited] = useState(true)
  const rawById = useMemo(() => Object.fromEntries(raw.map((p) => [p.id, p])), [raw])
  const m = METRICS.find((x) => x.key === metric)!

  const all = places.filter((p) => p.kind === kind)
  const ps = all.filter((p) => !skipVisited || !p.visited)
  const visited = all.filter((p) => p.visited).length

  const value = (p: Place): number | null => {
    switch (metric) {
      case 'votes': return voteCount[p.id] ?? 0
      case 'price': return p.price_jpy
      case 'travel': return p.travel_minutes
      case 'wait': return p.wait_minutes
      case 'value': return p.price_jpy ? (voteCount[p.id] ?? 0) / (p.price_jpy / 1000) : null
    }
  }
  const guessed = (p: Place) => {
    const r = rawById[p.id]
    if (!r) return false
    return metric === 'price' || metric === 'value' ? r.price_jpy == null
      : metric === 'wait' ? r.wait_minutes == null
      : metric === 'travel' ? (r.auto_fields ?? []).includes('travel') : false
  }
  const ranked = [...ps].sort((a, b) => {
    const va = value(a), vb = value(b)
    if (va == null) return 1
    if (vb == null) return -1
    return m.lowIsGood ? va - vb : vb - va
  })
  const vals = ranked.map(value).filter((v): v is number => v != null)
  const max = Math.max(1, ...vals)
  const label = (v: number | null) => v == null ? '—'
    : metric === 'price' ? fmtYen(v) : metric === 'travel' || metric === 'wait' ? fmtMin(v)
    : metric === 'value' ? `${v.toFixed(1)} /¥1k` : String(v)

  const tab = (on: boolean) => `rounded-lg py-1.5 ${on ? 'bg-white shadow-sm' : 'text-stone-600'}`
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-sm ${on ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white text-stone-700'}`

  return (
    <div className="space-y-4 px-4 pt-4">
      <div>
        <h2 className="font-display text-2xl">Compare</h2>
        <p className="text-sm text-stone-500">Pick what matters most and everything is ranked for you. Tap a place to open it.</p>
      </div>

      <div className="grid grid-cols-2 rounded-xl bg-stone-200/70 p-1 text-sm font-medium">
        <button className={tab(kind === 'restaurant')} onClick={() => setKind('restaurant')}>🍜 Food</button>
        <button className={tab(kind === 'activity')} onClick={() => setKind('activity')}>🎢 Activities</button>
      </div>

      <div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {METRICS.map((x) => <button key={x.key} data-sound="tab" className={chip(metric === x.key)} onClick={() => setMetric(x.key)}>{x.label}</button>)}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-stone-600">{m.explain}</p>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-stone-600">
            <input type="checkbox" checked={skipVisited} onChange={(e) => setSkipVisited(e.target.checked)} className="h-4 w-4 accent-torii" />Skip been
          </label>
        </div>
      </div>

      <ol className="space-y-2">
        {ranked.length === 0 && <li className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">Nothing to compare yet.</li>}
        {ranked.map((p, i) => {
          const v = value(p), g = guessed(p)
          const voters = members.filter((mm) => votes.some((vv) => vv.place_id === p.id && vv.member_id === mm.id))
          const r = rankOf(v ?? null, vals)
          const t = g ? YELLOW : tint(m.lowIsGood ? r : r == null ? null : 1 - r)
          return (
            <li key={p.id}>
              <button onClick={() => onOpen(p)} className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2.5 text-left">
                <span className="w-6 shrink-0 text-center text-lg">{i < 3 && v ? MEDALS[i] : <span className="text-sm text-stone-400">{i + 1}</span>}</span>
                <Thumb place={p} photoUrls={photoUrls} className="h-11 w-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${p.visited ? 'text-stone-400 line-through' : ''}`}>{p.name}</p>
                  {metric === 'votes' ? (
                    // unit histogram: one face per vote
                    <div className="mt-1 flex min-h-[1.5rem] flex-wrap items-center gap-0.5">
                      {voters.length ? voters.map((vv) => (
                        <span key={vv.id} title={displayName(vv)} className="flex h-6 w-6 items-center justify-center rounded-full bg-torii/10 text-sm">{vv.emoji}</span>
                      )) : <span className="text-xs text-stone-400">No votes yet</span>}
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <span className="block h-full rounded-full" style={{ width: `${v == null ? 0 : Math.max(6, (v / max) * 100)}%`, background: g ? '#f1d36b' : t.fg, opacity: g ? 0.8 : 0.55 }} />
                      </span>
                      <span className="shrink-0 rounded-md px-1.5 text-xs font-semibold" style={{ background: t.bg, color: t.fg }}>
                        {g && '~'}{label(v)}{g && ' ✨'}
                      </span>
                    </div>
                  )}
                </div>
                {metric === 'votes' && <span className="shrink-0 text-lg font-semibold">{v}</span>}
              </button>
            </li>
          )
        })}
      </ol>
      {ranked.some(guessed) && <p className="text-[11px] text-stone-500">✨ yellow = estimate (nobody has entered it yet).</p>}

      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg">Been there</h3>
          <span className="text-sm text-stone-500">{visited} of {all.length}</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${all.length ? (visited / all.length) * 100 : 0}%` }} />
        </div>
      </section>
    </div>
  )
}
