import { useCallback, useEffect, useRef, useState } from 'react'
import { PHOTO_BUCKET, isStoragePhoto, supabase, type Attendee, type Member, type Place, type Vote } from './lib'

/** Loads everything (small family dataset) and refreshes on focus + every 20s. Only runs once the device is unlocked. */
export function useData(enabled: boolean) {
  const [members, setMembers] = useState<Member[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const signed = useRef<Record<string, string>>({})
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
      // sign private photo links we haven't signed yet (valid 12h; cached so images don't flicker)
      const need = (p.data as Place[]).map((x) => x.image_url).filter(isStoragePhoto).map((u) => u.slice(8)).filter((path) => !signed.current[path])
      if (need.length) {
        const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(need, 60 * 60 * 12)
        data?.forEach((d) => { if (d.signedUrl && d.path) signed.current[d.path] = d.signedUrl })
        setPhotoUrls({ ...signed.current })
      }
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

  return { members, places, votes, attendees, photoUrls, loading, error, refresh, setPlaces, setVotes, setAttendees }
}
