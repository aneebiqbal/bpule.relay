import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { bootstrapDemoProfile, loginAsAdmin } from './helpers'

function uniqueLabel(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
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
  const data = await res.json()
  const leadId = data.lead?.id as string | undefined
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

test.beforeEach(async ({ page }) => {
  await ensureAuthenticatedSession(page)
})

test.describe('PRODUCT TEST C: Job orchestration', () => {
  test('C1: Upwork job -> generate CV -> CV persisted with jobId', async ({ page }) => {
    const company = uniqueLabel('JobCo')

    await page.goto('/upwork/new')
    await page.waitForLoadState('networkidle')

    const jobPost = `Senior Rails Developer needed for ${company}.\nMust have: Rails, PostgreSQL, API design, payments.\nRemote worldwide contract.`
    const rawInput = page.locator('textarea[placeholder*="full Upwork job post" i]').first()
    await expect(rawInput).toBeVisible({ timeout: 10_000 })
    await rawInput.fill(jobPost)

    await page.getByRole('button', { name: 'Extract', exact: true }).click()
    await expect(page.locator('#title')).toBeVisible({ timeout: 20_000 })

    const jobTitle = `Senior Rails Developer - ${company}`
    await page.locator('#title').fill(jobTitle)
    await page.locator('#description').fill(`${company} needs migration support on Rails and PostgreSQL API reliability.`)

    await page.getByRole('button', { name: 'Save job', exact: true }).click()
    await page.waitForURL(/\/upwork\/[a-f0-9-]+/, { timeout: 20_000 })

    const jobId = page.url().split('/upwork/')[1]?.split(/[?#]/)[0]
    expect(jobId).toBeTruthy()

    await page.goto(`/resume/generate?jobId=${jobId as string}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Truthful job-specific CV' })).toBeVisible({ timeout: 15_000 })

    const profilesRes = await page.request.get('/api/profiles')
    expect(profilesRes.ok()).toBe(true)
    const profilesPayload = await profilesRes.json()
    const profileId = profilesPayload?.profiles?.[0]?.id as string | undefined
    expect(profileId).toBeTruthy()

    const generateResponse = await page.request.post('/api/resume/generate', {
      data: {
        profileId,
        jobId,
        targetTitle: jobTitle,
        targetSkills: ['Rails', 'PostgreSQL', 'API design', 'payments'],
      },
    })
    expect(generateResponse.ok()).toBe(true)
    const resumePayload = await generateResponse.json()
    const tailoredCvId = resumePayload.tailoredCvId as string | null

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceRole) {
      const db = createClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data, error } = await db
        .from('tailored_cvs')
        .select('id, job_id')
        .eq('job_id', jobId as string)

      if (error && error.code === 'PGRST205') {
        throw new Error('tailored_cvs table is missing in this Supabase project. Apply migration 0087_tailored_cv_persistence.sql to unblock CV persistence proof.')
      }

      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
      expect((data ?? []).length).toBeGreaterThan(0)

      if (tailoredCvId) {
        expect((data ?? []).some((row: { id?: string | null }) => row.id === tailoredCvId)).toBe(true)
      }
      return
    }

    expect(tailoredCvId).toBeTruthy()
  })

  test('C2: CV page survives navigation away and back', async ({ page }) => {
    const createRes = await page.request.post('/api/upwork/jobs', {
      data: {
        title: uniqueLabel('Full-Stack Developer Healthcare'),
        description: 'TypeScript, Node.js, PostgreSQL, React for healthcare startup. HIPAA compliance preferred.',
        requiredSkills: ['TypeScript', 'Node.js', 'PostgreSQL', 'React'],
      },
    })
    expect(createRes.status()).toBe(201)
    const createData = await createRes.json()
    const jobId = createData.job?.id as string | undefined
    expect(jobId).toBeTruthy()

    await page.goto(`/resume/generate?jobId=${jobId as string}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Truthful job-specific CV' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Resume Tailoring')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Generate tailored CV', exact: true })).toBeVisible()

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await page.goto(`/resume/generate?jobId=${jobId as string}`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Truthful job-specific CV' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Resume Tailoring')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Generate tailored CV', exact: true })).toBeVisible()
  })
})

test.describe('TIMELINE: Yesterday fixture', () => {
  test('T1: Timeline shows date group when messages exist', async ({ page }) => {
    const company = uniqueLabel('TimelineCo')
    const leadId = await createLeadViaApi(page, company)

    await page.goto(`/leads/${leadId}`)
    await page.waitForLoadState('networkidle')

    await addTimelineMessage(page, leadId, `Client reply for ${company} confirming API migration urgency.`, 'reply')

    await page.reload({ waitUntil: 'networkidle' })

    const timelineSection = page.getByRole('heading', { name: 'Timeline' }).locator('..')
    await expect(timelineSection.getByText('Today').first()).toBeVisible({ timeout: 10_000 })

    await page.reload({ waitUntil: 'networkidle' })
    await expect(timelineSection.getByText('Today').first()).toBeVisible({ timeout: 10_000 })
  })
})
