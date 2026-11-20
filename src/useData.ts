import { useCallback, useEffect, useRef, useState } from 'react'
import { PHOTO_BUCKET, isStoragePhoto, supabase, type Member, type Place, type Vote } from './lib'

const SNAP = 'japanfam.snapshot.v1'
const TRIED = 'japanfam.photoCopyTried.v1' // linked photo url → when this phone last asked the server to copy it
const RESIGN_MS = 10 * 60 * 60 * 1000 // signed photo links last 12h; renew after 10h (a home-screen app can stay open for days)
const isLinked = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u)

/** Linked photos (Google Maps etc.) can expire: ask the server to copy them into our own storage. Each link tried at most once a day per phone. */
async function copyLinkedPhotos(places: Place[]): Promise<boolean> {
  let tried: Record<string, number> = {}
  try { tried = JSON.parse(localStorage.getItem(TRIED) ?? '{}') } catch { /* fresh */ }
  const now = Date.now()
  const todo = places.filter((p) => isLinked(p.image_url) && !(now - (tried[p.image_url!] ?? 0) < 24 * 60 * 60 * 1000)).slice(0, 40)
  if (!todo.length) return false
  todo.forEach((p) => { tried[p.image_url!] = now })
  try { localStorage.setItem(TRIED, JSON.stringify(Object.fromEntries(Object.entries(tried).filter(([, at]) => now - at < 7 * 24 * 60 * 60 * 1000)))) } catch { /* ignore */ }
  const { data } = await supabase.functions.invoke('copy-photo', { body: { ids: todo.map((p) => p.id) } })
  return !!data?.copied?.length
}
type Snapshot = { members: Member[]; places: Place[]; votes: Vote[]; photoUrls: Record<string, string>; savedAt: number }
function readSnap(): Snapshot | null { try { const s = localStorage.getItem(SNAP); return s ? JSON.parse(s) as Snapshot : null } catch { return null } }

/**
 * Loads everything (small family dataset) and refreshes on focus + every 20s. Only runs once the device is unlocked.
 * Offline: every good load is saved on the phone; if the network fails we show that saved copy (read-only) instead of an error.
 */
export function useData(enabled: boolean) {
  const [members, setMembers] = useState<Member[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const signed = useRef<Record<string, string>>({})
  const signedAt = useRef<Record<string, number>>({}) // path → when we signed it (0 = came from the offline copy)
  const copying = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offlineSince, setOfflineSince] = useState<number | null>(null) // savedAt of the copy we're showing

  const refresh: () => Promise<void> = useCallback(async () => {
    const fail = (e: unknown) => ({ data: null, error: { message: String((e as Error)?.message ?? e) } })
    const [m, p, v] = await Promise.all([
      supabase.from('members').select('*').order('created_at'),
      supabase.from('places').select('*').order('created_at'),
      supabase.from('votes').select('member_id, place_id'),
    ].map((q) => Promise.resolve(q).catch(fail)))
    const err = m.error ?? p.error ?? v.error
    if (err) {
      const snap = readSnap()
      if (snap && (!navigator.onLine || /fetch|network|Failed|Load failed/i.test(err.message))) {
        setMembers(snap.members); setPlaces(snap.places); setVotes(snap.votes)
        signed.current = { ...snap.photoUrls, ...signed.current }
        setPhotoUrls({ ...signed.current })
        setOfflineSince(snap.savedAt); setError(null)
      } else setError(err.message)
    } else {
      setError(null); setOfflineSince(null)
      setMembers(m.data as Member[])
      setPlaces(p.data as Place[])
      setVotes(v.data as Vote[])
      // sign private photo links we haven't signed yet (valid 12h; cached so images don't flicker)
      // (re)sign when missing or older than 10h, so a phone that keeps the app open for days never shows expired links
      const now = Date.now()
      const need = [...new Set((p.data as Place[]).map((x) => x.image_url).filter(isStoragePhoto).map((u) => u.slice(8)))]
        .filter((path) => !signed.current[path] || now - (signedAt.current[path] ?? 0) > RESIGN_MS)
      if (need.length) {
        const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(need, 60 * 60 * 12)
        data?.forEach((d) => { if (d.signedUrl && d.path) { signed.current[d.path] = d.signedUrl; signedAt.current[d.path] = now } })
        setPhotoUrls({ ...signed.current })
      }
      if (!copying.current && (p.data as Place[]).some((x) => isLinked(x.image_url))) {
        copying.current = true
        copyLinkedPhotos(p.data as Place[]).then((any) => { copying.current = false; if (any) refresh() }, () => { copying.current = false })
      }
      try {
        localStorage.setItem(SNAP, JSON.stringify({ members: m.data, places: p.data, votes: v.data, photoUrls: signed.current, savedAt: Date.now() }))
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

  return { members, places, votes, photoUrls, loading, error, offlineSince, refresh, setPlaces, setVotes }
}
