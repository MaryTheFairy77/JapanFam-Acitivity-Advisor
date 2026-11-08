import { useCallback, useEffect, useRef, useState } from 'react'
import { PHOTO_BUCKET, isStoragePhoto, supabase, type Attendee, type Member, type Place, type Vote } from './lib'

const SNAP = 'japanfam.snapshot.v1'
type Snapshot = { members: Member[]; places: Place[]; votes: Vote[]; attendees: Attendee[]; photoUrls: Record<string, string>; savedAt: number }
function readSnap(): Snapshot | null { try { const s = localStorage.getItem(SNAP); return s ? JSON.parse(s) as Snapshot : null } catch { return null } }

/**
 * Loads everything (small family dataset) and refreshes on focus + every 20s. Only runs once the device is unlocked.
 * Offline: every good load is saved on the phone; if the network fails we show that saved copy (read-only) instead of an error.
 */
export function useData(enabled: boolean) {
  const [members, setMembers] = useState<Member[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const signed = useRef<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offlineSince, setOfflineSince] = useState<number | null>(null) // savedAt of the copy we're showing

  const refresh = useCallback(async () => {
    const fail = (e: unknown) => ({ data: null, error: { message: String((e as Error)?.message ?? e) } })
    const [m, p, v, a] = await Promise.all([
      supabase.from('members').select('*').order('created_at'),
      supabase.from('places').select('*').order('created_at'),
      supabase.from('votes').select('member_id, place_id'),
      supabase.from('attendees').select('member_id, place_id'),
    ].map((q) => Promise.resolve(q).catch(fail)))
    const err = m.error ?? p.error ?? v.error ?? a.error
    if (err) {
      const snap = readSnap()
      if (snap && (!navigator.onLine || /fetch|network|Failed|Load failed/i.test(err.message))) {
        setMembers(snap.members); setPlaces(snap.places); setVotes(snap.votes); setAttendees(snap.attendees)
        signed.current = { ...snap.photoUrls, ...signed.current }
        setPhotoUrls({ ...signed.current })
        setOfflineSince(snap.savedAt); setError(null)
      } else setError(err.message)
    } else {
      setError(null); setOfflineSince(null)
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
      try {
        localStorage.setItem(SNAP, JSON.stringify({ members: m.data, places: p.data, votes: v.data, attendees: a.data, photoUrls: signed.current, savedAt: Date.now() }))
      } catch { /* storage full: keep going */ }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const id = setInterval(refresh, 20000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus) }
  }, [refresh, enabled])

  return { members, places, votes, attendees, photoUrls, loading, error, offlineSince, refresh, setPlaces, setVotes, setAttendees }
}
