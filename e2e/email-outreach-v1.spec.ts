import { test, expect, type Page } from '@playwright/test'
import { bootstrapDemoProfile, loginAsAdmin } from './helpers'
import { readFileSync } from 'node:fs'

function uniqueLabel(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function envValue(name: string): string | null {
  const direct = process.env[name]
  if (direct && direct.trim()) return direct.trim()
  try {
    const raw = readFileSync('.env.local', 'utf8')
    const line = raw.split('\n').find((row) => row.startsWith(`${name}=`))
    if (!line) return null
    const [, value] = line.split('=')
    return value?.trim() || null
  } catch {
    return null
  }
}

async function ensureResumeArtifact(identityId: string, organizationId: string): Promise<void> {
  const url = envValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return

  const payload = {
    organization_id: organizationId,
    revenue_identity_id: identityId,
    profile_id: null,
    artifact_type: 'RESUME',
    name: 'Acceptance Resume',
    description: 'Resume for email outreach acceptance chain',
    source_url: null,
    tags: ['acceptance', 'email'],
    active: true,
  }

  const res = await fetch(`${url}/rest/v1/outreach_artifacts`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  })
  expect(res.ok).toBe(true)
}

async function readTodaySends(page: Page): Promise<number> {
  const res = await page.context().request.get('/api/me/status')
  expect(res.ok()).toBe(true)
  const data = await res.json()
  return Number(data.todaySends ?? 0)
}

async function setupEmailIdentity(page: Page) {
  const workspaceRes = await page.context().request.get('/api/me/workspace')
  expect(workspaceRes.ok()).toBe(true)
  const workspaceData = await workspaceRes.json()
  const currentRepId = workspaceData.rep?.id as string | undefined
  expect(currentRepId).toBeTruthy()

  const workspaceIdentities = (workspaceData.identities ?? []) as Array<{
    revenueIdentityId: string
    identityName: string
    channel: string
  }>

  const identitiesRes = await page.context().request.get('/api/admin/revenue-identities')
  expect(identitiesRes.ok()).toBe(true)
  const identitiesData = await identitiesRes.json()
  const identities = (identitiesData.identities ?? []) as Array<{ id: string; identityName: string; channel: string; organizationId: string }>

  let selectedIdentity = workspaceIdentities.find((i) => i.channel === 'email')
  if (!selectedIdentity) {
    const globalEmailIdentity = identities.find((identity) => identity.channel === 'email')
    if (globalEmailIdentity) {
      const assignExistingRes = await page.context().request.post('/api/admin/assignments', {
        data: {
          identityId: globalEmailIdentity.id,
          repId: currentRepId,
        },
      })
      expect(assignExistingRes.ok()).toBe(true)

      selectedIdentity = {
        revenueIdentityId: globalEmailIdentity.id,
        identityName: globalEmailIdentity.identityName,
        channel: 'email',
      }
      workspaceIdentities.push(selectedIdentity)
    }
  }

  if (!selectedIdentity) {
    const createdIdentityName = `Relay Email ${Date.now()}`
    const createRes = await page.context().request.post('/api/admin/revenue-identities', {
      data: {
        identityName: createdIdentityName,
        slug: `relay-email-${Date.now()}`,
        channel: 'email',
        title: 'Email Outreach Identity',
      },
    })
    const createData = await createRes.json().catch(() => ({}))
    expect(createRes.status(), JSON.stringify(createData)).toBe(201)
    const createdId = createData.identity?.id as string | undefined
    expect(createdId).toBeTruthy()

    const assignRes = await page.context().request.post('/api/admin/assignments', {
      data: {
        identityId: createdId,
        repId: currentRepId,
      },
    })
    expect(assignRes.ok()).toBe(true)

    selectedIdentity = {
      revenueIdentityId: createdId as string,
      identityName: createdIdentityName,
      channel: 'email',
    }
    workspaceIdentities.push(selectedIdentity)
    identities.push({
      id: createdId as string,
      identityName: createdIdentityName,
      channel: 'email',
      organizationId: (createData.identity?.organizationId as string | undefined) ?? (identities[0]?.organizationId as string),
    })
  }

  expect(workspaceIdentities.length).toBeGreaterThan(0)
  if (!selectedIdentity) {
    throw new Error('No email-channel revenue identity is available for this workspace; Email V1 browser gate cannot run.')
  }
  const resolvedIdentityId = selectedIdentity.revenueIdentityId
  const orgId = identities.find((i) => i.id === resolvedIdentityId)?.organizationId as string | undefined
  expect(orgId).toBeTruthy()

  for (const identity of workspaceIdentities) {
    const mailboxRes = await page.context().request.patch(`/api/admin/revenue-identities/${identity.revenueIdentityId}/email`, {
      data: {
        mailbox: {
          provider: 'relay_noop',
          senderEmail: `bd+${Date.now()}@relay.test`,
          senderName: identity.identityName,
          status: 'CONNECTED',
        },
        policy: {
          dailySendCap: 200,
          minimumDelaySeconds: 0,
          workingHoursStart: 0,
          workingHoursEnd: 23,
          timezone: 'UTC',
          followUpLimit: 1,
        },
      },
    })
    const mailboxData = await mailboxRes.json().catch(() => ({}))
    expect(mailboxRes.ok(), `mailbox failed: ${JSON.stringify(mailboxData)}`).toBe(true)
  }

  await ensureResumeArtifact(resolvedIdentityId, orgId as string)

  return {
    identityId: resolvedIdentityId,
    activeRepId: currentRepId as string,
    organizationId: orgId as string,
  }
}

