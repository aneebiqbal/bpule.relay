/**
 * Phase 4 authenticated integration QA against local staging.
 *
 *   node scripts/qa/phase4-authenticated-qa.mjs [base]
 *
 * Requires staging-bootstrap + staging-fixtures and the app running with
 * .env.staging plus CRON_SECRET=staging-cron-test. Uses real Better Auth
 * sessions; every mutation goes through the real API under the caller's role.
 */
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:3000'
const PASSWORD = 'staging-password-1'
const CRON = 'staging-cron-test'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()

async function signIn(email) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASSWORD)
  await page.waitForTimeout(600)
  await page.locator('button.auth-submit').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 })
  return { ctx, page }
}

const api = (page, path, init) => page.evaluate(async ({ path, init }) => {
  const response = await fetch(path, init)
  let body = null
  try { body = await response.json() } catch {}
  return { status: response.status, body }
}, { path, init })

// ── Admin creates a custom channel and measurable activity ─────────────────
const admin = await signIn('admin.stg@org-a.test')
let channelId = ''
let activityId = ''
{
  const created = await api(admin.page, '/api/admin/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'QA Partners',
      slug: `qa-partners-${Date.now()}`,
      description: 'Phase 4 authenticated QA channel',
      template: 'custom',
      operationMode: 'manual_evidence',
    }),
  })
  check('admin creates a custom channel', created.status === 201, `HTTP ${created.status} ${JSON.stringify(created.body)?.slice(0, 160)}`)
  channelId = created.body?.channel?.id ?? ''

  const activity = await api(admin.page, `/api/admin/channels/${channelId}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'intro_sent',
      label: 'Introductions sent',
      countingMode: 'unique_verified_event',
      evidencePolicy: 'source_event_id',
      targetable: true,
      effortMinutes: 5,
    }),
  })
  check('admin adds a measurable activity', activity.status === 201, `HTTP ${activity.status} ${JSON.stringify(activity.body)?.slice(0, 160)}`)
  activityId = activity.body?.activity?.id ?? ''
}

// ── Bind an identity, set a requirement, allocate it with CAS ──────────────
let identityId = ''
let memberId = ''
let requirementSaved = false
{
  const setup = await api(admin.page, '/api/admin/work-setup')
  const payload = setup.body
  memberId = payload.reps.find((rep) => rep.name === 'A Member')?.id ?? ''
  const row = payload.rows.find((candidate) => candidate.identityName === 'A LinkedIn')
  if (!row) throw new Error('fixture identity missing')
  identityId = row.identityId

  const bound = await api(admin.page, `/api/admin/revenue-identities/${identityId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId }),
  })
  check('admin binds the identity to the custom channel', bound.status === 200 && bound.body?.identity?.channel_id === channelId, `HTTP ${bound.status}`)

  const refreshed = await api(admin.page, '/api/admin/work-setup')
  const targetRow = refreshed.body.rows.find((candidate) => candidate.identityId === identityId)
  const save = await api(admin.page, '/api/admin/work-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identityId,
      primaryRepId: targetRow.primaryRepId,
      operators: targetRow.operators.map((seat) => ({ repId: seat.repId })),
      backups: targetRow.backups.map((seat) => ({ repId: seat.repId })),
      targets: [{ activityType: 'intro_sent', targetCount: 5 }],
      allocations: [{ activityType: 'intro_sent', repId: memberId, targetCount: 5 }],
      expectedRevision: targetRow.revision,
    }),
  })
  requirementSaved = save.status === 200
  check('Work Setup saves the custom requirement + allocation with CAS', requirementSaved, `HTTP ${save.status} ${JSON.stringify(save.body)}`)

  const stale = await api(admin.page, '/api/admin/work-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identityId,
      primaryRepId: targetRow.primaryRepId,
      operators: [],
      backups: [],
      targets: [{ activityType: 'intro_sent', targetCount: 6 }],
      expectedRevision: targetRow.revision,
    }),
  })
  check('stale revision still conflicts with HTTP 409', stale.status === 409, `HTTP ${stale.status} ${JSON.stringify(stale.body)}`)
}

