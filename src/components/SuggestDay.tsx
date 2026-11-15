import { useMemo, useState } from 'react'
import { HOTELS, HOTEL_IDS, safeUrl, supabase, type HotelId, type Member, type Place } from '../lib'
import { openDates, planTrip } from '../itinerary'
import { HOTEL_INFO } from './HotelSheet'
import { DayBuilder } from './DayBuilder'
import { dayLabel, usePlanData } from './TripPlan'

/**
 * B (mix) · 💡 Suggest a day (Maryam, 15 Nov 2026). First: "Which hotel are you suggesting a day from?" with photos.
 * Then the shared DayBuilder: free order, 🔗 together, start ≥ 8 am, Maghrib at hotel or near a prayer room, +time badges.
 * One idea per person per hotel (day_ideas). Same screen for planners (they pin ideas to dates from the Trip plan / 🏆 Top days).
 */
export default function SuggestDay({ me, places, voteCount, photoUrls }: {
  me: Member; places: Place[]; voteCount: Record<string, number>; photoUrls: Record<string, string>
}) {
  const { plans, ideas, err, load } = usePlanData()
  const days = useMemo(() => planTrip(places, voteCount, plans), [places, voteCount, plans])
  const [hotel, setHotel] = useState<HotelId | null>(null)
  const mine = (h: HotelId) => ideas.find((i) => i.member_id === me.id && i.hotel === h) ?? null
  const stay = (h: HotelId) => days.filter((d) => d.hotel === h && d.kind !== 'flight')
  const locked = (h: HotelId) => stay(h).every((d) => d.locked)

  if (err) return <div className="m-4 rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">Couldn't load. Check your internet.</div>

  if (!hotel) return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <h2 className="font-display text-2xl">Which hotel are you suggesting a day from?</h2>
      {[...HOTEL_IDS].sort((a, b) => (stay(a)[0]?.date ?? '').localeCompare(stay(b)[0]?.date ?? '')).map((h) => {
        const s = stay(h), idea = mine(h), shut = locked(h)
        return (
          <button key={h} disabled={shut} onClick={() => setHotel(h)}
            className={`relative block h-40 w-full overflow-hidden rounded-3xl text-left shadow-md ${shut ? 'opacity-50' : ''}`}>
            <img src={safeUrl(HOTEL_INFO[h].photo) ?? ''} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-3 pt-8 text-white">
              <span className="block font-display text-xl">{HOTELS[h].short}</span>
              <span className="text-sm opacity-90">{s.length ? `${dayLabel(s[0].date, { day: 'numeric', month: 'short' })} – ${dayLabel(s[s.length - 1].date, { day: 'numeric', month: 'short' })}` : ''}</span>
            </span>
            {(idea || shut) && <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold">{shut ? '🔒 all locked' : '✓ idea sent'}</span>}
          </button>
        )
      })}
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
        />
    </div>
  )
}
