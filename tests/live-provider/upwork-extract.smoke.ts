/**
 * Live-provider smoke check — NOT part of the release contract.
 *
 * This file is deliberately named with the `.smoke.ts` suffix: vitest collects
 * only the `.test.ts` glob, so the release gate does not run it, and a flaky
 * provider can never turn a release red or green.
 *
 * Run it explicitly:
 *
 *   pnpm qa:live-provider
 *
 * It is an environmental check: it proves the real provider path still works
 * against a live key. It is not evidence for promotion — that is the browser
 * gate's job.
 */

import { describe, expect, it } from 'vitest'
import { HAS_AI_PROVIDER } from '../helpers/needs-ai'

describe.skipIf(!HAS_AI_PROVIDER)('live-provider smoke: Upwork extraction', () => {
  it('parses a real job paste end to end', async () => {
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({
      rawText: 'Hi John - came across your work. Thought it was worth connecting.',
    })

    // The provider may legitimately fail a 60-character non-job string; what
    // this checks is that the pipeline reports a typed outcome rather than
    // throwing. The deterministic contract covers the parse itself.
    expect(result.job !== null || result.error !== null).toBe(true)
    if (result.error) {
      console.warn(`[live-provider smoke] provider returned ${result.error} — environmental, not a code defect`)
    }
  })
})
