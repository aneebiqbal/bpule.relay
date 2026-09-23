import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers'

type TargetPayload = {
  targets: Array<{
    id: string
    repId: string
    revenueIdentityId: string
    activityType: string
    targetCount: number
    active: boolean
  }>
  identities: Array<{
    id: string
    identityName: string
    channel: 'linkedin' | 'email' | 'upwork' | 'other'
    status: string
  }>
  reps: Array<{ id: string; name: string }>
  defaults: Record<string, Array<{ activityType: string; targetCount: number }>>
}

async function loadTargetsPayload(page: Page): Promise<TargetPayload> {
  const res = await page.request.get('/api/admin/targets')
  expect(res.ok()).toBe(true)
  return await res.json() as TargetPayload
}

async function openAssignForm(page: Page): Promise<void> {
  const addButton = page.getByRole('button', { name: /Add daily pack|Hide form/i })
  await expect(addButton).toBeVisible({ timeout: 10_000 })
  if (await page.getByRole('button', { name: /Add daily pack/i }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /Add daily pack/i }).click()
  }
  await expect(page.locator('#target-identity')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('#target-rep')).toBeVisible({ timeout: 10_000 })
}

test.describe('ADMIN /admin/targets - complete feature', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('T01: Targets page renders with identity lanes', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')

    const body = await page.textContent('body')
    expect(body).toContain('Targets')
    expect(body?.toLowerCase()).not.toContain('failed to load')
    expect(body?.length).toBeGreaterThan(100)
  })

  test('T02: Revenue identity channels render from canonical admin contract', async ({ page }) => {
    const payload = await loadTargetsPayload(page)
    const activeIdentities = payload.identities.filter((identity) => identity.status !== 'archived')
    expect(activeIdentities.length).toBeGreaterThan(0)

    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')
    await openAssignForm(page)

    const optionTexts = await page.locator('#target-identity option').allTextContents()
    for (const identity of activeIdentities.slice(0, 5)) {
      const expectedSnippet = `${identity.identityName} . ${identity.channel}`.replace(' . ', ' · ')
      const found = optionTexts.some((text) => text.includes(identity.identityName) && text.toLowerCase().includes(identity.channel))
      expect(found, `Missing identity option for ${expectedSnippet}`).toBe(true)
    }

    const hasUnexpectedChannel = optionTexts.some((text) => {
      const lower = text.toLowerCase()
      if (!lower.includes('·')) return false
      return !lower.includes('linkedin') && !lower.includes('email') && !lower.includes('upwork') && !lower.includes('other')
    })
    expect(hasUnexpectedChannel).toBe(false)
  })

  test('T03: Create target form is functional', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')
    await openAssignForm(page)

    const form = page.locator('#target-identity, #target-rep').first()
    await expect(form).toBeVisible({ timeout: 5_000 })
  })

  test('T04: Existing targets show correct identity names', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1_000)

    const body = await page.textContent('body')
    const hasEmptyState = body?.includes('No targets assigned yet')
    if (hasEmptyState) {
      expect(hasEmptyState).toBeTruthy()
      return
    }

    const payload = await loadTargetsPayload(page)
    const activeNames = payload.identities.filter((identity) => identity.status !== 'archived').map((identity) => identity.identityName)
    const hasKnownIdentity = activeNames.some((name) => body?.includes(name))
    expect(hasKnownIdentity).toBeTruthy()
  })

  test('T05: Page survives hard refresh', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1_000)

    const body = await page.textContent('body')
    expect(body).toContain('Targets')
    expect(body?.toLowerCase()).not.toContain('failed')
  })

  test('T06: Add daily pack applies default allocation and renders lane', async ({ page }) => {
    const before = await loadTargetsPayload(page)
    const activeIdentities = before.identities.filter((identity) => identity.status !== 'archived')
    expect(activeIdentities.length).toBeGreaterThan(0)
    expect(before.reps.length).toBeGreaterThan(0)

    const identity = activeIdentities[0]
    const rep = before.reps[0]
    const expectedDefaults = before.defaults[identity.channel] ?? []
    expect(expectedDefaults.length).toBeGreaterThan(0)

    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')
    await openAssignForm(page)

    await page.selectOption('#target-identity', identity.id)
    await expect(page.locator('#target-rep')).toBeEnabled()
    await page.selectOption('#target-rep', rep.id)

    const assignButton = page.getByRole('button', { name: /^Assign daily pack$/ })
    await expect(assignButton).toBeEnabled()
    await assignButton.click()

    await expect(page.getByRole('button', { name: /Add daily pack/i })).toBeVisible({ timeout: 10_000 })

    const after = await loadTargetsPayload(page)
    const relevantTargets = after.targets.filter(
      (target) => target.repId === rep.id && target.revenueIdentityId === identity.id && target.active,
    )
    expect(relevantTargets.length).toBeGreaterThanOrEqual(expectedDefaults.length)

    for (const rule of expectedDefaults) {
      const matched = relevantTargets.find((target) => target.activityType === rule.activityType)
      expect(matched, `Missing allocation for ${rule.activityType}`).toBeTruthy()
      expect((matched?.targetCount ?? 0) > 0).toBe(true)
    }

    const repLane = page.locator('main article').filter({ hasText: rep.name }).first()
    await expect(repLane).toBeVisible({ timeout: 10_000 })
    await expect(repLane.getByText(identity.identityName, { exact: false }).first()).toBeVisible({ timeout: 10_000 })
  })
})
