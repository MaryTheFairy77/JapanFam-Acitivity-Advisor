import { useState } from 'react'
import { supabase, type Member } from '../lib'

const EMOJIS = ['🍣', '🍜', '🍡', '🗻', '⛩️', '🎎', '🐼', '🦊', '🐱', '🌸', '🎌', '🍵']

export default function Login({ members, onPick, refresh }: {
  members: Member[]; onPick: (id: string) => void; refresh: () => Promise<void>
}) {
  const [adding, setAdding] = useState(members.length === 0)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function signUp(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setErr(null)
    const { data, error } = await supabase.from('members').insert({ name: name.trim(), emoji }).select().single()
    setBusy(false)
    if (error) { setErr(error.code === '23505' ? 'That name is taken — just tap it below.' : error.message); return }
    await refresh()
    onPick((data as Member).id)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-10 pt-14">
      <div className="mb-8">
        <div className="mb-4 h-12 w-12 rounded-full bg-torii" />
        <h1 className="font-display text-4xl leading-tight">JapanFam<br />Advisor</h1>
        <p className="mt-2 text-stone-600">Halal eats & things to do near our hotels. Who's planning?</p>
      </div>

      {members.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {members.map((m) => (
            <button key={m.id} onClick={() => onPick(m.id)}
              className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition active:scale-95 hover:border-torii">
              <span className="text-3xl">{m.emoji}</span>
              <span className="truncate font-medium">{m.name}</span>
            </button>
          ))}
        </div>
      )}

      {adding ? (
        <form onSubmit={signUp} className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <label className="text-sm font-medium text-stone-700">Your name</label>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mary"
            className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none focus:border-torii" />
          <p className="mt-3 text-sm font-medium text-stone-700">Pick an icon</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {EMOJIS.map((em) => (
              <button type="button" key={em} onClick={() => setEmoji(em)}
                className={`h-10 w-10 rounded-xl text-xl ${emoji === em ? 'bg-torii/15 ring-2 ring-torii' : 'bg-stone-100'}`}>{em}</button>
            ))}
          </div>
          {err && <p className="mt-2 text-sm text-torii">{err}</p>}
          <button disabled={busy || !name.trim()}
            className="mt-4 w-full rounded-xl bg-torii py-3 font-medium text-white disabled:opacity-40">
            {busy ? 'Joining…' : 'Join the trip'}
          </button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-6 rounded-2xl border-2 border-dashed border-stone-300 p-4 text-stone-600 hover:border-torii hover:text-torii">
          + I'm new — add me
        </button>
      )}
    </div>
  )
}
