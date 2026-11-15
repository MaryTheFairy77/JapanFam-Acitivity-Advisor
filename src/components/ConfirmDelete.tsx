import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Trash2 } from 'lucide-react'
import { HOTELS, catOf, displayName, getPlannerCode, setPlannerCode, supabase, type HotelId, type Member, type Place } from '../lib'
import type { IdeaRow, PlannedDay } from '../itinerary'

export type Impact = { icon: string; text: string }

/**
 * 🗑 One confirmation sheet for every delete (Maryam, 15 Nov 2026): says exactly what goes, across the whole app,
 * and what stays. `needsCode` = only allowed as a trip planner → asks for the planner code here (once per session).
 * onConfirm(code) returns 'ok' | 'denied' | an error message.
 */
export default function ConfirmDelete({ title, lines, keeps = [], loading = false, needsCode = false, label = 'Delete for everyone', onConfirm, onClose, onDone }: {
  title: string; lines: Impact[]; keeps?: string[]; loading?: boolean; needsCode?: boolean; label?: string
  onConfirm: (code: string | null) => Promise<string>; onClose: () => void; onDone: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const askCode = needsCode && !getPlannerCode()
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [busy, onClose])

  async function go() {
    const c = needsCode ? getPlannerCode() ?? code.trim() : getPlannerCode()
    if (askCode && !c) { setErr('Enter the trip-planner code.'); return }
    setBusy(true); setErr(null)
    const r = await onConfirm(c || null).catch(() => 'Couldn’t delete. Check your internet.')
    setBusy(false)
    if (r === 'ok' || r === 'gone') { if (needsCode && c) setPlannerCode(c); onDone(); return }
    if (r === 'denied') { if (needsCode) setPlannerCode(null); setErr(needsCode ? 'Wrong trip-planner code.' : 'Only the person who added this (or a trip planner) can delete it.'); return }
    setErr(r)
  }

  return createPortal(
    <div className="fixed inset-0 z-[980] flex items-end justify-center bg-ink/50 sm:items-center" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label={title}
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-washi p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-torii/10"><Trash2 className="h-6 w-6 text-torii" /></span>
          <h3 className="font-display text-xl leading-tight">{title}</h3>
        </div>
        <p className="mt-3 text-sm font-semibold text-stone-700">This will remove, for everyone:</p>
        {loading ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking what it’s used in…</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-2 rounded-xl bg-white px-3 py-2 text-sm text-stone-800"><span className="shrink-0">{l.icon}</span><span>{l.text}</span></li>
            ))}
          </ul>
        )}
        {keeps.length > 0 && !loading && (
          <>
            <p className="mt-3 text-sm font-semibold text-stone-700">Stays as it is:</p>
            <ul className="mt-1 space-y-0.5 text-sm text-stone-600">{keeps.map((k, i) => <li key={i}>✓ {k}</li>)}</ul>
          </>
        )}
        <p className="mt-3 text-xs text-stone-500">This can’t be undone.</p>
        {askCode && (
          <label className="mt-3 block text-sm font-medium text-stone-700">⭐ Trip-planner code
            <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" autoCorrect="off"
              className="mt-1 h-11 w-full rounded-xl border border-stone-300 bg-white px-3 outline-none focus:border-torii" />
          </label>
        )}
        {err && <p className="mt-2 text-sm text-torii">{err}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-stone-300 bg-white font-medium">Keep it</button>
          <button disabled={busy || loading} onClick={go} data-sound="none"
            className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-torii font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{label}
          </button>
        </div>
      </div>
    </div>, document.body)
}

