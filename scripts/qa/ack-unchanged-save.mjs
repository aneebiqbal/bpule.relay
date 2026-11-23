import { chromium } from 'playwright'

const base = 'http://127.0.0.1:3200'
const IDENTITY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PROFILE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REP = '540fa149-9a3a-4bd1-affb-2d131b8ceeaa'
const log = (m) => console.log(`[ack] ${m}`)

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const admin = await browser.newPage()
const rep = await browser.newPage()

async function login(page, email, password) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]', { timeout: 90000 })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button:has-text("Sign in with password")')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 })
}

await login(admin, 'staging-operator@example.com', 'staging-pass-123')
await login(rep, 'staging-rep@example.com', 'staging-rep-pass-123')

const ADMIN = '3450295f-30a1-424b-9cc1-1da5e97edbf1'
const payload = { identityId: IDENTITY, primaryRepId: ADMIN, operators: [{ repId: REP }], backups: [], targets: [{ activityType: 'dm', targetCount: 30 }] }

// Arm an acknowledgement with a save.
log(`initial save ok=${(await (await admin.request.post(`${base}/api/admin/work-setup`, { data: payload })).json()).ok}`)
let cov = await (await rep.request.get(`${base}/api/rep/coverage`)).json()
const ack = (cov.coverage?.acknowledgements ?? []).find((a) => a.profileId === PROFILE)
log(`pending ack id=${ack?.id ?? 'none'}`)

// Rep acknowledges.
const ackRes = await rep.request.post(`${base}/api/rep/coverage`, { data: { action: 'acknowledge', acknowledgementId: ack?.id } })
log(`acknowledge status=${ackRes.status()}`)
cov = await (await rep.request.get(`${base}/api/rep/coverage`)).json()
const afterAck = (cov.coverage?.acknowledgements ?? []).find((a) => a.id === ack?.id)
const stamp = afterAck?.acknowledgedAt ?? null
log(`acknowledgedAt=${stamp}`)

// Unchanged save.
log(`unchanged save ok=${(await (await admin.request.post(`${base}/api/admin/work-setup`, { data: payload })).json()).ok}`)
cov = await (await rep.request.get(`${base}/api/rep/coverage`)).json()
const afterSave = (cov.coverage?.acknowledgements ?? []).find((a) => a.id === ack?.id) ?? (cov.coverage?.acknowledgements ?? []).find((a) => a.profileId === PROFILE)
const stamp2 = afterSave?.acknowledgedAt ?? null
log(`acknowledgedAt after unchanged save=${stamp2} · preserved=${stamp === stamp2}`)

await browser.close()
