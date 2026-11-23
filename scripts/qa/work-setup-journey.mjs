import { chromium } from 'playwright'
import fs from 'node:fs'

/**
 * Work Setup end-to-end journey with a real Admin and a real Rep account.
 *
 * The assignment/target save goes through the canonical write API that the
 * Work Setup form calls; every read-back is the real rendered page or the
 * canonical API. Staging data only.
 */
const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/work-setup-journey'
fs.mkdirSync(outDir, { recursive: true })
const log = (m) => console.log(`[journey] ${m}`)

const IDENTITY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' // Ayesha Khan · linkedin
const PROFILE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REP = '540fa149-9a3a-4bd1-affb-2d131b8ceeaa' // Staging Rep
const ADMIN = '3450295f-30a1-424b-9cc1-1da5e97edbf1' // staging-operator

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const admin = await adminCtx.newPage()
const repCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
const rep = await repCtx.newPage()

async function login(page, email, password) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]', { timeout: 90000 })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button:has-text("Sign in with password")')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 })
  return page.url()
}

// 1. Admin logs in.
log(`admin login -> ${await login(admin, 'staging-operator@example.com', 'staging-pass-123')}`)

// 2. Admin opens Work Setup and reads the canonical surface.
await admin.goto(`${base}/admin/targets`, { waitUntil: 'domcontentloaded' })
await admin.waitForTimeout(5000)
const setupBefore = await (await admin.request.get(`${base}/api/admin/work-setup`)).json()
const rowBefore = (setupBefore.rows ?? []).find((r) => r.identityId === IDENTITY)
log(`work setup rows=${(setupBefore.rows ?? []).length}; target row present=${Boolean(rowBefore)}`)
await admin.screenshot({ path: `${outDir}/01-admin-work-setup.png`, fullPage: true })

// 3-5. Admin assigns the rep and a daily target through the canonical writer.
const save = await admin.request.post(`${base}/api/admin/work-setup`, {
  data: { identityId: IDENTITY, primaryRepId: REP, operators: [], backups: [], targets: [{ activityType: 'dm', targetCount: 30 }] },
})
const saveBody = await save.json()
log(`save status=${save.status()} ok=${saveBody.ok} primary=${saveBody.primaryRepId} targetsWritten=${saveBody.targetsWritten}`)

const setupAfter = await (await admin.request.get(`${base}/api/admin/work-setup`)).json()
const rowAfter = (setupAfter.rows ?? []).find((r) => r.identityId === IDENTITY)
log(`after save: primary=${rowAfter?.primaryRepId} target=${rowAfter?.target}`)

// 6. Rep logs in.
log(`rep login -> ${await login(rep, 'staging-rep@example.com', 'staging-rep-pass-123')}`)

// 7. Rep sees the assignment + acknowledgement.
const coverage = await (await rep.request.get(`${base}/api/rep/coverage`)).json()
const ack = (coverage.coverage?.acknowledgements ?? []).find((a) => a.profileId === PROFILE)
log(`rep coverage own=${(coverage.coverage?.own ?? []).length} pendingAck=${Boolean(ack)}`)
await rep.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
await rep.waitForTimeout(6000)
const repDash = await rep.locator('body').innerText()
log(`rep dashboard shows target 30: ${/30/.test(repDash)}`)
await rep.screenshot({ path: `${outDir}/02-rep-today-before.png`, fullPage: true })

// 8. Rep acknowledges.
const ackRes = await rep.request.post(`${base}/api/rep/coverage`, { data: { action: 'acknowledge', acknowledgementId: ack?.id } })
const ackBody = await ackRes.json()
log(`acknowledge status=${ackRes.status()} ok=${ackBody.ok}`)

// 9. Rep completes an activity.
const sourceEventId = `ws-journey:${Date.now()}`
const eventRes = await rep.request.post(`${base}/api/accountability/event`, {
  data: { revenueIdentityId: IDENTITY, activityType: 'dm', sourceEventId },
})
const eventBody = await eventRes.json()
log(`activity status=${eventRes.status()} recorded=${eventBody.recorded} completed=${eventBody.completedCount}/${eventBody.targetCount}`)

// 10. Rep dashboard reflects the completion.
await rep.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
await rep.waitForTimeout(6000)
const repAfter = await rep.locator('body').innerText()
log(`rep dashboard completed 1: ${/1\s*\/\s*30|1 of 30/.test(repAfter)}`)
await rep.screenshot({ path: `${outDir}/03-rep-today-after.png`, fullPage: true })

// 11. Admin sees the same progress in the canonical API and the ledger.
const canonical = await (await admin.request.get(`${base}/api/admin/accountability`)).json()
const ledgerRow = (canonical.ledger ?? []).find((r) => r.identityId === IDENTITY)
log(`canonical requirement=${canonical.summary.requirement} completed=${canonical.summary.completed}`)
log(`ledger lane target=${ledgerRow?.targetCount} completed=${ledgerRow?.completed} seats=${ledgerRow?.seats?.length}`)
await admin.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
await admin.waitForTimeout(6000)
const adminDash = await admin.locator('body').innerText()
log(`admin dashboard shows progress: ${new RegExp(`${canonical.summary.completed} of ${canonical.summary.requirement}`).test(adminDash)}`)
await admin.screenshot({ path: `${outDir}/04-admin-after-activity.png`, fullPage: true })

// 12. Transfer: admin becomes primary, rep stays as operator.
const transfer = await admin.request.post(`${base}/api/admin/work-setup`, {
  data: { identityId: IDENTITY, primaryRepId: ADMIN, operators: [{ repId: REP }], backups: [], targets: [{ activityType: 'dm', targetCount: 30 }] },
})
const transferBody = await transfer.json()
log(`transfer ok=${transferBody.ok} primary=${transferBody.primaryRepId} operators=${JSON.stringify(transferBody.operatorIds)}`)
const repAfterTransfer = await (await rep.request.get(`${base}/api/rep/coverage`)).json()
log(`rep still executes after transfer: ${(repAfterTransfer.coverage?.own ?? []).some((p) => p.profileId === PROFILE)}`)

// 13. Unchanged save does not reset acknowledgement.
const unchanged = await admin.request.post(`${base}/api/admin/work-setup`, {
  data: { identityId: IDENTITY, primaryRepId: ADMIN, operators: [{ repId: REP }], backups: [] },
})
const unchangedBody = await unchanged.json()
const coverageFinal = await (await rep.request.get(`${base}/api/rep/coverage`)).json()
const pending = (coverageFinal.coverage?.acknowledgements ?? []).filter((a) => a.profileId === PROFILE && !a.acknowledgedAt)
log(`unchanged save ok=${unchangedBody.ok}; pending acknowledgements for profile=${pending.length}`)

log(`consistency: rep target ${eventBody.targetCount} vs canonical requirement ${canonical.summary.requirement}`)

await browser.close()
log('done')
