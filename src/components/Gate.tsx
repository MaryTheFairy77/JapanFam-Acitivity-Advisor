import { useState } from 'react'
import { ensureSession, supabase } from '../lib'
import { FujiScene, Torii } from './Art'
import Privacy from './Privacy'

/** Family-code screen. The database only answers devices that passed this. */
export default function Gate({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const sessErr = await ensureSession()
    if (sessErr) {
      setErr(/anonymous/i.test(sessErr) ? 'Setup not finished: turn on anonymous sign-ins in Supabase.' : sessErr)
      setBusy(false); return
    }
    const { data, error } = await supabase.rpc('join_family', { code })
    setBusy(false)
    if (error) setErr(error.message)
    else if (data === true) onUnlocked()
    else setErr('That code isn’t right. Ask Maryam for the family code.')
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[#fdf6ee]">
      <div className="mx-auto w-full max-w-sm flex-1 px-6 pt-16">
        <Torii className="h-14 w-14" />
        <h1 className="mt-4 font-display text-4xl">Family code</h1>
        <p className="mt-2 text-stone-600">Enter the code from the family WhatsApp group. You only need to do this once per phone.</p>
        <form onSubmit={submit} className="mt-6">
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. sakura-…" autoCapitalize="none" autoCorrect="off"
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3.5 text-lg outline-none focus:border-torii" />
          {err && <p className="mt-2 text-sm text-torii">{err}</p>}
          <button disabled={busy || !code.trim()} className="mt-4 w-full rounded-full bg-torii py-3.5 font-semibold text-white disabled:opacity-40">
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
        <Privacy className="mt-8" />
      </div>
      <FujiScene className="pointer-events-none h-40 w-full" />
    </div>
  )
}
