import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { bootstrapDemoProfile, loginAsAdmin } from './helpers'

function uniqueCompany(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function prospectText(company: string): string {
  return `${company}
Mina Rahman
VP of Engineering at ${company}
Remote, Worldwide

Building a distributed analytics platform with realtime ingestion and strict reliability requirements.
Recent note: "Our team needs external senior backend help to ship migration work and unblock the hiring pipeline."
Hiring signal: actively recruiting senior backend engineers for platform and API reliability work.
Tech stack: TypeScript, Node.js, PostgreSQL, Kafka`
}

async function ensureAuthenticatedSession(page: Page): Promise<void> {
  await bootstrapDemoProfile('http://localhost:3000').catch(() => {})
  try {
    await loginAsAdmin(page)
  } catch (error) {
    const appShellVisible = await page.locator('a[href="/dashboard"]').first().isVisible({ timeout: 2_000 }).catch(() => false)
    if (!appShellVisible) throw error
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
  }
}

async function analyzeProspect(page: Page, profileText: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto('/prospect', { waitUntil: 'domcontentloaded' })
      break
    } catch (error) {
      if (attempt === 1) throw error
    }
  }

  const textarea = page.locator('textarea[placeholder*="LinkedIn profile" i], textarea[placeholder*="Paste" i]').first()
  await expect(textarea).toBeVisible({ timeout: 20_000 })
  await textarea.fill(profileText)

  const analyzeBtn = page.getByRole('button', { name: /Analyze/i })
  await expect(analyzeBtn).toBeVisible()
  await analyzeBtn.click()
}

async function createLeadFromProspect(page: Page, profileText: string): Promise<string> {
  await analyzeProspect(page, profileText)

  const analyzingBtn = page.getByRole('button', { name: /Checking for existing intelligence/i })
  await expect(analyzingBtn).toBeHidden({ timeout: 60_000 }).catch(() => {})

  const createLeadBtn = page.getByRole('button', { name: /Create lead|Save as Lead|Save lead/i }).first()
  await expect(createLeadBtn).toBeEnabled({ timeout: 60_000 })
  await createLeadBtn.click()

  await page.waitForURL(/\/leads\/[a-f0-9-]+/, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  const leadId = page.url().split('/leads/')[1]?.split(/[?#]/)[0]
  expect(leadId).toBeTruthy()
  return leadId as string
}

async function addTimelineMessage(page: Page, leadId: string, text: string, type: 'dm' | 'reply' = 'reply'): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceRole) {
    const res = await fetch(`${supabaseUrl}/rest/v1/messages`, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        lead_id: leadId,
        type,
        sent_text: text,
        sent_at: new Date().toISOString(),
      }),
    })
    expect(res.ok).toBe(true)
    return
  }

  const contactRes = await page.request.post(`/api/leads/${leadId}/contact`, {
    data: { sentText: text, type },
  })
  expect(contactRes.ok()).toBe(true)
}

async function createLeadViaApi(page: Page, company: string): Promise<string> {
  const res = await page.request.post('/api/leads', {
    data: {
      company,
      contactName: 'Timeline Owner',
      contactTitle: 'Engineering Lead',
      titleRaw: `Engineering Lead at ${company}`,
      locationRaw: 'Remote',
      signalType: 6,
      signalEvidence: 'Actively hiring backend engineers and requesting migration support.',
      rawInput: `${company} is hiring backend engineers and asked for help modernizing their API platform.`,
      tags: ['backend', 'migration', 'api'],
      allowPotentialDuplicate: true,
    },
  })
  expect(res.ok()).toBe(true)
  const payload = await res.json()
  const leadId = payload.lead?.id as string | undefined
  expect(leadId).toBeTruthy()
  return leadId as string
}

test.beforeEach(async ({ page }) => {
  await ensureAuthenticatedSession(page)
})

