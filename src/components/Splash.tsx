import { FujiScene, Petals } from './Art'

/** Launch screen: red sun pops, floods the screen, settles back; Fuji rises; login button slides up. */
export default function Splash({ cta, onGo }: { cta: string; onGo: () => void }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden bg-[#fdf6ee]">
      <Petals />
      <div className="flex flex-1 flex-col items-center justify-center pb-24">
        <div className="relative">
          <div className="splash-sun" />
          <span className="splash-ring" />
          <span className="splash-ring r2" />
        </div>
        <h1 className="fade-up mt-8 font-display text-5xl text-ink" style={{ animationDelay: '1.55s' }}>JapanFam</h1>
        <p className="fade-up mt-1 text-sm tracking-[0.35em] text-torii" style={{ animationDelay: '1.75s' }}>家族旅行</p>
        <p className="fade-up mt-3 text-stone-500" style={{ animationDelay: '1.9s' }}>Osaka · Kyoto · Tokyo</p>
      </div>

      <FujiScene className="rise pointer-events-none absolute inset-x-0 bottom-0 h-[34vh] w-full" />

      <div className="fade-up absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(2rem,env(safe-area-inset-bottom))]" style={{ animationDelay: '2.2s' }}>
        <button onClick={onGo} data-sound="success"
          className="mx-auto block w-full max-w-sm rounded-full bg-torii py-4 text-lg font-semibold text-white shadow-xl shadow-torii/30 transition active:scale-95">
          {cta}
        </button>
      </div>
    </div>
  )
}
