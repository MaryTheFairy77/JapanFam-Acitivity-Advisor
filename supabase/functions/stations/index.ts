// Deployed to Supabase as the "stations" Edge Function (verify_jwt = true).
// Finds railway/subway stations near our hotels + places on OpenStreetMap (Overpass, free) and saves the list in
// public.stations_cache, so phones just read the table (Overpass is often busy and blocks browsers when it is).
// Family-only (is_family()). Body: { points: [[lat, lng], ...] } (max 300). Returns { stations }.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const URL_ = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function isFamily(auth: string | null) {
  if (!auth) return false
  const r = await fetch(`${URL_}/rest/v1/rpc/is_family`, { method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' })
  return r.ok && (await r.json()) === true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    if (!(await isFamily(req.headers.get('Authorization')))) return json({ error: 'not_family' }, 403)
    const { points, sig } = await req.json()
    if (!Array.isArray(points) || !points.length || points.length > 300 || typeof sig !== 'string' || sig.length > 20000) return json({ error: 'bad input' }, 400)
    const pts = points.filter((p: unknown) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && isFinite(n)))
      .filter(([la, ln]: number[]) => la > 24 && la < 46 && ln > 122 && ln < 146) // Japan only
      .map(([la, ln]: number[]) => `${la.toFixed(4)},${ln.toFixed(4)}`)
    const q = `[out:json][timeout:60];(${pts.map((p: string) => `node(around:700,${p})["railway"="station"];`).join('')});out body;`
    for (const m of MIRRORS) {
      try {
        const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'JapanFam family trip app' }, signal: AbortSignal.timeout(25000) })
        if (!r.ok) continue
        const j = await r.json()
        const seen = new Set<string>()
        const stations: { id: number; name: string; lat: number; lng: number }[] = []
        for (const e of j.elements ?? []) {
          const name: string | undefined = e.tags?.['name:en'] ?? e.tags?.['name:ja_rm'] ?? e.tags?.name
          if (!name || typeof e.lat !== 'number') continue
          const k = `${name}|${e.lat.toFixed(2)}|${e.lon.toFixed(2)}`
          if (seen.has(k)) continue
          seen.add(k)
          stations.push({ id: e.id, name: String(name).replace(/ Station$/i, '').slice(0, 80), lat: e.lat, lng: e.lon })
        }
        await fetch(`${URL_}/rest/v1/stations_cache`, {
          method: 'POST',
          headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ id: 1, sig, data: stations, updated_at: new Date().toISOString() }),
        })
        return json({ stations })
      } catch { /* try next mirror */ }
    }
    return json({ error: 'busy' }, 200)
  } catch (_e) {
    return json({ error: 'failed' }, 200)
  }
})
