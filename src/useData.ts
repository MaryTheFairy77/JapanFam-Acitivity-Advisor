import { useCallback, useEffect, useState } from 'react'
import { supabase, type Member, type Place, type Vote } from './lib'

/** Loads everything (small family dataset) and refreshes on focus + every 20s. */
export function useData() {
  const [members, setMembers] = useState<Member[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [m, p, v] = await Promise.all([
      supabase.from('members').select('*').order('created_at'),
      supabase.from('places').select('*').order('created_at'),
      supabase.from('votes').select('member_id, place_id'),
    ])
    const err = m.error ?? p.error ?? v.error
    if (err) setError(err.message)
    else {
      setError(null)
      setMembers(m.data as Member[])
      setPlaces(p.data as Place[])
      setVotes(v.data as Vote[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 20000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  return { members, places, votes, loading, error, refresh, setPlaces, setVotes }
}
