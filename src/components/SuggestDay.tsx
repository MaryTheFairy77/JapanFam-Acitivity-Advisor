import { useEffect, useMemo, useState } from 'react'
import { HOTELS, HOTEL_IDS, safeUrl, supabase, type HotelId, type Member, type Place } from '../lib'
import { comboKey, openDates, planTrip } from '../itinerary'
import ConfirmDelete, { deleteIdea, ideaImpact } from './ConfirmDelete'
import { Trash2 } from 'lucide-react'
import { HOTEL_INFO } from './HotelSheet'
import { DayBuilder } from './DayBuilder'
import { STAY_KANJI, dayLabel, usePlanData } from './TripPlan'

/**
 * B (mix) · 💡 Suggest a day (Maryam, 15 Nov 2026). First: "Which hotel are you suggesting a day from?" with photos.
 * Then the shared DayBuilder: free order, 🔗 together, start ≥ 8 am, Maghrib at hotel or near a prayer room, +time badges.
 * One idea per person per hotel (day_ideas). Same screen for planners (they pin ideas to dates from the Trip plan / 🏆 Top days).
 */
export default function SuggestDay({ me, members, places, voteCount, photoUrls }: {
  me: Member; members: Member[]; places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>
}) {
  const { plans, ideas, err, load } = usePlanData()
  const days = useMemo(() => planTrip(places, voteCount, plans), [places, voteCount, plans])
  const [hotel, setHotel] = useState<HotelId | null>(null)
  const [del, setDel] = useState(false)
  const [hearts, setHearts] = useState<string[]>([])
  useEffect(() => { if (del) supabase.from('day_hearts').select('combo_key').then(({ data }) => setHearts((data ?? []).map((h) => h.combo_key))) }, [del])
  const mine = (h: HotelId) => ideas.find((i) => i.member_id === me.id && i.hotel === h) ?? null
  const stay = (h: HotelId) => days.filter((d) => d.hotel === h && d.kind !== 'flight')
  const locked = (h: HotelId) => stay(h).every((d) => d.locked)

  if (err) return <div className="m-4 rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">Couldn't load. Check your internet.</div>

  if (!hotel) return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <h2 className="font-display text-2xl">Pick a hotel</h2>
      <p className="-mt-2 text-sm text-stone-500">Your day starts and ends there.</p>
      <div className="grid grid-cols-3 gap-3 pt-1">
      {[...HOTEL_IDS].sort((a, b) => (stay(a)[0]?.date ?? '').localeCompare(stay(b)[0]?.date ?? '')).map((h, n) => {
        const s = stay(h), idea = mine(h), shut = locked(h)
        return (
          <button key={h} disabled={shut} onClick={() => setHotel(h)} aria-label={`${HOTELS[h].short}${shut ? ', all locked' : idea ? ', idea sent' : ''}`}
            className={`stamp relative block text-left transition active:scale-95 ${shut ? 'opacity-50' : ''}`} style={{ transform: `rotate(${[-2, 1.5, -1][n % 3]}deg)` }}>
            <span className="block border-2 border-[#d65a6f] bg-[#fff4f1] p-1">
              <span className="relative block aspect-[3/4] overflow-hidden">
                <img src={safeUrl(HOTEL_INFO[h].photo) ?? ''} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover saturate-[.85]" />
                <span className="font-jp absolute left-1 top-1 rounded-sm bg-[#d65a6f] px-1 py-1 text-[13px] font-bold leading-none tracking-[.1em] text-white [writing-mode:vertical-rl]">{STAY_KANJI[h]}</span>
                {(idea || shut) && <span className="absolute bottom-1 right-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold">{shut ? '🔒' : '✓ sent'}</span>}
              </span>
              <span className="block pt-1 text-center font-display text-[13px] leading-tight text-[#7a3346]">{HOTELS[h].short}</span>
              <span className="block text-center text-[10px] text-stone-500">{s.length ? `${dayLabel(s[0].date, { day: 'numeric', month: 'short' })} – ${dayLabel(s[s.length - 1].date, { day: 'numeric', month: 'short' })}` : ''}</span>
            </span>
          </button>
        )
      })}
      </div>
    </div>
  )

  const idea = mine(hotel)
  const open = openDates(days, hotel)
  const refDate = open[0]?.date || stay(hotel)[0]?.date || '2026-12-27'
  return (
    <div className="px-4 pb-6 pt-3">
      <DayBuilder key={hotel} title={`🏯 ${HOTELS[hotel].short}`} hotel={hotel} date={refDate} places={places} voteCount={voteCount} photoUrls={photoUrls}
        initial={idea?.layout ?? (idea ? { start: idea.half_day ? 14 * 60 : 9 * 60, steps: idea.activity_ids.map((x) => [x]) } : null)} days={days}
        saveLabel={idea ? '💡 Update my idea' : '💡 Send my idea'} onBack={() => setHotel(null)}
        onSave={async (layout, ids) => {
          if (!ids.length) return 'Add at least one activity (food alone isn’t a day).'
          const { error } = await supabase.from('day_ideas').upsert({ member_id: me.id, hotel, half_day: layout.start >= 13 * 60, activity_ids: ids, layout }, { onConflict: 'member_id,hotel' })
          if (error) return 'Couldn’t send. Check your internet.'
          load()
          return '✓ Sent! Planners will see it on the Trip plan.'
        }}
        extra={idea && (
          <button type="button" onClick={() => setDel(true)} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-white/95 text-sm text-torii shadow-sm">
            <Trash2 className="h-4 w-4" />Delete my idea
          </button>
        )}
        />
      {del && idea && (() => {
        const k = comboKey(idea.activity_ids)
        const planned = days.find((d) => d.source === 'plan' && d.acts.length && comboKey(d.acts.map((p) => p.id)) === k)
        const others = ideas.some((x) => x.id !== idea.id && comboKey(x.activity_ids) === k) || !!planned
        const { lines, keeps } = ideaImpact([idea], members, places, hearts.filter((h) => h === k).length, others, planned?.date ?? null)
        return <ConfirmDelete title="Delete your day idea?" lines={lines} keeps={keeps} onClose={() => setDel(false)}
          onDone={() => { setDel(false); load(); setHotel(null) }} onConfirm={() => deleteIdea(idea.id, null)} />
      })()}
    </div>
  )
}
