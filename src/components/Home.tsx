import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Avatar } from './Face'
import { CATEGORIES, CATEGORY_IDS, catOf, regionOf, type Region, HOTELS, HOTEL_IDS, type Category, claimMember, displayName, downloadCsv, estimates, km, isKid, rankOf, supabase, withEstimates, type HotelId, type Kind, type Member, type Place } from '../lib'
import type { useData } from '../useData'
import PlaceCard, { PlaceDetail, PlaceTile } from './PlaceCard'
import PlaceForm from './PlaceForm'
import QuickAdd from './QuickAdd'
import { DeletePlace } from './ConfirmDelete'
import HotelSheet from './HotelSheet'
import { tripToolsOn, useMyPosition } from '../geo'
const MapView = lazy(() => import('./MapView'))
const HomeScreen = lazy(() => import('./HomeScreen'))
import ToolSheet, { prayerHint, type Tool } from './Tools'
import { tripToday } from '../tools'
const SuggestDay = lazy(() => import('./SuggestDay'))
const TripPlan = lazy(() => import('./TripPlan'))
import { ProfileSheet } from './Sheets'
import { FujiScene, WaveBand } from './Art'
import { getPrefs, onPrefs, setPrefs } from '../sound'
import { ChevronLeft, ChevronRight, Download, EyeOff, LayoutGrid, List, LogOut, Music2, Search, WifiOff, SlidersHorizontal, UserRound, VolumeX, X } from 'lucide-react'

/**
 * Navigation (Phase 2, 20 Nov 2026, Maryam picked "H1"): 🏠 Home is the centre with 4 big doors.
 * Map and Plan have no tab bar (a 🏠 button instead); Food and Do share a small Home · Food · Do bar (same layout, easy to flip).
 * ☰ is gone: tap your face for profile, settings, music and switching person. Compare's page is replaced by 🏆 on Home.
 */
type Tab = Kind | 'home' | 'map' | 'plan'
const BAR: { key: Tab; icon: string; label: string }[] = [
  { key: 'restaurant', icon: '🍜', label: 'Food' },
  { key: 'activity', icon: '⛩️', label: 'Activities' },
]
type SortKey = 'votes' | 'near' | 'price' | 'travel' | 'wait' | 'newest'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'votes', label: '👍 Most votes' },
  { key: 'near', label: '📍 Near me' },
  { key: 'price', label: '¥ Cheapest' },
  { key: 'travel', label: '🚗 Closest' },
  { key: 'wait', label: '⏱ Shortest wait' },
  { key: 'newest', label: '🆕 Newest' },
]

