import { useMemo, useState } from 'react'
import { HOTELS, HOTEL_IDS, supabase, type HotelId, type Kind, type Member, type Place } from '../lib'
import type { useData } from '../useData'
import PlaceCard from './PlaceCard'
import PlaceForm from './PlaceForm'
import Stats from './Stats'

type Tab = Kind | 'stats'
type SortKey = 'votes' | 'price' | 'travel' | 'wait' | 'newest'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'votes', label: '👍 Most votes' },
  { key: 'price', label: '¥ Cheapest' },
  { key: 'travel', label: '🚗 Closest' },
  { key: 'wait', label: '⏱ Shortest wait' },
  { key: 'newest', label: '🆕 Newest' },
]

export default function Home({ me, data, onLogout }: {
  me: Member; data: ReturnType<typeof useData>; onLogout: () => void
}) {
  const { members, places, votes, refresh, setPlaces, setVotes } = data
  const [tab, setTab] = useState<Tab>('restaurant')
  const [sort, setSort] = useState<SortKey>('votes')
  const [hotel, setHotel] = useState<HotelId | 'all'>('all')
  const [halalOnly, setHalalOnly] = useState(false)
  const [taste, setTaste] = useState<'all' | 'sweet' | 'savory'>('all')
  const [hideVisited, setHideVisited] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Place | 'new' | null>(null)

  const voteCount = useMemo(() => {
    const c: Record<string, number> = {}
    votes.forEach((v) => { c[v.place_id] = (c[v.place_id] ?? 0) + 1 })
    return c
  }, [votes])

  const list = useMemo(() => {
    if (tab === 'stats') return []
    const nullsLast = (a: number | null, b: number | null) =>
      a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a - b
    return places
      .filter((p) => p.kind === tab)
      .filter((p) => hotel === 'all' || p.nearest_hotels.includes(hotel))
      .filter((p) => !halalOnly || p.halal === 'Halal certified' || p.halal === 'Muslim friendly')
      .filter((p) => taste === 'all' || p.taste === taste || p.taste === 'both')
      .filter((p) => !hideVisited || !p.visited)
      .filter((p) => !q || `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        switch (sort) {
          case 'votes': return (voteCount[b.id] ?? 0) - (voteCount[a.id] ?? 0)
          case 'price': return nullsLast(a.price_jpy, b.price_jpy)
          case 'travel': return nullsLast(a.travel_minutes, b.travel_minutes)
          case 'wait': return nullsLast(a.wait_minutes, b.wait_minutes)
          default: return b.created_at.localeCompare(a.created_at)
        }
      })
  }, [places, tab, hotel, halalOnly, taste, hideVisited, q, sort, voteCount])

  async function toggleVote(p: Place) {
    const mine = votes.some((v) => v.place_id === p.id && v.member_id === me.id)
    // optimistic
    setVotes(mine ? votes.filter((v) => !(v.place_id === p.id && v.member_id === me.id)) : [...votes, { member_id: me.id, place_id: p.id }])
    const { error } = mine
      ? await supabase.from('votes').delete().match({ member_id: me.id, place_id: p.id })
      : await supabase.from('votes').insert({ member_id: me.id, place_id: p.id })
    if (error) { alert(error.message); refresh() }
  }

  async function toggleVisited(p: Place) {
    const visited = !p.visited
    setPlaces(places.map((x) => (x.id === p.id ? { ...x, visited } : x)))
    const { error } = await supabase.from('places')
      .update({ visited, visited_at: visited ? new Date().toISOString() : null }).eq('id', p.id)
    if (error) { alert(error.message); refresh() }
  }

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white text-stone-700'}`

  return (
    <div className="mx-auto max-w-2xl pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-washi/90 px-4 pb-2 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl">JapanFam <span className="text-torii">●</span></h1>
          <button onClick={onLogout} className="flex items-center gap-2 rounded-full border border-stone-300 bg-white py-1 pl-1.5 pr-3 text-sm">
            <span className="text-lg">{me.emoji}</span>{me.name}<span className="text-stone-400">· switch</span>
          </button>
        </div>
        <nav className="mt-3 grid grid-cols-3 rounded-xl bg-stone-200/70 p-1 text-sm font-medium">
          {([['restaurant', '🍜 Food'], ['activity', '🎢 Activities'], ['stats', '📊 Compare']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-2 ${tab === k ? 'bg-white shadow-sm' : 'text-stone-600'}`}>{l}</button>
          ))}
        </nav>
      </header>

      {tab === 'stats' ? (
        <Stats places={places} votes={votes} members={members} voteCount={voteCount} />
      ) : (
        <>
          {/* Filters */}
          <div className="space-y-2 px-4 pt-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-torii" />
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              <button className={chip(hotel === 'all')} onClick={() => setHotel('all')}>All hotels</button>
              {HOTEL_IDS.map((h) => (
                <button key={h} className={chip(hotel === h)} onClick={() => setHotel(h)}>{HOTELS[h].short}</button>
              ))}
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {tab === 'restaurant' && (
                <>
                  <button className={chip(halalOnly)} onClick={() => setHalalOnly(!halalOnly)}>☪️ Halal / Muslim-friendly</button>
                  <button className={chip(taste === 'savory')} onClick={() => setTaste(taste === 'savory' ? 'all' : 'savory')}>🧂 Savoury</button>
                  <button className={chip(taste === 'sweet')} onClick={() => setTaste(taste === 'sweet' ? 'all' : 'sweet')}>🍡 Sweet</button>
                </>
              )}
              <button className={chip(hideVisited)} onClick={() => setHideVisited(!hideVisited)}>Hide visited</button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-stone-500">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5">
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <span className="ml-auto text-stone-500">{list.length} place{list.length === 1 ? '' : 's'}</span>
            </div>
          </div>

          {/* List */}
          <div className="mt-3 space-y-3 px-4">
            {list.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-stone-300 p-8 text-center text-stone-500">
                Nothing here yet. Tap <b>+ Add</b> to suggest a {tab === 'restaurant' ? 'restaurant' : 'activity'}.
              </div>
            )}
            {list.map((p, i) => (
              <PlaceCard key={p.id} place={p} rank={sort === 'votes' ? i + 1 : undefined}
                voters={members.filter((m) => votes.some((v) => v.place_id === p.id && v.member_id === m.id))}
                addedBy={members.find((m) => m.id === p.created_by)}
                mine={votes.some((v) => v.place_id === p.id && v.member_id === me.id)}
                onVote={() => toggleVote(p)} onVisited={() => toggleVisited(p)} onEdit={() => setEditing(p)} />
            ))}
          </div>

          <button onClick={() => setEditing('new')}
            className="fixed bottom-6 right-1/2 z-30 translate-x-1/2 rounded-full bg-torii px-6 py-3.5 font-medium text-white shadow-lg shadow-torii/30 active:scale-95">
            + Add {tab === 'restaurant' ? 'restaurant' : 'activity'}
          </button>
        </>
      )}

      {editing && (
        <PlaceForm me={me} kind={editing === 'new' ? (tab === 'stats' ? 'restaurant' : tab) : editing.kind}
          place={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
      )}
    </div>
  )
}
