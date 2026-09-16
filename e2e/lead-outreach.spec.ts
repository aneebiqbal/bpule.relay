import { test, expect } from '@playwright/test'
import { bootstrapDemoProfile } from './helpers'

test.describe('LEAD -> Outreach', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapDemoProfile('http://localhost:3000').catch(() => {})
    await page.context().request.post('/api/onboarding', {
      data: {
        quiz: {
          contractions: 'sometimes',
          formality: 3,
          sentenceLength: 'medium',
          punctuation: 'standard',
          openers: 'statement',
          emoji: 'none',
          greeting: 'Hey',
          signOff: 'Best',
          neverWords: '',
          preferredWords: '',
        },
        samples: 'demo',
      },
    })
  })

  test('L01: Create lead from new lead form', async ({ page }) => {
    await page.goto('/leads/new')
    await page.waitForLoadState('networkidle')

    // Form fields only appear after extraction — paste research first
    const rawText = 'Sarah Chen is VP Engineering at Acme Example Co in San Francisco, CA. They are hiring senior Rails engineers to rebuild the patient messaging platform. Sarah posted: "We need a partner who can take the mobile app over."'
    await page.locator('#raw-input').fill(rawText)

    const extractBtn = page.getByRole('button', { name: /Extract/i })
    await expect(extractBtn).toBeVisible()
    await extractBtn.click()

    // Wait for extracted fields to appear
    await expect(page.getByLabel('Company')).toBeVisible({ timeout: 15_000 })

    await page.getByLabel('Company').fill('Acme Example Co')
    await page.getByLabel('Contact name').fill('Sarah Chen')
    await page.getByLabel('Title (as shown)').fill('VP Engineering')
    await page.getByLabel('Location (as shown)').fill('San Francisco, CA')
    await page.getByLabel('Signal evidence').fill('Hiring senior Rails engineers to rebuild the patient messaging platform.')
    await page.getByLabel('Verbatim quote (their words)').fill('We need a partner who can take the mobile app over.')

    const saveBtn = page.getByRole('button', { name: /Save lead/i })
    await expect(saveBtn).toBeVisible()
    await saveBtn.click()

    await page.waitForURL('**/leads/**', { timeout: 20_000 })
    expect(page.url()).toMatch(/\/leads\/[a-zA-Z0-9-]+/)
  })

  test('L02: Duplicate lead shows conflict', async ({ page }) => {
    await page.goto('/leads/new')
    await page.waitForLoadState('networkidle')

    // First create: paste research, extract, fill, save
    const rawText = 'Sarah Chen is VP Engineering at Acme Example Co in San Francisco, CA. They are hiring senior Rails engineers to rebuild the patient messaging platform. Sarah posted: "We need a partner who can take the mobile app over."'
    await page.locator('#raw-input').fill(rawText)
    await page.getByRole('button', { name: /Extract/i }).click()
    await expect(page.getByLabel('Company')).toBeVisible({ timeout: 15_000 })

    await page.getByLabel('Company').fill('Acme Example Co')
    await page.getByLabel('Contact name').fill('Sarah Chen')
    await page.getByLabel('Title (as shown)').fill('VP Engineering')
    await page.getByLabel('Signal evidence').fill('Hiring senior Rails engineers to rebuild the patient messaging platform.')

    const saveBtn1 = page.getByRole('button', { name: /Save lead/i })
    await saveBtn1.click()

    await page.waitForURL('**/leads/**', { timeout: 20_000 })

    // Second create: same company/contact — should trigger duplicate detection
    await page.goto('/leads/new')
    await page.waitForLoadState('networkidle')

    await page.locator('#raw-input').fill(rawText)
    await page.getByRole('button', { name: /Extract/i }).click()
    await expect(page.getByLabel('Company')).toBeVisible({ timeout: 15_000 })

    await page.getByLabel('Company').fill('Acme Example Co')
    await page.getByLabel('Contact name').fill('Sarah Chen')
    await page.getByLabel('Title (as shown)').fill('VP Engineering')
    await page.getByLabel('Signal evidence').fill('Hiring senior Rails engineers to rebuild the patient messaging platform.')

    const saveBtn2 = page.getByRole('button', { name: /Save lead/i })
    await saveBtn2.click()

    // Wait for the blocked alert to appear (409 conflict sets `blocked` state)
    const conflictAlert = page.locator('text=/duplicate|already exists|existing/i').first()
    await expect(conflictAlert).toBeVisible({ timeout: 10_000 })
  })
})