export default function Home({ me, data, onLogout }: {
  me: Member; data: ReturnType<typeof useData>; onLogout: () => void
}) {
  const { members, places, votes, photoUrls, refresh, setPlaces, setVotes } = data
  const [tab, setTabRaw] = useState<Tab>('home')
  const [planDay, setPlanDay] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool | null>(null)
  const setTab = (k: Tab) => { setTabRaw(k); if (k !== 'plan') setPlanDay(null); window.scrollTo(0, 0) }
  const [sort, setSort] = useState<SortKey>('votes')
  const [hotel, setHotel] = useState<HotelId | 'all'>('all')
  const [halalOnly, setHalalOnly] = useState(false)
  const [taste, setTaste] = useState<'all' | 'sweet' | 'savory'>('all')
  const [cat, setCat] = useState<Category>('activity') // Do tab: 🎢 Activities | 🛍 Shopping
  const [foodCity, setFoodCity] = useState<Region>('kanto') // Food tab: 🗼 Tokyo | 🦌 Osaka (shows where we're short)
  const [hideVisited, setHideVisited] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Place | 'new' | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null) // details sheet (overview → details on demand)
  const viewing = viewingId ? places.find((p) => p.id === viewingId) ?? null : null
  const [view, setView] = useState<'list' | 'grid'>(() => { try { return localStorage.getItem('jf-view2') === 'list' ? 'list' : 'grid' } catch { return 'grid' } })
  useEffect(() => { try { localStorage.setItem('jf-view2', view) } catch { /* private mode */ } }, [view])
  const [showFilters, setShowFilters] = useState(false)
  const [hotelOpen, setHotelOpen] = useState<HotelId | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pos: myPos, busy: locating, err: posErr, locate } = useMyPosition()
  const distTo = (p: Place) => (myPos && p.lat != null && p.lng != null ? km(myPos, { lat: p.lat, lng: p.lng }) : null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [music, setMusic] = useState(getPrefs().ambience)
  const [offlineTip, setOfflineTip] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const [deleting, setDeleting] = useState<Place | null>(null)
  const [planView, setPlanView] = useState<'trip' | 'idea'>('trip')
  // link this phone to the person who picked their name (used for 'only the creator can edit')
  useEffect(() => { claimMember(me.id) }, [me.id])
  const kidMode = isKid(me)
  // delete = ONLY whoever added it (Maryam, 15 Nov): no planners, no co-owners; Maryam deletes others via SQL admin_delete_place
  const canDelete = (p: Place) => !kidMode && p.created_by != null && p.created_by === me.id
  const canEdit = (p: Place) => !kidMode && (me.is_admin || (p.created_by != null && (p.created_by === me.id || (p.co_owners ?? []).includes(me.id))))
  useEffect(() => onPrefs(() => setMusic(getPrefs().ambience)), [])

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
      // food split by city; places with no pin yet show in both so they're not lost
      .filter((p) => p.kind !== 'restaurant' || regionOf(p) == null || regionOf(p) === foodCity)
      .filter((p) => !hideVisited || !p.visited)
      .filter((p) => !q || `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        switch (sort) {
          case 'votes': return (voteCount[b.id] ?? 0) - (voteCount[a.id] ?? 0)
          case 'near': return nullsLast(distTo(a), distTo(b))
          case 'price': return nullsLast(a.price_jpy, b.price_jpy) // unknown prices go last, never guessed
          case 'travel': return nullsLast(a.travel_minutes, b.travel_minutes)
          case 'wait': return nullsLast(a.wait_minutes ?? est.wait[a.kind], b.wait_minutes ?? est.wait[b.kind])
          default: return b.created_at.localeCompare(a.created_at)
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, tab, hotel, halalOnly, taste, cat, foodCity, hideVisited, q, sort, voteCount, est, myPos])

  const activeFilters = (hotel !== 'all' ? 1 : 0) + (halalOnly ? 1 : 0) + (taste !== 'all' ? 1 : 0) + (hideVisited ? 1 : 0)

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
      Votes: voteCount[p.id] ?? 0,
      'Voted by': members.filter((m) => votes.some((v) => v.place_id === p.id && v.member_id === m.id)).map(displayName),
      Visited: p.visited ? 'Yes' : 'No',
      Lat: p.lat,
      Lng: p.lng,
      Pin: p.maps_url,
    })))
  }

  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-iris bg-iris text-white' : 'border-stone-300 bg-white text-stone-700'}`

  // Mount Fuji behind Food / Do / Plan / Compare (decorative, fixed to the bottom of the screen)
  const fujiBg = (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 mx-auto h-[55vh] max-w-2xl opacity-70" aria-hidden>
      <FujiScene className="h-full w-full" />
    </div>
  )

  return (
    <div className={`mx-auto max-w-2xl ${tab === 'map' ? '' : tab === 'restaurant' || tab === 'activity' ? 'pb-40' : 'pb-10'}`}>
      {/* Header */}
      <header className="sticky top-0 z-[600] bg-washi/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          {tab !== 'home' && (
            <button onClick={() => setTab('home')} data-sound="tab" aria-label="Back to Home"
              className="-ml-3 flex h-11 w-9 items-center justify-center text-[#d65a6f] active:opacity-60">
              <ChevronLeft className="h-8 w-8" strokeWidth={2.75} />
            </button>
          )}
          {tab === 'home' && <h1 className="font-display text-2xl"><button onClick={() => setTab('home')} aria-label="JapanFam: go to Home">JapanFam <span className="text-torii">●</span></button></h1>}
          <div className="flex items-center gap-2">
          {data.offlineSince && (
            <button onClick={() => setOfflineTip((v) => !v)} aria-label="Offline: showing saved data"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-amber-400 bg-amber-100 text-amber-800">
              <WifiOff className="h-4 w-4" />
              {offlineTip && (
                <span role="status" className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl bg-ink/85 px-3 py-2 text-left text-xs font-normal text-white shadow-lg">
                  📴 Offline: showing what was saved at {new Date(data.offlineSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Votes &amp; edits need internet.
                </span>
              )}
            </button>
          )}
          <button onClick={() => setMenuOpen(true)} aria-label={`${displayName(me)}: profile and settings`} aria-expanded={menuOpen}
            className={`flex items-center gap-1.5 rounded-full border border-stone-300 bg-white py-1 pl-1 text-sm ${tab === 'home' ? 'pr-3' : 'pr-1'}`}>
            <Avatar m={me} className="h-9 w-9 text-xl" />{tab === 'home' && <><span className="max-w-[6rem] truncate">{displayName(me)}</span>{me.is_admin && <span title="Trip planner">⭐</span>}</>}
          </button>
          </div>
        </div>
      </header>
      <WaveBand />

      {/* Food / Do only: Home · Food · Do (same tile layout, so flipping between them is easy) */}
      {(tab === 'restaurant' || tab === 'activity') && (
      <nav className="fixed inset-x-0 bottom-0 z-[700] border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-2">
          {BAR.map((t) => (
            <button key={t.key} data-sound="tab" onClick={() => setTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}
              className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[13px] font-medium ${tab === t.key ? 'text-torii' : 'text-stone-500'}`}>
              <span className={`text-2xl transition ${tab === t.key ? 'scale-110' : ''}`}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>
      )}

      {tab === 'home' ? (
        <Suspense fallback={<div className="p-10 text-center text-stone-400">Loading…</div>}>
          {fujiBg}
          <HomeScreen places={effPlaces} voteCount={voteCount} photoUrls={photoUrls} onGo={(d) => setTab(d)} onOpen={(p) => setViewingId(p.id)} />
        </Suspense>
      ) : tab === 'map' ? (
        <Suspense fallback={<div className="h-[calc(100dvh-4.5rem)] animate-pulse bg-[#fbf3e6]" />}>
          <MapView me={me} members={members} places={places} voteCount={voteCount} photoUrls={photoUrls} onOpen={(p) => setViewingId(p.id)} onHotel={setHotelOpen} />
        </Suspense>
      ) : tab === 'plan' ? (
        <Suspense fallback={<div className="p-10 text-center text-stone-400">Loading planner…</div>}>
          {fujiBg}
          <div className="relative z-10">
            <div className="mx-4 mt-4 flex items-center gap-2">
            <div className="flex flex-1 rounded-full border border-stone-300 bg-white p-0.5 text-sm">
              <button onClick={() => setPlanView('trip')} className={`flex-1 rounded-full py-1.5 ${planView === 'trip' ? 'bg-iris text-white' : 'text-stone-600'}`}>🗓 Trip plan</button>
              <button onClick={() => setPlanView('idea')} className={`flex-1 rounded-full py-1.5 ${planView === 'idea' ? 'bg-iris text-white' : 'text-stone-600'}`}>💡 Suggest a day</button>
            </div>
            </div>
            {planView === 'trip'
              ? <TripPlan key={planDay ?? 'plan'} me={me} members={members} places={effPlaces} votes={votes} voteCount={voteCount} photoUrls={photoUrls} onOpen={(p) => setViewingId(p.id)} initialDay={planDay} />
              : <SuggestDay me={me} members={members} places={effPlaces} voteCount={voteCount} photoUrls={photoUrls} />}
          </div>
        </Suspense>
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
                      className={`rounded-xl py-2 text-sm font-medium transition ${cat === c ? 'bg-iris text-white shadow' : 'text-stone-600'}`}>
                      {CATEGORIES[c].emoji} {CATEGORIES[c].label} <span className="opacity-60">{n}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {/* Food tab: Tokyo | Osaka sub-tabs (counts show where we're short) */}
          {tab === 'restaurant' && (
            <div className="relative z-10 px-4 pt-3">
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-stone-200 bg-white p-1" role="tablist">
                {([['kanto', '🗼 Tokyo & Fuji'], ['kansai', '🦌 Osaka & Kyoto']] as const).map(([r, label]) => {
                  const n = places.filter((p) => p.kind === 'restaurant' && regionOf(p) === r).length
                  return (
                    <button key={r} role="tab" aria-selected={foodCity === r} data-sound="tab" onClick={() => setFoodCity(r)}
                      className={`rounded-xl py-2 text-sm font-medium transition ${foodCity === r ? 'bg-iris text-white shadow' : 'text-stone-600'}`}>
                      {label} <span className="opacity-60">{n}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {/* Filters: one compact row; the rest folds away (zoom & filter without the scrolling) */}
          <div className="relative z-10 space-y-2 px-4 pt-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search"
                  className="h-10 w-full rounded-xl border border-stone-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-torii" />
              </div>
              <select value={sort} aria-label="Sort by" onChange={(e) => { const k = e.target.value as SortKey; setSort(k); if (k === 'near') locate() }}
                className={`h-10 shrink-0 rounded-xl border border-iris bg-iris px-2 text-sm font-medium text-white outline-none ${sort === 'near' && locating ? 'animate-pulse' : ''}`}>
                {SORTS.filter((s) => s.key !== 'near' || tripToolsOn()).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-label="Filters and view"
                className={`relative inline-flex h-10 items-center gap-1 rounded-xl border px-2.5 text-sm ${showFilters ? 'border-iris bg-iris text-white' : 'border-stone-300 bg-white text-stone-700'}`}>
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilters > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-torii text-[10px] text-white">{activeFilters}</span>}
              </button>
            </div>
            {showFilters && (
              <div className="space-y-2 rounded-2xl border border-stone-200 bg-white/90 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-stone-600">Show as</span>
                  <div className="flex rounded-xl border border-stone-300 bg-white p-0.5" role="group" aria-label="View">
                    <button onClick={() => setView('grid')} aria-pressed={view === 'grid'} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm ${view === 'grid' ? 'bg-iris text-white' : 'text-stone-600'}`}><LayoutGrid className="h-4 w-4" />Tiles</button>
                    <button onClick={() => setView('list')} aria-pressed={view === 'list'} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm ${view === 'list' ? 'bg-iris text-white' : 'text-stone-600'}`}><List className="h-4 w-4" />List</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={chip(hotel === 'all')} onClick={() => setHotel('all')}>All hotels</button>
                  {HOTEL_IDS.map((h) => (
                    <button key={h} className={chip(hotel === h)} onClick={() => setHotel(h)}>{HOTELS[h].short}</button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {tab === 'restaurant' && (
                    <>
                      <button className={chip(halalOnly)} onClick={() => setHalalOnly(!halalOnly)}>☪︎ Halal</button>
                      <button className={chip(taste === 'savory')} onClick={() => setTaste(taste === 'savory' ? 'all' : 'savory')} aria-label="Savoury">🧂 Savoury</button>
                      <button className={chip(taste === 'sweet')} onClick={() => setTaste(taste === 'sweet' ? 'all' : 'sweet')} aria-label="Sweet">🍡 Sweet</button>
                    </>
                  )}
                  <button className={chip(hideVisited) + ' inline-flex items-center gap-1'} onClick={() => setHideVisited(!hideVisited)}><EyeOff className="h-3.5 w-3.5" />Hide been</button>
                </div>
                <div className="flex items-center gap-2 border-t border-stone-100 pt-2">
                  <p className="flex items-center gap-1.5 text-[11px] text-stone-500">
                    <span className="inline-block h-2.5 w-6 shrink-0 rounded-full" style={{ background: 'linear-gradient(90deg,#e2f4e9,#faf7f1,#fde4e6)' }} />
                    green = cheaper / quicker, red = pricier / longer, yellow ✨ = estimate
                  </p>
                  <button onClick={exportCsv} disabled={!list.length} aria-label="Download CSV" title="Download CSV"
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 disabled:opacity-40"><Download className="h-3.5 w-3.5" />CSV</button>
                </div>
              </div>
            )}
            {sort === 'near' && posErr && <p className="text-xs text-torii">{posErr}</p>}
            <p className="text-xs text-stone-500">{list.length} {list.length === 1 ? 'place' : 'places'}{activeFilters > 0 && <> · <button className="underline" onClick={() => { setHotel('all'); setHalalOnly(false); setTaste('all'); setHideVisited(false) }}>clear filters</button></>}</p>
          </div>

          {/* List */}
          <div className="relative z-10 mt-2 space-y-2 px-4">
            {list.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-stone-300 p-8 text-center text-stone-500">
                Nothing here yet. Tap <b>+ Add</b> to suggest a {tab === 'restaurant' ? 'restaurant' : CATEGORIES[cat].one}.
              </div>
            )}
            {view === 'grid' ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {list.map((p) => (
                  <PlaceTile key={p.id} place={p} votes={voteCount[p.id] ?? 0} photoUrls={photoUrls}
                    mine={votes.some((v) => v.place_id === p.id && v.member_id === me.id)} nearKm={sort === 'near' ? distTo(p) : null}
                    onVote={() => toggleVote(p)} onOpen={() => setViewingId(p.id)} />
                ))}
              </div>
            ) : list.map((p, i) => (
              <PlaceCard key={p.id} place={p} rank={sort === 'votes' ? i + 1 : undefined} votes={voteCount[p.id] ?? 0}
                mine={votes.some((v) => v.place_id === p.id && v.member_id === me.id)}
                photoUrls={photoUrls} ranks={ranks[p.id] ?? { price: null, travel: null, wait: null }} est={est} nearKm={sort === 'near' ? distTo(p) : null}
                onVote={() => toggleVote(p)} onOpen={() => setViewingId(p.id)} />
            ))}
          </div>

          {!kidMode && (
          <button onClick={() => setQuickAdd(true)}
            className="fixed bottom-20 right-1/2 z-30 mb-[env(safe-area-inset-bottom)] translate-x-1/2 rounded-full bg-torii px-6 py-3.5 font-medium text-white shadow-lg shadow-torii/30 active:scale-95">
            + Add {tab === 'restaurant' ? 'restaurant' : CATEGORIES[cat].one}
          </button>
          )}
        </>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/40" onClick={() => setMenuOpen(false)}>
          <nav onClick={(e) => e.stopPropagation()} aria-label="You and settings"
            className="w-full max-w-2xl rounded-t-3xl bg-washi p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
            <span className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-stone-300" aria-hidden />
            <div className="flex items-center gap-3">
              <Avatar m={me} className="h-14 w-14 text-3xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold">{displayName(me)}</p>
                <p className="text-sm text-stone-500">{me.is_admin ? '⭐ Trip planner' : 'Family member'} · {votes.filter((v) => v.member_id === me.id).length} 👍</p>
              </div>
              <button onClick={() => setMenuOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl bg-white">
              <button onClick={() => { setMenuOpen(false); setProfileOpen(true) }} className="flex min-h-[60px] w-full items-center gap-3 border-b border-stone-100 px-4 text-left">
                <UserRound className="h-5 w-5 text-iris" /><span className="flex-1 font-medium">Profile & settings<span className="block text-xs font-normal text-stone-500">Emoji, colour, nickname, export</span></span><ChevronRight className="h-4 w-4 text-stone-400" />
              </button>
              <button onClick={() => { setMenuOpen(false); setTab('plan'); setPlanView('trip'); setPlanDay(tripToday().day.date) }} className="flex min-h-[60px] w-full items-center gap-3 border-b border-stone-100 px-4 text-left">
                <span className="w-5 text-center text-xl">✨</span><span className="flex-1 font-medium">Suggested for {tripToday().phase === 'during' ? 'today' : 'day 1'}<span className="block text-xs font-normal text-stone-500">Opens it in the trip plan</span></span><ChevronRight className="h-4 w-4 text-stone-400" />
              </button>
              {([['prayer', '🕌', 'Salah times', prayerHint()], ['money', '💴', '¥ ↔ R converter', 'Works offline'], ['taxi', '🚕', 'Taxi card', "Tonight's hotel in Japanese"]] as const).map(([k, e, label, sub]) => (
                <button key={k} onClick={() => { setMenuOpen(false); setTool(k) }} className="flex min-h-[60px] w-full items-center gap-3 border-b border-stone-100 px-4 text-left">
                  <span className="w-5 text-center text-xl">{e}</span><span className="flex-1 font-medium">{label}<span className="block text-xs font-normal text-stone-500">{sub}</span></span><ChevronRight className="h-4 w-4 text-stone-400" />
                </button>
              ))}
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl bg-white">
              <button data-sound="none" onClick={() => setPrefs({ ambience: !music })} aria-pressed={music} className="flex min-h-[60px] w-full items-center gap-3 border-b border-stone-100 px-4 text-left">
                {music ? <Music2 className="h-5 w-5 text-torii" /> : <VolumeX className="h-5 w-5 text-stone-500" />}<span className="flex-1 font-medium">Background music</span>
                <span className={`relative h-7 w-12 rounded-full transition ${music ? 'bg-iris' : 'bg-stone-300'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${music ? 'left-[22px]' : 'left-0.5'}`} /></span>
              </button>
              <button onClick={() => { setMenuOpen(false); onLogout() }} className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left">
                <LogOut className="h-5 w-5 text-stone-500" /><span className="flex-1 font-medium">Switch person</span>
              </button>
            </div>
          </nav>
        </div>
      )}
      {tool && <ToolSheet tool={tool} onClose={() => setTool(null)} />}
      {profileOpen && (
        <ProfileSheet me={me} places={places} onClose={() => setProfileOpen(false)} onSaved={() => { setProfileOpen(false); refresh() }}
          onSwitch={() => { setProfileOpen(false); onLogout() }} />
      )}
      {hotelOpen && !viewing && (
        <HotelSheet id={hotelOpen} places={places} photoUrls={photoUrls} onClose={() => setHotelOpen(null)}
          onOpenPlace={(p) => setViewingId(p.id)} />
      )}
      {viewing && !editing && (
        <PlaceDetail place={viewing} votes={voteCount[viewing.id] ?? 0}
          mine={votes.some((v) => v.place_id === viewing.id && v.member_id === me.id)}
          voters={members.filter((m) => votes.some((v) => v.place_id === viewing.id && v.member_id === m.id))}
          owners={[viewing.created_by, ...(viewing.co_owners ?? [])].map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m)}
          canEdit={canEdit(viewing)} photoUrls={photoUrls} ranks={ranks[viewing.id] ?? { price: null, travel: null, wait: null }} est={est} kidMode={kidMode}
          onClose={() => setViewingId(null)} onVote={() => toggleVote(viewing)} onVisited={() => toggleVisited(viewing)}
          onEdit={() => setEditing(viewing)} onHotel={(h) => { setViewingId(null); setHotelOpen(h) }}
          onDelete={canDelete(viewing) ? () => setDeleting(viewing) : undefined} />
      )}
      {quickAdd && (
        <QuickAdd me={me} places={places} members={members} defaultKind={tab === 'activity' ? 'activity' : 'restaurant'} defaultCategory={cat}
          onClose={() => setQuickAdd(false)} onOpenPlace={(id) => { setQuickAdd(false); setViewingId(id) }}
          onManual={() => { setQuickAdd(false); setEditing('new') }}
          onSaved={async (id) => { setQuickAdd(false); await refresh(); setViewingId(id) }} />
      )}
      {editing && (
        <PlaceForm me={me} canDelete={editing !== 'new' && canDelete(editing)} onDelete={() => editing !== 'new' && setDeleting(editing)} photoUrls={photoUrls}
          canEdit={editing === 'new' || canEdit(editing)} creator={editing === 'new' ? undefined : members.find((m) => m.id === editing.created_by)} kind={editing === 'new' ? (tab === 'activity' ? 'activity' : 'restaurant') : editing.kind}
          place={editing === 'new' ? null : editing} defaultCategory={cat}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
      )}
      {deleting && (
        <DeletePlace place={deleting} me={me} members={members} onClose={() => setDeleting(null)}
          onDone={() => { setPlaces(places.filter((x) => x.id !== deleting.id)); setVotes(votes.filter((v) => v.place_id !== deleting.id)); setDeleting(null); setEditing(null); setViewingId(null); refresh() }} />
      )}
    </div>
  )
}
