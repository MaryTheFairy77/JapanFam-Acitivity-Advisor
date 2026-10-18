import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { CATEGORIES, CATEGORY_IDS, catOf, HOTELS, HOTEL_IDS, type Category, claimMember, displayName, downloadCsv, estimates, isKid, rankOf, supabase, withEstimates, type HotelId, type Kind, type Member, type Place } from '../lib'
import type { useData } from '../useData'
import PlaceCard from './PlaceCard'
import PlaceForm from './PlaceForm'
import Stats from './Stats'
const MapView = lazy(() => import('./MapView'))
const Planner = lazy(() => import('./Planner'))
import { GoingSheet, ProfileSheet, goingSummary } from './Sheets'
import { FujiScene, WaveBand } from './Art'
import { getPrefs, onPrefs, setPrefs } from '../sound'
import { ArrowUpDown, Download, EyeOff, Music2, Search, VolumeX } from 'lucide-react'

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
  const { members, places, votes, attendees, photoUrls, refresh, setPlaces, setVotes, setAttendees } = data
  const [tab, setTab] = useState<Tab>('map')
  const [sort, setSort] = useState<SortKey>('votes')
  const [hotel, setHotel] = useState<HotelId | 'all'>('all')
  const [halalOnly, setHalalOnly] = useState(false)
  const [taste, setTaste] = useState<'all' | 'sweet' | 'savory'>('all')
  const [cat, setCat] = useState<Category>('activity') // Do tab: 🎢 Activities | 🛍 Shopping
  const [hideVisited, setHideVisited] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Place | 'new' | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [music, setMusic] = useState(getPrefs().ambience)
  // link this phone to the person who picked their name (used for 'only the creator can edit')
  useEffect(() => { claimMember(me.id) }, [me.id])
  const kidMode = isKid(me)
  const canEdit = (p: Place) => !kidMode && (me.is_admin || (p.created_by != null && p.created_by === me.id))
  useEffect(() => onPrefs(() => setMusic(getPrefs().ambience)), [])
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

  // empty price/wait/visit → family's typical value (never stored), so stats + planner still work
  const est = useMemo(() => estimates(places), [places])
  const effPlaces = useMemo(() => places.map((p) => withEstimates(p, est)), [places, est])

  // comparative ranks: each place vs. the others of the same kind (food vs food, activities vs activities)
  const ranks = useMemo(() => {
    const out: Record<string, { price: number | null; travel: number | null; wait: number | null }> = {}
    const group = (p: Place) => (p.kind === 'restaurant' ? 'restaurant' : catOf(p))
    for (const g of ['restaurant', 'activity', 'shopping'] as const) {
      const ps = effPlaces.filter((p) => group(p) === g)
      const vals = (k: 'price_jpy' | 'travel_minutes' | 'wait_minutes') => ps.map((p) => p[k]).filter((v): v is number => v != null)
      const price = vals('price_jpy'), travel = vals('travel_minutes'), wait = vals('wait_minutes')
      for (const p of ps) out[p.id] = { price: rankOf(p.price_jpy, price), travel: rankOf(p.travel_minutes, travel), wait: rankOf(p.wait_minutes, wait) }
    }
    return out
  }, [effPlaces])

  const list = useMemo(() => {
    if (tab !== 'restaurant' && tab !== 'activity') return []
    const nullsLast = (a: number | null, b: number | null) =>
      a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a - b
    return places
      .filter((p) => p.kind === tab)
      .filter((p) => hotel === 'all' || p.nearest_hotels.includes(hotel))
      .filter((p) => !halalOnly || p.halal === 'Halal certified' || p.halal === 'Muslim friendly')
      .filter((p) => taste === 'all' || p.taste === taste || p.taste === 'both')
      .filter((p) => p.kind !== 'activity' || catOf(p) === cat)
      .filter((p) => !hideVisited || !p.visited)
      .filter((p) => !q || `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        switch (sort) {
          case 'votes': return (voteCount[b.id] ?? 0) - (voteCount[a.id] ?? 0)
          case 'price': return nullsLast(a.price_jpy, b.price_jpy) // unknown prices go last, never guessed
          case 'travel': return nullsLast(a.travel_minutes, b.travel_minutes)
          case 'wait': return nullsLast(a.wait_minutes ?? est.wait[a.kind], b.wait_minutes ?? est.wait[b.kind])
          default: return b.created_at.localeCompare(a.created_at)
        }
      })
  }, [places, tab, hotel, halalOnly, taste, cat, hideVisited, q, sort, voteCount, est])

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
    if (kidMode) return
    const visited = !p.visited
    setPlaces(places.map((x) => (x.id === p.id ? { ...x, visited } : x)))
    const { error } = await supabase.rpc('set_visited', { place: p.id, is_visited: visited })
    if (error) { alert(error.message); refresh() }
  }

  function exportCsv() {
    downloadCsv(`japanfam-${tab === 'activity' ? cat : tab}-${new Date().toISOString().slice(0, 10)}.csv`, list.map((p) => ({
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
      ...(p.kind === 'activity' ? { Category: CATEGORIES[catOf(p)].label } : {}),
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

  // Mount Fuji behind Food / Do / Plan / Compare (decorative, fixed to the bottom of the screen)
  const fujiBg = (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 mx-auto h-[55vh] max-w-2xl opacity-70" aria-hidden>
      <FujiScene className="h-full w-full" />
    </div>
  )

  return (
    <div className={`mx-auto max-w-2xl ${tab === 'map' ? '' : 'pb-40'}`}>
      {/* Header */}
      <header className="sticky top-0 z-[600] bg-washi/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl">JapanFam <span className="text-torii">●</span></h1>
          <div className="flex items-center gap-2">
          <button data-sound="none" onClick={() => setPrefs({ ambience: !music })} aria-label={music ? 'Turn off background music' : 'Turn on background music'}
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg ${music ? 'border-torii bg-torii/10' : 'border-stone-300 bg-white grayscale'}`}>
            {music ? <Music2 className="h-4 w-4 text-torii" /> : <VolumeX className="h-4 w-4 text-stone-500" />}
          </button>
          <button onClick={() => setProfileOpen(true)} className="flex items-center gap-2 rounded-full border border-stone-300 bg-white py-1 pl-1.5 pr-3 text-sm">
            <span className="text-lg">{me.emoji}</span>{displayName(me)}{me.is_admin && <span title="Trip planner">⭐</span>}
          </button>
          </div>
        </div>
      </header>
      <WaveBand />

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-[700] border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map((t) => (
            <button key={t.key} data-sound="tab" onClick={() => setTab(t.key)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${tab === t.key ? 'text-torii' : 'text-stone-500'}`}>
              <span className={`text-xl transition ${tab === t.key ? 'scale-110' : 'grayscale-[60%]'}`}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'map' ? (
        <Suspense fallback={<div className="h-[calc(100dvh-8rem)] animate-pulse bg-[#fbf3e6]" />}>
          <MapView places={places} voteCount={voteCount} photoUrls={photoUrls} onOpen={setEditing} />
        </Suspense>
      ) : tab === 'plan' ? (
        <Suspense fallback={<div className="p-10 text-center text-stone-400">Loading planner…</div>}>
          {fujiBg}
          <div className="relative z-10"><Planner places={effPlaces} voteCount={voteCount} /></div>
        </Suspense>
      ) : tab === 'stats' ? (
        <>
          {fujiBg}
          <div className="relative z-10"><Stats places={effPlaces} raw={places} votes={votes} members={members} voteCount={voteCount} photoUrls={photoUrls} onOpen={setEditing} /></div>
        </>
      ) : (
        <>
          {fujiBg}
          {/* Do tab: two sub-tabs */}
          {tab === 'activity' && (
            <div className="relative z-10 px-4 pt-3">
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-stone-200 bg-white p-1" role="tablist">
                {CATEGORY_IDS.map((c) => {
                  const n = places.filter((p) => p.kind === 'activity' && catOf(p) === c).length
                  return (
                    <button key={c} role="tab" aria-selected={cat === c} data-sound="tab" onClick={() => setCat(c)}
                      className={`rounded-xl py-2 text-sm font-medium transition ${cat === c ? 'bg-ink text-white shadow' : 'text-stone-600'}`}>
                      {CATEGORIES[c].emoji} {CATEGORIES[c].label} <span className="opacity-60">{n}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {/* Filters */}
          <div className="relative z-10 space-y-2 px-4 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search"
                className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-torii" />
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              <button className={chip(hotel === 'all')} onClick={() => setHotel('all')}>All hotels</button>
              {HOTEL_IDS.map((h) => (
                <button key={h} className={chip(hotel === h)} onClick={() => setHotel(h)}>{HOTELS[h].short}</button>
              ))}
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {tab === 'restaurant' && (
                <>
                  <button className={chip(halalOnly)} onClick={() => setHalalOnly(!halalOnly)}>☪︎ Halal</button>
                  <button className={chip(taste === 'savory')} onClick={() => setTaste(taste === 'savory' ? 'all' : 'savory')} aria-label="Savoury">🧂</button>
                  <button className={chip(taste === 'sweet')} onClick={() => setTaste(taste === 'sweet' ? 'all' : 'sweet')} aria-label="Sweet">🍡</button>
                </>
              )}
              <button className={chip(hideVisited) + ' inline-flex items-center gap-1'} onClick={() => setHideVisited(!hideVisited)}><EyeOff className="h-3.5 w-3.5" />Been</button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ArrowUpDown className="h-4 w-4 text-stone-500" aria-label="Sort" />
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5">
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <span className="ml-auto text-stone-500">{list.length}</span>
              <button onClick={exportCsv} disabled={!list.length} aria-label="Download CSV" title="Download CSV"
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-stone-700 disabled:opacity-40"><Download className="h-4 w-4" />CSV</button>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-stone-500">
              <span className="inline-block h-2.5 w-6 rounded-full" style={{ background: 'linear-gradient(90deg,#e2f4e9,#faf7f1,#fde4e6)' }} />
              cheaper / quicker → pricier / longer, compared with the other {tab === 'restaurant' ? 'restaurants' : CATEGORIES[cat].label.toLowerCase()}
            </p>
          </div>

          {/* List */}
          <div className="relative z-10 mt-3 space-y-3 px-4">
            {list.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-stone-300 p-8 text-center text-stone-500">
                Nothing here yet. Tap <b>+ Add</b> to suggest a {tab === 'restaurant' ? 'restaurant' : CATEGORIES[cat].one}.
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
                canEdit={canEdit(p)} photoUrls={photoUrls} ranks={ranks[p.id] ?? { price: null, travel: null, wait: null }} est={est} kidMode={kidMode}
                onVote={() => toggleVote(p)} onVisited={() => toggleVisited(p)} onEdit={() => setEditing(p)} />
            ))}
          </div>

          {!kidMode && (
          <button onClick={() => setEditing('new')}
            className="fixed bottom-20 right-1/2 z-30 mb-[env(safe-area-inset-bottom)] translate-x-1/2 rounded-full bg-torii px-6 py-3.5 font-medium text-white shadow-lg shadow-torii/30 active:scale-95">
            + Add {tab === 'restaurant' ? 'restaurant' : CATEGORIES[cat].one}
          </button>
          )}
        </>
      )}

      {profileOpen && (
        <ProfileSheet me={me} places={places} onClose={() => setProfileOpen(false)} onSaved={() => { setProfileOpen(false); refresh() }}
          onSwitch={() => { setProfileOpen(false); onLogout() }} />
      )}
      {goingFor && (
        <GoingSheet place={goingFor} members={members} attendees={attendees} onlyMemberId={kidMode ? me.id : undefined} onClose={() => setGoingFor(null)}
          onToggle={(id) => toggleGoing(id, goingFor)} />
      )}
      {editing && (
        <PlaceForm me={me} canDelete={me.is_admin} photoUrls={photoUrls}
          canEdit={editing === 'new' || canEdit(editing)} creator={editing === 'new' ? undefined : members.find((m) => m.id === editing.created_by)} kind={editing === 'new' ? (tab === 'activity' ? 'activity' : 'restaurant') : editing.kind}
          place={editing === 'new' ? null : editing} defaultCategory={cat}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
      )}
    </div>
  )
}
