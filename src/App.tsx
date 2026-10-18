import { useEffect, useState } from 'react'
import { useData } from './useData'
import Login from './components/Login'
import Home from './components/Home'

const KEY = 'japanfam.memberId'

export default function App() {
  const data = useData()
  const [memberId, setMemberId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY) } catch { return null }
  })

  useEffect(() => {
    try { memberId ? localStorage.setItem(KEY, memberId) : localStorage.removeItem(KEY) } catch { /* ignore */ }
  }, [memberId])

  const me = data.members.find((m) => m.id === memberId) ?? null

  if (data.error) {
    return (
      <div className="mx-auto max-w-md p-6 pt-16 text-center">
        <p className="font-display text-2xl">Can't reach the database</p>
        <p className="mt-2 text-sm text-stone-600">{data.error}</p>
        <p className="mt-2 text-sm text-stone-600">If this is a fresh setup, run the SQL in <code>supabase/migrations</code> first.</p>
        <button onClick={data.refresh} className="mt-4 rounded-full bg-torii px-5 py-2 text-white">Retry</button>
      </div>
    )
  }

  if (data.loading) return <div className="p-10 text-center text-stone-500">Loading…</div>

  if (!me) return <Login members={data.members} onPick={setMemberId} refresh={data.refresh} />

  return <Home me={me} data={data} onLogout={() => setMemberId(null)} />
}
