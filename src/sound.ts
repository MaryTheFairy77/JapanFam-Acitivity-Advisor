/**
 * All sounds are synthesised live with the Web Audio API: no audio files, nothing to license.
 * - UI sounds: soft wood-block taps, a chime for upvotes, a temple bell for "visited".
 * - Ambience: a breathy shakuhachi-style flute improvising on the Japanese "in" (miyako-bushi) scale,
 *   occasional bird chirps, and a soft stream bed.
 */

export type Track = 'garden' | 'piano' | 'koto'
type Prefs = { clicks: boolean; ambience: boolean; track: Track }
const KEY = 'japanfam.sound'
const DEFAULTS: Prefs = { clicks: true, ambience: false, track: 'garden' }
const read = (): Prefs => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return { ...DEFAULTS } } }
let prefs = read()
const listeners = new Set<() => void>()
export const getPrefs = () => prefs
export function setPrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p }
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
  if (p.track && prefs.ambience) { stopAmbience(true); setTimeout(startAmbience, 300) } // switch track
  else if (p.ambience === true) startAmbience()
  else if (p.ambience === false) stopAmbience()
  listeners.forEach((f) => f())
}
export const onPrefs = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }

let ctx: AudioContext | null = null
let master: GainNode
let reverb: ConvolverNode
function ac() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination)
    // generated "temple hall" reverb: decaying stereo noise impulse
    reverb = ctx.createConvolver()
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3 }
    reverb.buffer = ir
    const wet = ctx.createGain(); wet.gain.value = 0.35; reverb.connect(wet).connect(master)
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {}) // 'suspended' or iOS 'interrupted'
  return ctx
}

const noiseBuf = (() => { let b: AudioBuffer | null = null; return (c: AudioContext) => {
  if (!b) { b = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1 }
  return b } })()

/** One enveloped tone. */
function tone(freq: number, { t = 0, dur = 0.15, vol = 0.2, type = 'sine' as OscillatorType, wet = 0, attack = 0.004, bend = 1 } = {}) {
  const c = ac(), now = c.currentTime + t
  const o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.setValueAtTime(freq, now)
  if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq * bend, now + dur)
  g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  o.connect(g).connect(master); if (wet) { const s = c.createGain(); s.gain.value = wet; g.connect(s).connect(reverb) }
  o.start(now); o.stop(now + dur + 0.05)
}

/** Short filtered noise "tok" (wood block / bamboo). */
function knock(freq: number, vol = 0.25, dur = 0.05) {
  const c = ac(), now = c.currentTime
  const n = c.createBufferSource(); n.buffer = noiseBuf(c)
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 8
  const g = c.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  n.connect(f).connect(g).connect(master); n.start(now); n.stop(now + dur + 0.02)
  tone(freq, { dur: dur * 1.4, vol: vol * 0.5 })
}

export type SoundName = 'tap' | 'tab' | 'pop' | 'vote' | 'unvote' | 'bell' | 'success' | 'error'
const SOUNDS: Record<SoundName, () => void> = {
  tap: () => knock(1600, 0.18),
  tab: () => knock(950, 0.22, 0.07),
  pop: () => tone(660, { dur: 0.12, vol: 0.16, bend: 1.5 }),
  vote: () => { tone(1175, { dur: 0.5, vol: 0.13, wet: 0.5 }); tone(1760, { t: 0.07, dur: 0.6, vol: 0.1, wet: 0.5 }) }, // D6 → A6
  unvote: () => { tone(1175, { dur: 0.3, vol: 0.1 }); tone(880, { t: 0.06, dur: 0.35, vol: 0.08 }) },
  bell: () => [1, 2.76, 5.4].forEach((m, i) => tone(523 * m, { dur: 1.6 - i * 0.4, vol: 0.12 / (i + 1), wet: 0.8 })), // temple-bell partials
  success: () => [587, 784, 880].forEach((f, i) => tone(f, { t: i * 0.09, dur: 0.35, vol: 0.12, wet: 0.4 })),
  error: () => tone(180, { dur: 0.22, vol: 0.2, type: 'triangle', bend: 0.7 }),
}
export function play(name: SoundName) {
  if (!prefs.clicks) return
  try { SOUNDS[name]() } catch { /* audio unavailable */ }
}

