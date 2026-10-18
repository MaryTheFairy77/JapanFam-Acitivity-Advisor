import { useState } from 'react'
import { EMOJIS, GROUPS, LIMITS, displayName, getPlannerCode, setPlannerCode, supabase, type Group, type Attendee, type Member, type Place } from '../lib'
import Privacy from './Privacy'

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
export function ProfileSheet({ me, onClose, onSaved, onSwitch }: {
  me: Member; onClose: () => void; onSaved: () => void; onSwitch: () => void
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
      {me.is_admin && <AddMember onAdded={onSaved} />}
      <Privacy className="mt-5" />
    </Sheet>
  )
}

/** Tick who's going to a place — anyone can tick for anyone (parents for kids). */
export function GoingSheet({ place, members, attendees, onClose, onToggle }: {
  place: Place; members: Member[]; attendees: Attendee[]; onClose: () => void; onToggle: (memberId: string) => void
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
                  <button key={m.id} onClick={() => onToggle(m.id)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${on ? 'border-emerald-400 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
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
