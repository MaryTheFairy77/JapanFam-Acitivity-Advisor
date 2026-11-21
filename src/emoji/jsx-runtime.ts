/**
 * Our JSX runtime: React's, plus emoji → Fluent pictures in text children of normal HTML elements.
 * Skipped where pictures can't go or text must stay text: <option>, <textarea>, <title>, SVG <text>, code,
 * and anything marked data-no-emoji. Attributes (aria-label, title, placeholder) keep the real emoji.
 */
import * as R from 'react/jsx-runtime'
import { withEmoji } from './emoji'

export const Fragment = R.Fragment
export type { JSX } from 'react/jsx-runtime'

const SKIP = new Set(['option', 'optgroup', 'textarea', 'title', 'style', 'script', 'text', 'tspan', 'textPath', 'code', 'pre'])

function mapChild(c: unknown): unknown {
  if (typeof c === 'string') return withEmoji(c)
  if (Array.isArray(c)) {
    let changed = false
    const out = c.map((x) => { const y = mapChild(x); if (y !== x) changed = true; return y })
    return changed ? out : c
  }
  return c
}

export function fix(type: unknown, props: Record<string, unknown> | null) {
  if (typeof type !== 'string' || !props || props.children == null || SKIP.has(type) || props['data-no-emoji']) return props
  const children = mapChild(props.children)
  return children === props.children ? props : { ...props, children }
}

export function jsx(type: React.ElementType, props: Record<string, unknown>, key?: React.Key) {
  return R.jsx(type, fix(type, props) as never, key)
}
export function jsxs(type: React.ElementType, props: Record<string, unknown>, key?: React.Key) {
  // children that became a picture + text are nested arrays/fragments, which React accepts as static children
  return R.jsxs(type, fix(type, props) as never, key)
}
