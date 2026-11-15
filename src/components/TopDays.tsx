import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'
import { HOTELS, HOTEL_IDS, avatarBg, displayName, supabase, type HotelId, type Member, type Place } from '../lib'
import { buildTimeline, comboKey, ideaScore, isActivity, openDates, type IdeaRow, type Layout, type PlannedDay, type Timeline } from '../itinerary'
import Thumb from './Thumb'
import Face, { Avatar } from './Face'
import { clock, dayLabel, setLayout } from './TripPlan'
import { TimelineView } from './DayBuilder'

/**
 * 🏆 Day leaderboard (Maryam, 15 Nov 2026): every suggested day (💡 ideas + 🤖 AI drafts + planned days) ranked by ❤️.
 * A day = its SET of activities, so identical days are one card (makers + hearts merge) → no duplicate days.
 * Named after whoever made it ("Maryam's Tokyo lights"); the word + vibe line come from Gemini once (day-vibe, cached).
 * Trip plan shows the top 3 as square covers in their own box; "See all" opens the full list.
 */
type Vibe = { word: string; emoji: string; vibe: string; story?: string | null }
export type Entry = {
  key: string; hotel: HotelId; steps: Place[][]; start: number; makers: Member[]; ai: boolean; planner: boolean
  onDate: string | null; tl: Timeline; hearts: string[]; score: number
}
const city = (h: HotelId) => (HOTELS[h].region === 'kansai' ? 'Osaka' : 'Tokyo')
export const entryTitle = (e: Entry, v?: Vibe) => {
  const w = v?.word ?? 'day'
  if (e.makers.length) return `${displayName(e.makers[0])}'s ${city(e.hotel)} ${w}`
  return e.planner ? `Planners' ${city(e.hotel)} ${w}` : `Family's ${city(e.hotel)} ${w}`
}

/** Hearts + AI vibes, with missing vibes fetched (a few at a time) from the day-vibe function. */
export function useBoard(me: Member, members: Member[], places: Place[], ideas: IdeaRow[], days: PlannedDay[], voteCount: Record<string, number>) {
  const [hearts, setHearts] = useState<{ member_id: string; combo_key: string }[]>([])
  const [vibes, setVibes] = useState<Record<string, Vibe>>({})
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const entries = useMemo(() => {
    const map = new Map<string, Entry>()
    const add = (hotel: HotelId, steps: Place[][], start: number, date: string, maker: Member | null, kind: 'idea' | 'draft' | 'plan', onDate: string | null) => {
      const ids = [...new Set(steps.flat().filter(isActivity).map((p) => p.id))]
      if (!ids.length) return
      const key = comboKey(ids)
      const k = hotel + '|' + key
      const e = map.get(k)
      if (e) {
        if (maker && !e.makers.some((m) => m.id === maker.id)) e.makers.push(maker)
        if (kind !== 'draft') e.ai = false
        if (kind === 'plan') e.planner = !e.makers.length
        if (onDate) e.onDate = onDate
        return
      }
      map.set(k, { key, hotel, steps, start, makers: maker ? [maker] : [], ai: kind === 'draft', planner: kind === 'plan', onDate,
        tl: buildTimeline(steps, hotel, start, date), hearts: [], score: ideaScore({ activity_ids: ids } as IdeaRow, voteCount) })
    }
    const ref = (h: HotelId) => openDates(days, h)[0]?.date ?? days.find((d) => d.hotel === h)?.date ?? '2026-12-27'
    for (const i of [...ideas].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const steps = (i.layout?.steps ?? i.activity_ids.map((x) => [x])).map((g) => g.map((id) => byId.get(id)).filter((p): p is Place => !!p)).filter((g) => g.length)
      add(i.hotel, steps, i.layout?.start ?? (i.half_day ? 840 : 540), ref(i.hotel), memberById.get(i.member_id) ?? null, 'idea', null)
    }
    for (const d of days) if (d.hotel && d.steps.length && d.source !== 'none') add(d.hotel, d.steps, d.start, d.date, null, d.source === 'plan' ? 'plan' : 'draft', d.source === 'plan' ? d.date : null)
    const out = [...map.values()]
    for (const e of out) e.hearts = hearts.filter((h) => h.combo_key === e.key).map((h) => h.member_id)
    return out.sort((a, b) => b.hearts.length - a.hearts.length || b.score - a.score)
  }, [ideas, days, byId, memberById, hearts, voteCount])

  const load = useCallback(async () => {
    const [h, v] = await Promise.all([supabase.from('day_hearts').select('member_id, combo_key'), supabase.from('day_vibes').select('combo_key, word, emoji, vibe, story')])
    if (h.data) setHearts(h.data)
    if (v.data) setVibes(Object.fromEntries(v.data.map((r) => [r.combo_key, { word: r.word, emoji: r.emoji, vibe: r.vibe, story: r.story }])))
  }, [])
  useEffect(() => { load() }, [load])

  // name the top days that have no vibe yet (sequential, max 4 per visit: free tier friendly)
  const missing = entries.slice(0, 12).filter((e) => !vibes[e.key]?.story).slice(0, 4).map((e) => e.key + '|' + e.steps.flat().map((p) => p.id).join(',')).join(';')
  useEffect(() => {
    if (!missing) return
    let stop = false
    ;(async () => {
      for (const item of missing.split(';')) {
        if (stop) return
        const [key, order] = item.split('|')
        const { data } = await supabase.functions.invoke('day-vibe', { body: { ids: [...new Set(order.split(','))].slice(0, 12), key } })
        if (data && !data.error && !stop) setVibes((v) => ({ ...v, [key]: data as Vibe }))
        else return // busy: try again next visit
      }
    })()
    return () => { stop = true }
  }, [missing])

  async function heart(key: string) {
    const mine = hearts.some((h) => h.combo_key === key && h.member_id === me.id)
    setHearts(mine ? hearts.filter((h) => !(h.combo_key === key && h.member_id === me.id)) : [...hearts, { member_id: me.id, combo_key: key }])
    const r = mine
      ? await supabase.from('day_hearts').delete().eq('member_id', me.id).eq('combo_key', key)
      : await supabase.from('day_hearts').insert({ member_id: me.id, combo_key: key })
    if (r.error) load()
  }
  return { entries, vibes, heart, memberById }
}

