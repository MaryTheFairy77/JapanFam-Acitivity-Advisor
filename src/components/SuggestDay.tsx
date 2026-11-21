import { useEffect, useMemo, useState } from 'react'
import { HOTELS, HOTEL_IDS, displayName, safeUrl, supabase, type HotelId, type Member, type Place } from '../lib'
import { comboKey, openDates, planTrip, type IdeaRow } from '../itinerary'
import ConfirmDelete, { deleteIdea, ideaImpact } from './ConfirmDelete'
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import Thumb from './Thumb'
import { HOTEL_INFO } from './HotelSheet'
import { DayBuilder } from './DayBuilder'
import { STAY_KANJI, dayLabel, usePlanData } from './TripPlan'

/**
 * B (mix) · 💡 Suggest a day (Maryam, 15 Nov 2026). First: "Which hotel are you suggesting a day from?" with photos.
 * Then the shared DayBuilder: free order, 🔗 together, start ≥ 8 am, Maghrib at hotel or near a prayer room, +time badges.
 * Up to 3 ideas per person per hotel (day_ideas.slot 1–3, 21 Nov). Same screen for planners (they pin ideas to dates from the Trip plan / 🏆 Top days).
 */
const MAX = 3

export default function SuggestDay({ me, members, places, voteCount, photoUrls }: {
  me: Member; members: Member[]; places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>
}) {
  const { plans, ideas, err, load } = usePlanData()
  const days = useMemo(() => planTrip(places, voteCount, plans), [places, voteCount, plans])
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const [hotel, setHotel] = useState<HotelId | null>(null)
  const [editing, setEditing] = useState<IdeaRow | 'new' | null>(null)
  const [del, setDel] = useState<IdeaRow | null>(null)
  const [hearts, setHearts] = useState<string[]>([])
  useEffect(() => { if (del) supabase.from('day_hearts').select('combo_key').then(({ data }) => setHearts((data ?? []).map((h) => h.combo_key))) }, [del])
  const mine = (h: HotelId) => ideas.filter((i) => i.member_id === me.id && i.hotel === h).sort((a, b) => (a.slot ?? 1) - (b.slot ?? 1))
  const stay = (h: HotelId) => days.filter((d) => d.hotel === h && d.kind !== 'flight')
  const locked = (h: HotelId) => stay(h).every((d) => d.locked)
  const pick = (h: HotelId) => { setHotel(h); setEditing(mine(h).length ? null : 'new') }

  if (err) return <div className="m-4 rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">Couldn't load. Check your internet.</div>

  // 1 · pick a hotel: three big postage stamps, staggered down the page
  if (!hotel) return (
    <div className="px-4 pb-8 pt-3">
      <h2 className="font-display text-2xl">Pick a hotel</h2>
      <p className="text-sm text-stone-500">Your day starts and ends there. Up to {MAX} ideas each.</p>
      <div className="mt-4 flex flex-col gap-5">
      {[...HOTEL_IDS].sort((a, b) => (stay(a)[0]?.date ?? '').localeCompare(stay(b)[0]?.date ?? '')).map((h, n) => {
        const s = stay(h), count = mine(h).length, shut = locked(h)
        return (
          <button key={h} disabled={shut} onClick={() => pick(h)} aria-label={`${HOTELS[h].short}${shut ? ', all locked' : count ? `, ${count} of ${MAX} ideas sent` : ''}`}
            className={`stamp relative block w-[82%] text-left transition active:scale-[.97] ${n % 2 ? 'self-end' : 'self-start'} ${shut ? 'opacity-50' : ''}`}
            style={{ transform: `rotate(${[-1.8, 1.6, -1.2][n % 3]}deg)` }}>
            <span className="block border-2 border-[#d65a6f] bg-[#fff4f1] p-1.5">
              <span className="relative block aspect-[16/10] overflow-hidden">
                <img src={safeUrl(HOTEL_INFO[h].photo) ?? ''} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover saturate-[.85]" />
                <span className="font-jp absolute left-1.5 top-1.5 rounded-sm bg-[#d65a6f] px-1.5 py-1.5 text-lg font-bold leading-none tracking-[.12em] text-white shadow [writing-mode:vertical-rl]">{STAY_KANJI[h]}</span>
                {(count > 0 || shut) && <span className="absolute bottom-1.5 right-1.5 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold">{shut ? '🔒 locked' : `💡 ${count}/${MAX}`}</span>}
              </span>
              <span className="flex items-baseline justify-between gap-2 px-1 pt-1.5">
                <span className="font-display text-lg leading-tight text-[#7a3346]">{HOTELS[h].short}</span>
                <span className="shrink-0 text-xs text-stone-500">{s.length ? `${dayLabel(s[0].date, { day: 'numeric', month: 'short' })} – ${dayLabel(s[s.length - 1].date, { day: 'numeric', month: 'short' })}` : ''}</span>
              </span>
            </span>
          </button>
        )
      })}
      </div>
    </div>
  )

  const list = mine(hotel)

  // 2 · your ideas for this hotel (plaques) + a new one
  if (editing == null) return (
    <div className="px-4 pb-8 pt-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setHotel(null)} aria-label="Back to hotels" className="-ml-2 flex h-10 w-10 items-center justify-center text-[#d65a6f]"><ChevronLeft className="h-7 w-7" strokeWidth={2.75} /></button>
        <span className="font-jp flex w-7 items-center justify-center rounded-md bg-[#d65a6f] py-1 text-sm font-bold leading-none tracking-[.1em] text-white [writing-mode:vertical-rl]">{STAY_KANJI[hotel]}</span>
        <h2 className="font-display text-2xl">{HOTELS[hotel].short}</h2>
      </div>
      <p className="mt-1 text-sm text-stone-500">Your ideas · {list.length} of {MAX}. Tap one to change it.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {list.map((i) => {
          const acts = i.activity_ids.map((x) => byId.get(x)).filter((p): p is Place => !!p)
          return (
            <div key={i.id} className="ema-wrap">
              <button onClick={() => setEditing(i)} className="ema block w-full px-2 pb-2 text-left" style={{ ['--roof' as string]: '20px' }}>
                <span className="flex h-20 gap-1">{acts.slice(0, 2).map((p) => <Thumb key={p.id} place={p} photoUrls={photoUrls} className="h-full min-w-0 flex-1 rounded-xl" />)}</span>
                <span className="mt-1.5 line-clamp-2 block text-xs font-medium text-[#4a2c17]">{acts.map((p) => p.name).join(' · ')}</span>
                <span className="mt-1 flex items-center gap-1 text-[11px] text-[#6b4a30]"><Pencil className="h-3 w-3" />Change</span>
              </button>
            </div>
          )
        })}
        {list.length < MAX && (
          <button onClick={() => setEditing('new')} className="flex min-h-[10rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#d65a6f]/50 text-[#d65a6f]">
            <Plus className="h-7 w-7" /><span className="text-sm font-semibold">New idea</span>
          </button>
        )}
      </div>
      {del && delSheet(del)}
    </div>
  )

  function delSheet(idea: IdeaRow) {
    const k = comboKey(idea.activity_ids)
    const planned = days.find((d) => d.source === 'plan' && d.acts.length && comboKey(d.acts.map((p) => p.id)) === k)
    const others = ideas.some((x) => x.id !== idea.id && comboKey(x.activity_ids) === k) || !!planned
    const { lines, keeps } = ideaImpact([idea], members, places, hearts.filter((h) => h === k).length, others, planned?.date ?? null)
    return <ConfirmDelete title="Delete this day idea?" lines={lines} keeps={keeps} onClose={() => setDel(null)}
      onDone={() => { setDel(null); load(); setEditing(null) }} onConfirm={() => deleteIdea(idea.id, null)} />
  }

  // 3 · build / change one idea
  const idea = editing === 'new' ? null : editing
  const open = openDates(days, hotel)
  const refDate = open[0]?.date || stay(hotel)[0]?.date || '2026-12-27'
  return (
    <div className="px-4 pb-6 pt-3">
      <DayBuilder key={hotel + (idea?.id ?? 'new')} title={`${STAY_KANJI[hotel]} ${HOTELS[hotel].short}`} hotel={hotel} date={refDate} places={places} voteCount={voteCount} photoUrls={photoUrls}
        initial={idea?.layout ?? (idea ? { start: idea.half_day ? 14 * 60 : 9 * 60, steps: idea.activity_ids.map((x) => [x]) } : null)} days={days}
        saveLabel={idea ? '💡 Update idea' : '💡 Send idea'} onBack={() => (list.length ? setEditing(null) : setHotel(null))}
        onSave={async (layout, ids) => {
          if (!ids.length) return 'Add at least one activity (food alone isn’t a day).'
          // no exact copies of someone's idea or a planned day (same hotel + same activities). Matching a 🤖 draft is fine: it becomes yours.
          const k = comboKey(ids)
          const twin = ideas.find((i) => i.hotel === hotel && i.id !== idea?.id && comboKey(i.activity_ids) === k)
          if (twin) {
            const who = twin.member_id === me.id ? 'your other idea' : `${displayName(members.find((m) => m.id === twin.member_id) ?? { name: 'someone', nickname: null })}'s idea`
            return `Same as ${who}. Give it a ❤️ in Top days instead.`
          }
          const planned = days.find((d) => d.source === 'plan' && d.hotel === hotel && d.acts.length && comboKey(d.acts.map((p) => p.id)) === k)
          if (planned) return `That's already planned for ${dayLabel(planned.date, { weekday: 'short', day: 'numeric' })}.`
          const row = { half_day: layout.start >= 13 * 60, activity_ids: ids, layout }
          let error
          if (idea) ({ error } = await supabase.from('day_ideas').update(row).eq('id', idea.id))
          else {
            const used = new Set(list.map((i) => i.slot ?? 1))
            const slot = [1, 2, 3].find((n) => !used.has(n))
            if (!slot) return `You already have ${MAX} ideas here. Change one instead.`
            ;({ error } = await supabase.from('day_ideas').insert({ member_id: me.id, hotel, slot, ...row }))
          }
          if (error) return 'Couldn’t send. Check your internet.'
          load()
          return '✓ Sent! Planners will see it on the Trip plan.'
        }}
        extra={idea && (
          <button type="button" onClick={() => setDel(idea)} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white/95 text-sm text-torii shadow-sm">
            <Trash2 className="h-4 w-4" />Delete this idea
          </button>
        )}
        />
      {del && delSheet(del)}
    </div>
  )
}
