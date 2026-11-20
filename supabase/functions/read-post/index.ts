// Deployed to Supabase as the "read-post" Edge Function (verify_jwt = true). Added 20 Nov 2026 (Phase 1: TikTok links).
// Paste a TikTok or Instagram link → caption, creator and cover picture, then Gemini (FREE tier only) lists the place(s) it recommends.
//   TikTok: TikTok's free public oEmbed lookup (no account, no key). Short links (vm./vt./tiktok.com/t/) are followed first.
//   Instagram: the post's public Open Graph tags (same as the older read-instagram function, which stays for old app versions).
// The cover picture is copied straight into our private place-photos bucket (social CDN links expire within hours).
// Returns { platform, source, creator, image, places: [{ name, area, kind, description, halal }] } or { error }.
// Family-only (is_family()). Only tiktok.com / instagram.com links are fetched (no open proxy). Nothing else is stored.
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
const MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
let DEBUG = false
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const IG = /^https:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/
const TT_HOST = /^(?:www\.|m\.|vm\.|vt\.)?tiktok\.com$/i
const TT_FULL = /^https:\/\/(?:www\.|m\.)?tiktok\.com\/@([A-Za-z0-9_.-]{1,40})\/(video|photo)\/(\d{8,25})/

const unescape = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))?.[1] ?? null
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

async function isFamily(auth: string | null) {
  if (!auth) return false
  const r = await fetch(`${URL_}/rest/v1/rpc/is_family`, { method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' })
  return r.ok && (await r.json()) === true
}

type Post = { platform: 'tiktok' | 'instagram'; source: string; caption: string; creator: string | null; cover: string | null }

// ── TikTok ──
/** Follow short links (vm.tiktok.com/…, tiktok.com/t/…) to the full video link, staying on tiktok.com. */
async function fullTikTok(link: string): Promise<string | null> {
  let u = link
  for (let hop = 0; hop < 5; hop++) {
    const m = u.match(TT_FULL)
    if (m) return `https://www.tiktok.com/@${m[1]}/${m[2]}/${m[3]}`
    let host: string
    try { host = new URL(u).hostname } catch { return null }
    if (!TT_HOST.test(host)) return null
    const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(6000) }).catch(() => null)
    const loc = r?.headers.get('location')
    if (!loc) {
      // some short links answer 200 with the canonical link in the page
      const html = r && r.ok ? (await r.text()).slice(0, 400000) : ''
      const c = html.match(/https:\/\/www\.tiktok\.com\/@[A-Za-z0-9_.-]+\/(?:video|photo)\/\d{8,25}/)
      return c ? c[0] : null
    }
    u = new URL(loc, u).toString().split('?')[0]
  }
  return null
}

/** Pull the caption + cover out of a TikTok page (video page or embed page). */
function fromPage(html: string): { caption: string | null; cover: string | null } {
  let caption: string | null = null, cover: string | null = null
  for (const id of ['__UNIVERSAL_DATA_FOR_REHYDRATION__', 'SIGI_STATE', '__FRONTITY_CONNECT_STATE__', '__NEXT_DATA__']) {
    const m = html.match(new RegExp(`<script[^>]+id="${id}"[^>]*>([\\s\\S]*?)</script>`))
    if (!m) continue
    const desc = m[1].match(/"desc":"((?:[^"\\]|\\.){3,4000})"/)
    if (desc) { try { caption = JSON.parse(`"${desc[1]}"`) } catch { /* keep looking */ } }
    const cv = m[1].match(/"(?:originCover|cover|dynamicCover)":"(https:[^"]+)"/)
    if (cv) { try { cover = JSON.parse(`"${cv[1]}"`) } catch { /* ignore */ } }
    if (caption) break
  }
  if (!caption) {
    const d = meta(html, 'og:description') ?? meta(html, 'description')
    if (d) {
      const u = unescape(d)
      // "959 Likes, TikTok video from Name (@user): “caption”."
      caption = u.match(/[“"](.{3,})[”"]\.?\s*$/s)?.[1] ?? u
    }
  }
  cover ??= meta(html, 'og:image') ? unescape(meta(html, 'og:image')!) : null
  return { caption: caption?.trim() || null, cover }
}

async function getPage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) { if (DEBUG) console.log('page', r.status, url); return null }
    return (await r.text()).slice(0, 1500000)
  } catch (e) { if (DEBUG) console.log('page error', url, String(e).slice(0, 120)); return null }
}