type Board = ReturnType<typeof useBoard>

function Cover({ e, v, className = '' }: { e: Entry; v?: Vibe; className?: string }) {
  const m = e.makers[0]
  return m ? <Avatar m={m} className={className} />
    : <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-stone-200 leading-none ${className}`}>{e.planner ? '⭐' : v?.emoji ?? '🤖'}</span>
}

/** 🏆 Top 3 box at the top of the trip plan: square covers (avatar emoji on its pastel, title, ❤️). */
export function Top3({ me, board, onAll, onPeek }: { me: Member; board: Board; onAll: () => void; onPeek: (e: Entry) => void }) {
  const top = board.entries.slice(0, 3)
  if (!top.length) return null
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-3" aria-label="Top days">
      <div className="mb-2 flex items-center">
        <h3 className="flex-1 text-[15px] font-semibold">🏆 Top days</h3>
        <button onClick={onAll} className="h-9 rounded-full px-2 text-sm font-semibold text-torii">See all {board.entries.length} ›</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {top.map((e, i) => {
          const v = board.vibes[e.key], mine = e.hearts.includes(me.id)
          return (
            <button key={e.hotel + e.key} onClick={() => onPeek(e)} className="relative flex aspect-square flex-col items-center justify-center rounded-2xl p-1.5 text-center"
              style={{ backgroundColor: e.makers[0] ? avatarBg(e.makers[0]) : '#e7e5e4' }}>
              <span className="absolute left-1.5 top-1 text-base">{['🥇', '🥈', '🥉'][i]}</span>
              <span className={`absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${mine ? 'bg-torii text-white' : 'bg-white text-torii'}`}>❤️ {e.hearts.length}</span>
              <span className="mt-2 text-4xl leading-none">{e.makers[0]?.emoji ?? (e.planner ? '⭐' : v?.emoji ?? '🤖')}</span>
              <span className="mt-1.5 line-clamp-2 font-display text-[11px] leading-tight">{entryTitle(e, v)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Full ranked list ("See all"). */
export function TopDaysPage({ me, board, photoUrls, days, onClose, run, reload }: {
  me: Member; board: Board; photoUrls: Record<string, string>; days: PlannedDay[]
  onClose: () => void; run: (fn: (c: string) => Promise<boolean>) => Promise<boolean>; reload: () => void
}) {
  const [hotel, setHotel] = useState<HotelId | 'all'>('all')
  const [msg, setMsg] = useState<string | null>(null)
  const [peek, setPeek] = useState<Entry | null>(null)
  const list = board.entries.filter((e) => hotel === 'all' || e.hotel === hotel)
  const order = [...HOTEL_IDS].sort((a, b) => (days.find((d) => d.hotel === a)?.date ?? '').localeCompare(days.find((d) => d.hotel === b)?.date ?? ''))

  async function put(e: Entry, date: string) {
    const lay: Layout = { start: e.start, steps: e.steps.map((g) => g.map((p) => p.id)) }
    const ok = await run((c) => setLayout(c, date, e.key.split('+'), lay, false, null))
    setMsg(ok ? `📌 Put on ${dayLabel(date, { weekday: 'short', day: 'numeric' })}` : null); reload()
  }

  return createPortal(
    <div className="fixed inset-0 z-[700] overflow-y-auto bg-washi" role="dialog" aria-modal="true" aria-label="Top days">
      <div className="mx-auto max-w-2xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-washi/95 px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <button onClick={onClose} aria-label="Back to trip plan" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"><ChevronLeft className="h-6 w-6" /></button>
          <h2 className="flex-1 font-display text-2xl">🏆 Top days</h2>
        </header>
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {(['all', ...order] as const).map((h) => (
            <button key={h} onClick={() => setHotel(h)} aria-pressed={hotel === h}
              className={`h-10 truncate rounded-full px-1 text-xs ${hotel === h ? 'border-2 border-iris bg-white font-semibold' : 'border border-stone-300 bg-white'}`}>{h === 'all' ? 'All' : HOTELS[h].short.split(' ')[0]}</button>
          ))}
        </div>
        {msg && <p className="mb-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>}
        <div className="space-y-3">
          {list.map((e, i) => {
            const v = board.vibes[e.key], mine = e.hearts.includes(me.id)
            const acts = e.steps.flat().filter(isActivity)
            const food = e.steps.flat().find((p) => p.kind === 'restaurant')
            const open = openDates(days, e.hotel).filter((d) => d.date !== e.onDate)
            return (
              <article key={e.hotel + e.key} className="rounded-3xl bg-white p-2 shadow-sm">
                <button onClick={() => setPeek(e)} aria-label={`Open ${entryTitle(e, v)}`} className="relative flex h-24 w-full gap-1 text-left">
                  {acts.slice(0, 3).map((p, k) => <Thumb key={p.id} place={p} photoUrls={photoUrls} className={`h-full ${k === 0 ? 'flex-[2]' : 'flex-1'} min-w-0 rounded-2xl`} />)}
                  {food && acts.length < 3 && <Thumb place={food} photoUrls={photoUrls} className="h-full min-w-0 flex-1 rounded-2xl" />}
                  <span className="absolute left-1.5 top-1 text-xl">{i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="rounded-full bg-iris px-2 py-0.5 text-xs font-bold text-white">#{i + 1}</span>}</span>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <Cover e={e} v={v} className="h-11 w-11 text-2xl" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base leading-tight">{entryTitle(e, v)}</p>
                    <p className="truncate text-xs text-stone-600">{v ? `${v.emoji} ${v.vibe}` : acts.map((p) => p.name).join(' · ')}</p>
                  </div>
                  <button onClick={() => board.heart(e.key)} aria-pressed={mine} aria-label={mine ? 'Remove heart' : 'Heart this day'}
                    className={`h-11 min-w-[4rem] rounded-full px-3 text-[15px] font-bold ${mine ? 'bg-torii text-white' : 'border border-rose-200 bg-rose-50 text-torii'}`}>❤️ {e.hearts.length}</button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-stone-500">
                  {e.hearts.map((id) => board.memberById.get(id)).filter((m): m is Member => !!m).map((m) => <Face key={m.id} m={m} className="h-6 w-6 text-xs" />)}
                  <span className="ml-1">🚪 {clock(e.tl.start)} → 🏯 {clock(e.tl.end)}</span>
                  {e.makers.length > 1 && <span>· also {e.makers.slice(1).map(displayName).join(', ')}</span>}
                  {e.ai && <span>· 🤖 made from everyone's 👍</span>}
                  {e.onDate && <span className="font-semibold text-emerald-700">· ✓ on {dayLabel(e.onDate, { weekday: 'short', day: 'numeric' })}</span>}
                </div>
                {!e.tl.maghrib.ok && <p className="mt-1.5 rounded-xl bg-orange-50 px-2 py-1 text-[11px] text-orange-900">⚠️ Out at Maghrib: needs a swap</p>}
                {me.is_admin && !e.onDate && open.length > 0 && (
                  <select value="" onChange={(ev) => ev.target.value && put(e, ev.target.value)} aria-label="Put this day on a date"
                    className="mt-2 h-10 w-full rounded-xl border border-stone-300 bg-white px-2 text-sm">
                    <option value="">⭐ Put on a day…</option>
                    {open.map((d) => <option key={d.date} value={d.date}>{dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}{d.source === 'plan' ? ' (replaces plan)' : ''}</option>)}
                  </select>
                )}
              </article>
            )
          })}
          {!list.length && <p className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">No days yet. 💡 Suggest one!</p>}
        </div>
      </div>
      {peek && <DayPeek me={me} board={board} e={peek} photoUrls={photoUrls} onClose={() => setPeek(null)} />}
    </div>, document.body)
}


/** Small day overview popup (Maryam, 15 Nov 2026): name, longer AI description, everything on the day, ❤️. Close with ✕ or tap outside. */
export function DayPeek({ me, board, e, photoUrls, onClose }: { me: Member; board: Board; e: Entry; photoUrls: Record<string, string>; onClose: () => void }) {
  const live = board.entries.find((x) => x.hotel === e.hotel && x.key === e.key) ?? e
  const v = board.vibes[e.key], mine = live.hearts.includes(me.id)
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[760] flex items-end justify-center bg-ink/45 sm:items-center" onClick={onClose}>
      <div onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true" aria-label={entryTitle(live, v)}
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-washi p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="flex items-start gap-3">
          <Cover e={live} v={v} className="h-14 w-14 text-3xl" />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl leading-tight">{entryTitle(live, v)}</h3>
            <p className="text-sm text-stone-600">{v ? `${v.emoji} ${v.vibe}` : HOTELS[live.hotel].short}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-3 rounded-2xl bg-white p-3 text-[15px] leading-relaxed text-stone-800">
          {v?.story ?? <span className="text-stone-400">✨ Writing a description…</span>}
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm text-stone-600">
          <span className="rounded-full border border-stone-200 bg-white px-3 py-1">🚪 {clock(live.tl.start)}</span>
          <span className="h-0.5 flex-1 bg-stone-200" />
          <span className="rounded-full border border-stone-200 bg-white px-3 py-1">🏯 back {clock(live.tl.end)}</span>
        </div>
        <div className="mt-2"><TimelineView tl={live.tl} photoUrls={photoUrls} /></div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {live.hearts.map((id) => board.memberById.get(id)).filter((m): m is Member => !!m).map((m) => <Face key={m.id} m={m} className="h-7 w-7 text-sm" />)}
          </div>
          <button onClick={() => board.heart(live.key)} aria-pressed={mine}
            className={`h-12 min-w-[5rem] rounded-full px-4 text-base font-bold ${mine ? 'bg-torii text-white' : 'border border-rose-200 bg-rose-50 text-torii'}`}>❤️ {live.hearts.length}</button>
        </div>
      </div>
    </div>, document.body)
}
