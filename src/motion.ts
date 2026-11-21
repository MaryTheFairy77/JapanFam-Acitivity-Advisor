/** Small, quick animations. All of them switch off when the phone's "Reduce motion" setting is on. */
export const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Short buzz (Android only; iPhones don't allow it for web apps). */
export const buzz = (ms = 12) => { try { navigator.vibrate?.(ms) } catch { /* not supported */ } }

/** 👍 bounce */
export function bounce(el: Element | null) {
  if (!el || calm()) return
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }],
    { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' })
}

/** ✓ Been: a little burst of sakura petals from the tapped spot. */
export function sakuraBurst(from: Element | null) {
  if (!from || calm()) return
  const r = from.getBoundingClientRect()
  const x = r.left + r.width / 2, y = r.top + r.height / 2
  const colours = ['#f9c0cf', '#f6a6b8', '#fbd5de', '#e98aa0']
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span')
    const s = 7 + Math.random() * 6
    Object.assign(p.style, {
      position: 'fixed', left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${s}px`, zIndex: '2000', pointerEvents: 'none',
      background: colours[i % colours.length], borderRadius: '80% 0 80% 0',
    })
    document.body.appendChild(p)
    const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4
    const d = 40 + Math.random() * 45
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 25
    p.animate([
      { transform: 'translate(-50%,-50%) scale(.4) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${180 + Math.random() * 180}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy + 45}px)) scale(.8) rotate(360deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => p.remove()
  }
}

/** Map pin drops in from a little above. */
export function dropIn(el: Element | null, delay = 0) {
  if (!el || calm()) return
  el.animate([{ transform: 'translateY(-18px)', opacity: 0 }, { transform: 'translateY(2px)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }],
    { duration: 380, delay, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' })
}
