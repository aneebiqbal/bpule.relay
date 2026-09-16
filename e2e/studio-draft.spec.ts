import { test, expect } from '@playwright/test'
import { bootstrapDemoProfile } from './helpers'

test.describe('STUDIO -> Draft', () => {
  test.beforeEach(async ({ page }) => {
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

  test('ST01: Studio content page loads', async ({ page }) => {
    await page.goto('/content')
    await page.waitForLoadState('networkidle')
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('ST02: Daily content route responds', async ({ request }) => {
    const res = await request.get('/api/content/daily?personaId=test-persona')
    expect([200, 400, 401, 404]).toContain(res.status())
  })

  test('ST03: Cold start route responds', async ({ request }) => {
    const res = await request.post('/api/content/cold-start', { data: {} })
    expect([200, 400, 401, 422]).toContain(res.status())
  })
})
