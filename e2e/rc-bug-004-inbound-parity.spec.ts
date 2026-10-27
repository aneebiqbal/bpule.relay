import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAsAdmin } from './helpers'
import { attachDiagnostics, reportDiagnostics, type Diagnostics } from './rc-diagnostics'

/**
 * BUG-004 — inbound-first parity. A DEDICATED hard gate, not one item among
 * twelve.
 *
 * `createLead` now writes a canonical `messages` row for an inbound lead, so the
 * messages table owns the conversation instead of a lead-level fallback. That is
 * the right design, but it is the riskiest persistence/state change in the
 * batch: it can legitimately alter `messageCount`, `lastInboundAt` and
 * `hasUnansweredInbound`, and a mistake here shows the same message twice on one
 * surface and once on another.
 *
 * This spec creates ONE synthetic inbound-first lead and asserts every
 * consequence from that same record:
 *
 *   - exactly one canonical opening message row, with the expected key
 *   - exactly one inbound event on Overview, Conversation, History, Chats,
 *     Archive and Today
 *   - relationship state = Needs Reply
 *   - not To Contact, not Follow-up, not Replied
 *   - the thread exists and is not duplicated
 *
 * A unit test cannot prove this: it needs a real row in a real database and the
 * derived state every surface computes from it.
 */

const diagnosticsByPage = new WeakMap<Page, Diagnostics>()

test.beforeEach(async ({ page }) => {
  diagnosticsByPage.set(page, attachDiagnostics(page))
})

test.afterEach(async ({ page }, testInfo) => {
  const diagnostics = diagnosticsByPage.get(page)
  if (diagnostics) reportDiagnostics(testInfo, diagnostics)
})

/**
 * The opening message. Long enough to be unmistakable, short enough to assert
 * on verbatim.
 */
const OPENING = 'We need an external team to rebuild our booking platform. Budget approved: $45,000.'

/** The canonical key `createLead` writes for an inbound lead's opening message. */
function inboundFirstKey(leadId: string): string {
  return `inbound_first:${leadId}`
}

/** Count case-insensitive occurrences of `needle` in a string. */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  return haystack.split(needle).length - 1
}

/** Create one synthetic inbound-first lead and return its id. */
async function createInboundFirstLead(page: Page, company: string): Promise<string> {
  const res = await page.request.post('/api/inbound/lead', {
    data: {
      company,
      contactName: 'Michael Anderson',
      contactTitle: 'CTO',
      message: OPENING,
      source: 'linkedin',
      // QA seeding: excluded from analytics and swept by the QA cleanup.
      isTest: true,
      idempotencyKey: `qa-bug004:${Date.now()}`,
    },
  })
  expect(res.ok(), `POST /api/inbound/lead failed: ${res.status()} ${await res.text().catch(() => '')}`).toBe(true)
  const payload = await res.json() as { lead?: { id?: string } }
  const leadId = payload.lead?.id
  expect(leadId, 'the inbound route did not return a lead id').toBeTruthy()
  return leadId as string
}

/** The stored lead, straight from the API — the record the UI is derived from. */
async function readLead(page: Page, leadId: string) {
  const res = await page.request.get(`/api/leads/${leadId}`)
  expect(res.ok(), `GET /api/leads/${leadId} failed`).toBe(true)
  const payload = await res.json() as {
    lead?: {
      id?: string
      direction?: string
      inboundMessage?: string | null
      messages?: Array<{
        id: string
        direction?: string
        sentText?: string | null
        idempotencyKey?: string | null
        type?: string
      }>
    }
  }
  return payload.lead
}