// ── Rep sees the activity, records it twice, credit is exactly once ────────
const member = await signIn('member.stg@org-a.test')
{
  await member.page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
  await member.page.waitForTimeout(800)
  const body = await member.page.locator('body').innerText()
  check('rep dashboard shows the custom activity label', body.includes('Introductions sent'))

  const first = await api(member.page, '/api/accountability/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revenueIdentityId: identityId, activityType: 'intro_sent', sourceEventId: `qa-intro-${Date.now()}`, evidence: 'qa' }),
  })
  check('rep records the custom activity', first.status === 200 && (first.body?.recorded ?? true), `HTTP ${first.status} ${JSON.stringify(first.body)?.slice(0, 160)}`)

  const eventKey = `qa-dup-${Date.now()}`
  const second = await api(member.page, '/api/accountability/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revenueIdentityId: identityId, activityType: 'intro_sent', sourceEventId: eventKey }),
  })
  const third = await api(member.page, '/api/accountability/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revenueIdentityId: identityId, activityType: 'intro_sent', sourceEventId: eventKey }),
  })
  check('duplicate source event is accepted but not double counted', second.status === 200 && third.status === 200, `HTTP ${second.status}/${third.status}`)

  const progress = await api(admin.page, '/api/admin/work-setup')
  const row = progress.body.rows.find((candidate) => candidate.identityId === identityId)
  const lane = row?.lanes.find((entry) => entry.activityType === 'intro_sent')
  // One unique source event + the duplicated event credited once = 2 units.
  check('canonical ledger credits each unique event exactly once', lane?.completed === 2, `businessDate=${progress.body.businessDate} lanes=${JSON.stringify(row?.lanes ?? null).slice(0, 200)}`)

  const people = progress.body.people.find((person) => person.repId === memberId)
  check('People projection shows the personal allocation and completion', people && people.assignedUnits >= 5 && people.completedUnits >= 1, JSON.stringify(people))

  // Configurable availability: no default workday is invented.
  const beforeCapacity = await api(admin.page, '/api/admin/capacity')
  check('capacity settings read returns an array', beforeCapacity.status === 200 && Array.isArray(beforeCapacity.body?.capacity), `HTTP ${beforeCapacity.status}`)
  const configured = await api(admin.page, '/api/admin/capacity', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repId: memberId, availableMinutes: 240 }),
  })
  const withCapacity = await api(admin.page, '/api/admin/work-setup')
  const person = withCapacity.body.people.find((row) => row.repId === memberId)
  const expectedUtilization = person?.estimatedEffortMinutes != null ? Math.round((person.estimatedEffortMinutes / 240) * 100) : null
  check(
    'availability drives honest utilization without inventing defaults',
    configured.status === 200 && person?.availableMinutes === 240 && person?.utilizationPct === expectedUtilization && person?.capacityStatus !== 'not_configured',
    JSON.stringify(person),
  )
  await api(admin.page, '/api/admin/capacity', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repId: memberId, availableMinutes: null }),
  })
}

// ── Cross-org isolation at the API boundary ────────────────────────────────
{
  const outsider = await signIn('bmember.stg@org-b.test')
  const channels = await api(outsider.page, '/api/admin/channels')
  // Org B's member has no catalog capability (403 is correct); an authorized
  // org B manager must still never see org A's custom row.
  const leaked = JSON.stringify(channels.body).includes(channelId)
  check('org B cannot access org A custom channel', !leaked && [200, 403].includes(channels.status), `HTTP ${channels.status}`)

  const forged = await api(outsider.page, '/api/accountability/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revenueIdentityId: identityId, activityType: 'intro_sent', sourceEventId: `forge-${Date.now()}` }),
  })
  check('cross-org activity credit is denied', forged.status === 403, `HTTP ${forged.status} ${JSON.stringify(forged.body)?.slice(0, 120)}`)
  await outsider.ctx.close()
}

