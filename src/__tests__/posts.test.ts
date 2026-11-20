import { describe, expect, it } from 'vitest'
import { findDuplicate, firstUrl, isMapsLinkText, isSocialLink, isTikTokLink, normName, postDescription, postLink } from '../lib'
import { place } from './fixtures'

describe('links in pasted text (Phase 1: TikTok)', () => {
  it('pulls the link out of a shared message', () => {
    expect(firstUrl('Check this out! https://vm.tiktok.com/ZMabc123/ so good 😋')).toBe('https://vm.tiktok.com/ZMabc123/')
    expect(firstUrl('(https://www.instagram.com/reel/ABCdef123/).')).toBe('https://www.instagram.com/reel/ABCdef123/')
    expect(firstUrl('Ramen Ouka, Shinjuku')).toBeNull()
  })
  it('knows TikTok links, long and short', () => {
    for (const u of ['https://www.tiktok.com/@navito_halal/video/7539764236134665489', 'https://vm.tiktok.com/ZMabc/', 'https://vt.tiktok.com/ZSx/', 'https://m.tiktok.com/v/123.html', 'https://www.tiktok.com/t/ZT8abc/'])
      expect(isTikTokLink(u)).toBe(true)
    expect(isTikTokLink('https://tiktok.com.evil.example/x')).toBe(false)
    expect(isSocialLink('https://www.instagram.com/p/ABCdef123/')).toBe(true)
    expect(isSocialLink('https://maps.app.goo.gl/abc')).toBe(false)
    expect(isMapsLinkText('https://maps.app.goo.gl/abc')).toBe(true)
  })
  it('labels AI text with the platform and creator', () => {
    expect(postDescription('tiktok', '@navito_halal', 'Halal wagyu in Asakusa')).toBe('✨ From TikTok (@navito_halal): Halal wagyu in Asakusa')
    expect(postDescription('instagram', null, 'Cosy café')).toBe('✨ From Instagram: Cosy café')
    expect(postDescription('tiktok', '@x', null)).toBeNull()
  })
  it('finds the post link for the Watch button', () => {
    expect(postLink({ auto_sources: 'https://www.openstreetmap.org/x https://www.tiktok.com/@a/video/123456789' }))
      .toEqual({ href: 'https://www.tiktok.com/@a/video/123456789', platform: 'tiktok' })
    expect(postLink({ auto_sources: 'https://www.instagram.com/p/ABCdef123/' })?.platform).toBe('instagram')
    expect(postLink({ auto_sources: null })).toBeNull()
  })
})

describe('already added?', () => {
  const panga = place({ id: 'p1', name: 'Halal Yakiniku PANGA (A5 Wagyu)', lat: 35.6595, lng: 139.7005 })
  const round1 = place({ id: 'r1', name: 'ROUND1 (Tokyo)', lat: 35.70, lng: 139.77, branches: [{ lat: 35.62, lng: 139.78, area: 'Odaiba' }] })
  const fromTikTok = place({ id: 't1', name: 'Tokitarazu', auto_sources: 'https://www.tiktok.com/@halalfoodinjapan/video/7367326299368590610' })
  const all = [panga, round1, fromTikTok]

  it('ignores brackets, case and filler words', () => {
    expect(normName('Halal Yakiniku PANGA (A5 Wagyu)')).toBe('yakinikupanga')
    expect(normName('ROUND1 (Kita Ward)')).toBe('round1')
  })
  it('same post pasted again', () => {
    expect(findDuplicate(all, { name: 'Something else', source: 'https://www.tiktok.com/@halalfoodinjapan/video/7367326299368590610?lang=en' })?.id).toBe('t1')
  })
  it('same name, close by or no pin', () => {
    expect(findDuplicate(all, { name: 'Halal Wagyu Yakiniku Panga' })?.id).toBe('p1') // no pin: name alone
    expect(findDuplicate(all, { name: 'Yakiniku Panga', lat: 35.66, lng: 139.70 })?.id).toBe('p1')
    expect(findDuplicate(all, { name: 'Round1', lat: 35.621, lng: 139.781 })?.id).toBe('r1') // near a branch
  })
  it('same name far away is a different place', () => {
    expect(findDuplicate(all, { name: 'Yakiniku Panga', lat: 34.67, lng: 135.50 })).toBeNull() // Osaka
  })
  it('short or unrelated names never match', () => {
    expect(findDuplicate(all, { name: 'Ramen' })).toBeNull()
    expect(findDuplicate(all, { name: 'Tendon Itsuki' })).toBeNull()
    expect(findDuplicate([place({ id: 'x', name: 'Halal Wagyu Ramen Shinjuku-tei (Shibuya)' })], { name: 'Ramen Shop' })).toBeNull()
    expect(findDuplicate([place({ id: 's', name: 'Star Wars Store', lat: 35.7308, lng: 139.7124 })], { name: 'Star Case', lat: 35.7053, lng: 139.6499 })).toBeNull()
  })
})
