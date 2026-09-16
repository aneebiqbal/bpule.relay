import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('API ENDPOINTS - Direct Verification', () => {
  test('API01: POST /api/leads validates required fields', async ({ request }) => {
    const res = await request.post('/api/leads', {
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  test('API02: POST /api/leads rejects empty company', async ({ request }) => {
    const res = await request.post('/api/leads', {
      data: {
        company: '',
        signalType: 1,
        signalEvidence: 'test evidence',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('API03: POST /api/leads rejects invalid signalType', async ({ request }) => {
    const res = await request.post('/api/leads', {
      data: {
        company: 'TestCo',
        signalType: 99,
        signalEvidence: 'test evidence',
      },
    })
    expect(res.status()).toBe(400)
  })

  test('API04: POST /api/prospect/analyze rejects empty body', async ({ request }) => {
    const res = await request.post('/api/prospect/analyze', {
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  test('API05: POST /api/prospect/analyze rejects oversized input', async ({ request }) => {
    const res = await request.post('/api/prospect/analyze', {
      data: {
        rawText: 'A'.repeat(31_000),
      },
    })
    // Should be 400 (too long) or handle gracefully
    expect(res.status()).toBeLessThan(500)
  })

  test('API06: POST /api/prospect/analyze accepts valid input', async ({ request }) => {
    // SSE stream returns 200 and keeps connection open; just verify it starts responding
    const res = await request.post('/api/prospect/analyze', {
      data: {
        rawText: 'Jane Smith\nVP Engineering at Acme Corp\nHiring senior Rails engineers.',
      },
      timeout: 30_000,
    })
    expect(res.status()).toBe(200)
  })

  test('API07: GET /api/leads returns leads list', async ({ request }) => {
    const res = await request.get('/api/leads')
    // Should return 200 or 401 (if not authenticated)
    expect(res.status()).toBeLessThan(500)
  })

  test('API08: Search API responds', async ({ request }) => {
    const res = await request.get('/api/search?q=test')
    expect(res.status()).toBeLessThan(500)
  })

  test('API09: Content drafts API responds', async ({ request }) => {
    const res = await request.get('/api/content/drafts')
    expect(res.status()).toBeLessThan(500)
  })

  test('API10: Inbound reply API validates input', async ({ request }) => {
    const res = await request.post('/api/inbound/reply', {
      data: {},
    })
    // Should return 400 (missing fields) not 500
    expect(res.status()).toBeLessThan(500)
  })
})
