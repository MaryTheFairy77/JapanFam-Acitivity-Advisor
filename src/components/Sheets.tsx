import { useState } from 'react'
import { EMOJIS, GROUPS, LIMITS, autoFillPlace, displayName, getPlannerCode, lookupPlace, resolveMapsLink, setPlannerCode, supabase, HOTELS, type Group, type Attendee, type Member, type Place } from '../lib'
import Privacy from './Privacy'
import { TRACKS, getPrefs, setPrefs, type Track } from '../sound'

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-washi p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">{title}</h2>
          <button onClick={onClose} className="text-2xl text-stone-400">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Edit your nickname + avatar, or switch person. */
export function ProfileSheet({ me, places, onClose, onSaved, onSwitch }: {
  me: Member; places: Place[]; onClose: () => void; onSaved: () => void; onSwitch: () => void
}) {
  const [nickname, setNickname] = useState(me.nickname ?? '')
  const [emoji, setEmoji] = useState(me.emoji)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('members').update({ nickname: nickname.trim() || null, emoji }).eq('id', me.id)
    setBusy(false)
    if (error) setErr(error.message); else onSaved()
  }

  return (
    <Sheet title="Your profile" onClose={onClose}>
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3">
        <span className="text-4xl">{emoji}</span>
        <div>
          <p className="font-medium">{nickname.trim() || me.name}</p>
          <p className="text-xs text-stone-500">{GROUPS.find((g) => g.key === me.grp)?.label.slice(0, -1)}{me.is_admin ? ' · trip planner ⭐' : ''}</p>
        </div>
      </div>
      <label className="mt-4 block text-sm font-medium text-stone-700">Nickname
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={me.name} maxLength={LIMITS.nickname}
          className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-torii" />
      </label>
      <p className="mt-4 text-sm font-medium text-stone-700">Avatar</p>
      <div className="mt-1 grid grid-cols-8 gap-1.5">
        {EMOJIS.map((em) => (
          <button key={em} onClick={() => setEmoji(em)}
            className={`aspect-square rounded-xl text-xl ${emoji === em ? 'bg-torii/15 ring-2 ring-torii' : 'bg-white'}`}>{em}</button>
        ))}
      </div>
      {err && <p className="mt-2 text-sm text-torii">{err}</p>}
      <button onClick={save} disabled={busy} className="mt-5 w-full rounded-full bg-torii py-3 font-semibold text-white disabled:opacity-40">
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button onClick={onSwitch} className="mt-2 w-full rounded-full border border-stone-300 bg-white py-3 text-sm">Switch to someone else</button>
      <SoundSettings />
      {me.is_admin && <AddMember onAdded={onSaved} />}
      {me.is_admin && <FillGaps places={places} onDone={onSaved} />}
      <Privacy className="mt-5" />
    </Sheet>
  )
}

