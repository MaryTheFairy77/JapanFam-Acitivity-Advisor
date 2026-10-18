import { useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { HOTELS, HOTEL_IDS, fmtMin, fmtYen, fmtZar, type HotelId, type Place } from '../lib'
import { buildPlans, type Goal } from '../planner'

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export default function Planner({ places, voteCount }: { places: Place[]; voteCount: Record<string, number> }) {
  const [hotel, setHotel] = useState<HotelId>('toranomon')
  const [budget, setBudget] = useState(15000)
  const [hours, setHours] = useState(11)
  const [start, setStart] = useState('09:00')
  const [nAct, setNAct] = useState(1)
  const [nMeal, setNMeal] = useState(2)
  const [halalOnly, setHalalOnly] = useState(true)
  const [unvisited, setUnvisited] = useState(true)
  const [goal, setGoal] = useState<Goal>('votes')
  const refs = useRef<(HTMLDivElement | null)[]>([])

  const startMin = (() => { const [h, m] = start.split(':').map(Number); return h * 60 + (m || 0) })()
  const { plans, considered, checked, short } = useMemo(
    () => buildPlans({ places, voteCount, hotel, budget, hours, startMin, nAct, nMeal, halalOnly, unvisited, goal }),
    [places, voteCount, hotel, budget, hours, startMin, nAct, nMeal, halalOnly, unvisited, goal])

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
          <label className={label}>⏳ Hours out
            <input inputMode="decimal" className={input} value={hours} onChange={(e) => setHours(Number(e.target.value) || 0)} />
          </label>
          <label className={label}>🎢 Activities
            <select className={input} value={nAct} onChange={(e) => setNAct(+e.target.value)}>{[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select>
          </label>
          <label className={label}>🍜 Meals
            <select className={input} value={nMeal} onChange={(e) => setNMeal(+e.target.value)}>{[0, 1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select>
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
        Checked {checked.toLocaleString()} combos from {considered} places near {HOTELS[hotel].city} · {plans.length ? `top ${plans.length} shown` : 'none fit'}
      </p>

      {plans.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          {short
            ? <>There {/^only 1 |^no [^,]*restaurants?$|^no activities$/.test(short) && !short.includes(' and ') && short.startsWith('only 1 ') ? 'is' : 'are'} {short} near {HOTELS[hotel].city} so far. Lower the number of stops or add more places.</>
            : <>No combo fits. Try a bigger budget, more hours or fewer stops.</>}
        </div>
      )}

      {plans.map((plan, i) => (
        <div key={i}>
          <div ref={(el) => { refs.current[i] = el }} className="rounded-2xl border border-stone-200 bg-washi p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-torii">Plan {i + 1}{i === 0 ? ' · best' : ''}</p>
                <h3 className="font-display text-xl">Day from {HOTELS[hotel].short}</h3>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">{fmtYen(plan.cost)} <span className="font-normal text-stone-500">pp</span></p>
                <p className="text-stone-500">{fmtMin(plan.minutes)} · ▲{plan.votes}</p>
              </div>
            </div>
            <ol className="relative mt-4 space-y-3 border-l-2 border-dashed border-torii/40 pl-5">
              <li className="relative text-sm text-stone-600">
                <span className="absolute -left-[29px] top-0 text-base">🏯</span>
                <b>{clock(startMin)}</b> Leave {HOTELS[hotel].name}
              </li>
              {plan.stops.map((s) => (
                <li key={s.p.id} className="relative">
                  <span className="absolute -left-[29px] top-0.5 text-base">{s.p.kind === 'restaurant' ? '🍜' : '🎢'}</span>
                  <p className="text-[11px] text-stone-400">↓ ~{fmtMin(s.travel)} travel</p>
                  <p className="text-sm"><b>{clock(s.arrive)}–{clock(s.leave)}</b> {s.p.name}</p>
                  <p className="text-xs text-stone-500">
                    {fmtYen(s.p.price_jpy)}{s.p.wait_minutes ? ` · ~${fmtMin(s.p.wait_minutes)} wait` : ''}{s.p.halal && s.p.kind === 'restaurant' ? ` · ${s.p.halal}` : ''}
                  </p>
                </li>
              ))}
              <li className="relative text-sm text-stone-600">
                <span className="absolute -left-[29px] top-0 text-base">🏯</span>
                <p className="text-[11px] text-stone-400">↓ ~{fmtMin(plan.back)} travel</p>
                <b>{clock(startMin + plan.minutes)}</b> Back at the hotel
              </li>
            </ol>
            <p className="mt-3 text-[10px] text-stone-400">JapanFam Advisor · travel times are estimates</p>
          </div>
          <button onClick={() => savePng(i)} className="mt-2 w-full rounded-xl border border-stone-300 bg-white py-2 text-sm font-medium">⬇ Save plan {i + 1} as image</button>
        </div>
      ))}
    </div>
  )
}
