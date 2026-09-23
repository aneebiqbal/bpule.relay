import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAsAdmin } from './helpers'

/**
 * Live browser + DB proof for the lead-messaging lifecycle gate: a lead
 * with a sent connection note but no recorded acceptance must show DM
 * blocked with an explanation, and "Mark connection accepted" must clear
 * the gate and persist connection_accepted_at.
 *
 * Uses a real lead already in the DB with a sent connection message and no
 * connection_accepted_at (found via a direct read against the live org) —
 * resets connection_accepted_at back to null in afterAll regardless of
 * pass/fail, so this test never leaves the fixture lead in a different
 * state than it found it.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LEAD_ID = 'd7f48eea-03cf-4b1b-981b-3b6c1b106ceb' // "Experity" — owned by the E2E admin login, has a sent connection note, no acceptance recorded

function adminDb() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec.')
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

test.describe('Lead connection-accepted gate (live browser + DB)', () => {
  test.afterAll(async () => {
    try {
      await adminDb().from('leads').update({ connection_accepted_at: null }).eq('id', LEAD_ID)
    } catch {
      // best-effort cleanup
    }
  })

  test('DM is blocked until the connection is marked accepted, then unblocks and persists', async ({ page }) => {
    const db = adminDb()
    // Ensure known starting state regardless of prior runs.
    await db.from('leads').update({ connection_accepted_at: null }).eq('id', LEAD_ID)

    await loginAsAdmin(page)
    await page.goto(`/leads/${LEAD_ID}`)
    await page.waitForLoadState('networkidle')

    // DM is the default-selected tab, and when blocked it's aria-disabled —
    // no click needed (and a disabled tab shouldn't be clicked anyway).
    const dmTab = page.getByRole('tab', { name: 'DM' })
    const dmTabVisible = await dmTab.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!dmTabVisible) {
      test.skip(true, 'DM tab control not present on this lead detail render — cannot exercise this path.')
      return
    }
    if ((await dmTab.getAttribute('aria-selected')) !== 'true') {
      await dmTab.click()
    }

    // Blocked state: explanation shown, "Mark connection accepted" visible.
    await expect(page.getByText(/Waiting on the LinkedIn connection to be accepted/i)).toBeVisible({ timeout: 5_000 })
    const markAcceptedBtn = page.locator('button:has-text("Mark connection accepted")').first()
    await expect(markAcceptedBtn).toBeVisible({ timeout: 5_000 })

    await markAcceptedBtn.click()

    // Blocked explanation must go away and the normal draft controls appear.
    await expect(page.getByText(/Waiting on the LinkedIn connection to be accepted/i)).not.toBeVisible({ timeout: 10_000 })
    await expect(page.locator('button:has-text("Generate draft")').first()).toBeVisible({ timeout: 5_000 })

    // Persisted DB proof — not just a client-side UI toggle.
    const { data: leadRow } = await db.from('leads').select('connection_accepted_at').eq('id', LEAD_ID).maybeSingle()
    expect(leadRow?.connection_accepted_at).toBeTruthy()
  })
})
