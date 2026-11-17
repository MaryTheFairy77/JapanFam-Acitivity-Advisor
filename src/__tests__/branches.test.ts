import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchBranches } from '../lib'

const hit = (id: number, lat: number, lng: number, extra: Record<string, unknown> = {}) => ({
  osm_type: 'node', osm_id: id, lat: String(lat), lon: String(lng), name: 'ROUND1', category: 'leisure',
  namedetails: { name: 'ROUND1', brand: 'ラウンドワン' }, address: { city_district: 'Kita Ward' }, extratags: {}, ...extra,
})

describe('searchBranches', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('drops extra words, removes duplicates, closest to a hotel first', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 2000 })
    const urls: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      urls.push(u)
      const q = decodeURIComponent(/&q=([^&]+)/.exec(u)![1])
      const kansai = u.includes('135.25')
      const body = q !== 'round1' ? [] : kansai
        ? [hit(1, 34.6676, 135.5028, { address: { city_district: 'Chūō Ward' } }), hit(2, 34.7034, 135.5011), hit(3, 34.70345, 135.50115, { category: 'building' })]
        : [hit(4, 35.7301, 139.7151, { address: { suburb: '東池袋', city: 'Toshima' } })]
      return { ok: true, json: async () => body } as Response
    })
    const r = await searchBranches('round1 gaming arena')
    vi.useRealTimers()
    expect(urls.some((u) => u.includes('q=round1%20gaming%20arena'))).toBe(true)
    expect(r.map((b) => b.id)).toEqual(['node2', 'node1', 'node4']) // Umeda (by Osaka hotel) → Namba → Ikebukuro; building duplicate dropped
    expect(r[0].hotel).toBe('osaka')
    expect(r[1].area).toBe('Chūō Ward')
    expect(r[2].area).toBe('Toshima') // Japanese-only suburb skipped
  }, 20000)
})

describe('cardsFor', async () => {
  const { cardsFor } = await import('../components/QuickAdd')
  const b = (area: string, lat: number, lng: number): { name: string; brand: string; area: string; lat: number; lng: number; branches?: { lat: number; lng: number; area: string }[] } => ({ name: `ROUND1 (${area})`, brand: 'ROUND1', area, lat, lng })
  it('one card per city, pin = first (closest) branch, all branches kept', () => {
    const cards = cardsFor([b('Kita Ward', 34.7034, 135.5011), b('Chūō Ward', 34.6676, 135.5028), b('Toshima', 35.7301, 139.7151), b('Fushimi', 34.9361, 135.746)])
    expect(cards.map((c) => c.name)).toEqual(['ROUND1 (Osaka/Kyoto)', 'ROUND1 (Toshima)'])
    expect(cards[0].lat).toBe(34.7034)
    expect(cards[0].branches?.map((x) => x.area)).toEqual(['Kita Ward', 'Chūō Ward', 'Fushimi'])
    expect(cards[1].branches).toBeUndefined()
  })
})