async function readTikTok(link: string): Promise<Post | string> {
  const full = await fullTikTok(link)
  if (!full) return 'no_caption'
  const m = full.match(TT_FULL)!
  let caption: string | null = null, cover: string | null = null, creator: string | null = null
  // 1. TikTok's free public oEmbed lookup
  for (const t of m[2] === 'photo' ? [full, full.replace('/photo/', '/video/')] : [full]) {
    try {
      const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(t)}`, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
      if (!r.ok) { console.log('tiktok oembed', r.status, t); continue }
      const j = await r.json()
      if (DEBUG) console.log('oembed', JSON.stringify(j).slice(0, 1500))
      creator = clip(j.author_unique_id, 60) ? `@${j.author_unique_id}` : clip(j.author_name, 60)
      caption = clip(j.title, 4000)
      if (!caption && typeof j.html === 'string') {
        const p = j.html.match(/<p>([\s\S]*?)<\/p>/)?.[1]
        if (p) caption = clip(unescape(p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')), 4000)
      }
      if (typeof j.thumbnail_url === 'string' && /^https:\/\//.test(j.thumbnail_url)) cover = j.thumbnail_url
      break
    } catch (e) { console.log('tiktok oembed error', String(e).slice(0, 200)) }
  }
  // 2. still no caption or cover: the public video page, then the embed page
  for (const url of [full, `https://www.tiktok.com/embed/v2/${m[3]}`]) {
    if (caption && cover) break
    const html = await getPage(url)
    if (!html) continue
    const got = fromPage(html)
    if (DEBUG) console.log('page', url, html.length, JSON.stringify({ c: got.caption?.slice(0, 120), cv: !!got.cover }))
    caption ??= got.caption
    cover ??= got.cover
  }
  if (!caption && !cover) return 'no_caption'
  return { platform: 'tiktok', source: full, caption: caption ?? '', creator: creator ?? `@${m[1]}`, cover }
}

