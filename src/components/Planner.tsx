import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { HOTELS, HOTEL_IDS, catOf, fmtMin, fmtYen, fmtZar, type HotelId, type Place } from '../lib'
import { SALAH, buildDayPlans, eveningShopping, type Goal, type Shape } from '../planner'

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export default function Planner({ places, voteCount }: { places: Place[]; voteCount: Record<string, number> }) {
  const [hotel, setHotel] = useState<HotelId>('toranomon')
  const [budget, setBudget] = useState(15000)
  const [backAt, setBackAt] = useState(clock(SALAH.backBy))
  const [start, setStart] = useState('09:00')
  const [shape, setShape] = useState<Shape>('either')
  const [halalOnly, setHalalOnly] = useState(true)
  const [unvisited, setUnvisited] = useState(true)
  const [goal, setGoal] = useState<Goal>('votes')
  const refs = useRef<(HTMLDivElement | null)[]>([])

  const toMin = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0) }
  const startMin = toMin(start)
  const backBy = Math.min(toMin(backAt) || SALAH.backBy, SALAH.backBy)
  const { plans, considered, checked, short, light } = useMemo(
    () => buildDayPlans({ places, voteCount, hotel, budget, backBy, startMin, shape, halalOnly, unvisited, goal }),
    [places, voteCount, hotel, budget, backBy, startMin, shape, halalOnly, unvisited, goal])

  async function savePng(i: number) {
    const node = refs.current[i]
    if (!node) return
    try {
      const url = await toPng(node, { pixelRatio: 2, backgroundColor: '#fbf7f0', cacheBust: true })
      const a = document.createElement('a'); a.href = url; a.download = `japanfam-plan-${HOTELS[hotel].short.replace(/\s/g, '')}-${i + 1}.png`; a.click()
    } catch (e) { alert('Could not make the image: ' + (e as Error).message) }
  }

  const input = 'mt-1 block w-full min-w-0 max-w-full appearance-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-base outline-none focus:border-torii'
  const label = 'block min-w-0 text-xs font-medium text-stone-600'

  return (
    <div className="space-y-4 px-4 pt-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="font-display text-lg">Plan a day</h2>
        <p className="text-sm text-stone-500">Finds every combo that fits your budget & time, best first.</p>
        <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
          🕌 Every plan is home by {clock(SALAH.backBy)} for Maghrib, with a Dhuhr stop ({clock(SALAH.dhuhr.from)}–{clock(SALAH.dhuhr.to)}).
          If you&apos;re out past {clock(SALAH.maghrib)} it adds an Asr stop ({clock(SALAH.asr.from)}–{clock(SALAH.asr.to)}); otherwise Asr + Maghrib are back to back at the hotel.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <label className={`${label} col-span-2`}>🏯 Home base
            <select className={input} value={hotel} onChange={(e) => setHotel(e.target.value as HotelId)}>
              {HOTEL_IDS.map((h) => <option key={h} value={h}>{HOTELS[h].name}</option>)}
            </select>
          </label>
          <label className={label}>💴 Budget / person (¥)
            <input inputMode="numeric" className={input} value={budget} onChange={(e) => setBudget(Number(e.target.value.replace(/\D/g, '')) || 0)} />
            <span className="text-[11px] text-stone-400">{fmtZar(budget)}</span>
          </label>
          <label className={label}>🌇 Home by (Maghrib)
            <input type="time" className={input} value={backAt} max={clock(SALAH.backBy)} onChange={(e) => setBackAt(e.target.value)} />
            <span className="text-[11px] text-stone-400">latest {clock(SALAH.backBy)}</span>
          </label>
          <label className={`${label} col-span-2`}>🗓 Day shape (+ a 🍜 food stop when one fits)
            <select className={input} value={shape} onChange={(e) => setShape(e.target.value as Shape)}>
              <option value="either">✨ Whichever's best</option>
              <option value="acts">🍜 + 🎢 🎢 Two activities</option>
              <option value="shop">🍜 + 🎢 🛍 Activity + shopping</option>
            </select>
          </label>
          <label className={label}>🕘 Leave at
            <input type="time" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className={label}>🏆 Best by
            <select className={input} value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
              <option value="votes">👍 Most votes</option><option value="cheap">¥ Cheapest</option><option value="time">⏱ Least time</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={halalOnly} onChange={(e) => setHalalOnly(e.target.checked)} className="h-4 w-4 accent-torii" />Halal / Muslim-friendly meals only</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={unvisited} onChange={(e) => setUnvisited(e.target.checked)} className="h-4 w-4 accent-torii" />Skip visited</label>
        </div>
      </section>

      <p className="text-center text-xs text-stone-500">
        Tried {checked.toLocaleString()} combos from {considered} places near {HOTELS[hotel].city} · {plans.length ? `best ${plans.length} shown` : 'none fit'}
      </p>
      {light && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ No full day (2 activities, or activity + shopping) fits near {HOTELS[hotel].city} before {clock(backBy)}{short ? ` (${short})` : ''}, so these are <b>light days</b> with one activity. Add more places nearby to get full days.
        </div>
      )}

      {plans.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          {short
            ? <>There {/^only 1 |^no [^,]*restaurants?$|^no activities$/.test(short) && !short.includes(' and ') && short.startsWith('only 1 ') ? 'is' : 'are'} {short} near {HOTELS[hotel].city} so far. Lower the number of stops or add more places.</>
            : <>No combo fits before {clock(backBy)} with prayer stops. Try leaving earlier, a bigger budget or the other day shape.</>}
        </div>
      )}

      {plans.map((plan, i) => (
        <div key={i}>
          <div ref={(el) => { refs.current[i] = el }} className="rounded-2xl border border-stone-200 bg-washi p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-torii">Plan {i + 1}{i === 0 ? ' · best' : ''}{plan.light ? ' · light day' : ''}</p>
                <h3 className="font-display text-xl">Day from {HOTELS[hotel].short}</h3>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">{fmtYen(plan.cost)}{plan.stops.some((s) => s.p.price_jpy == null) ? ' + ❓' : ''} <span className="font-normal text-stone-500">pp</span></p>
                <p className="text-stone-500">{fmtMin(plan.minutes)} · ▲{plan.votes}</p>
              </div>
            </div>
            {!plan.stops.some((x) => x.p.kind === 'restaurant') && (
              <p className="mt-2 rounded-lg bg-stone-100 px-2 py-1.5 text-xs text-stone-600">🥤 No food stop fits this one: grab a snack at the place or a konbini.</p>
            )}
            <ol className="relative mt-4 space-y-3 border-l-2 border-dashed border-torii/40 pl-5">
              <li className="relative text-sm text-stone-600">
                <span className="absolute -left-[29px] top-0 text-base">🏯</span>
                <b>{clock(startMin)}</b> Leave {HOTELS[hotel].name}
              </li>
              {plan.stops.map((s) => (
                <li key={s.p.id} className="relative">
                  <span className="absolute -left-[29px] top-0.5 text-base">{s.p.kind === 'restaurant' ? '🍜' : catOf(s.p) === 'shopping' ? '🛍' : '🎢'}</span>
                  <p className="text-[11px] text-stone-400">↓ ~{fmtMin(s.travel)} travel</p>
                  <p className="text-sm"><b>{clock(s.arrive)}–{clock(s.leave)}</b> {s.p.name}</p>
                  <p className="text-xs text-stone-500">
                    {s.p.price_jpy == null ? '❓ price unknown' : fmtYen(s.p.price_jpy)}{s.p.wait_minutes ? ` · ~${fmtMin(s.p.wait_minutes)} wait` : ''}{s.p.halal && s.p.kind === 'restaurant' ? ` · ${s.p.halal}` : ''}
                  </p>
                  {s.prayers.map((pr) => (
                    <p key={pr.name} className="mt-1 inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                      🕌 {clock(pr.at)} {pr.name} here ({SALAH.prayMinutes} min) · find a prayer room / quiet spot
                    </p>
                  ))}
                </li>
              ))}
              <li className="relative text-sm text-stone-600">
                <span className="absolute -left-[29px] top-0 text-base">🏯</span>
                <p className="text-[11px] text-stone-400">↓ ~{fmtMin(plan.back)} travel</p>
                <b>{clock(startMin + plan.minutes)}</b> Back at the hotel
                <p className="text-xs text-emerald-800">
                  🕌 {plan.asrOut ? `Maghrib from ${clock(SALAH.maghrib)} (Asr already prayed out)` : `Asr + Maghrib back to back (Maghrib from ${clock(SALAH.maghrib)})`}
                  {startMin + plan.minutes <= SALAH.dhuhr.to && !plan.stops.some((x) => x.prayers.some((pr) => pr.name === 'Dhuhr')) ? ' · Dhuhr at the hotel too' : ''}
                </p>
              </li>
            </ol>
            {(() => {
              const eve = eveningShopping({ places, voteCount, hotel, unvisited }, plan)
              return (
                <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
                  <p className="text-sm font-semibold text-indigo-900">🌙 After Maghrib · adults&apos; shopping (optional)</p>
                  {eve.length ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-indigo-900">
                      {eve.map(({ p, travel }) => (
                        <li key={p.id}>🛍 <b>{p.name}</b> · ~{fmtMin(travel)} from the hotel{p.price_jpy === 0 ? ' · Free entry' : ''}</li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-indigo-800">No other shopping spots near {HOTELS[hotel].city} yet. Add some in 🎢 Do → 🛍 Shopping.</p>}
                  <p className="mt-1 text-[11px] text-indigo-700/80">Not counted in the day&apos;s cost or time.</p>
                </div>
              )
            })()}
            {plan.stops.some((s) => s.p.price_jpy == null) && (
              <p className="mt-3 rounded-lg bg-stone-100 px-2 py-1.5 text-xs text-stone-600">❓ {plan.stops.filter((s) => s.p.price_jpy == null).length} stop(s) have no price yet, so the total doesn&apos;t include them.</p>
            )}
            <p className="mt-3 text-[10px] text-stone-400">JapanFam Advisor · travel times are estimates</p>
          </div>
          <button onClick={() => savePng(i)} className="mt-2 w-full rounded-xl border border-stone-300 bg-white py-2 text-sm font-medium">⬇ Save plan {i + 1} as image</button>
        </div>
      ))}
    </div>
  )
}
