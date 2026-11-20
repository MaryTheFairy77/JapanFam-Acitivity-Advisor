// Deployed to Supabase as the "copy-photo" Edge Function (verify_jwt = true).
// Linked photos (Google Maps, Tripadvisor… links pasted into a place) can expire or get blocked. This copies each one into
// our private `place-photos` bucket and swaps places.image_url to "storage:<path>", so the photo can't disappear before the trip.
// Same picture the family chose (rule 7: we never pick photos). JPEG EXIF/XMP (incl. location) is stripped.
// Family-only (is_family()). Body: { ids: [place uuid, ...] } (max 40). Returns { copied, failed, skipped }.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const URL_ = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
const MAX = 3 * 1024 * 1024 // bucket limit
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function isFamily(auth: string | null) {
  if (!auth) return false
  const r = await fetch(`${URL_}/rest/v1/rpc/is_family`, { method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' })
  return r.ok && (await r.json()) === true
}

/** Sniff the real type from the first bytes (don't trust the server's header). */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

/** Drop APP1 (EXIF / XMP) and APP13 (IPTC) segments from a JPEG. Leaves everything else byte-for-byte. */
function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  while (i + 4 <= b.length && b[i] === 0xff) {
    const m = b[i + 1]
    if (m === 0xda) break // start of scan: image data follows
    const len = (b[i + 2] << 8) | b[i + 3]
    if (len < 2 || i + 2 + len > b.length) return b // odd file: keep as is
    if (m !== 0xe1 && m !== 0xed) out.push(b.subarray(i, i + 2 + len))
    i += 2 + len
  }
  out.push(b.subarray(i))
  const r = new Uint8Array(out.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of out) { r.set(p, o); o += p.length }
  return r
}

async function download(url: string): Promise<{ bytes: Uint8Array; type: string } | string> {
  let u: URL
  try { u = new URL(url) } catch { return 'bad link' }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'bad link'
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(u.hostname)) return 'bad link'
  const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8' } })
  if (!r.ok) return `http ${r.status}`
  const buf = new Uint8Array(await r.arrayBuffer())
  if (buf.length > MAX) return 'too big'
  const type = sniff(buf)
  if (!type) return 'not a photo'
  return { bytes: type === 'image/jpeg' ? stripJpeg(buf) : buf, type }
}

async function copyOne(id: string, url: string): Promise<'copied' | string> {
  const got = await download(url)
  if (typeof got === 'string') return got
  const path = `linked/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${EXT[got.type]}`
  const up = await fetch(`${URL_}/storage/v1/object/place-photos/${path}`, { method: 'POST', headers: { ...svc, 'Content-Type': got.type, 'x-upsert': 'false' }, body: got.bytes })
  if (!up.ok) return `upload ${up.status}`
  // only swap if nobody changed the photo meanwhile
  const p = await fetch(`${URL_}/rest/v1/places?id=eq.${id}&image_url=eq.${encodeURIComponent(url)}`, {
    method: 'PATCH', headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ image_url: `storage:${path}` }),
  })
  const rows = p.ok ? await p.json() : []
  if (!rows.length) { // changed meanwhile (or failed): remove the copy we just made
    await fetch(`${URL_}/storage/v1/object/place-photos/${path}`, { method: 'DELETE', headers: svc })
    return p.ok ? 'changed meanwhile' : `save ${p.status}`
  }
  return 'copied'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    if (!(await isFamily(req.headers.get('Authorization')))) return json({ error: 'not_family' }, 403)
    const { ids } = await req.json()
    if (!Array.isArray(ids) || !ids.length || ids.length > 40 || !ids.every((x) => typeof x === 'string' && UUID.test(x))) return json({ error: 'bad input' }, 400)
    const r = await fetch(`${URL_}/rest/v1/places?select=id,image_url&id=in.(${ids.join(',')})`, { headers: svc })
    const rows: { id: string; image_url: string | null }[] = r.ok ? await r.json() : []
    const todo = rows.filter((x) => x.image_url && /^https?:\/\//i.test(x.image_url))
    const copied: string[] = [], failed: Record<string, string> = {}
    for (let i = 0; i < todo.length; i += 4) { // 4 at a time
      await Promise.all(todo.slice(i, i + 4).map(async (x) => {
        try {
          const res = await copyOne(x.id, x.image_url!)
          if (res === 'copied') copied.push(x.id); else failed[x.id] = res
        } catch (e) { failed[x.id] = String(e).slice(0, 80) }
      }))
    }
    console.log('copy-photo', JSON.stringify({ copied: copied.length, failed }))
    return json({ copied, failed, skipped: ids.length - todo.length })
  } catch (_e) {
    return json({ error: 'failed' }, 200)
  }
})
