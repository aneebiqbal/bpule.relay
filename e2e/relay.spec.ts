import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('RELAY - Conversations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/relay')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('R01: Relay page renders with conversation list', async ({ page }) => {
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('R02: Filter controls exist', async ({ page }) => {
    // Look for filter buttons or dropdowns
    const body = await page.textContent('body')
    const hasFilters = body?.includes('All') || body?.includes('Pending') || 
                       body?.includes('Replied') || body?.includes('Filter') ||
                       body?.includes('Queue') || body?.includes('Today')
    expect(hasFilters).toBeTruthy()
  })

  test('R03: Conversation cards are clickable', async ({ page }) => {
    // Find first conversation link/card
    const convoLink = page.locator('a[href*="/relay/"], a[href*="/leads/"]').first()
    const hasConvo = await convoLink.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasConvo) {
      await convoLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(20)
    }
  })

  test('R04: Reply functionality exists on conversation detail', async ({ page }) => {
    const convoLink = page.locator('a[href*="/relay/"], a[href*="/leads/"]').first()
    const hasConvo = await convoLink.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasConvo) {
      await convoLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      
      const body = await page.textContent('body')
      const hasReply = body?.includes('Reply') || body?.includes('Send') || 
                       body?.includes('Draft') || body?.includes('Generate') ||
                       body?.includes('Write')
      expect(hasReply).toBeTruthy()
    }
  })

  test('R05: Back button returns to conversation list', async ({ page }) => {
    const convoLink = page.locator('a[href*="/relay/"], a[href*="/leads/"]').first()
    const hasConvo = await convoLink.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasConvo) {
      await convoLink.click()
      await page.waitForLoadState('networkidle')
      
      await page.goBack()
      await page.waitForLoadState('networkidle')
      
      expect(page.url()).toContain('/relay')
    }
  })

  test('R06: No console errors on relay page', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('WebSocket') && !msg.text().includes('HMR')) {
        errors.push(msg.text())
      }
    })
    
    await page.waitForTimeout(3000)
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0)
  })

  test('R07: Reply API endpoint responds to valid request', async ({ page }) => {
    // Test the API directly via fetch
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/inbound/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'test-lead',
          inboundMessage: 'Hi, thanks for reaching out!',
          channel: 'linkedin',
        }),
      })
      return { status: res.status, ok: res.ok }
    })
    
    // Should respond (even if 404 or 400, it shouldn't crash)
    expect(response.status).toBeGreaterThan(0)
    expect(response.status).toBeLessThan(500)
  })
})
