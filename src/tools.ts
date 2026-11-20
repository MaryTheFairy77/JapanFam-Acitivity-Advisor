/**
 * Home page helpers (Phase 2, 20 Nov 2026): which trip day/hotel it is, the taxi card, and the ¥ ↔ R rate.
 * Free only: the rate comes from Frankfurter (api.frankfurter.dev, central-bank reference rates, no key), cached for offline.
 */
import { useEffect, useState } from 'react'
import { STAYS, tripDays, type HotelId } from './lib'

/** Today's date in Japan (YYYY-MM-DD) and the minutes after midnight there. */
export function japanNow(now = Date.now()) {
  const j = new Date(now + 9 * 3600e3)
  return { date: j.toISOString().slice(0, 10), min: j.getUTCHours() * 60 + j.getUTCMinutes() }
}

/** Where we are in the trip: before (shows day 1), during (today), after (last day). */
export function tripToday(now = Date.now()) {
  const days = tripDays()
  const { date, min } = japanNow(now)
  const first = days[0].date, last = days[days.length - 1].date
  const phase: 'before' | 'during' | 'after' = date < first ? 'before' : date > last ? 'after' : 'during'
  const day = days.find((d) => d.date === date) ?? (phase === 'before' ? days[0] : days[days.length - 1])
  // tonight's hotel; on the flight home day, the hotel we leave from
  const hotel: HotelId = day.hotel ?? day.from ?? STAYS[STAYS.length - 1].hotel
  const daysTo = Math.round((Date.parse(first) - Date.parse(date)) / 864e5)
  return { phase, day, hotel, daysTo, nowMin: phase === 'during' ? min : null }
}

/** Taxi card: official Japanese names + addresses (checked 20 Nov 2026 on the hotels' own sites). */
export const TAXI: Record<HotelId, { ja: string; building: string; address: string; phone: string }> = {
  toranomon: { ja: 'ホテル虎ノ門ヒルズ', building: '虎ノ門ヒルズ ステーションタワー', address: '〒105-0001 東京都港区虎ノ門2-6-4', phone: '+81 3-6834-5678' },
  osaka: { ja: '大阪ステーションホテル、オートグラフ コレクション', building: 'JPタワー大阪（JR大阪駅 西口直結）', address: '〒530-0001 大阪府大阪市北区梅田3-2-2', phone: '+81 6-6105-1874' },
  jw_tokyo: { ja: 'JWマリオット・ホテル東京', building: '高輪ゲートウェイシティ（高輪ゲートウェイ駅 直結）', address: '〒108-0074 東京都港区高輪2-21-2', phone: '+81 3-3434-7070' },
}

// ───────────── ¥ ↔ R ─────────────
const RATE_KEY = 'jf-rate-jpy-zar'
/** Used only until the first successful download (about ¥1 = R0.12 in Nov 2026); always labelled as approximate. */
export const FALLBACK_RATE = 0.12
export type Rate = { zarPerYen: number; date: string | null; live: boolean }

export function useYenRate(): Rate {
  const [r, setR] = useState<Rate>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(RATE_KEY) ?? 'null') as { v: number; date: string; at: number } | null
      if (c && c.v > 0) return { zarPerYen: c.v, date: c.date, live: true }
    } catch { /* fresh */ }
    return { zarPerYen: FALLBACK_RATE, date: null, live: false }
  })
  useEffect(() => {
    let at = 0
    try { at = (JSON.parse(localStorage.getItem(RATE_KEY) ?? 'null') as { at: number } | null)?.at ?? 0 } catch { /* ignore */ }
    if (Date.now() - at < 12 * 3600e3) return // fresh enough (central banks publish once a day)
    let alive = true
    fetch('https://api.frankfurter.dev/v1/latest?base=JPY&symbols=ZAR')
      .then((x) => (x.ok ? x.json() : Promise.reject(x.status)))
      .then((j) => {
        const v = Number(j?.rates?.ZAR)
        if (!(v > 0.01 && v < 1)) return // sanity check: ¥1 is a few cents
        try { localStorage.setItem(RATE_KEY, JSON.stringify({ v, date: j.date, at: Date.now() })) } catch { /* ignore */ }
        if (alive) setR({ zarPerYen: v, date: j.date ?? null, live: true })
      })
      .catch(() => { /* offline: keep the saved rate */ })
    return () => { alive = false }
  }, [])
  return r
}
