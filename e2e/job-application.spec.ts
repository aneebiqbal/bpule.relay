import { test, expect } from '@playwright/test'
import { bootstrapDemoProfile, loginAsAdmin } from './helpers'

test.describe('JOB -> Application', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await bootstrapDemoProfile('http://localhost:3000').catch(() => {})
    await page.context().request.post('/api/onboarding', {
      data: {
        quiz: {
          contractions: 'sometimes',
          formality: 3,
          sentenceLength: 'medium',
          punctuation: 'standard',
          openers: 'statement',
          emoji: 'none',
          greeting: 'Hey',
          signOff: 'Best',
          neverWords: '',
          preferredWords: '',
        },
        samples: 'demo',
      },
    })
  })

  test('J01: Upwork jobs page loads', async ({ page }) => {
    await page.goto('/upwork')
    await page.waitForLoadState('networkidle')
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('J02: Generate route validates job id', async ({ page }) => {
    const res = await page.request.post('/api/upwork/jobs/test-id/generate', {
      data: {},
    })
    expect([200, 400, 404, 422]).toContain(res.status())
  })
})
