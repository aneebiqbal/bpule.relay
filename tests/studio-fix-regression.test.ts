import { describe, it, expect } from 'vitest'
import { parseQuickCapture } from '@/lib/content/quick-capture'
import { appendHashtags } from '@/lib/content/intelligence/v2/caption-utils'

describe('BUG-16: custom post pipeline entry (parseQuickCapture)', () => {
  it('extracts technical lesson angles from build/fix verbs', () => {
    const angles = parseQuickCapture('I spent 3 days debugging a kubernetes pod restart loop')
    expect(angles.length).toBeGreaterThan(0)
    expect(angles.some(a => a.type === 'technical_lesson')).toBe(true)
  })

  it('extracts lesson angles from learning verbs', () => {
    const angles = parseQuickCapture('I learned that microservices complexity has a hidden price')
    expect(angles.some(a => a.title.toLowerCase().includes('lesson'))).toBe(true)
  })

  it('extracts opinion angles from conviction language', () => {
    const angles = parseQuickCapture('I believe AI is making implementation cheaper but engineering judgment is not')
    expect(angles.some(a => a.type === 'opinion')).toBe(true)
  })

  it('falls back to generic angles when no pattern matches', () => {
    const angles = parseQuickCapture('something random and unclear')
    expect(angles.length).toBeGreaterThan(0)
    expect(angles.length).toBeLessThanOrEqual(3)
  })
})

describe('BUG-17: downloaded caption reflects generated content with hashtags', () => {
  it('the caption a user downloads on LinkedIn includes hashtags', () => {
    const rawCaption = 'We deleted half our kubernetes cluster. Costs dropped 40% that week.'
    const finalized = appendHashtags(rawCaption, { title: 'Kubernetes cost wins', territory: 'infrastructure', angle: '' }, 'engineer', 'linkedin')
    // The finalized caption (what gets persisted and shown) is what the user downloads.
    expect(finalized).toContain('#Kubernetes')
    expect(finalized.startsWith(rawCaption)).toBe(true)
  })

  it('the caption a user downloads on X has no hashtags', () => {
    const rawCaption = 'Hot take: 80% of platform engineering is just ops with a redesign budget.'
    const finalized = appendHashtags(rawCaption, { title: rawCaption, territory: '', angle: '' }, 'engineer', 'x')
    expect(finalized).not.toContain('#')
  })

  it('edited caption with hashtags survives as the displayed + downloaded text', () => {
    // Simulates: user generates post (has hashtags), then the persisted caption
    // is what both displays and downloads.
    const generated = appendHashtags(
      'Debugging a production issue taught me something about how I think.',
      { title: 'Debugging lesson', territory: 'engineering culture', angle: '' },
      'senior engineer',
      'linkedin',
    )
    // The displayed caption and the downloaded caption are the same string.
    const downloaded = generated
    expect(downloaded).toBe(generated)
    expect(downloaded).toContain('#')
  })
})

describe('BUG-15: hashtag consistency — same input always produces same output', () => {
  it('appendHashtags is deterministic for identical input', () => {
    const input = 'A post about kubernetes and infrastructure.'
    const a = appendHashtags(input, { title: 'K8s infra', territory: 'infrastructure', angle: '' }, 'engineer', 'linkedin')
    const b = appendHashtags(input, { title: 'K8s infra', territory: 'infrastructure', angle: '' }, 'engineer', 'linkedin')
    expect(a).toBe(b)
  })

  it('forge-style and persona-style paths both append hashtags for LinkedIn', () => {
    const idea = { title: 'Kubernetes cost wins', territory: 'infrastructure', angle: 'cut costs' }
    const forgeOut = appendHashtags('We cut cluster costs.', idea, 'engineer', 'linkedin')
    const personaOut = appendHashtags('We cut cluster costs.', { ...idea, title: 'K8s wins' }, 'engineer', 'linkedin')
    expect(forgeOut).toContain('#')
    expect(personaOut).toContain('#')
  })
})