// ── Instagram ──
async function readInstagram(link: string): Promise<Post | string> {
  const m = link.match(IG)
  if (!m) return 'bad_link'
  const canon = `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`
  // Instagram serves Open Graph tags (incl. the caption) to link-preview bots; often refuses everyone else.
  for (const ua of ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Mozilla/5.0 (compatible; JapanFamBot/1.0)']) {
    try {
      const r = await fetch(canon, { headers: { 'User-Agent': ua, 'Accept-Language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(6000) })
      if (!r.ok) continue
      const html = (await r.text()).slice(0, 600000)
      const title = meta(html, 'og:title'), desc = meta(html, 'og:description') ?? meta(html, 'description')
      const parts = [title, desc].filter(Boolean).map((s) => unescape(s!))
      const text = [...new Set(parts)].join('\n').trim()
      if (text.length <= 20 || /log ?in|sign up to see/i.test(text.slice(0, 80))) continue
      // "123 likes, 4 comments - someone on November 1, 2025: "…"" or "Name on Instagram: "…""
      const creator = (desc && unescape(desc).match(/-\s*([A-Za-z0-9_.]{2,30}) on [A-Z][a-z]+ \d/)?.[1]) ?? null
      const img = meta(html, 'og:image')
      return { platform: 'instagram', source: canon, caption: text.slice(0, 4000), creator: creator ? `@${creator}` : null, cover: img ? unescape(img) : null }
    } catch { /* try next */ }
  }
  return 'no_caption'
}

// ── Gemini (free tier): which places does the caption recommend? ──
const PROMPT = (platform: string) => `You help a family plan a trip to Japan. Below is the caption of a ${platform} post.
List the real places in Japan it recommends (restaurants, cafés, shops, attractions, activities). Usually one; "top 5" style posts list several.
Reply as JSON only: {"places": [{"name": string, "area": string|null, "kind": "restaurant"|"activity"|"shopping"|null,
 "description": string|null, "halal": "certified"|"muslim_friendly"|"pork_free"|"unknown"}]}
Rules: name = the place's own name (not the poster's, not a hashtag unless it is clearly the place). area = neighbourhood + city if stated
(e.g. "Shinjuku, Tokyo"). description = max 140 characters, in your own words, what it's known for. halal: "certified" ONLY if the
caption explicitly says certified / certification / certificate for that place; "muslim_friendly" if it calls the place halal, halal-friendly,
or Muslim friendly without mentioning certification; "pork_free" if it only says no pork; else "unknown".
At most 8 places, in the order the caption mentions them. If no specific place is named, return {"places": []}. Never invent a place.

Caption:
"""
`

async function askGemini(platform: string, text: string, key: string): Promise<{ places?: unknown[]; error?: string }> {
  const call = (model: string, noThinking: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT(platform) + text + '\n"""' }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 1200, ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
    signal: AbortSignal.timeout(10000),
  })
  let last = 'ai_failed'
  for (const model of MODELS) {
    let r: Response
    try {
      r = await call(model, true)
      if (r.status === 400) { console.log('gemini', model, 400, (await r.text()).slice(0, 300)); r = await call(model, false) }
    } catch (e) { console.log('gemini', model, 'timeout/error', String(e).slice(0, 200)); last = 'busy'; continue }
    // 404 = model retired; 429 = that model's free-tier limit: no charge, try the next model
    if (r.status === 404 || r.status === 429) { console.log('gemini', model, r.status, (await r.text()).slice(0, 300)); last = 'busy'; continue }
    if (!r.ok) { console.log('gemini', model, r.status, (await r.text()).slice(0, 200)); return { error: 'ai_failed' } }
    const j = await r.json()
    const out = j?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
    try {
      const parsed = JSON.parse(out)
      return { places: Array.isArray(parsed?.places) ? parsed.places : parsed?.name ? [parsed] : [] }
    } catch { console.log('gemini', model, 'bad json', String(out).slice(0, 200)); return { error: 'ai_failed' } }
  }
  return { error: last }
}

// ── Cover picture → our own storage (same safety as copy-photo) ──
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}
function stripJpeg(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  while (i + 4 <= b.length && b[i] === 0xff) {
    const m = b[i + 1]
    if (m === 0xda) break
    const len = (b[i + 2] << 8) | b[i + 3]
    if (len < 2 || i + 2 + len > b.length) return b
    if (m !== 0xe1 && m !== 0xed) out.push(b.subarray(i, i + 2 + len))
    i += 2 + len
  }
  out.push(b.subarray(i))
  const r = new Uint8Array(out.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of out) { r.set(p, o); o += p.length }
  return r
}
async function saveCover(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    if (!/(tiktokcdn[a-z0-9-]*\.com|tiktok\.com|cdninstagram\.com|fbcdn\.net)$/i.test(host)) return null
    const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8' }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) { console.log('cover', r.status, host); return null }
    const buf = new Uint8Array(await r.arrayBuffer())
    if (buf.length > 3 * 1024 * 1024) return null
    const type = sniff(buf)
    if (!type) return null
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type]
    const path = `covers/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
    const up = await fetch(`${URL_}/storage/v1/object/place-photos/${path}`, {
      method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': type, 'x-upsert': 'false' },
      body: type === 'image/jpeg' ? stripJpeg(buf) : buf,
    })
    return up.ok ? `storage:${path}` : null
  } catch (e) { console.log('cover error', String(e).slice(0, 200)); return null }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    if (!(await isFamily(req.headers.get('Authorization')))) return json({ error: 'not_family' }, 403)
    const body = await req.json()
    DEBUG = body?.debug === true
    const link = typeof body?.url === 'string' ? body.url.trim().match(/https?:\/\/\S+/)?.[0]?.replace(/[)\].,!]+$/, '') : null
    if (!link) return json({ error: 'bad_link' }, 400)
    let host = ''
    try { host = new URL(link).hostname } catch { return json({ error: 'bad_link' }, 400) }
    const post = TT_HOST.test(host) ? await readTikTok(link) : /(^|\.)instagram\.com$/i.test(host) ? await readInstagram(link) : 'bad_link'
    if (typeof post === 'string') { console.log(post, link); return json({ error: post }, 200) }
    // start copying the cover while Gemini reads the caption
    const coverP = saveCover(post.cover)
    const base = { platform: post.platform, source: post.source, creator: post.creator }
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!post.caption) return json({ ...base, image: await coverP, error: 'no_place' }, 200)
    if (!key) return json({ ...base, image: await coverP, error: 'no_key' }, 200)
    const g = await askGemini(post.platform === 'tiktok' ? 'TikTok' : 'Instagram', post.caption, key)
    const image = await coverP
    if (g.error) return json({ ...base, image, error: g.error }, 200)
    const places = (g.places ?? []).slice(0, 8).map((p) => {
      const x = p as Record<string, unknown>
      return {
        name: clip(x.name, 120), area: clip(x.area, 120),
        kind: ['restaurant', 'activity', 'shopping'].includes(x.kind as string) ? x.kind : null,
        description: clip(x.description, 200),
        halal: ({ certified: 'Halal certified', muslim_friendly: 'Muslim friendly', pork_free: 'Pork-free' } as Record<string, string>)[x.halal as string] ?? null,
      }
    }).filter((p) => p.name)
    if (!places.length) return json({ ...base, image, error: 'no_place' }, 200)
    return json({ ...base, image, places })
  } catch (e) {
    console.log('failed', String(e).slice(0, 200))
    return json({ error: 'failed' }, 200)
  }
})