/** One global listener: any button/link/checkbox makes a sound; `data-sound="vote"` etc. picks a specific one. */
export function installClickSounds() {
  const handler = (e: PointerEvent) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-sound],button,a,input[type=checkbox],select,summary')
    if (!el || el.matches(':disabled')) return
    const name = (el.dataset.sound as SoundName | 'none' | undefined) ?? 'tap'
    if (name !== 'none') play(name)
    if (prefs.ambience && !ambienceTimer) startAmbience() // browsers need a tap before audio can start
  }
  document.addEventListener('pointerdown', handler, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) ctx.suspend().catch(() => {}); else if (prefs.ambience) ctx.resume().catch(() => {})
  })
}

// ── Ambience (all original, generated live) ──────────────
export const TRACKS: Record<Track, { label: string; hint: string }> = {
  garden: { label: '🎋 Garden', hint: 'Bamboo flute, birds and a stream' },
  piano: { label: '🎹 Piano meadow', hint: 'Gentle, nostalgic film-style piano' },
  koto: { label: '☔ Koto in the rain', hint: 'Plucked koto and soft rain' },
}
const midi = (m: number) => 440 * 2 ** ((m - 69) / 12)

// Japanese "in" scale on D: D Eb G A Bb (D4..D6)
const IN_SCALE = [293.66, 311.13, 392.0, 440.0, 466.16, 587.33, 622.25, 783.99, 880.0, 932.33, 1174.66]
let ambienceTimer: number | null = null
let ambBus: GainNode | null = null
let stream: AudioBufferSourceNode | null = null
let nextAt = 0 // audio-clock time for the next scheduled piano bar

function flute(freq: number, at: number, dur: number) {
  const c = ac(), bus = ambBus!
  const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain()
  o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = freq; o2.frequency.value = freq
  const vib = c.createOscillator(), vibAmt = c.createGain()
  vib.frequency.value = 4.8; vibAmt.gain.setValueAtTime(0, at); vibAmt.gain.linearRampToValueAtTime(freq * 0.012, at + dur * 0.6)
  vib.connect(vibAmt); vibAmt.connect(o.frequency); vibAmt.connect(o2.frequency)
  o.frequency.setValueAtTime(freq * 0.96, at); o.frequency.linearRampToValueAtTime(freq, at + 0.25) // "meri" bend
  const mix = c.createGain(); mix.gain.value = 0.25; o2.connect(mix)
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.09, at + 0.35); g.gain.setValueAtTime(0.09, at + dur * 0.7); g.gain.linearRampToValueAtTime(0, at + dur)
  o.connect(g); mix.connect(g)
  const n = c.createBufferSource(); n.buffer = noiseBuf(c); n.loop = true
  const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 1.5
  const ng = c.createGain(); ng.gain.setValueAtTime(0, at); ng.gain.linearRampToValueAtTime(0.025, at + 0.15); ng.gain.linearRampToValueAtTime(0.008, at + dur * 0.5); ng.gain.linearRampToValueAtTime(0, at + dur)
  n.connect(nf).connect(ng).connect(g)
  g.connect(bus); const s = c.createGain(); s.gain.value = 0.9; g.connect(s).connect(reverb)
  ;[o, o2, vib, n].forEach((x) => { x.start(at); x.stop(at + dur + 0.1) })
}

function bird(at: number) {
  const c = ac(), pan = c.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(ambBus!)
  const chirps = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1600
  for (let i = 0; i < chirps; i++) {
    const t = at + i * (0.09 + Math.random() * 0.08), o = c.createOscillator(), g = c.createGain()
    o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), t + 0.04)
    o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.08)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.connect(g).connect(pan); o.start(t); o.stop(t + 0.1)
  }
}

