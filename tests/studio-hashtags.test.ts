import { describe, it, expect } from 'vitest'
import { generateHashtags, appendHashtags } from '@/lib/content/intelligence/v2/caption-utils'

describe('Studio hashtag generation', () => {
  it('returns topic-based PascalCase tags for LinkedIn content', () => {
    const tags = generateHashtags(
      'We migrated our kubernetes cluster and cut deploy time significantly.',
      { title: 'Kubernetes migration lessons', territory: 'infrastructure', angle: 'deploy faster' },
      'platform engineer',
    )
    expect(tags.length).toBeGreaterThan(0)
    expect(tags).toContain('Kubernetes')
    expect(tags.length).toBeLessThanOrEqual(3)
  })

  it('never returns generic tags like Success or Business', () => {
    const tags = generateHashtags(
      'A generic post about working hard and staying focused on business outcomes.',
      { title: 'Generic motivation', territory: '', angle: '' },
      'professional',
    )
    expect(tags).not.toContain('Success')
    expect(tags).not.toContain('Business')
  })

  it('appends hashtags beneath the caption for LinkedIn', () => {
    const caption = 'We deleted half our cluster. Costs dropped 40%.'
    const result = appendHashtags(caption, { title: 'Kubernetes cost', territory: 'infrastructure', angle: '' }, 'engineer', 'linkedin')
    expect(result).toContain('#')
    expect(result).toContain('#Kubernetes')
    expect(result.startsWith(caption)).toBe(true)
  })

  it('does not append hashtags for X', () => {
    const caption = 'Short post about kubernetes.'
    const result = appendHashtags(caption, { title: 'Kubernetes', territory: '', angle: '' }, 'engineer', 'x')
    expect(result).toBe(caption)
    expect(result).not.toContain('#')
  })

  it('does not duplicate hashtags already present in the caption', () => {
    const result = appendHashtags(
      'We use kubernetes for our platform. #Kubernetes',
      { title: 'Kubernetes platform', territory: 'infrastructure', angle: '' },
      'engineer',
      'linkedin',
    )
    const matches = result.match(/#Kubernetes/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('returns the caption unchanged when no topics match and no long words exist', () => {
    const caption = 'A b c d e.'
    const result = appendHashtags(caption, { title: '', territory: '', angle: '' }, '', 'linkedin')
    expect(result.trim()).toBe(caption.trim())
  })
})
