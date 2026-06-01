/**
 * Multi-role access spec — verifies each enterprise staff role
 * can reach expected pages and sees role-appropriate UI.
 *
 * Requires: supabase local running + seed applied (pnpm run supa db reset).
 * Run: npx playwright test tests/enterprise/multi-role-access.spec.ts --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const PASSWORD   = 'TestPass123!'
const ORG_SLUG   = 'crossfit-test-norte'

/** Login for enterprise-only staff (no coach account) */
async function orgLogin(page: Page, email: string) {
    await page.goto('/org/login')
    await page.fill('input[id="org-email"]', email)
    await page.fill('input[id="org-password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(url => !url.href.includes('/login') && !url.href.includes('/workspace/select'), { timeout: 12_000 })
}

/** Login for coach who also has an org owner role */
async function coachOrgLogin(page: Page, email: string, orgSlug: string) {
    await page.goto('/login')
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 12_000 })
    // Navigate directly to org after login
    await page.goto(`/org/${orgSlug}`)
    await page.waitForURL(url => !url.href.includes('/login'), { timeout: 8_000 })
}

test.describe('Multi-role enterprise access', () => {

    // ── Each role can reach the dashboard ─────────────────────────────────────

    test('org_owner: dashboard accessible (coach+owner)', async ({ page }) => {
        // Owner A is also a coach — uses coach login then navigates to org
        await coachOrgLogin(page, 'coach-owner-a@eva-test.cl', ORG_SLUG)
        await expect(page.locator('text=CrossFit Test Norte').first()).toBeVisible({ timeout: 8000 })
        // Owner has NO role focus banner (sees full dashboard)
        await expect(page.locator('text=Admin enterprise')).not.toBeVisible()
    })

    test('org_admin: dashboard accessible + banner visible', async ({ page }) => {
        await orgLogin(page, 'org-owner-nocoach@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}`)
        await expect(page.locator('text=Admin enterprise').first()).toBeVisible({ timeout: 8000 })
    })

    test('ops: dashboard accessible + Operaciones banner', async ({ page }) => {
        await orgLogin(page, 'staff-ops-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}`)
        await expect(page.locator('text=Operaciones').first()).toBeVisible({ timeout: 8000 })
    })

    test('analyst: dashboard accessible + Solo lectura banner', async ({ page }) => {
        await orgLogin(page, 'staff-analyst-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}`)
        await expect(page.locator('text=Analista').first()).toBeVisible({ timeout: 8000 })
    })

    test('brand_manager: dashboard accessible + Marca banner', async ({ page }) => {
        await orgLogin(page, 'staff-brand-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}`)
        await expect(page.locator('text=Marca').first()).toBeVisible({ timeout: 8000 })
    })

    // ── Role-specific page access ──────────────────────────────────────────────

    test('ops: can access /clients', async ({ page }) => {
        await orgLogin(page, 'staff-ops-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}/clients`)
        expect(page.url()).toContain('/clients')
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 8000 })
    })

    test('ops: can access /assignments', async ({ page }) => {
        await orgLogin(page, 'staff-ops-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}/assignments`)
        expect(page.url()).toContain('/assignments')
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 8000 })
    })

    test('brand_manager: can access /brand', async ({ page }) => {
        await orgLogin(page, 'staff-brand-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}/brand`)
        expect(page.url()).toContain('/brand')
        await expect(page.locator('text=Brand Center').first()).toBeVisible({ timeout: 8000 })
    })

    test('analyst: can access /reports', async ({ page }) => {
        await orgLogin(page, 'staff-analyst-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}/reports`)
        expect(page.url()).toContain('/reports')
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 8000 })
    })

    test('analyst: can access /audit', async ({ page }) => {
        await orgLogin(page, 'staff-analyst-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}/audit`)
        expect(page.url()).toContain('/audit')
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 8000 })
    })

    // ── Action queue is role-filtered ──────────────────────────────────────────

    test('analyst: no assignment actions in queue', async ({ page }) => {
        await orgLogin(page, 'staff-analyst-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}`)
        await expect(page.locator('text=CrossFit Test Norte').first()).toBeVisible({ timeout: 8000 })
        // Analyst should NOT see operational assign mutations in the queue
        await expect(page.locator('text=Asignar alumnos sin coach')).not.toBeVisible()
    })

    test('brand_manager: no assignment/client actions in queue', async ({ page }) => {
        await orgLogin(page, 'staff-brand-a@eva-test.cl')
        await page.goto(`/org/${ORG_SLUG}`)
        await expect(page.locator('text=CrossFit Test Norte').first()).toBeVisible({ timeout: 8000 })
        // Brand manager's action queue only shows brand items
        await expect(page.locator('text=Asignar alumnos sin coach')).not.toBeVisible()
    })

    // ── Cross-org isolation (roles can't see other orgs) ──────────────────────

    test('ops org_a cannot access org_b dashboard', async ({ page }) => {
        await orgLogin(page, 'staff-ops-a@eva-test.cl')
        await page.goto('/org/box-test-sur')
        // Should redirect away — not a member of org_b
        await page.waitForURL(url => !url.href.includes('/org/box-test-sur'), { timeout: 8000 })
    })

})
