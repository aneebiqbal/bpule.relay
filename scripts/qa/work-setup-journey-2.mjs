import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/work-setup-journey'
fs.mkdirSync(outDir, { recursive: true })
const log = (m) => console.log(`[journey2] ${m}`)

const IDENTITY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PROFILE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REP = '540fa149-9a3a-4bd1-affb-2d131b8ceeaa'
const ADMIN = '3450295f-30a1-424b-9cc1-1da5e97edbf1'

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

log(`admin login -> ${await login(admin, 'staging-operator@example.com', 'staging-pass-123')}`)
log(`rep login -> ${await login(rep, 'staging-rep@example.com', 'staging-rep-pass-123')}`)

// Put the rep back as PRIMARY with a 30/day DM target.
const save = await admin.request.post(`${base}/api/admin/work-setup`, {
  data: { identityId: IDENTITY, primaryRepId: REP, operators: [], backups: [], targets: [{ activityType: 'dm', targetCount: 30 }] },
})
log(`reset save ok=${(await save.json()).ok}`)

// Rep Today.
await rep.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await rep.waitForTimeout(6000)
const repText = await rep.locator('body').innerText()
log(`rep dashboard url=${new URL(rep.url()).pathname}`)
log(`rep dashboard shows 30: ${/30/.test(repText)}`)
const repToday = await (await rep.request.get(`${base}/api/rep/today`)).json()
log(`rep/today totalTarget=${repToday.totalTarget} completed=${repToday.totalCompleted} remaining=${repToday.totalRemaining}`)
await rep.screenshot({ path: `${outDir}/05-rep-today.png`, fullPage: true })

// Rep completes one activity.
const eventRes = await rep.request.post(`${base}/api/accountability/event`, {
  data: { revenueIdentityId: IDENTITY, activityType: 'dm', sourceEventId: `ws2:${Date.now()}` },
})
log(`activity ${(await eventRes.json())}`)

await rep.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await rep.waitForTimeout(6000)
const repAfter = await rep.locator('body').innerText()
const repTodayAfter = await (await rep.request.get(`${base}/api/rep/today`)).json()
log(`rep/today after: completed=${repTodayAfter.totalCompleted} remaining=${repTodayAfter.totalRemaining}`)
log(`rep dashboard shows 1/30: ${/1\s*\/\s*30/.test(repAfter)}`)
await rep.screenshot({ path: `${outDir}/06-rep-today-after.png`, fullPage: true })

// Admin sees the same.
const canonical = await (await admin.request.get(`${base}/api/admin/accountability`)).json()
log(`canonical requirement=${canonical.summary.requirement} completed=${canonical.summary.completed}`)
await admin.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await admin.waitForTimeout(6000)
const adminText = await admin.locator('body').innerText()
log(`admin dashboard shows "1 of 30 required": ${/1 of 30 required/.test(adminText)}`)
await admin.screenshot({ path: `${outDir}/07-admin-progress.png`, fullPage: true })

// Acknowledgement survives an unchanged save.
const before = await (await rep.request.get(`${base}/api/rep/coverage`)).json()
const ackBefore = (before.coverage?.acknowledgements ?? []).find((a) => a.profileId === PROFILE)
log(`ack before: acknowledgedAt=${ackBefore?.acknowledgedAt ?? 'null'}`)
const unchanged = await admin.request.post(`${base}/api/admin/work-setup`, {
  data: { identityId: IDENTITY, primaryRepId: REP, operators: [], backups: [] },
})
log(`unchanged save ok=${(await unchanged.json()).ok}`)
const afterAck = await (await rep.request.get(`${base}/api/rep/coverage`)).json()
const ackAfter = (afterAck.coverage?.acknowledgements ?? []).find((a) => a.profileId === PROFILE)
log(`ack after: acknowledgedAt=${ackAfter?.acknowledgedAt ?? 'null'} (unchanged=${ackBefore?.acknowledgedAt === ackAfter?.acknowledgedAt})`)

log(`consistency: rep target ${repTodayAfter.totalTarget} vs canonical requirement ${canonical.summary.requirement}`)
await browser.close()
log('done')
