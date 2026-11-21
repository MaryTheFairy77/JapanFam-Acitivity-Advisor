/**
 * 🪟 One emoji style on every phone (Maryam, 21 Nov 2026): Microsoft's Fluent "Color" emoji, the ones Windows uses.
 * Emoji characters in the UI are swapped for small pictures (public/emoji/*.webp, 96 px, made from microsoft/fluentui-emoji, MIT).
 * The swap happens in our JSX runtime (src/emoji/jsx-runtime.ts), so every screen gets it without changing components.
 * The picture keeps the emoji as its alt text, so copy/paste and screen readers still get the real emoji.
 */
import { createElement, Fragment, type ReactNode } from 'react'
import { AVAILABLE } from './available'

// one emoji: pictographic (+ optional VS16 / keycap / skin tone), joined by ZWJ; or a flag pair
const RE = /(?:\p{Extended_Pictographic}|[#*0-9]️?⃣)(?:️|[\u{1F3FB}-\u{1F3FF}])?(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?)*|[\u{1F1E6}-\u{1F1FF}]{2}/gu
const QUICK = /[\u{1F000}-\u{1FAFF}☀-➿⬀-⯿←-⇿⌀-⏿〰〽㊗㊙]/u

export const emojiKey = (e: string) => [...e].filter((c) => c !== '️').map((c) => c.codePointAt(0)!.toString(16)).join('_')
export const emojiSrc = (e: string) => { const k = emojiKey(e); return AVAILABLE.has(k) ? `/emoji/${k}.webp` : null }

/** Text with emoji → the same text with our emoji pictures in place (or the text unchanged if it has none we ship). */
export function withEmoji(text: string): ReactNode {
  if (!QUICK.test(text)) return text
  const parts: ReactNode[] = []
  let last = 0, i = 0, changed = false
  for (const m of text.matchAll(RE)) {
    const src = emojiSrc(m[0])
    if (!src) continue
    if (m.index! > last) parts.push(text.slice(last, m.index))
    parts.push(createElement('img', { key: `e${i++}`, src, alt: m[0], className: 'jf-emoji', draggable: false, decoding: 'async' }))
    last = m.index! + m[0].length
    changed = true
  }
  if (!changed) return text
  if (last < text.length) parts.push(text.slice(last))
  return createElement(Fragment, null, ...parts)
}

/** For plain DOM (map pins): put the emoji picture inside `el` (falls back to the character). */
export function setEmoji(el: HTMLElement, emoji: string) {
  const src = emojiSrc(emoji)
  if (!src) { el.textContent = emoji; return }
  el.textContent = ''
  const img = document.createElement('img')
  img.src = src; img.alt = emoji; img.className = 'jf-emoji'; img.draggable = false
  el.appendChild(img)
}
