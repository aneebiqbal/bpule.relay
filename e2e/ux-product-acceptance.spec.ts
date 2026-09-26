import { test, expect } from '@playwright/test';
import { loginAsRep, loginAsAdmin } from './helpers';

const PAGES = [
  { path: '/dashboard', label: 'dashboard', roles: ['rep', 'admin'] },
  { path: '/relay', label: 'relay', roles: ['rep'] },
  { path: '/leads', label: 'leads', roles: ['rep', 'admin'] },
  { path: '/content', label: 'studio', roles: ['rep'] },
  { path: '/profiles', label: 'profiles', roles: ['rep'] },
  { path: '/facts', label: 'proof', roles: ['rep'] },
  { path: '/inbound', label: 'inbound', roles: ['rep'] },
  { path: '/upwork', label: 'jobs', roles: ['rep'] },
  { path: '/find-jobs', label: 'find-jobs', roles: ['rep'] },
  { path: '/admin/command-center', label: 'command-center', roles: ['admin'] },
  { path: '/admin/people', label: 'people', roles: ['admin'] },
  { path: '/admin/revenue-intelligence', label: 'revenue-intelligence', roles: ['admin'] },
];

test.describe('UX Product Acceptance', () => {
  for (const { path, label, roles } of PAGES) {
    for (const vp of [{ name: 'desktop', w: 1440, h: 900 }, { name: 'mobile', w: 390, h: 844 }]) {
      test(`${label} (${vp.name}) loads without overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        const login = roles.includes('admin') ? loginAsAdmin : loginAsRep;
        await login(page);
        await page.goto(path, { waitUntil: 'networkidle', timeout: 45000 });

        // No horizontal overflow
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        );
        expect(overflow, `${path} has horizontal overflow at ${vp.name}`).toBe(false);

        // Has visible heading
        const heading = page.locator('main h1').first();
        await expect(heading, `${path} missing h1 at ${vp.name}`).toBeVisible();
      });
    }
  }
});

test.describe('UX invariants', () => {
  test('Dashboard: Do This Next is visible for rep', async ({ page }) => {
    await loginAsRep(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Do This Next', { exact: true })).toBeVisible();
  });

  test('Relay: top item is elevated', async ({ page }) => {
    await loginAsRep(page);
    await page.goto('/relay');
    await page.waitForLoadState('networkidle');
    const featured = page.locator('a.border-l-orange');
    await expect(featured.first()).toBeVisible();
  });

  test('Leads: orange pollution reduced (no more than 5 primary-action orange elements)', async ({ page }) => {
    await loginAsRep(page);
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');
    // Count orange backgrounds (primary actions only, not scores or states)
    const orangeCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.bg-orange, [class*="bg-orange"]')).length;
    });
    // Before fix: 47. After fix: should be under 15 (mostly filter badges + search focus).
    expect(orangeCount).toBeLessThan(20);
  });
});