async function createLeadWithContact(page: Page, identityId: string, repId: string, organizationId: string) {
  const url = envValue('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY')

  if (url && serviceRoleKey) {
    const company = uniqueLabel('Acme Email Co')
    const leadPayload = {
      organization_id: organizationId,
      owner_rep_id: repId,
      company,
      contact_name: 'Sarah Chen',
      contact_title: 'CTO',
      title_raw: `CTO at ${company}`,
      location_raw: 'San Francisco, CA',
      url: 'https://acmehealth.com/engineering',
      raw_input: `${company} reported a production outage and migration debt that is delaying releases, and said they need external engineering support.`,
      signal_type: 6,
      signal_evidence: 'Production outage + migration debt is delaying releases; team says they need external engineering support.',
      verbatim_quote: 'Migration debt caused a production outage and delayed this release.',
      score: 8,
      verdict: 'research_more',
      status: 'new',
      tags: ['backend', 'migration', 'delivery-risk'],
      revenue_identity_id: identityId,
      extraction_confidence: 100,
    }

    const leadRes = await fetch(`${url}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(leadPayload),
    })
    expect(leadRes.ok).toBe(true)
    const leadRows = await leadRes.json() as Array<{ id: string }>
    const leadId = leadRows[0]?.id
    expect(leadId).toBeTruthy()

    const contactRes = await fetch(`${url}/rest/v1/contact_points`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        organization_id: organizationId,
        lead_id: leadId,
        type: 'email',
        value: `sarah+${Date.now()}@acmehealth.com`,
        source: 'USER_PROVIDED',
        is_primary: true,
        verification_status: 'VERIFIED',
        verification_method: 'manual',
      }),
    })
    expect(contactRes.ok).toBe(true)

    return { leadId: leadId as string, company }
  }

  let company = ''
  let leadId: string | null = null
  const createErrors: string[] = []

  for (let attempt = 0; attempt < 10; attempt += 1) {
    company = uniqueLabel('Acme Email Co')
    const leadRes = await page.context().request.post('/api/leads', {
      data: {
        company,
        contactName: 'Sarah Chen',
        contactTitle: 'CTO',
        titleRaw: `CTO at ${company}`,
        locationRaw: 'San Francisco, CA',
        url: 'https://acmehealth.com/engineering',
        signalType: 6,
        signalEvidence: 'Production outage + migration debt is delaying releases; team says they need external engineering support.',
        rawInput: `${company} reported a production outage and migration debt that is delaying releases, and said they need external engineering support.`,
        verbatimQuote: 'Migration debt caused a production outage and delayed this release.',
        extractionConfidence: 100,
        tags: ['backend', 'migration', 'delivery-risk'],
        revenueIdentityId: identityId,
        allowPotentialDuplicate: true,
      },
    })
    if (!leadRes.ok()) {
      createErrors.push(`${leadRes.status()}: ${await leadRes.text()}`)
      continue
    }
    const leadData = await leadRes.json()
    if (leadData.lead?.id) {
      leadId = leadData.lead.id as string
      break
    }
  }

  if (!leadId) {
    if (url && serviceRoleKey) {
      const fallbackRes = await fetch(`${url}/rest/v1/leads?select=id,company&company=ilike.*Acme%20Email%20Co*&order=created_at.desc&limit=1`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      })
      if (fallbackRes.ok) {
        const rows = await fallbackRes.json() as Array<{ id: string; company: string }>
        if (rows[0]?.id) {
          leadId = rows[0].id
          company = rows[0].company
        }
      }
    }
  }

  expect(leadId, createErrors.join(' | ')).toBeTruthy()

  const contactRes = await page.context().request.post(`/api/leads/${leadId as string}/contacts`, {
    data: {
      type: 'email',
      value: `sarah+${Date.now()}@acmehealth.com`,
      source: 'USER_PROVIDED',
      isPrimary: true,
    },
  })
  expect(contactRes.ok()).toBe(true)

  return { leadId: leadId as string, company }
}

test.describe('Email Outreach V1 browser acceptance', () => {
  test.skip(process.env.RUN_EMAIL_ACCEPTANCE !== '1', 'Manual gate: requires migrated email tables + configured runtime environment.')
  test.setTimeout(420_000)

  test('lead flow + bulk prepare guardrails', async ({ page }) => {
    await bootstrapDemoProfile('http://localhost:3000').catch(() => {})
    await loginAsAdmin(page)

    const { identityId, activeRepId, organizationId } = await setupEmailIdentity(page)
    const { leadId, company } = await createLeadWithContact(page, identityId, activeRepId, organizationId)
    const baselineSends = await readTodaySends(page)

    const unassignRes = await page.context().request.delete(`/api/admin/revenue-identities/${identityId}/assign?repId=${activeRepId}`)
    expect(unassignRes.ok()).toBe(true)

    const unauthorizedPrepare = await page.context().request.post(`/api/leads/${leadId}/email/prepare`, {
      data: { revenueIdentityId: identityId },
    })
    expect(unauthorizedPrepare.status()).toBe(403)

    const reassignRes = await page.context().request.post('/api/admin/assignments', {
      data: { identityId, repId: activeRepId },
    })
    expect(reassignRes.ok()).toBe(true)

    await page.goto(`/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: 'EMAIL', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Prepare Email' }).click()
    await expect(page.locator('text=EMAIL STRATEGY')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('heading', { name: company })).toBeVisible()
    await expect(page.locator('text=Why email:')).toBeVisible()
    await expect(page.locator('text=Goal:')).toBeVisible()
    await expect(page.locator('text=Proof:')).toBeVisible()
    await expect(page.locator('text=Attachment:')).toBeVisible()

    const subject = page.locator('#email-subject')
    const body = page.locator('#email-body')
    await subject.fill('Acme hiring backend support')
    await body.fill('Hi Sarah, saw the backend hiring push. Open to a short exchange this week?')

    const preSendLeadEmail = await page.context().request.get(`/api/leads/${leadId}/email`)
    expect(preSendLeadEmail.ok()).toBe(true)
    const preSendPayload = await preSendLeadEmail.json()
    const draftId = preSendPayload.drafts?.[0]?.id as string
    expect(draftId).toBeTruthy()

    await page.getByRole('button', { name: 'Send from Relay' }).click()
    await expect(page.locator('text=Email sent from Relay.')).toBeVisible({ timeout: 20_000 })

    const postSendLeadEmail = await page.context().request.get(`/api/leads/${leadId}/email`)
    expect(postSendLeadEmail.ok()).toBe(true)
    const postSendPayload = await postSendLeadEmail.json()
    const firstMessageIdempotencyKey = postSendPayload.messages?.[0]?.idempotencyKey as string | undefined
    expect(firstMessageIdempotencyKey).toBeTruthy()

    const replaySend = await page.context().request.post(`/api/leads/${leadId}/email/send`, {
      data: {
        draftId,
        idempotencyKey: firstMessageIdempotencyKey,
      },
    })
    expect(replaySend.ok()).toBe(true)
    const replayData = await replaySend.json()
    expect(replayData.idempotent).toBe(true)

    await page.goto('/revenue/email', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /WAITING/i }).click()
    await expect(page.locator(`text=${company}`)).toBeVisible({ timeout: 20_000 })

    const afterSendCount = await readTodaySends(page)
    expect(afterSendCount).toBeGreaterThanOrEqual(baselineSends + 1)

    await page.goto('/revenue/email', { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /WAITING/i }).click()
    await expect(page.locator(`text=${company}`)).toBeVisible()

    const leadEmailRes = await page.context().request.get(`/api/leads/${leadId}/email`)
    expect(leadEmailRes.ok()).toBe(true)
    const leadEmailData = await leadEmailRes.json()
    expect((leadEmailData.messages ?? []).length).toBe(1)
    const providerMessageId = leadEmailData.messages?.[0]?.providerMessageId as string | undefined
    expect(providerMessageId).toBeTruthy()

    const replyWebhook = await page.context().request.post('/api/email/webhook', {
      data: {
        provider: 'relay_noop',
        eventId: uniqueLabel('reply'),
        eventType: 'REPLIED',
        providerMessageId,
        replyBody: 'Yes, please send details.',
      },
    })
    expect(replyWebhook.ok()).toBe(true)

    await page.goto('/revenue/email', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /REPLIES/i }).click()
    await expect(page.locator(`text=${company}`)).toBeVisible({ timeout: 20_000 })

    await page.goto(`/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Reply now')).toBeVisible()
    await expect(page.locator('text=Generate follow-up')).toHaveCount(0)

    const refreshedLeadEmailRes = await page.context().request.get(`/api/leads/${leadId}/email`)
    const refreshedLeadEmailData = await refreshedLeadEmailRes.json()
    expect(refreshedLeadEmailData.lead?.status).toBe('replied')

    const bulkLeadIds: string[] = []
    for (let i = 0; i < 20; i += 1) {
      const bulkCompany = uniqueLabel(`Bulk Lead ${i + 1}`)
      const createRes = await page.context().request.post('/api/leads', {
        data: {
          company: bulkCompany,
          contactName: `Contact ${i + 1}`,
          contactTitle: 'Engineering Manager',
          titleRaw: `Engineering Manager at ${bulkCompany}`,
          locationRaw: 'Remote',
          signalType: 1,
          signalEvidence: 'Actively hiring backend engineers this quarter.',
          rawInput: `${bulkCompany} is actively hiring backend engineers this quarter.`,
          tags: ['backend', 'hiring'],
          revenueIdentityId: identityId,
        },
      })
      expect(createRes.ok()).toBe(true)
      const created = await createRes.json()
      const bulkLeadId = created.lead?.id as string
      bulkLeadIds.push(bulkLeadId)

      if (i % 2 === 0) {
        const contactRes = await page.context().request.post(`/api/leads/${bulkLeadId}/contacts`, {
          data: {
            type: 'email',
            value: `contact${i + 1}+${Date.now()}@bulkco.com`,
            source: 'USER_PROVIDED',
            isPrimary: true,
          },
        })
        expect(contactRes.ok()).toBe(true)
      }
    }

    const bulkPrepareRes = await page.context().request.post('/api/revenue/email/prepare', {
      timeout: 180_000,
      data: {
        leadIds: bulkLeadIds,
        revenueIdentityId: identityId,
      },
    })
    expect(bulkPrepareRes.ok()).toBe(true)
    const bulkPrepareData = await bulkPrepareRes.json()
    expect(bulkPrepareData.prepared).toHaveLength(20)
    expect((bulkPrepareData.summary?.CONTACT_NOT_FOUND ?? 0)).toBeGreaterThan(0)

    const noContactLeadIds = bulkLeadIds.filter((_, idx) => idx % 2 === 1)
    for (const id of noContactLeadIds.slice(0, 5)) {
      const leadEmail = await page.context().request.get(`/api/leads/${id}/email`)
      expect(leadEmail.ok()).toBe(true)
      const leadEmailPayload = await leadEmail.json()
      const newestDraft = leadEmailPayload.drafts?.[0]
      expect(newestDraft?.draftStatus).toBe('CONTACT_NOT_FOUND')
      expect(typeof newestDraft?.subject === 'string' && newestDraft.subject.length > 0).toBe(true)
      expect(typeof newestDraft?.body === 'string' && newestDraft.body.length > 0).toBe(true)
      expect(leadEmailPayload.messages ?? []).toHaveLength(0)
    }
  })
})
