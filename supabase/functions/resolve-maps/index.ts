// Deployed to Supabase as the "resolve-maps" Edge Function (verify_jwt = true).
// Follows a short Google Maps link server-side. Returns { lat, lng } when the link contains coordinates,
// otherwise { address } (phone-app share links only carry the address) for the app to look up on OpenStreetMap.
// Only Google hosts are followed (no open proxy).
const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.[a-z.]+|consent\.google\.[a-z.]+)$/i
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const dec = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
function coords(s: string): { lat: number; lng: number } | null {
  const t = dec(dec(s))
  const m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? t.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (!m) return null
  const lat = +m[1], lng = +m[2]
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}
function addressFrom(u: URL): string | null {
  const inner = u.searchParams.get('continue')
  if (inner) { try { return addressFrom(new URL(inner)) } catch { /* ignore */ } }
  const q = u.searchParams.get('q') ?? u.searchParams.get('query')
  if (q && !/^-?\d+\.\d+,/.test(q)) return q.slice(0, 300)
  const place = dec(u.pathname).match(/\/maps\/place\/([^/@]+)/)
  return place ? place[1].replace(/\+/g, ' ').slice(0, 300) : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const { url } = await req.json()
    if (typeof url !== 'string' || url.length > 2000) return json({ error: 'bad url' }, 400)
    let u = new URL(url.trim())
    let address: string | null = null
    for (let hop = 0; hop < 6; hop++) {
      if (u.protocol !== 'https:' || !ALLOWED.test(u.hostname)) return json({ error: 'Only Google Maps links are supported' }, 400)
      const c = coords(u.toString())
      if (c) return json(c)
      address ??= addressFrom(u)
      if (/^consent\./i.test(u.hostname)) break // cookie wall: we already have what we need
      const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (JapanFam trip app)', 'Accept-Language': 'en' } })
      const loc = r.headers.get('location')
      if (!loc) {
        const c2 = coords((await r.text()).slice(0, 400000))
        if (c2) return json(c2)
        break
      }
      u = new URL(loc, u)
    }
    return address ? json({ address }) : json({ error: 'No location found in that link' }, 404)
  } catch (_e) {
    return json({ error: 'Could not read that link' }, 400)
  }
})
