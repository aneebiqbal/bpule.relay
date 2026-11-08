import { test, expect, type Browser, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { STATE_DIR, type SynthRole } from './global-setup'

/**
 * Phase 8 browser certification on the local synthetic stack.
 *
 * MATRIX: every role's Phase 8 routes at 1440/1280/1024/768/375 — HTTP status,
 * error boundary, uncaught errors, horizontal overflow, axe (critical/serious),
 * navigation timing, screenshots at 1440 and 375.
 * FUNCTIONAL: role scope, cross-org isolation, Rep 360 guard, Rep Home
 * scoreboard vs seed truth, notifications mark-read, tasks, Cmd-K, chat
 * preview egress, saved views.
 *
 * Ground truth comes from the seed (SYNTH_TRUTH / SYNTH_CAST), not from app code.
 */

const PASSWORD = process.env.SYNTH_PASSWORD
test.skip(!PASSWORD, 'Local synthetic stack only (set SYNTH_PASSWORD).')

const readJson = (p?: string) => (p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null)
const TRUTH = readJson(process.env.SYNTH_TRUTH)
const CAST: Record<string, { rep_id: string }> = readJson(process.env.SYNTH_CAST) ?? {}
const AXE = process.env.SYNTH_AXE
const OUT = path.resolve('test-results/phase8-synthetic')
const SHOTS = path.join(OUT, 'screenshots')
const MATRIX_LOG = path.join(OUT, 'matrix.jsonl')
const WIDTHS = [1440, 1280, 1024, 768, 375]
const SHOT_WIDTHS = new Set([1440, 375])
const ERROR_TEXT = /Something went wrong|Application error|Unhandled Runtime Error|This page could not be found/i

async function asRole(browser: Browser, role: SynthRole, width = 1440): Promise<Page> {
  const context = await browser.newContext({
    storageState: path.join(STATE_DIR, `${role}.json`),
    viewport: { width, height: width <= 768 ? 900 : 1000 },
  })
  return context.newPage()
}

const record = (row: Record<string, unknown>) => {
  fs.mkdirSync(OUT, { recursive: true })
  fs.appendFileSync(MATRIX_LOG, JSON.stringify(row) + '\n')
}

const repPath = (key: string) => `/team/${CAST[key]?.rep_id}`

const ROUTES: Record<string, string[]> = {
  // /accounts is admin/owner only (RELAY_OPERATIONS_WORKSPACE_V2 §8.13); ACCOUNTS_ADMIN_ONLY checks the redirect.
  rep1: ['/dashboard', '/leads', '/chats', '/tasks', '/notifications', '/performance'],
  manager: ['/dashboard', '/team', '/team/activity', '/team/performance', '/team/tasks', '/team/groups', '/chats', '/notifications', repPath('rep1')],
  admin: ['/dashboard', '/team', '/team/activity', '/team/performance', '/team/tasks', '/team/groups', '/chats', '/accounts', '/notifications', repPath('rep3')],
  owner: ['/dashboard', '/team', '/team/performance', '/accounts'],
  adminb: ['/dashboard', '/team', '/chats', '/accounts'],
}
const FULL_WIDTH_ROLES = new Set(['rep1', 'admin'])

test.describe('MATRIX', () => {
  for (const [role, routes] of Object.entries(ROUTES)) {
    for (const route of routes) {
      test(`${role} ${route}`, async ({ browser }) => {
        const widths = FULL_WIDTH_ROLES.has(role) ? WIDTHS : [1440, 375]
        for (const width of widths) {
          const page = await asRole(browser, role as SynthRole, width)
          const pageErrors: string[] = []
          const consoleErrors: string[] = []
          page.on('pageerror', (e) => pageErrors.push(e.message))
          page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)))
          const started = Date.now()
          const response = await page.goto(route, { waitUntil: 'networkidle' })
          const wallMs = Date.now() - started
          const status = response?.status() ?? 0
          const finalPath = new URL(page.url()).pathname
          const bodyText = (await page.locator('body').innerText()).slice(0, 20_000)
          const timing = await page.evaluate(() => {
            const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
            return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), bytes: n.transferSize } : null
          })
          const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          let axe: { critical: number; serious: number; rules: string[] } | null = null
          if (AXE && SHOT_WIDTHS.has(width)) {
            await page.addScriptTag({ path: AXE })
            axe = await page.evaluate(async () => {
              // @ts-expect-error injected
              const r = await window.axe.run(document, { resultTypes: ['violations'] })
              const v = r.violations as Array<{ id: string; impact: string }>
              return {
                critical: v.filter((x) => x.impact === 'critical').length,
                serious: v.filter((x) => x.impact === 'serious').length,
                rules: v.filter((x) => x.impact === 'critical' || x.impact === 'serious').map((x) => `${x.impact}:${x.id}`),
              }
            })
          }
          if (SHOT_WIDTHS.has(width)) {
            fs.mkdirSync(SHOTS, { recursive: true })
            const name = `${role}${route.replace(/[^a-z0-9]+/gi, '_')}_${width}.png`.replace(/_+/g, '_')
            await page.screenshot({ path: path.join(SHOTS, name), fullPage: true })
          }
          const errorBoundary = ERROR_TEXT.test(bodyText)
          record({ role, route, width, status, finalPath, wallMs, timing, overflowPx, errorBoundary, pageErrors, consoleErrors: consoleErrors.length, axe })
          await page.context().close()

          expect.soft(status, `${role} ${route} @${width} status`).toBeLessThan(400)
          expect.soft(errorBoundary, `${role} ${route} @${width} error boundary`).toBe(false)
          expect.soft(pageErrors, `${role} ${route} @${width} uncaught errors`).toEqual([])
          expect.soft(overflowPx, `${role} ${route} @${width} horizontal overflow`).toBeLessThanOrEqual(1)
          if (axe) expect.soft(axe.critical, `${role} ${route} @${width} axe critical: ${axe.rules.join(', ')}`).toBe(0)
        }
      })
    }
  }
})

