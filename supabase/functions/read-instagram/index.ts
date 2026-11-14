// Deployed to Supabase as the "read-instagram" Edge Function (verify_jwt = true).
// Paste an Instagram post/reel link → we read its public caption (Open Graph tags) and ask Gemini (FREE tier only)
// which place it is about. Returns { name, area, kind, description, halal } or { error }.
//
// Cost safety: the GEMINI_API_KEY secret must come from a Google AI Studio project WITHOUT billing.
// Free tier = no charges; when its limit is hit Google refuses the request and the app just asks for the name.
// Only phones that entered the family code can call this (checked with is_family()).
// Only instagram.com links are fetched (no open proxy). Nothing is stored.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const IG = /^https:\/\/(www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest']

const unescape = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))?.[1] ?? null

async function isFamily(auth: string | null) {
  if (!auth) return false
  const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const r = await fetch(`${url}/rest/v1/rpc/is_family`, { method: 'POST', headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' })
  return r.ok && (await r.json()) === true
}

async function caption(link: string): Promise<string | null> {
  // Instagram serves Open Graph tags (incl. the caption) to link-preview bots; often refuses everyone else.
  for (const ua of ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Mozilla/5.0 (compatible; JapanFamBot/1.0)']) {
    try {
      const r = await fetch(link, { headers: { 'User-Agent': ua, 'Accept-Language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(6000) })
      if (!r.ok) continue
      const html = (await r.text()).slice(0, 600000)
      const parts = [meta(html, 'og:title'), meta(html, 'og:description'), meta(html, 'description')].filter(Boolean).map((s) => unescape(s!))
      const text = [...new Set(parts)].join('\n').trim()
      if (text.length > 20 && !/log ?in|sign up to see/i.test(text.slice(0, 80))) return text.slice(0, 4000)
    } catch { /* try next */ }
  }
  return null
}

const PROMPT = `You help a family plan a trip to Japan. Below is the caption of an Instagram post.
Work out which ONE real place in Japan it recommends (restaurant, café, shop, attraction or activity).
Reply as JSON only:
{"name": string|null, "area": string|null, "kind": "restaurant"|"activity"|"shopping"|null,
 "description": string|null, "halal": "certified"|"muslim_friendly"|"pork_free"|"unknown"}
Rules: name = the place's own name (not the poster's). area = neighbourhood + city if stated (e.g. "Shinjuku, Tokyo").
description = max 140 characters, in your own words, what it's known for. halal: only "certified" if the caption says halal certified;
"muslim_friendly" if it says halal options / Muslim friendly; "pork_free" if it says no pork; else "unknown".
If the caption doesn't name a specific place, set name to null. Never invent a place.

Caption:
"""
`

async function askGemini(text: string, key: string) {
  const call = (model: string, noThinking: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT + text + '\n"""' }] }],
      // easy question: skip the model's "thinking" step (much faster); falls back if a model doesn't support it
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 400, ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
    signal: AbortSignal.timeout(15000),
  })
  for (const model of MODELS) {
    let r: Response
    try {
      r = await call(model, true)
      if (r.status === 400) r = await call(model, false)
    } catch { return { error: 'busy' } } // timed out
    if (r.status === 404) continue // model name retired: try the next
    if (r.status === 429) return { error: 'busy' } // free-tier limit reached: no charge, just try later
    if (!r.ok) { console.log('gemini', model, r.status, (await r.text()).slice(0, 200)); return { error: 'ai_failed' } }
    const j = await r.json()
    const out = j?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
    try { return JSON.parse(out) } catch { return { error: 'ai_failed' } }
  }
  return { error: 'ai_failed' }
}

const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    if (!(await isFamily(req.headers.get('Authorization')))) return json({ error: 'not_family' }, 403)
    const { url } = await req.json()
    const m = typeof url === 'string' ? url.trim().match(IG) : null
    if (!m) return json({ error: 'not_instagram' }, 400)
    const link = `https://www.instagram.com/${m[2] === 'reels' ? 'reel' : m[2]}/${m[3]}/`
    const text = await caption(link)
    if (!text) { console.log('no caption', link); return json({ error: 'no_caption' }, 200) }
    const key = Deno.env.get('GEMINI_API_KEY')
    if (!key) return json({ error: 'no_key', caption: text.slice(0, 600) }, 200)
    const g = await askGemini(text, key)
    if (g.error) return json({ error: g.error }, 200)
    const kind = ['restaurant', 'activity', 'shopping'].includes(g.kind) ? g.kind : null
    const halal = { certified: 'Halal certified', muslim_friendly: 'Muslim friendly', pork_free: 'Pork-free' }[g.halal as string] ?? null
    if (!clip(g.name, 120)) return json({ error: 'no_place' }, 200)
    return json({ name: clip(g.name, 120), area: clip(g.area, 120), kind, description: clip(g.description, 200), halal, source: link })
  } catch (_e) {
    return json({ error: 'failed' }, 200)
  }
})
