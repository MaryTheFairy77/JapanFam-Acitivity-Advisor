import { describe, expect, it } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { emojiKey, emojiSrc, withEmoji } from '../emoji/emoji'
import { fix } from '../emoji/jsx-runtime'

describe('Fluent emoji pictures', () => {
  it('turns emoji into keys without FE0F', () => {
    expect(emojiKey('🍜')).toBe('1f35c')
    expect(emojiKey('⛩️')).toBe('26e9')
    expect(emojiSrc('🍜')).toBe('/emoji/1f35c.webp')
  })
  it('leaves plain text alone', () => {
    expect(withEmoji('Halal ramen, Asakusa')).toBe('Halal ramen, Asakusa')
  })
  it('swaps emoji for pictures and keeps the text around them', () => {
    const out = withEmoji('🍜 Food') as ReactElement<{ children: unknown[] }>
    expect(isValidElement(out)).toBe(true)
    const kids = out.props.children as unknown[]
    expect(kids.length).toBe(2)
    expect((kids[0] as ReactElement<{ src: string; alt: string }>).props.src).toBe('/emoji/1f35c.webp')
    expect((kids[0] as ReactElement<{ alt: string }>).props.alt).toBe('🍜')
    expect(kids[1]).toBe(' Food')
  })
  it('skips <option> and data-no-emoji, and never touches attributes', () => {
    const p = { children: '👍 Most votes' }
    expect(fix('option', p)).toBe(p)
    expect(fix('span', { children: '👍', 'data-no-emoji': true })).toEqual({ children: '👍', 'data-no-emoji': true })
    const b = fix('button', { 'aria-label': '👍 vote', children: 'Vote 👍' }) as Record<string, unknown>
    expect(b['aria-label']).toBe('👍 vote')
    expect(isValidElement(b.children)).toBe(true)
  })
})