const day = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`

type PlaceImpact = { votes: number; going: number; hearts: number; plan_days: { day: string; locked: boolean; empties: boolean }[]; ideas: { member: string; hotel: HotelId; empties: boolean }[] }

/** 🗑 Delete a restaurant / activity / shop: asks the database where it's used, then confirms. */
export function DeletePlace({ place, members, onClose, onDone }: { place: Place; me?: Member; members: Member[]; onClose: () => void; onDone: () => void }) {
  const [imp, setImp] = useState<PlaceImpact | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    supabase.rpc('place_delete_impact', { place: place.id }).then(({ data, error }) => { if (error || !data) setFailed(true); else setImp(data as PlaceImpact) })
  }, [place.id])
  const who = (id: string) => { const m = members.find((x) => x.id === id); return m ? displayName(m) : 'Someone' }
  const what = place.kind === 'restaurant' ? 'restaurant' : catOf(place) === 'shopping' ? 'shop' : 'activity'
  const lines: Impact[] = [{ icon: place.kind === 'restaurant' ? '🍜' : catOf(place) === 'shopping' ? '🛍️' : '🎢', text: `“${place.name}” from ${place.kind === 'restaurant' ? 'Food' : 'Do'}, the 🗾 Map, 📊 Compare and the CSV` }]
  if (imp) {
    if (imp.votes) lines.push({ icon: '👍', text: `${n(imp.votes, 'vote')} on it` })
    if (imp.going) lines.push({ icon: '🙋', text: `${n(imp.going, 'person', 'people')} marked “I’m in”` })
    for (const d of imp.plan_days) lines.push({ icon: '🗓', text: d.empties
      ? `${day(d.day)}: it’s the only activity planned, so the day goes back to a 🤖 draft${d.locked ? ' (and loses its 🔒 lock)' : ''}`
      : `Taken out of the plan for ${day(d.day)}${d.locked ? ' 🔒' : ''}; the rest of the day stays` })
    for (const i of imp.ideas) lines.push({ icon: '💡', text: i.empties
      ? `${who(i.member)}’s ${HOTELS[i.hotel].short} day idea is deleted (it was the only activity)`
      : `Taken out of ${who(i.member)}’s ${HOTELS[i.hotel].short} day idea` })
    if (imp.hearts) lines.push({ icon: '❤️', text: `${n(imp.hearts, 'heart')} on 🏆 Top days that included it` })
    if (place.image_url) lines.push({ icon: '📷', text: 'Its photo' })
  } else if (failed) lines.push({ icon: '⚠️', text: 'Couldn’t check where it’s used (no internet?). Votes, plans and ideas that use it would also be cleaned up.' })
  return (
    <ConfirmDelete title={`Delete this ${what}?`} lines={lines} loading={!imp && !failed}
      keeps={['Every other place, vote and day']}
      onClose={onClose} onDone={onDone}
      onConfirm={async () => {
        const { data, error } = await supabase.rpc('delete_place', { place: place.id, code: null })
        return error ? 'Couldn’t delete. Check your internet.' : String(data)
      }} />
  )
}

/** Lines for deleting a 💡 day idea (or several merged into one 🏆 card). */
export function ideaImpact(ideas: IdeaRow[], members: Member[], places: Place[], hearts: number, othersKeepIt: boolean, onDate: string | null): { lines: Impact[]; keeps: string[] } {
  const who = (id: string) => { const m = members.find((x) => x.id === id); return m ? displayName(m) : 'Someone' }
  const names = (ids: string[]) => ids.map((id) => places.find((p) => p.id === id)?.name).filter(Boolean).join(', ')
  const lines: Impact[] = ideas.map((i) => ({ icon: '💡', text: `${who(i.member_id)}’s ${HOTELS[i.hotel].short} day idea (${names(i.activity_ids) || 'its activities'})` }))
  if (!othersKeepIt) {
    lines.push({ icon: '🏆', text: 'Its card on 🏆 Top days' })
    if (hearts) lines.push({ icon: '❤️', text: `${n(hearts, 'heart')} on that day` })
  }
  const keeps = ['The places themselves and their 👍 votes']
  if (othersKeepIt) keeps.push('The 🏆 card and its ❤️ (someone else suggested the same day, or it’s planned)')
  if (onDate) keeps.push(`The planned day on ${day(onDate)} (clear it there if you want it gone)`)
  return { lines, keeps }
}

export async function deleteIdea(id: string, code: string | null) {
  const { data, error } = await supabase.rpc('delete_idea', { idea: id, code })
  return error ? 'Couldn’t delete. Check your internet.' : String(data)
}

/** Lines for clearing a planned day back to its draft. */
export function planImpact(d: PlannedDay, hearts: number, ideaHasIt: boolean): { lines: Impact[]; keeps: string[] } {
  const acts = d.acts.map((p) => p.name).join(', ')
  const lines: Impact[] = [{ icon: '🗓', text: `The plan for ${day(d.date)}${acts ? ` (${acts})` : ''}: the day goes back to a faded 🤖 draft` }]
  if (d.locked) lines.push({ icon: '🔒', text: 'Its lock' })
  if (d.acts.length) lines.push({ icon: '🔓', text: 'Its activities become free again, so drafts on other days may change' })
  if (hearts && !ideaHasIt) lines.push({ icon: '❤️', text: `${n(hearts, 'heart')} on this day on 🏆 Top days` })
  const keeps = ['The places, their 👍 votes and everyone’s 💡 ideas']
  if (hearts && ideaHasIt) keeps.push('The ❤️ on this day (a 💡 idea still has it)')
  return { lines, keeps }
}
