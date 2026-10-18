import { useCallback, useEffect, useState } from 'react'
import { supabase, type Attendee, type Member, type Place, type Vote } from './lib'

/** Loads everything (small family dataset) and refreshes on focus + every 20s. Only runs once the device is unlocked. */
export function useData(enabled: boolean) {
  const [members, setMembers] = useState<Member[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [m, p, v, a] = await Promise.all([
      supabase.from('members').select('*').order('created_at'),
      supabase.from('places').select('*').order('created_at'),
      supabase.from('votes').select('member_id, place_id'),
      supabase.from('attendees').select('member_id, place_id'),
    ])
    const err = m.error ?? p.error ?? v.error ?? a.error
    if (err) setError(err.message)
    else {
      setError(null)
      setMembers(m.data as Member[])
      setPlaces(p.data as Place[])
      setVotes(v.data as Vote[])
      setAttendees(a.data as Attendee[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const id = setInterval(refresh, 20000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [refresh, enabled])

  return { members, places, votes, attendees, loading, error, refresh, setPlaces, setVotes, setAttendees }
}