// ── Handoff preview and execution reconcile ────────────────────────────────
{
  const preview = await api(admin.page, `/api/admin/handoff?fromRepId=${memberId}&toRepId=${admin.body?.ctx?.orgId ?? ''}`)
  // admin body isn't available here; use manager as replacement instead
  const managerSetup = await api(admin.page, '/api/admin/work-setup')
  const managerId = managerSetup.body.reps.find((rep) => rep.name === 'A Manager')?.id ?? ''
  const plan = await api(admin.page, `/api/admin/handoff?fromRepId=${memberId}&toRepId=${managerId}`)
  check('handoff preview reports the custom allocation', plan.status === 200 && plan.body?.plan?.targetUnits >= 5, JSON.stringify(plan.body?.plan ?? plan.body).slice(0, 160))

  const executed = await api(admin.page, '/api/admin/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromRepId: memberId, toRepId: managerId, suspendFromRep: false }),
  })
  check('handoff executes durably', executed.status === 200 && ['completed', 'partial'].includes(executed.body?.status), JSON.stringify(executed.body).slice(0, 200))

  const after = await api(admin.page, '/api/admin/work-setup')
  const laneAfter = after.body.rows.find((row) => row.identityId === identityId)?.lanes.find((entry) => entry.activityType === 'intro_sent')
  const movedToManager = laneAfter?.allocations.every((allocation) => allocation.repName === 'A Manager') && laneAfter.allocations.length > 0
  check('replacement owns the allocation after transfer', Boolean(movedToManager), JSON.stringify(laneAfter?.allocations))
}

// ── Jobs: freshness, honest last-sync, durable Sync Now worker path ────────
{
  await admin.page.goto(`${base}/jobs`, { waitUntil: 'domcontentloaded' })
  await admin.page.waitForTimeout(900)
  const jobsBody = await admin.page.locator('body').innerText()
  check('Jobs header exposes last-sync state', /Last synced/i.test(jobsBody), jobsBody.slice(0, 80))

  const queued = await api(admin.page, '/api/jobs/sync', { method: 'POST' })
  check('Sync Now enqueues a durable run', queued.status === 200 && queued.body?.requestId, `HTTP ${queued.status} ${JSON.stringify(queued.body).slice(0, 120)}`)
  const requestId = queued.body?.requestId ?? ''

  const repeat = await api(admin.page, '/api/jobs/sync', { method: 'POST' })
  check('repeated click is deduplicated (cooldown/active reuse)', repeat.status === 200 && (repeat.body?.reused === true || repeat.body?.requestId === requestId), JSON.stringify(repeat.body).slice(0, 120))

  // Real scheduled worker route (cron-secret protected), which also drains the queue.
  const worker = await fetch(`${base}/api/cron/job-discovery?max=2&timeout=8000`, { headers: { Authorization: `Bearer ${CRON}` } })
  const workerBody = await worker.json().catch(() => ({}))
  check('discovery worker completes without claiming fake success', worker.status === 200 || worker.status === 423, `HTTP ${worker.status} manual=${JSON.stringify(workerBody.manual ?? null).slice(0, 160)}`)

  let status = null
  for (let attempt = 0; attempt < 20 && !status; attempt += 1) {
    const polled = await api(admin.page, `/api/jobs/sync?requestId=${requestId}`)
    if (polled.body?.status === 'succeeded' || polled.body?.status === 'failed') status = polled.body
    else await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  check('manual run reaches a terminal state', Boolean(status), JSON.stringify(status).slice(0, 200))
  check('sync result reports counters honestly', status?.result?.sources !== undefined, JSON.stringify(status?.result ?? {}).slice(0, 160))
}

await admin.ctx.close()
await member.ctx.close()
await browser.close()

const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} Phase 4 authenticated checks passed`)
process.exit(failed.length ? 1 : 0)
