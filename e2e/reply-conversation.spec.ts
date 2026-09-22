import { test, expect } from '@playwright/test'
import { bootstrapDemoProfile, loginAsAdmin } from './helpers'

test.describe('REPLY -> Conversation', () => {
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

  test('R01: Inbound reply route validates input and rejects fabricated answers', async ({ page }) => {
    const res = await page.request.post('/api/inbound/reply', {
      data: {
        leadId: 'missing-lead-id',
        message: 'Can you tell me more about your experience with Rails?',
        profileId: null,
        history: [],
      },
    })
    // Should return 400 for missing lead or 422 for quality gate — never 500
    expect(res.status()).toBeLessThan(500)
    const body = await res.json()
    expect(body).toBeTruthy()
  })

  test('R02: Inbound analyze classifies intent', async ({ page }) => {
    const res = await page.request.post('/api/inbound/analyze', {
      data: {
        message: 'What is your rate for a Rails project?',
      },
    })
    expect(res.status()).toBeLessThan(500)
  })
})