/** Garden: one flute phrase + maybe birds. Returns seconds until the next call. */
function gardenStep() {
  const c = ac(); let t = c.currentTime + 0.1
  let idx = 3 + Math.floor(Math.random() * 5)
  const notes = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < notes; i++) {
    idx = Math.max(0, Math.min(IN_SCALE.length - 1, idx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]))
    const dur = 1.4 + Math.random() * 1.8
    flute(IN_SCALE[idx], t, dur); t += dur * 0.85
  }
  if (Math.random() < 0.7) bird(c.currentTime + Math.random() * 4)
  if (Math.random() < 0.4) bird(c.currentTime + 4 + Math.random() * 4)
  return t - c.currentTime + 3 + Math.random() * 5
}

/** Soft felt-piano voice: a few sine partials, quick attack, long natural decay. */
function pianoNote(m: number, at: number, vel: number, dur = 3) {
  const c = ac(), f = midi(m), g = c.createGain(), lp = c.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 7), at); lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 1.5), at + dur)
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  ;[[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]].forEach(([mul, amp], i) => {
    const o = c.createOscillator(), og = c.createGain()
    o.frequency.value = f * mul * (i ? 1.0008 : 1); og.gain.value = amp
    o.connect(og).connect(g); o.start(at); o.stop(at + dur + 0.05)
  })
  g.connect(lp); lp.connect(ambBus!); const s = c.createGain(); s.gain.value = 0.7; lp.connect(s).connect(reverb)
}

// Warm progressions in F major (MIDI roots + chord tones); original, randomly varied each phrase
const PROGRESSIONS: number[][][] = [
  [[53, 57, 60], [52, 55, 60], [50, 53, 57], [46, 50, 53]],   // F  C/E  Dm  Bb
  [[46, 50, 53], [48, 52, 55], [45, 48, 52], [50, 53, 57]],   // Bb C  Am  Dm
  [[53, 57, 60], [45, 48, 52], [46, 50, 53], [48, 52, 55]],   // F  Am  Bb  C
]
const F_MAJOR = [65, 67, 69, 70, 72, 74, 76, 77, 79, 81] // melody range F4..A5
let prog = PROGRESSIONS[0], bar = 0, lastNote = 72

/** Piano: schedules one 4-beat bar (≈66 bpm): flowing left-hand arpeggio + a sparse singing melody. */
function pianoStep() {
  const c = ac(), beat = 0.9, barLen = beat * 4
  if (nextAt < c.currentTime + 0.05) nextAt = c.currentTime + 0.15
  if (bar % 8 === 0) prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)]
  const chord = prog[bar % 4], [r, t3, t5] = chord, at = nextAt
  // left hand: root – fifth – octave – tenth – octave – fifth (eighth notes)
  ;[r - 12, t5 - 12, r, t3 + 12 - 12, r, t5 - 12].forEach((m, i) => pianoNote(m, at + i * beat * 0.66, 0.055 - i * 0.003, 3.2))
  // right hand: 1–3 notes per bar, mostly chord tones, stepwise motion
  const tones = F_MAJOR.filter((m) => [r, t3, t5].some((x) => (m - x) % 12 === 0))
  const slots = bar % 4 === 3 ? [0] : Math.random() < 0.5 ? [0, 2] : [0, 1.5, 3]
  for (const sl of slots) {
    if (Math.random() < 0.15) continue
    const near = (sl === 0 ? tones : F_MAJOR).filter((m) => Math.abs(m - lastNote) <= 5)
    const pick = (near.length ? near : tones)[Math.floor(Math.random() * (near.length || tones.length))]
    lastNote = pick
    pianoNote(pick, at + sl * beat + (Math.random() * 0.03), 0.075, sl === 0 ? 3.6 : 2.4)
  }
  bar++; nextAt = at + barLen
  return Math.max(0.5, nextAt - c.currentTime - 0.6) // wake up just before the bar ends
}

