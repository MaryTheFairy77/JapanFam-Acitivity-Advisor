// Deployed to Supabase as the "day-vibe" Edge Function (verify_jwt = true).
// 🏆 Day leaderboard: give a day (its set of activities) a fun one-word name + emoji + short vibe line,
// e.g. word "drift" → "Haroon's Tokyo drift", vibe "Go-karts through Shibuya, then sky views".
// Asked ONCE per activity set and cached in day_vibes, so opening the leaderboard costs nothing.
// Cost safety: GEMINI_API_KEY is from a Google AI Studio project WITHOUT billing (free tier; over the limit = refused, no charge).
// Only family phones can call it (is_family()); place names are read with the caller's own login (RLS).
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const PROMPT = `A Muslim family is planning a day in Japan. These are the day's activities:
{{LIST}}
Give the day a playful name and vibe. Reply as JSON only:
{"word": string, "emoji": string, "vibe": string, "story": string}
word = ONE or TWO lowercase English words that finish the phrase "Haroon's Tokyo ___" (e.g. "drift", "lights", "zen walk", "sugar rush", "adventure").
emoji = one emoji that fits. vibe = max 60 characters, in your own words, what the day feels like (e.g. "Glowing art, cat cuddles, then wagyu ramen").
story = 2–3 warm sentences (max 320 characters) walking through the day in the order given: what you'll see, do and eat, and the feel of it.
Use only the places listed; don't invent opening times, prices or facts. Family friendly, no alcohol or nightlife references.`

async function gemini(list: string, key: string) {
  const call = (model: string, noThinking: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT.replace('{{LIST}}', list) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: 400, ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
    signal: AbortSignal.timeout(8000),
  })
  for (const model of MODELS) {
    let r: Response
    try {
      r = await call(model, true)
      if (r.status === 400) r = await call(model, false)
    } catch { continue }
    if (r.status === 404 || r.status === 429) { console.log('gemini', model, r.status); continue }
    if (!r.ok) { console.log('gemini', model, r.status, (await r.text()).slice(0, 200)); return null }
    const out = (await r.json())?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
    try { return JSON.parse(out) } catch { return null }
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const auth = req.headers.get('Authorization')
    const url = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!auth) return json({ error: 'not_family' }, 403)
    const fam = await fetch(`${url}/rest/v1/rpc/is_family`, { method: 'POST', headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' })
    if (!fam.ok || (await fam.json()) !== true) return json({ error: 'not_family' }, 403)

    const { ids, key: k } = await req.json()
    if (!Array.isArray(ids) || !ids.length || ids.length > 12 || !ids.every((x) => typeof x === 'string' && UUID.test(x))) return json({ error: 'bad_ids' }, 400)
    const keyIds = typeof k === 'string' ? k.split('+') : ids
    if (!keyIds.every((x: unknown) => typeof x === 'string' && UUID.test(x) && ids.includes(x))) return json({ error: 'bad_key' }, 400)
    const key = [...new Set(keyIds as string[])].sort().join('+')
    const svc = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }

    const cached = await fetch(`${url}/rest/v1/day_vibes?combo_key=eq.${encodeURIComponent(key)}&select=word,emoji,vibe,story`, { headers: svc }).then((r) => r.json())
    if (Array.isArray(cached) && cached[0]?.story) return json(cached[0])

    // ids may include food in the day's order (for the story); the cache key is the activity set the app sends as `key`
    const order = [...new Set(ids as string[])]
    const places = await fetch(`${url}/rest/v1/places?id=in.(${order.join(',')})&select=id,name,description,category`, { headers: { apikey: anon, Authorization: auth } }).then((r) => r.json())
    if (!Array.isArray(places) || !places.length) return json({ error: 'no_places' }, 400)
    places.sort((a: { id: string }, b: { id: string }) => order.indexOf(a.id) - order.indexOf(b.id))
    const list = places.map((p: { name: string; description: string | null }) => `- ${p.name}${p.description ? `: ${String(p.description).slice(0, 120)}` : ''}`).join('\n')

    const gk = Deno.env.get('GEMINI_API_KEY')
    const g = gk ? await gemini(list, gk) : null
    const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
    const old = Array.isArray(cached) ? cached[0] : null // keep an existing name; only add the story
    const word = old?.word ?? clip(g?.word, 30).toLowerCase(), emoji = old?.emoji ?? clip(g?.emoji, 16), vibe = old?.vibe ?? clip(g?.vibe, 120), story = clip(g?.story, 600)
    if (!word || !emoji || !vibe) return json({ error: 'busy' }, 200) // free tier busy: the app shows a plain name and asks again later

    await fetch(`${url}/rest/v1/day_vibes`, { method: 'POST', headers: { ...svc, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ combo_key: key, word, emoji, vibe, story: story || null }) })
    return json({ word, emoji, vibe, story: story || null })
  } catch (e) {
    console.log('day-vibe failed', String(e).slice(0, 200))
    return json({ error: 'failed' }, 200)
  }
})