test.describe('SCOPE', () => {
  test('MANAGER_TEAM: the manager sees their team, not another team', async ({ browser }) => {
    const page = await asRole(browser, 'manager')
    await page.goto('/team', { waitUntil: 'networkidle' })
    const text = await page.locator('main').innerText()
    expect(text).toContain('Ava Rep')
    expect(text).toContain('Ben Rep')
    expect(text).not.toContain('Cara Rep')
  })

  test('ADMIN_TEAM: an admin sees the whole organization', async ({ browser }) => {
    const page = await asRole(browser, 'admin')
    await page.goto('/team', { waitUntil: 'networkidle' })
    const text = await page.locator('main').innerText()
    for (const name of ['Ava Rep', 'Ben Rep', 'Cara Rep', 'Mara Manager']) expect(text).toContain(name)
  })

  test('REP_NO_TEAM: a rep cannot open the team workspace', async ({ browser }) => {
    const page = await asRole(browser, 'rep1')
    const res = await page.goto('/team', { waitUntil: 'networkidle' })
    const text = await page.locator('body').innerText()
    const blocked = !new URL(page.url()).pathname.startsWith('/team') || (res?.status() ?? 200) >= 400 || !text.includes('Ben Rep')
    expect(blocked).toBe(true)
  })

  test('REP360_GUARD: a manager cannot open a rep outside their team; an admin can', async ({ browser }) => {
    const manager = await asRole(browser, 'manager')
    const res = await manager.goto(repPath('rep3'), { waitUntil: 'networkidle' })
    const managerText = await manager.locator('body').innerText()
    expect((res?.status() ?? 200) === 404 || !managerText.includes('Cara Rep')).toBe(true)
    await manager.goto(repPath('rep1'), { waitUntil: 'networkidle' })
    await expect(manager.getByRole('heading', { name: 'Ava Rep', exact: true })).toBeVisible()
    const admin = await asRole(browser, 'admin')
    await admin.goto(repPath('rep3'), { waitUntil: 'networkidle' })
    await expect(admin.getByRole('heading', { name: 'Cara Rep', exact: true })).toBeVisible()
  })

  test('ACCOUNTS_ADMIN_ONLY: reps and managers are sent home; an admin sees every company', async ({ browser }) => {
    for (const role of ['rep1', 'manager'] as const) {
      const page = await asRole(browser, role)
      await page.goto('/accounts', { waitUntil: 'networkidle' })
      expect(new URL(page.url()).pathname, role).toBe('/dashboard')
    }
    const admin = await asRole(browser, 'admin')
    await admin.goto('/accounts', { waitUntil: 'networkidle' })
    await expect(admin.getByText('Analytics 00 (synthetic)').first()).toBeVisible()
  })

  test('XORG: org B sees nothing of org A', async ({ browser }) => {
    const page = await asRole(browser, 'adminb')
    for (const route of ['/team', '/accounts', '/chats', '/dashboard']) {
      await page.goto(route, { waitUntil: 'networkidle' })
      const text = await page.locator('body').innerText()
      for (const leak of ['Ava Rep', 'Mara Manager', 'Northwind', 'Analytics 00 (synthetic)']) {
        expect(text, `${route} leaks "${leak}"`).not.toContain(leak)
      }
    }
  })
})

