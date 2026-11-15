import { CATEGORIES, HOTELS, catOf, displayName, estimates, regionOf, supabase, withEstimates, type HotelId, type Member, type Place } from './lib'
import { comboKey, isActivity, planTrip, type DayPlanRow, type IdeaRow } from './itinerary'

/**
 * 📥 Export everything (Maryam, 15 Nov 2026): one .xlsx, a tab each for Food, Activities, Shopping, Trip plan, Day ideas, People.
 * Reads fresh from the database so it's complete (not just what's filtered on screen). Never stores anything.
 */
type Cell = string | number | boolean | null | { value: string | number; fontWeight?: 'bold'; backgroundColor?: string; wrap?: boolean }

const clock = (m: number) => { const r = Math.round(m / 5) * 5; return `${String(Math.floor(r / 60) % 24).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }
const day = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const head = (cols: string[]): Cell[] => cols.map((c) => ({ value: c, fontWeight: 'bold', backgroundColor: '#E8E2F4' }))
const city = (p: Place) => { const r = regionOf(p); return r === 'kansai' ? 'Osaka / Kyoto' : r === 'kanto' ? 'Tokyo / Fuji' : '' }
const hotels = (hs: HotelId[] | null) => (hs ?? []).map((h) => HOTELS[h].name).join('; ')
const clean = (rows: Cell[][]) => rows.map((r) => r.map((c) => (c === '' || c == null ? null : c)))

export async function exportEverything() {
  const [m, p, v, a, pl, id, h] = await Promise.all([
    supabase.from('members').select('*').order('created_at'),
    supabase.from('places').select('*').order('created_at'),
    supabase.from('votes').select('member_id, place_id'),
    supabase.from('attendees').select('member_id, place_id'),
    supabase.from('day_plans').select('day, activity_ids, food_id, locked, idea_id, layout'),
    supabase.from('day_ideas').select('id, member_id, hotel, half_day, activity_ids, created_at, layout'),
    supabase.from('day_hearts').select('member_id, combo_key'),
  ])
  const err = m.error ?? p.error ?? v.error ?? pl.error ?? id.error ?? h.error
  if (err) throw new Error('Couldn’t load everything. Check your internet and try again.')
  const members = m.data as Member[], places = p.data as Place[]
  const votes = v.data as { member_id: string; place_id: string }[]
  const going = (a.data ?? []) as { member_id: string; place_id: string }[] // optional: older setups may lack access
  const plans = pl.data as DayPlanRow[], ideas = id.data as IdeaRow[], hearts = h.data as { member_id: string; combo_key: string }[]

  const who = new Map(members.map((x) => [x.id, displayName(x)]))
  const names = (ids: string[]) => ids.map((x) => who.get(x)).filter(Boolean).join(', ')
  const voteCount: Record<string, number> = {}
  votes.forEach((x) => { voteCount[x.place_id] = (voteCount[x.place_id] ?? 0) + 1 })
  const byVotes = (xs: Place[]) => [...xs].sort((x, y) => (voteCount[y.id] ?? 0) - (voteCount[x.id] ?? 0) || x.name.localeCompare(y.name))

  const placeCols = (food: boolean) => ['Name', 'Specialty / Description', 'City', 'Price per person (¥)',
    ...(food ? ['Halal-ness', 'Sweet / Savoury'] : []), 'Nearest hotel', 'Distance from nearest hotel', 'Travel (min)',
    'Estimated wait', 'Wait (min)', 'Time there (min)', 'Long line / notes', ...(food ? [] : ['Full day?']),
    '👍 Votes', 'Voted by', 'I’m in', 'Visited', 'Added by', 'Google Maps pin', 'Website', 'Lat', 'Lng']
  const placeRow = (x: Place, food: boolean): Cell[] => [x.name, x.description, city(x), x.price_jpy,
    ...(food ? [x.halal, x.taste === 'savory' ? 'Savoury' : x.taste === 'sweet' ? 'Sweet' : x.taste === 'both' ? 'Both' : null] : []),
    hotels(x.nearest_hotels), x.travel_text, x.travel_minutes, x.wait_text, x.wait_minutes, x.visit_minutes, x.long_line,
    ...(food ? [] : [x.full_day ? 'Yes' : 'No']),
    voteCount[x.id] ?? 0, names(votes.filter((y) => y.place_id === x.id).map((y) => y.member_id)),
    names(going.filter((y) => y.place_id === x.id).map((y) => y.member_id)), x.visited ? 'Yes' : 'No',
    who.get(x.created_by ?? '') ?? '', x.maps_url, x.website_url, x.lat, x.lng]
  const placeSheet = (xs: Place[], food: boolean) => clean([head(placeCols(food)), ...byVotes(xs).map((x) => placeRow(x, food))])

  const food = places.filter((x) => x.kind === 'restaurant')
  const acts = places.filter((x) => x.kind === 'activity' && catOf(x) === 'activity')
  const shops = places.filter((x) => x.kind === 'activity' && catOf(x) === 'shopping')

  // 🗓 Trip plan: same maths as the app (planned days + faded AI drafts), one row per stop
  const est = estimates(places)
  const days = planTrip(places.map((x) => withEstimates(x, est)), voteCount, plans)
  const trip: Cell[][] = [head(['Date', 'Hotel (night)', 'Status', 'Time', 'What', 'Type', 'Prayer stops', 'Notes'])]
  for (const d of days) {
    const base = [day(d.date), d.hotel ? HOTELS[d.hotel].name : '']
    const status = d.kind === 'flight' ? 'Fly home' : d.source === 'plan' ? (d.locked ? 'Planned 🔒' : 'Planned') : d.source === 'draft' ? 'AI draft' : 'Open'
    const note = [d.kind === 'moving' && d.from && d.hotel ? `Moving ${HOTELS[d.from].short} → ${HOTELS[d.hotel].short}` : '', d.kind === 'arrival' ? 'Arrival day' : ''].filter(Boolean).join('; ')
    const tl = d.timeline
    if (!tl) { trip.push([...base, status, '', d.kind === 'flight' ? '✈️ Fly home' : 'Nothing yet', '', '', note]); continue }
    trip.push([...base, status, clock(tl.start), '🚪 Leave hotel', '', '', note])
    for (const s of tl.steps) trip.push([...base, status, `${clock(s.arrive)}–${clock(s.leave)}`, s.places.map((x) => x.name).join(' + '),
      s.places.map((x) => (x.kind === 'restaurant' ? 'Food' : CATEGORIES[catOf(x)].label)).join(' + '),
      s.prayers.map((y) => `${y.name} ${clock(y.at)}${y.room ? ` @ ${y.room.name}` : ''}`).join('; '), ''])
    trip.push([...base, status, clock(tl.end), '🏯 Back at hotel', '', '', tl.maghrib.ok ? '' : '⚠️ Out at Maghrib'])
    if (d.supper) trip.push([...base, status, 'After Maghrib', `🌙 Supper: ${d.supper.name}`, 'Food', '', ''])
  }

  // 💡 Day ideas (+ ❤️ on the same set of activities)
  const pname = new Map(places.map((x) => [x.id, x.name]))
  const ideaRows: Cell[][] = [head(['Suggested by', 'Hotel', 'Start', 'Activities (in order)', 'Everything in the day', '❤️ Hearts', 'Hearted by', 'Sent'])]
  for (const i of [...ideas].sort((x, y) => x.hotel.localeCompare(y.hotel) || x.created_at.localeCompare(y.created_at))) {
    const steps = i.layout?.steps ?? i.activity_ids.map((x) => [x])
    const hs = hearts.filter((y) => y.combo_key === comboKey(i.activity_ids))
    const actsIn = steps.flat().filter((x) => { const pl2 = places.find((q) => q.id === x); return pl2 && isActivity(pl2) })
    ideaRows.push([who.get(i.member_id) ?? '', HOTELS[i.hotel].name, clock(i.layout?.start ?? (i.half_day ? 840 : 540)),
      actsIn.map((x) => pname.get(x)).filter(Boolean).join(' → '),
      steps.map((g) => g.map((x) => pname.get(x)).filter(Boolean).join(' + ')).filter(Boolean).join(' → '),
      hs.length, names(hs.map((y) => y.member_id)), i.created_at.slice(0, 10)])
  }

  // 👨‍👩‍👧 People
  const people: Cell[][] = [head(['Name', 'Nickname', 'Group', 'Trip planner', '👍 Votes', 'Places added', 'Day ideas'])]
  for (const x of members) people.push([x.name, x.nickname, x.grp === 'kid' ? 'Kid' : x.grp === 'teen' ? 'Teen' : 'Adult', x.is_admin ? 'Yes' : '',
    votes.filter((y) => y.member_id === x.id).length, places.filter((y) => y.created_by === x.id).length, ideas.filter((y) => y.member_id === x.id).length])

  const w = (...ns: number[]) => ns.map((width) => ({ width }))
  const foodW = w(28, 50, 14, 10, 16, 11, 34, 22, 9, 18, 9, 9, 28, 8, 30, 24, 8, 14, 40, 40, 10, 10)
  const doW = w(28, 50, 14, 10, 34, 22, 9, 18, 9, 9, 28, 9, 8, 30, 24, 8, 14, 40, 40, 10, 10)
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  type S = Parameters<typeof writeXlsxFile>[0]
  const sheets = [
    { sheet: 'Food', data: placeSheet(food, true), columns: foodW, stickyRowsCount: 1 },
    { sheet: 'Activities', data: placeSheet(acts, false), columns: doW, stickyRowsCount: 1 },
    { sheet: 'Shopping', data: placeSheet(shops, false), columns: doW, stickyRowsCount: 1 },
    { sheet: 'Trip plan', data: clean(trip), columns: w(20, 34, 12, 13, 46, 18, 40, 30), stickyRowsCount: 1 },
    { sheet: 'Day ideas', data: clean(ideaRows), columns: w(14, 34, 8, 50, 60, 9, 30, 12), stickyRowsCount: 1 },
    { sheet: 'People', data: clean(people), columns: w(14, 14, 8, 12, 9, 13, 12), stickyRowsCount: 1 },
  ] as unknown as S
  const blob = await writeXlsxFile(sheets).toBlob()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `JapanFam-everything-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 4000)
  return { food: food.length, acts: acts.length, shops: shops.length, ideas: ideas.length }
}