/** Koto pluck: bright attack, quick decay, a tiny press-bend into pitch. */
function koto(m: number, at: number, vel = 0.07) {
  const c = ac(), f = midi(m), g = c.createGain(), lp = c.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 8, at); lp.frequency.exponentialRampToValueAtTime(f * 1.5, at + 1)
  ;(['triangle', 'sawtooth'] as OscillatorType[]).forEach((type, i) => {
    const o = c.createOscillator(), og = c.createGain(); o.type = type; og.gain.value = i ? 0.25 : 1
    o.frequency.setValueAtTime(f * 0.985, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.08)
    o.connect(og).connect(g); o.start(at); o.stop(at + 1.6)
  })
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.5)
  g.connect(lp); lp.connect(ambBus!); const s = c.createGain(); s.gain.value = 0.6; lp.connect(s).connect(reverb)
}
const HIRAJOSHI = [62, 64, 65, 69, 70, 74, 76, 77, 81, 82] // D E F A Bb
function kotoStep() {
  const c = ac(); let t = c.currentTime + 0.1, i = 2 + Math.floor(Math.random() * 5)
  const n = 3 + Math.floor(Math.random() * 5)
  for (let k = 0; k < n; k++) {
    i = Math.max(0, Math.min(HIRAJOSHI.length - 1, i + [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)]))
    koto(HIRAJOSHI[i], t)
    if (Math.random() < 0.2) { koto(HIRAJOSHI[i], t + 0.12, 0.04); koto(HIRAJOSHI[i], t + 0.24, 0.03) } // little tremolo
    t += [0.35, 0.5, 0.7, 1.0][Math.floor(Math.random() * 4)]
  }
  if (Math.random() < 0.5) koto(HIRAJOSHI[0] - 12, t + 0.2, 0.06) // low closing note
  return t - c.currentTime + 2 + Math.random() * 3
}

const STEP: Record<Track, () => number> = { garden: gardenStep, piano: pianoStep, koto: kotoStep }

/** Background bed: stream (garden), rain (koto) or nothing (piano). */
function startBed(c: AudioContext, track: Track) {
  if (track === 'piano') return
  stream = c.createBufferSource(); stream.buffer = noiseBuf(c); stream.loop = true
  const f = c.createBiquadFilter(), sg = c.createGain()
  if (track === 'garden') { f.type = 'lowpass'; f.frequency.value = 500; sg.gain.value = 0.035 }
  else { f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.4; sg.gain.value = 0.05 }
  const lfo = c.createOscillator(), la = c.createGain(); lfo.frequency.value = 0.07; la.gain.value = 0.015; lfo.connect(la).connect(sg.gain); lfo.start()
  stream.connect(f).connect(sg).connect(ambBus!); stream.start()
}

export function startAmbience() {
  if (ambienceTimer) return
  try {
    const c = ac(), track = prefs.track in STEP ? prefs.track : 'garden'
    ambBus = c.createGain(); ambBus.gain.setValueAtTime(0, c.currentTime); ambBus.gain.linearRampToValueAtTime(0.55, c.currentTime + 3); ambBus.connect(master)
    startBed(c, track)
    nextAt = 0; bar = 0
    // never let one bad note kill the loop: always schedule the next step
    const loop = () => {
      let wait = 6
      try { if (ambBus) wait = STEP[track]() } catch { /* skip */ }
      ambienceTimer = window.setTimeout(loop, Math.max(0.5, wait) * 1000)
    }
    ambienceTimer = window.setTimeout(loop, 400)
    startWatchdog()
  } catch { /* audio unavailable */ }
}

/** Every 4s: if music should be playing but the phone paused the audio engine, wake it back up. */
let watchdog: number | null = null
function startWatchdog() {
  if (watchdog) return
  watchdog = window.setInterval(() => {
    if (!prefs.ambience || document.hidden) return
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
    if (!ambienceTimer || !ambBus) { ambienceTimer = null; startAmbience() }
  }, 4000)
}

export function stopAmbience(keepWatchdog = false) {
  if (watchdog && !keepWatchdog) { clearInterval(watchdog); watchdog = null }
  if (ambienceTimer) { clearTimeout(ambienceTimer); ambienceTimer = null }
  if (ctx && ambBus) {
    const bus = ambBus, s = stream, now = ctx.currentTime
    bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(bus.gain.value, now); bus.gain.linearRampToValueAtTime(0, now + 1.2)
    setTimeout(() => { try { s?.stop(); bus.disconnect() } catch { /* ignore */ } }, 1400)
    ambBus = null; stream = null
  }
}
