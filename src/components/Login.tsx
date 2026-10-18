import { GROUPS, displayName, type Member } from '../lib'
import { FujiScene, WaveBand } from './Art'
import Privacy from './Privacy'

/** "Who are you?" — fixed family list, tap your name. */
export default function Login({ members, onPick }: { members: Member[]; onPick: (id: string) => void }) {
  return (
    <div className="relative min-h-[100dvh] bg-[#fdf6ee]">
      <div className="relative h-44 overflow-hidden bg-gradient-to-b from-[#fde2e4] to-[#fdf6ee]">
        <FujiScene className="absolute inset-x-0 bottom-0 h-full w-full" />
        <div className="absolute left-5 top-10">
          <h1 className="font-display text-4xl">Who's this?</h1>
          <p className="text-stone-600">Tap your name 👇</p>
        </div>
      </div>
      <WaveBand />
      <div className="mx-auto max-w-md px-5 pb-10 pt-5">
        {GROUPS.map((g) => {
          const list = members.filter((m) => m.grp === g.key)
          if (!list.length) return null
          return (
            <section key={g.key} className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-torii">{g.label}</h2>
              <div className="grid grid-cols-3 gap-2.5">
                {list.map((m) => (
                  <button key={m.id} onClick={() => onPick(m.id)}
                    className="flex flex-col items-center gap-1 rounded-2xl border border-stone-200 bg-white px-2 py-3 shadow-sm transition active:scale-95 hover:border-torii">
                    <span className="text-3xl">{m.emoji}</span>
                    <span className="w-full truncate text-center text-sm font-medium">{displayName(m)}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
        <p className="text-center text-sm text-stone-500">Not on the list? Ask Maryam to add you.</p>
        <Privacy className="mt-6" />
      </div>
    </div>
  )
}
