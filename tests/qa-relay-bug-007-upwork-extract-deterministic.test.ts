/**
 * BUG-007 — Upwork extraction contract (deterministic).
 *
 * The release contract must not depend on a live provider: a flaky network call
 * must never produce a fake red or a fake green release. This test mocks the
 * provider, so it runs identically in CI with no key.
 *
 * The live-provider smoke test lives beside the other `*.smoke.ts` checks, which
 * vitest does not collect (its include pattern is the `.test.ts` glob) and which
 * `pnpm qa:live-provider` runs separately as a non-gating environmental check.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai/runtime', () => ({
  generate: vi.fn(async () => ({
    data: {
      title: 'Job Title: Full-Stack Developer for AI-Powered Logistics SaaS',
      description: 'Build a logistics platform in React and Node.',
      skills: ['React', 'Node.js'],
      screeningQuestions: [],
      applicationRequirements: [],
      budget: null,
      budgetType: null,
      hourlyRateMin: null,
      hourlyRateMax: null,
      experienceLevel: 'Expert',
      connectsCost: null,
    },
  })),
}))

const RAW = [
  'Job Title: Full-Stack Developer for AI-Powered Logistics SaaS',
  'Fixed price: $60,000',
  'Build a logistics platform in React and Node. PostgreSQL on AWS.',
  'Must ship in 6 weeks.',
].join('\n')

describe('BUG-007 Upwork extraction (deterministic contract)', () => {
  it('returns a job when the mocked provider succeeds', async () => {
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: RAW })

    expect(result.error).toBeNull()
    expect(result.job).not.toBeNull()
  })

  it('strips the label from the job title (BUG-007 label parsing)', async () => {
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: RAW })

    // The label belongs to the source format, never to the value.
    expect(result.job?.title).toBe('Full-Stack Developer for AI-Powered Logistics SaaS')
    expect(result.job?.title).not.toMatch(/^Job Title/i)
  })

  it('reads the labeled job title even when the provider returns none', async () => {
    const { generate } = await import('@/lib/ai/runtime')
    vi.mocked(generate).mockResolvedValueOnce({
      data: { title: '', description: 'Build a logistics platform.', skills: [], screeningQuestions: [], applicationRequirements: [] },
    } as never)

    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: RAW })

    // `extractTitleFromRaw` now reads the labeled title through the canonical
    // normalization boundary, so the title is still the real one.
    expect(result.job?.title).toBe('Full-Stack Developer for AI-Powered Logistics SaaS')
  })

  it('fails closed on short input without calling the provider', async () => {
    const { generate } = await import('@/lib/ai/runtime')
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: 'too short' })

    expect(result.job).toBeNull()
    expect(result.error).toBe('INVALID_INPUT')
    expect(vi.mocked(generate)).not.toHaveBeenCalled()
  })
})