test.describe('PRODUCT TEST A: Full outbound revenue workflow', () => {
  test('A1: Prospect Check -> Analyze -> Save Lead -> Lead appears in list', async ({ page }) => {
    const company = uniqueCompany('P0-A1-Co')
    const leadId = await createLeadFromProspect(page, prospectText(company))

    const detailRes = await page.request.get(`/api/leads/${leadId}`)
    expect(detailRes.ok()).toBe(true)
    const detailPayload = await detailRes.json()
    expect(detailPayload?.lead?.company).toBe(company)

    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    await expect(page.locator(`a[href="/leads/${leadId}"]`).first()).toBeVisible({ timeout: 30_000 })
  })

  test('A2: Save Lead persists and survives hard refresh', async ({ page }) => {
    const company = uniqueCompany('P0-A2-Co')
    const leadId = await createLeadViaApi(page, company)

    await page.goto(`/leads/${leadId}`)
    await page.waitForLoadState('networkidle')

    await page.reload({ waitUntil: 'networkidle' })
    expect(page.url()).toContain(`/leads/${leadId}`)
    const body = await page.textContent('body')
    expect(body).toContain(company)
  })

  test('A3: Save Lead double-click does not create duplicates', async ({ page }) => {
    const company = uniqueCompany('P0-A3-Co')
    await analyzeProspect(page, prospectText(company))

    const createLeadBtn = page.getByRole('button', { name: /Create lead|Save as Lead|Save lead/i }).first()
    await expect(createLeadBtn).toBeEnabled({ timeout: 60_000 })
    await createLeadBtn.click()
    await createLeadBtn.click({ timeout: 1_000 }).catch(() => {})
    await createLeadBtn.click({ timeout: 1_000 }).catch(() => {})

    await page.waitForURL(/\/leads\/[a-f0-9-]+/, { timeout: 20_000 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && serviceRole) {
      const db = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data, error } = await db.from('leads').select('id').eq('company', company)
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
      expect(data ?? []).toHaveLength(1)
      return
    }

    const leadsRes = await page.request.get('/api/leads')
    expect(leadsRes.ok()).toBe(true)
    const leadsData = await leadsRes.json()
    const leads = Array.isArray(leadsData?.leads) ? leadsData.leads : []
    const sameCompany = leads.filter((lead: { company?: string }) => lead.company === company)
    expect(sameCompany).toHaveLength(1)
  })
})

test.describe('PRODUCT TEST A: Reply workflow', () => {
  test('A4: Reply button activates after client response recorded', async ({ page }) => {
    const company = uniqueCompany('P0-A4-Co')
    const leadId = await createLeadFromProspect(page, prospectText(company))

    await addTimelineMessage(page, leadId, 'Thanks for reaching out. Can you share a practical approach and timing?', 'reply')

    await page.reload({ waitUntil: 'networkidle' })

    const replyTab = page.getByRole('tab', { name: /^Reply$/ })
    await expect(replyTab).toBeVisible()
    expect(await replyTab.getAttribute('aria-disabled')).not.toBe('true')

    await replyTab.click()
    await expect(page.locator('#reply-text')).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('PRODUCT TEST B: Inbound-first workflow', () => {
  test('B1: Inbound client message -> Lead -> Reply immediately', async ({ page }) => {
    await page.goto('/inbound')
    await page.waitForLoadState('networkidle')

    const clientMessage = 'Hi Hassan, we need hands-on Rails marketplace modernization and API reliability support. Are you available this quarter?'
    await page.locator('textarea[placeholder*="incoming message" i], textarea[placeholder*="client" i]').first().fill(clientMessage)
    await page.locator('input[placeholder*="company" i]').first().fill(uniqueCompany('Inbound-Co'))

    await page.getByRole('button', { name: /Analyze/i }).click()
    const saveBtn = page.getByRole('button', { name: /Save as Lead/i })
    await expect(saveBtn).toBeVisible({ timeout: 20_000 })
    await saveBtn.click()

    await expect(page.locator('text=Lead saved')).toBeVisible({ timeout: 20_000 })

    const openLeadBtn = page.getByRole('link', { name: /Open Lead & Reply/i })
    await expect(openLeadBtn).toBeVisible({ timeout: 20_000 })
    await openLeadBtn.click()
    await page.waitForURL(/\/leads\/[a-f0-9-]+/, { timeout: 20_000 })

    const replyTab = page.getByRole('tab', { name: /^Reply$/ })
    await expect(replyTab).toBeVisible()
    expect(await replyTab.getAttribute('aria-disabled')).not.toBe('true')
  })
})

test.describe('PRODUCT TEST C: Timeline date grouping', () => {
  test('C1: Timeline shows date grouping labels', async ({ page }) => {
    const company = uniqueCompany('P0-C1-Co')
    const leadId = await createLeadViaApi(page, company)

    await page.goto(`/leads/${leadId}`)
    await page.waitForLoadState('networkidle')

    await addTimelineMessage(page, leadId, `Client reply for ${company} confirming migration urgency and timeline.`, 'reply')

    await page.reload({ waitUntil: 'networkidle' })

    const leadRes = await page.request.get(`/api/leads/${leadId}`)
    expect(leadRes.ok()).toBe(true)
    const leadPayload = await leadRes.json()
    const hasLoggedMessage = Array.isArray(leadPayload?.lead?.messages)
      && leadPayload.lead.messages.some((message: { sentText?: string }) => Boolean(message.sentText))
    expect(hasLoggedMessage).toBe(true)

    const timelineSection = page.getByRole('heading', { name: 'Timeline' }).locator('..')
    await expect(timelineSection.getByText('Today').first()).toBeVisible({ timeout: 10_000 })

    await page.reload({ waitUntil: 'networkidle' })
    await expect(timelineSection.getByText('Today').first()).toBeVisible({ timeout: 10_000 })
  })
})