test.describe('FUNCTIONAL', () => {
  test('REP_HOME_SCOREBOARD: today’s connections equal the seeded executed sends', async ({ browser }) => {
    test.skip(!TRUTH, 'needs SYNTH_TRUTH')
    const page = await asRole(browser, 'rep1')
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    const board = page.getByRole('region', { name: 'Personal scoreboard' })
    await expect(board).toBeVisible()
    const value = await board.getByText('Connections sent', { exact: true }).locator('xpath=following-sibling::p[1]').innerText()
    expect(Number(value)).toBe(TRUTH.today.rep1.connections)
  })

  test('NOTIFICATIONS: opening an unread notification marks it read', async ({ browser }) => {
    const page = await asRole(browser, 'rep1')
    const before = await (await page.request.get('/api/notifications-app')).json()
    expect(before.available).not.toBe(false)
    expect(before.unread).toBeGreaterThan(0)
    await page.goto('/notifications', { waitUntil: 'networkidle' })
    const first = page.locator('main a[href]').filter({ hasText: /New task assigned|New reply/ }).first()
    await first.click()
    await page.waitForLoadState('networkidle')
    await expect.poll(async () => (await (await page.request.get('/api/notifications-app')).json()).unread).toBe(before.unread - 1)
  })

  test('TASKS: an assignee sees their task; a peer does not', async ({ browser }) => {
    const rep2 = await asRole(browser, 'rep2')
    await rep2.goto('/tasks', { waitUntil: 'networkidle' })
    // Seeded due three days ago, so it lives under Overdue, not Today.
    await rep2.getByRole('tab', { name: 'Overdue' }).click()
    await expect(rep2.getByText('Review follow-up copy (synthetic)').first()).toBeVisible()
    const rep1 = await asRole(browser, 'rep1')
    await rep1.goto('/tasks', { waitUntil: 'networkidle' })
    await rep1.getByRole('tab', { name: 'All' }).click()
    await expect(rep1.getByText('Call the Harbor Analytics champion (synthetic)').first()).toBeVisible()
    await expect(rep1.getByText('Review follow-up copy (synthetic)')).toHaveCount(0)
  })

  test('CMDK: the palette opens with ⌘K and finds a lead by company', async ({ browser }) => {
    const page = await asRole(browser, 'admin')
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await page.keyboard.press('ControlOrMeta+k')
    const input = page.getByPlaceholder('Search people, companies, leads, tasks — or a command')
    await expect(input).toBeVisible()
    await input.fill('Harbor')
    await expect(page.getByRole('dialog').getByText(/Harbor/).first()).toBeVisible({ timeout: 15_000 })
  })

  test('CHAT_PREVIEW_EGRESS: the inbox never renders a full long message body', async ({ browser }) => {
    const page = await asRole(browser, 'rep1')
    await page.goto('/chats', { waitUntil: 'networkidle' })
    const html = await page.content()
    expect(html).not.toContain('We are evaluating vendors this quarter. '.repeat(3))
  })

  test('SAVED_VIEWS: create, list, delete (API, as the signed-in manager)', async ({ browser }) => {
    const page = await asRole(browser, 'manager')
    const created = await page.request.post('/api/saved-views', { data: { surface: 'accounts', name: 'Synthetic view', query: 'q=harbor' } })
    expect(created.status()).toBe(201)
    const { view } = await created.json()
    const list = await (await page.request.get('/api/saved-views?surface=accounts')).json()
    expect(list.views.map((v: { id: string }) => v.id)).toContain(view.id)
    const peer = await asRole(browser, 'rep1')
    const peerList = await (await peer.request.get('/api/saved-views?surface=accounts')).json()
    expect(peerList.views.map((v: { id: string }) => v.id)).not.toContain(view.id)
    expect((await page.request.delete(`/api/saved-views/${view.id}`)).status()).toBe(200)
  })
})