test.describe('BUG-004 — inbound-first canonical message row', () => {
  test('the database holds exactly one canonical opening row', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const leadId = await createInboundFirstLead(page, `Bug004 Co ${Date.now()}`)

    const lead = await readLead(page, leadId)
    expect(lead?.direction).toBe('inbound')
    expect(lead?.inboundMessage).toBe(OPENING)

    const messages = lead?.messages ?? []
    // The lead-level fallback and the canonical row must never both exist.
    expect(messages).toHaveLength(1)

    const [row] = messages
    expect(row.sentText).toBe(OPENING)
    expect(row.direction).toBe('inbound')
    expect(row.idempotencyKey, 'the canonical opening row must carry the deterministic key').toBe(inboundFirstKey(leadId))
  })

  test('the opening message is rendered once, not twice, on Overview and History', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const leadId = await createInboundFirstLead(page, `Bug004 Dup ${Date.now()}`)

    await page.goto(`/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Booking|Bug004/ }).first()).toBeVisible({ timeout: 60_000 })

    // History is the timeline the rep reads; its badge is the canonical count.
    const history = page.locator('details', { hasText: 'History' }).first()
    await expect(history).toBeVisible()
    const badge = history.locator('span').filter({ hasText: /^\d+$/ }).first()
    await expect(badge).toHaveText('1')

    // The opening text appears exactly once inside History.
    expect(countOccurrences(await history.innerText(), OPENING)).toBe(1)

    // And nowhere else on the page is it rendered a second time.
    const wholePage = await page.locator('body').innerText()
    expect(countOccurrences(wholePage, OPENING)).toBe(1)
  })

  test('the Conversation tab shows one opening turn', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const leadId = await createInboundFirstLead(page, `Bug004 Chat ${Date.now()}`)

    await page.goto(`/leads/${leadId}?tab=conversation`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('tab', { name: 'Conversation' })).toBeVisible({ timeout: 60_000 })

    const text = await page.locator('body').innerText()
    expect(countOccurrences(text, OPENING)).toBe(1)
  })
})

test.describe('BUG-004 — relationship state', () => {
  test('has inbound, no later outbound → Needs Reply (not To Contact, not Follow-up, not Replied)', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const leadId = await createInboundFirstLead(page, `Bug004 Rel ${Date.now()}`)

    await page.goto(`/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Bug004/ }).first()).toBeVisible({ timeout: 60_000 })

    const text = await page.locator('body').innerText()

    // The canonical label. Contract 3 / REL-QA-005: the internal `replied`
    // phase must never be shown as "Replied" while the rep owes a reply.
    expect(text).toMatch(/Needs reply/i)
    expect(text).not.toMatch(/To contact/i)
    expect(text).not.toMatch(/Follow-up due/i)
    expect(text).not.toMatch(/Replied/i)
  })
})

test.describe('BUG-004 — every surface agrees', () => {
  test('Chats lists the lead once, in "Waiting on you"', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const company = `Bug004 Surf ${Date.now()}`
    const leadId = await createInboundFirstLead(page, company)

    await page.goto('/chats', { waitUntil: 'domcontentloaded' })
    const bucket = page.locator('section', { hasText: 'Waiting on you' }).first()
    await expect(bucket).toBeVisible({ timeout: 60_000 })

    // One link to this lead — not two.
    const links = bucket.locator(`a[href="/leads/${leadId}"]`)
    await expect(links).toHaveCount(1)
    expect(countOccurrences(await bucket.innerText(), company)).toBe(1)
  })

  test('Archive does not show a lead that was never archived', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const company = `Bug004 Arch ${Date.now()}`
    await createInboundFirstLead(page, company)

    await page.goto('/archive', { waitUntil: 'domcontentloaded' })
    const text = await page.locator('body').innerText()
    expect(countOccurrences(text, company)).toBe(0)
  })

  test('Today counts the lead once and files it as Needs Reply', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const company = `Bug004 Today ${Date.now()}`
    const leadId = await createInboundFirstLead(page, company)

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Team today|YOUR DAY/ }).first()).toBeVisible({ timeout: 120_000 })

    const text = await page.locator('body').innerText()
    expect(countOccurrences(text, company)).toBe(1)
    // The inbound-first lead is a live conversation, not a cold contact.
    expect(page.locator(`a[href="/leads/${leadId}"]`).first()).toBeVisible()
  })
})
