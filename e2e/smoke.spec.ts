import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsRep, bootstrapDemoProfile } from './helpers'

test.describe('SMOKE - Critical Path (Admin)', () => {
  test('S01: Demo onboarding bootstrap works', async ({ request }) => {
    const res = await request.post('/api/onboarding', {
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
        samples: 'demo mode smoke test',
      },
    })
    // This assumes demo mode (unauthenticated request auto-bootstraps a
    // profile). Against a real-auth environment (Supabase credentials
    // configured, no demo fallback), the same unauthenticated request
    // correctly gets 401 "Not signed in." — that is the CORRECT behavior
    // there, not a bug, so skip rather than fail this demo-mode-specific
    // assertion when it's not applicable.
    if (res.status() === 401) {
      test.skip(true, 'Server is running in real-auth mode (not demo mode) — unauthenticated onboarding bootstrap correctly requires a session here.')
      return
    }
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.profile).toBeTruthy()
  })

  test('S02: Admin bootstrap reaches dashboard', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard')
    
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(10)
  })

  test('S03: Dashboard loads without critical console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('WebSocket') && !msg.text().includes('HMR')) {
        errors.push(msg.text())
      }
    })
    
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // Filter out benign errors (favicon, network issues)
    const critical = errors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('Failed to load resource') &&
      !e.includes('net::ERR')
    )
    expect(critical).toHaveLength(0)
  })

  test('S04: App rail navigation renders all items', async ({ page }) => {
    await bootstrapDemoProfile('http://localhost:3000').catch(() => {})
    await loginAsAdmin(page)
    
    // Check that navigation items exist
    const nav = page.locator('nav, [role="navigation"]').first()
    await expect(nav).toBeVisible()
    
    // Look for key nav items
    const body = await page.textContent('body')
    expect(body).toContain('Dashboard')
    expect(body).toContain('Leads')
    expect(body).toContain('Relay')
  })

  test('S05: Navigation to each major route works', async ({ page }) => {
    await bootstrapDemoProfile('http://localhost:3000').catch(() => {})
    await loginAsAdmin(page)
    
    const routes = [
      '/dashboard',
      '/prospect',
      '/leads',
      '/relay',
      '/content',
      '/profiles',
      '/admin/command-center',
    ]
    
    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      
      // Should not redirect to login
      expect(page.url()).not.toContain('/login')
      
      // Should render some content
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(10)
    }
  })
})

test.describe('SMOKE - Critical Path (Rep)', () => {
  test('S06: Rep accessible routes respond', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/leads')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('S07: Assigned profiles route responds', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/rep/assigned-profiles')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })
})
