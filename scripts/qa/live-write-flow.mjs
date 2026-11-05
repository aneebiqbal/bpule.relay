/**
 * LIVE authenticated REP write flow (Neon production, HTTPS dev server).
 * Inbox → Needs reply → select → inspect profile → Generate with AI → edit →
 * Log as sent → verify persistence, waiting-state transition, attribution.
 */
import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const IDENTITY = 'c26a685b-a18b-4672-b7ad-a55e211539b2' // Hassan · LinkedIn
const EDIT_MARKER = ' — confirmed on our side, we can start next week.'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
await context.addInitScript((id) => {
  try { localStorage.setItem('relay-active-identity', id) } catch {}
}, IDENTITY)
const page = await context.newPage()

const log = (...a) => console.log(...a)

// ── Auth ────────────────────────────────────────────────────────────────────
await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill('dawood@scout.dev')
await page.locator('input[type="password"], input[name="password"]').first().fill('scout-dev-password')
await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 30_000 })
await page.waitForTimeout(1500)
const me = await (await context.request.get(`${base}/api/me/status`)).json()
log('AUTH /api/me/status:', JSON.stringify(me))

// ── Inbox → Needs reply ──────────────────────────────────────────────────────
await page.goto(`${base}/chats`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
const tabs = await page.locator('nav[aria-label="Conversation views"] a, nav[aria-label="Conversation views"] button').allInnerTexts()
log('TABS:', tabs.map((t) => t.replace(/\n/g, ' ')).join(' | '))
const rows = await page.locator('ul[aria-label="Conversations"] li').allInnerTexts()
log('QUEUE rows:', rows.length, '| first:', rows[0]?.replace(/\n/g, ' | ').slice(0, 120))

await page.locator('ul[aria-label="Conversations"] li').first().click()
await page.waitForTimeout(3500)
const url = new URL(page.url())
const leadId = url.searchParams.get('lead')
log('SELECTED lead:', leadId, '| url:', page.url())

// Sending profile + composer identity
const composerHeader = await page.locator('section[aria-label="Conversation"] .border-t').first().innerText().catch(() => '')
log('COMPOSER header:', composerHeader.replace(/\n/g, ' | ').slice(0, 200))

// ── Before state ─────────────────────────────────────────────────────────────
const before = await (await context.request.get(`${base}/api/leads/${leadId}/conversation`)).json()
log('BEFORE thread turns:', before.thread?.length, '| awaitingReply:', before.awaitingReply, '| suggestedIntent:', before.suggestedIntent, '| stage:', before.stageLabel)
const beforeMessages = await (await context.request.get(`${base}/api/leads/${leadId}/conversation`)).text()
log('BEFORE bytes:', beforeMessages.length)

// ── Generate with AI ─────────────────────────────────────────────────────────
const composer = page.getByRole('textbox', { name: 'Your message' })
await page.getByRole('button', { name: /Generate with AI|Write with AI|Improve with AI/ }).first().click()
log('clicked Generate with AI')
await expectValue(composer, /./, 120_000)
const generated = await composer.inputValue()
log('GENERATED length:', generated.length, '| preview:', generated.slice(0, 140).replace(/\n/g, ' '))

// ── Edit ─────────────────────────────────────────────────────────────────────
const edited = `${generated.trimEnd()}${EDIT_MARKER}`
await composer.fill(edited)
await page.waitForTimeout(300)
log('EDITED length:', (await composer.inputValue()).length, '| marker present:', (await composer.inputValue()).includes('confirmed on our side'))

// ── Log as sent ──────────────────────────────────────────────────────────────
const sendResp = page.waitForResponse((r) => r.url().includes('/conversation/send') && r.request().method() === 'POST', { timeout: 60_000 }).catch(() => null)
await page.getByRole('button', { name: 'Log as sent', exact: true }).click()
const resp = await sendResp
log('SEND status:', resp ? resp.status() : 'no response captured')
await page.waitForTimeout(2500)

// ── After state ──────────────────────────────────────────────────────────────
const after = await (await context.request.get(`${base}/api/leads/${leadId}/conversation`)).json()
log('AFTER thread turns:', after.thread?.length, '| awaitingReply:', after.awaitingReply, '| suggestedIntent:', after.suggestedIntent, '| stage:', after.stageLabel)
const lastTurn = after.thread?.at(-1)
log('AFTER last turn:', JSON.stringify({ role: lastTurn?.role, kind: lastTurn?.kind, at: lastTurn?.at, text: lastTurn?.text?.slice(0, 120) }))

// ── Queue transition ─────────────────────────────────────────────────────────
await page.goto(`${base}/chats?view=waiting_me`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const tabsAfter = await page.locator('nav[aria-label="Conversation views"] a, nav[aria-label="Conversation views"] button').allInnerTexts()
log('TABS after send:', tabsAfter.map((t) => t.replace(/\n/g, ' ')).join(' | '))
const rowsAfter = await page.locator('ul[aria-label="Conversations"] li').allInnerTexts()
log('QUEUE rows after:', rowsAfter.length, '| still first:', rowsAfter[0]?.replace(/\n/g, ' | ').slice(0, 80))
const meAfter = await (await context.request.get(`${base}/api/me/status`)).json()
log('ME after:', JSON.stringify(meAfter))

// ── Idempotency: same key twice ──────────────────────────────────────────────
const idem = `live-qa-${leadId}-1`
const payload = JSON.stringify({ text: `${edited}${EDIT_MARKER}`, intent: 'reply', idempotencyKey: idem })
const first = await context.request.post(`${base}/api/leads/${leadId}/conversation/send`, { headers: { 'Content-Type': 'application/json' }, data: payload })
const second = await context.request.post(`${base}/api/leads/${leadId}/conversation/send`, { headers: { 'Content-Type': 'application/json' }, data: payload })
log('IDEMPOTENCY first:', first.status(), 'second:', second.status())
const afterIdem = await (await context.request.get(`${base}/api/leads/${leadId}/conversation`)).json()
const outboundCount = afterIdem.thread?.filter((t) => t.role === 'me').length
log('IDEMPOTENCY outbound turns:', outboundCount, '(expected 1 from the UI send + 1 from the deduped API send = 2)')

await page.screenshot({ path: 'artifacts/inbox-live-after-send.png', fullPage: false })
await browser.close()

async function expectValue(locator, re, timeout) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = await locator.inputValue().catch(() => '')
    if (re.test(v)) return v
    await page.waitForTimeout(500)
  }
  throw new Error('textarea value timeout')
}
