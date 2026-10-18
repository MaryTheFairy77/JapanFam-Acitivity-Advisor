import { useMemo, useState } from 'react'
import { HOTELS, HOTEL_IDS, displayName, downloadCsv, supabase, type HotelId, type Kind, type Member, type Place } from '../lib'
import type { useData } from '../useData'
import PlaceCard from './PlaceCard'
import PlaceForm from './PlaceForm'
import Stats from './Stats'
import MapView from './MapView'
import Planner from './Planner'
import { GoingSheet, ProfileSheet, goingSummary } from './Sheets'
import { WaveBand } from './Art'

type Tab = Kind | 'stats' | 'map' | 'plan'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'map', icon: '🗾', label: 'Map' },
  { key: 'restaurant', icon: '🍜', label: 'Food' },
  { key: 'activity', icon: '🎢', label: 'Do' },
  { key: 'plan', icon: '🗓️', label: 'Plan' },
  { key: 'stats', icon: '📊', label: 'Compare' },
]
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
  const { members, places, votes, attendees, refresh, setPlaces, setVotes, setAttendees } = data
  const [tab, setTab] = useState<Tab>('map')
  const [sort, setSort] = useState<SortKey>('votes')
  const [hotel, setHotel] = useState<HotelId | 'all'>('all')
  const [halalOnly, setHalalOnly] = useState(false)
  const [taste, setTaste] = useState<'all' | 'sweet' | 'savory'>('all')
  const [hideVisited, setHideVisited] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Place | 'new' | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [goingFor, setGoingFor] = useState<Place | null>(null)

  async function toggleGoing(memberId: string, p: Place) {
    const on = attendees.some((a) => a.place_id === p.id && a.member_id === memberId)
    setAttendees(on ? attendees.filter((a) => !(a.place_id === p.id && a.member_id === memberId)) : [...attendees, { member_id: memberId, place_id: p.id }])
    const { error } = on
      ? await supabase.from('attendees').delete().match({ member_id: memberId, place_id: p.id })
      : await supabase.from('attendees').insert({ member_id: memberId, place_id: p.id })
    if (error) { alert(error.message); refresh() }
  }

  const voteCount = useMemo(() => {
    const c: Record<string, number> = {}
    votes.forEach((v) => { c[v.place_id] = (c[v.place_id] ?? 0) + 1 })
    return c
  }, [votes])

  const list = useMemo(() => {
    if (tab !== 'restaurant' && tab !== 'activity') return []
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

  function exportCsv() {
    downloadCsv(`japanfam-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, list.map((p) => ({
      Name: p.name,
      'Specialty / Description': p.description,
      'Price per person (JPY)': p.price_jpy,
      ...(p.kind === 'restaurant' ? { 'Halal-ness': p.halal, 'Sweet / Savory': p.taste } : {}),
      'Nearest Hotel': p.nearest_hotels.map((h) => HOTELS[h].name),
      'Distance from Nearest Hotel': p.travel_text,
      'Travel (min)': p.travel_minutes,
      'Estimated wait': p.wait_text,
      'Wait (min)': p.wait_minutes,
      'Time there (min)': p.visit_minutes,
      'Long line': p.long_line,
      Website: p.website_url,
      ...Object.fromEntries(goingSummary(p.id, members, attendees).counts.map((c) => [`Going (${c.g.many})`, c.n])),
      'Who is going': members.filter((m) => attendees.some((a) => a.place_id === p.id && a.member_id === m.id)).map(displayName),
      Votes: voteCount[p.id] ?? 0,
      'Voted by': members.filter((m) => votes.some((v) => v.place_id === p.id && v.member_id === m.id)).map(displayName),
      Visited: p.visited ? 'Yes' : 'No',
      Lat: p.lat,
      Lng: p.lng,
      Pin: p.maps_url,
    })))
  }

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white text-stone-700'}`

  return (
    <div className={`mx-auto max-w-2xl ${tab === 'map' ? '' : 'pb-40'}`}>
      {/* Header */}
      <header className="sticky top-0 z-[600] bg-washi/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl">JapanFam <span className="text-torii">●</span></h1>
          <button onClick={() => setProfileOpen(true)} className="flex items-center gap-2 rounded-full border border-stone-300 bg-white py-1 pl-1.5 pr-3 text-sm">
            <span className="text-lg">{me.emoji}</span>{displayName(me)}{me.is_admin && <span title="Trip planner">⭐</span>}
          </button>
        </div>
      </header>
      <WaveBand />

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-[700] border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${tab === t.key ? 'text-torii' : 'text-stone-500'}`}>
              <span className={`text-xl transition ${tab === t.key ? 'scale-110' : 'grayscale-[60%]'}`}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'map' ? (
        <MapView places={places} voteCount={voteCount} onOpen={(p) => setEditing(p)} />
      ) : tab === 'plan' ? (
        <Planner places={places} voteCount={voteCount} />
      ) : tab === 'stats' ? (
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
              <button onClick={exportCsv} disabled={!list.length}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-stone-700 disabled:opacity-40">⬇ CSV</button>
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
                going={goingSummary(p.id, members, attendees)}
                imGoing={attendees.some((a) => a.place_id === p.id && a.member_id === me.id)}
                onImIn={() => toggleGoing(me.id, p)} onGoing={() => setGoingFor(p)}
                onVote={() => toggleVote(p)} onVisited={() => toggleVisited(p)} onEdit={() => setEditing(p)} />
            ))}
          </div>

          <button onClick={() => setEditing('new')}
            className="fixed bottom-20 right-1/2 z-30 mb-[env(safe-area-inset-bottom)] translate-x-1/2 rounded-full bg-torii px-6 py-3.5 font-medium text-white shadow-lg shadow-torii/30 active:scale-95">
            + Add {tab === 'restaurant' ? 'restaurant' : 'activity'}
          </button>
        </>
      )}

      {profileOpen && (
        <ProfileSheet me={me} onClose={() => setProfileOpen(false)} onSaved={() => { setProfileOpen(false); refresh() }}
          onSwitch={() => { setProfileOpen(false); onLogout() }} />
      )}
      {goingFor && (
        <GoingSheet place={goingFor} members={members} attendees={attendees} onClose={() => setGoingFor(null)}
          onToggle={(id) => toggleGoing(id, goingFor)} />
      )}
      {editing && (
        <PlaceForm me={me} canDelete={me.is_admin} kind={editing === 'new' ? (tab === 'activity' ? 'activity' : 'restaurant') : editing.kind}
          place={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
      )}
    </div>
  )
}
