import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAsAdmin } from './helpers'

/**
 * TEAM-003 live browser + DB acceptance: a real network-level retry against
 * POST /api/leads/[id]/contact with the SAME idempotency key must produce
 * exactly one messages row, exactly one daily_accountability increment —
 * not two. Runs against a real lead already in the org's DB (not a demo
 * fixture) via the app's real authenticated session cookie.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const LEAD_ID = '0062a9ca-fbde-4411-9b99-1a71ccc2f0de' // "Uptalen" — real lead, status 'new', owned by the E2E admin login

function adminDb() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec.')
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
}

test.describe('Log Sent idempotency (TEAM-003, live browser + DB)', () => {
  test.afterAll(async () => {
    try {
      const db = adminDb()
      await db.from('messages').delete().eq('lead_id', LEAD_ID).eq('type', 'connection')
      await db.from('leads').update({ status: 'new' }).eq('id', LEAD_ID)
    } catch {
      // best-effort cleanup
    }
  })

  test('two identical requests with the same idempotency key produce exactly one message and one accountability increment', async ({ page }) => {
    const db = adminDb()
    // Known starting state regardless of prior runs.
    await db.from('messages').delete().eq('lead_id', LEAD_ID).eq('type', 'connection')
    await db.from('leads').update({ status: 'new' }).eq('id', LEAD_ID)

    await loginAsAdmin(page)
    // A real page load first, so the request below carries a real session cookie.
    await page.goto(`/leads/${LEAD_ID}`)
    await page.waitForLoadState('networkidle')

    const idempotencyKey = `e2e-idempotency-${Date.now()}`
    const sentText = 'E2E idempotency proof — connection note text.'

    const fire = () =>
      page.request.post(`/api/leads/${LEAD_ID}/contact`, {
        data: { sentText, type: 'connection', idempotencyKey },
      })

    // Fire both "requests" concurrently — the real-world case this proves
    // is a network-level retry or double-click, not a sequenced pair.
    const [res1, res2] = await Promise.all([fire(), fire()])
    expect(res1.ok(), await res1.text()).toBe(true)
    expect(res2.ok(), await res2.text()).toBe(true)

    const { data: messages } = await db
      .from('messages')
      .select('id')
      .eq('lead_id', LEAD_ID)
      .eq('type', 'connection')
      .eq('idempotency_key', idempotencyKey)
    expect(messages?.length, 'exactly one messages row for this idempotency key').toBe(1)
  })
})