/** Tick who's going to a place — anyone can tick for anyone (parents for kids). */
export function GoingSheet({ place, members, attendees, onlyMemberId, onClose, onToggle }: {
  place: Place; members: Member[]; attendees: Attendee[]; onlyMemberId?: string; onClose: () => void; onToggle: (memberId: string) => void
}) {
  const going = new Set(attendees.filter((a) => a.place_id === place.id).map((a) => a.member_id))
  return (
    <Sheet title="Who's going?" onClose={onClose}>
      <p className="-mt-2 mb-4 text-sm text-stone-600">{place.name}</p>
      {GROUPS.map((g) => {
        const list = members.filter((m) => m.grp === g.key)
        if (!list.length) return null
        const n = list.filter((m) => going.has(m.id)).length
        return (
          <section key={g.key} className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-torii">{g.label} · {n}</h3>
            <div className="grid grid-cols-2 gap-2">
              {list.map((m) => {
                const on = going.has(m.id)
                return (
                  <button key={m.id} onClick={() => onToggle(m.id)} disabled={!!onlyMemberId && m.id !== onlyMemberId}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm disabled:opacity-50 ${on ? 'border-emerald-400 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
                    <span className="text-lg">{m.emoji}</span>
                    <span className="flex-1 truncate">{displayName(m)}</span>
                    <span>{on ? '✅' : '⬜'}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      <button onClick={onClose} className="mt-2 w-full rounded-full bg-torii py-3 font-semibold text-white">Done</button>
    </Sheet>
  )
}

export function goingSummary(placeId: string, members: Member[], attendees: Attendee[]) {
  const ids = new Set(attendees.filter((a) => a.place_id === placeId).map((a) => a.member_id))
  const counts = GROUPS.map((g) => ({ g, n: members.filter((m) => m.grp === g.key && ids.has(m.id)).length }))
  const total = counts.reduce((s, c) => s + c.n, 0)
  const text = counts.filter((c) => c.n).map((c) => `${c.n} ${c.n === 1 ? c.g.one : c.g.many}`).join(' · ')
  return { total, text, counts }
}

/** Trip planners only: add a family member (checked server-side with the planner code). */
function AddMember({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [grp, setGrp] = useState<Group>('adult')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 w-full rounded-full border border-dashed border-stone-300 py-3 text-sm text-stone-600">⭐ Add a family member</button>

  async function add() {
    const c = getPlannerCode() ?? code
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('planner_add_member', { member_name: name, member_grp: grp, member_emoji: '🙂', code: c })
    setBusy(false)
    if (error) setMsg(/duplicate|unique/i.test(error.message) ? 'That name already exists.' : /Too many/.test(error.message) ? 'Too many wrong codes. Wait 15 minutes.' : error.message)
    else if (!data) { setPlannerCode(null); setMsg('Wrong trip-planner code.') }
    else { setPlannerCode(c); setName(''); setMsg('Added ✓'); onAdded() }
  }
  const input = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-torii'
  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-white p-3">
      <p className="text-sm font-medium">⭐ Add a family member</p>
      <input className={input} placeholder="First name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      <select className={input} value={grp} onChange={(e) => setGrp(e.target.value as Group)}>
        {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label.slice(0, -1)}</option>)}
      </select>
      {!getPlannerCode() && <input className={input} type="password" placeholder="Trip-planner code" value={code} onChange={(e) => setCode(e.target.value)} />}
      {msg && <p className="text-sm text-torii">{msg}</p>}
      <button onClick={add} disabled={busy || !name.trim()} className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Adding…' : 'Add'}</button>
    </div>
  )
}

function SoundSettings() {
  const [p, setP] = useState(getPrefs())
  const toggle = (k: 'clicks' | 'ambience') => { setPrefs({ [k]: !p[k] }); setP(getPrefs()) }
  const row = (k: 'clicks' | 'ambience', label: string, hint: string) => (
    <label className="flex items-center justify-between gap-3 py-2">
      <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-stone-500">{hint}</span></span>
      <input type="checkbox" data-sound="none" checked={p[k]} onChange={() => toggle(k)} className="h-5 w-5 accent-torii" />
    </label>
  )
  return (
    <div className="mt-3 rounded-2xl bg-white px-3 py-1">
      {row('clicks', '🔔 Button sounds', 'Soft taps, chimes and bells')}
      {row('ambience', '🎶 Background music', TRACKS[p.track].hint)}
      <div className="flex gap-1.5 pb-2">
        {(Object.keys(TRACKS) as Track[]).map((t) => (
          <button key={t} data-sound="tab" onClick={() => { setPrefs({ track: t, ...(p.ambience ? {} : { ambience: true }) }); setP(getPrefs()) }}
            className={`flex-1 rounded-xl border px-2 py-2 text-xs ${p.track === t ? 'border-torii bg-torii/10 font-semibold' : 'border-stone-200 bg-white'}`}>
            {TRACKS[t].label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Trip planners only: look up every place that has no pin yet (free OpenStreetMap search, 1 per second). */
function FillGaps({ places, onDone }: { places: Place[]; onDone: () => void }) {
  // places with no pin, or with ✨ generated info that can be refreshed (human-entered info is never touched)
  const todo = places.filter((p) => p.lat == null || p.lng == null || !p.maps_url || (p.auto_fields ?? []).length > 0)
  const [code, setCode] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  if (!todo.length) return null

  async function run() {
    const c = getPlannerCode() ?? code
    setBusy(true); setLog([])
    let ok = 0
    for (const p of todo) {
      const hint = p.nearest_hotels.length ? `${HOTELS[p.nearest_hotels[0]].city}, Japan` : undefined
      // prefer the place's own Google Maps link, then search by name
      const fromLink = p.maps_url ? await resolveMapsLink(p.maps_url).catch(() => null) : null
      const lk = fromLink ? { ...fromLink, label: 'Google Maps link' }
        : (await lookupPlace(p.name, hint).catch(() => null))
          ?? (p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng, label: 'existing pin' } : null) // still fill blanks around a known pin
      if (!lk) { setLog((l) => [...l, `❔ ${p.name}: not found`]); await new Promise((r) => setTimeout(r, 1100)); continue }
      const { row, added: a0 } = autoFillPlace(p, lk)
      let added = a0
      if (fromLink?.exact) { row.auto_fields = row.auto_fields.filter((f) => f !== 'pin'); added = added.filter((f) => f !== 'pin') }
      const { data, error } = await supabase.rpc('planner_update_place', { place: p.id, data: row, code: c })
      if (error || data !== true) { setPlannerCode(null); setLog((l) => [...l, error?.message.includes('Too many') ? '⛔ Too many wrong codes, wait 15 min' : '⛔ Wrong trip-planner code']); break }
      setPlannerCode(c); ok++
      setLog((l) => [...l, `✨ ${p.name}: ${added.join(', ')}`])
      await new Promise((r) => setTimeout(r, 1100)) // be polite to the free OpenStreetMap service
    }
    setBusy(false)
    if (ok) onDone()
  }
  const input = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-torii'
  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-[#fdf4c8]/60 p-3">
      <p className="text-sm font-medium">✨ Fill missing info ({todo.length} place{todo.length === 1 ? '' : 's'})</p>
      <p className="text-xs text-stone-600">Looks each one up on OpenStreetMap and fills the pin, nearest hotel and travel time (plus website or halal status if listed). Only blank or ✨ generated info is ever changed; anything a person typed is left alone.</p>
      {!getPlannerCode() && <input className={input} type="password" placeholder="Trip-planner code" value={code} onChange={(e) => setCode(e.target.value)} />}
      <button onClick={run} disabled={busy || (!getPlannerCode() && !code)} className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Looking up…' : 'Fill missing info'}</button>
      {log.length > 0 && <ul className="space-y-0.5 text-xs text-stone-700">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  )
}
