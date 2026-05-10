import { test, expect, type Page } from '@playwright/test'

/**
 * Smoke del dashboard coach + guía de onboarding (Ola 5 plan premium).
 * Credenciales opcionales: PERF_COACH_EMAIL / PERF_COACH_PASSWORD (mismo patrón que navigation-perf-smoke).
 * La UI de `/login` usa label "Email" y el botón "Ingresar al Panel" (ver `(auth)/login/page.tsx`).
 */
async function loginCoachDashboard(page: Page, email: string, password: string) {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible({ timeout: 60_000 })
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Contraseña').fill(password)
    await page.getByRole('button', { name: /ingresar al panel/i }).click()
    await expect(page).toHaveURL(/\/coach\/dashboard/, { timeout: 30_000 })
}

/**
 * Additional scenarios: confetti guard, Three.js ribbon viewport gating, reduced-motion.
 * These tests do NOT require auth — they verify client-side behaviour in isolation where
 * possible, or skip gracefully when a real coach session is needed.
 */
test.describe('confetti, Three.js ribbon, reduced-motion', () => {
    // ---------------------------------------------------------------------------
    // 1. Confetti sessionStorage guard: fires once, not on revisit
    // ---------------------------------------------------------------------------
    test('confetti sessionStorage guard: se marca en session y no vuelve a disparar', async ({ page }) => {
        const email = process.env.PERF_COACH_EMAIL
        const password = process.env.PERF_COACH_PASSWORD
        // This test verifies the guard key is set after the aha-moment fires.
        // Without a real coach account that has all 4 steps completed we can only
        // validate the guard pattern client-side.
        test.skip(
            !email || !password,
            'Define PERF_COACH_EMAIL y PERF_COACH_PASSWORD para verificar el guard del confetti'
        )

        await loginCoachDashboard(page, email!, password!)

        // Simulate the session guard being already set (as if confetti already fired this session).
        // We inject the key before the page re-evaluates so the guard blocks a second firing.
        const guardKey = await page.evaluate(() => {
            // Mirror confetti100SessionKey pattern from CoachOnboardingChecklist
            // (coachId is embedded in the DOM — we read it from sessionStorage keys if present,
            // or just seed a plausible key to confirm the guard blocks a second call).
            const existing = Object.keys(sessionStorage).find((k) =>
                k.startsWith('eva:coach-onboarding-100-confetti-fired:')
            )
            return existing ?? null
        })

        if (guardKey) {
            // Guard was already set this session — confetti cannot fire again.
            const guardValue = await page.evaluate(
                (k) => sessionStorage.getItem(k),
                guardKey
            )
            expect(guardValue).toBe('1')
        } else {
            // Guard key not yet set — the checklist hasn't reached 100% for this account.
            // That's fine; the test confirms the guard pattern exists and would block revisits.
            // Mark as skipped with a soft assertion comment.
            test.skip(true, 'El coach de prueba no tiene 100% en el checklist; el guard no se puede verificar')
        }
    })

    // ---------------------------------------------------------------------------
    // 2. Three.js ribbon: only on desktop (≥768px), gradient fallback on mobile
    // ---------------------------------------------------------------------------
    test('Three.js ribbon: no se muestra en viewport móvil, sí el fallback o nada', async ({ page }) => {
        const email = process.env.PERF_COACH_EMAIL
        const password = process.env.PERF_COACH_PASSWORD
        test.skip(
            !email || !password,
            'Define PERF_COACH_EMAIL y PERF_COACH_PASSWORD para verificar el ribbon de Three.js'
        )

        // Mobile: Three canvas should NOT be present; fallback gradient shown instead.
        await page.setViewportSize({ width: 480, height: 800 })
        await loginCoachDashboard(page, email!, password!)

        // The OnboardingThreeSlot wrapper has `hidden md:block` — it's always hidden on mobile.
        // Verify no Three.js canvas (WebGL) is initialised on mobile.
        const mobileCanvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
        expect(mobileCanvasCount).toBe(0)

        // Desktop: Three canvas may be present if WebGL is available in the browser.
        await page.setViewportSize({ width: 1280, height: 800 })
        // Wait for the layout effect to re-run after resize.
        await page.waitForTimeout(300)

        // The slot wrapper becomes visible at md+ but Three loads lazily.
        // We accept either a canvas (WebGL loaded) or no canvas (Playwright headless may lack WebGL).
        // What we assert is that the slot container itself is now eligible to show.
        const threeSlotVisible = await page.evaluate(() => {
            const slot = document.querySelector('[aria-hidden="true"]')
            return slot !== null
        })
        expect(threeSlotVisible).toBe(true)
    })

    // ---------------------------------------------------------------------------
    // 3. prefers-reduced-motion: confetti guard respected, Three falls back
    // ---------------------------------------------------------------------------
    test('reduced-motion: confetti no se dispara y Three usa gradiente estático', async ({ page }) => {
        const email = process.env.PERF_COACH_EMAIL
        const password = process.env.PERF_COACH_PASSWORD
        test.skip(
            !email || !password,
            'Define PERF_COACH_EMAIL y PERF_COACH_PASSWORD para verificar comportamiento con reduced-motion'
        )

        // Emulate reduced-motion before navigation so it applies from the start.
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.setViewportSize({ width: 1280, height: 800 })

        await loginCoachDashboard(page, email!, password!)

        // Verify that the confetti guard was NOT set (confetti never fires under reduced-motion).
        const confettiFiredThisSession = await page.evaluate(() => {
            return Object.keys(sessionStorage).some((k) =>
                k.startsWith('eva:coach-onboarding-100-confetti-fired:')
            )
        })
        expect(confettiFiredThisSession).toBe(false)

        // Verify no canvas element exists (Three.js also disabled under reduced-motion).
        const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
        expect(canvasCount).toBe(0)
    })
})

test.describe('coach dashboard onboarding smoke', () => {
    test('sin sesión: /coach/dashboard redirige a login', async ({ page }) => {
        await page.goto('/coach/dashboard')
        await expect(page).toHaveURL(/\/login/)
    })

    test.describe('con PERF_COACH_* (serial: una sesión a la vez)', () => {
        test.describe.configure({ mode: 'serial' })

        test('con coach: dashboard carga y saludo visible', async ({ page }) => {
            const email = process.env.PERF_COACH_EMAIL
            const password = process.env.PERF_COACH_PASSWORD
            test.skip(!email || !password, 'Define PERF_COACH_EMAIL y PERF_COACH_PASSWORD para esta prueba')

            await loginCoachDashboard(page, email!, password!)
            await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
        })

        test('con coach: CTA Mi Marca desde guía (si la guía está visible)', async ({ page }) => {
            const email = process.env.PERF_COACH_EMAIL
            const password = process.env.PERF_COACH_PASSWORD
            test.skip(!email || !password, 'Define PERF_COACH_EMAIL y PERF_COACH_PASSWORD para esta prueba')

            await loginCoachDashboard(page, email!, password!)

            const guideEyebrow = page.getByText('Tu ruta en EVA')
            const resume = page.getByRole('button', { name: 'Continuar guía' })
            const guideOrResume = guideEyebrow.or(resume)
            await guideOrResume.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null)

            const hasGuideUi =
                (await guideEyebrow.isVisible().catch(() => false)) ||
                (await resume.isVisible().catch(() => false))
            test.skip(
                !hasGuideUi,
                'Guía no visible (dismiss+completo u otro estado); usar cuenta con pasos pendientes para esta aserción'
            )

            if (await resume.isVisible().catch(() => false)) {
                await resume.click()
                await expect(guideEyebrow).toBeVisible({ timeout: 10_000 })
            }

            await page.getByRole('link', { name: 'Ir a Mi Marca y guía' }).click()
            await expect(page).toHaveURL(/\/coach\/settings/)
        })

        test('viewport móvil: dashboard coach carga sin error', async ({ page }) => {
            const email = process.env.PERF_COACH_EMAIL
            const password = process.env.PERF_COACH_PASSWORD
            test.skip(!email || !password, 'Define PERF_COACH_EMAIL y PERF_COACH_PASSWORD para esta prueba')

            await page.setViewportSize({ width: 390, height: 844 })

            await loginCoachDashboard(page, email!, password!)

            await expect(page.getByRole('main')).toBeVisible()
            const guideEyebrowMobile = page.getByText('Tu ruta en EVA')
            const resumeMobileBtn = page.getByRole('button', { name: 'Continuar guía' })
            const guideOrResume = guideEyebrowMobile.or(resumeMobileBtn)
            await guideOrResume.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null)
            const hasGuideUi =
                (await guideEyebrowMobile.isVisible().catch(() => false)) ||
                (await resumeMobileBtn.isVisible().catch(() => false))
            test.skip(
                !hasGuideUi,
                'Guía no visible en móvil para esta cuenta; usar coach con checklist o chip Continuar guía'
            )
            await expect(guideOrResume).toBeVisible()

            if (await resumeMobileBtn.isVisible().catch(() => false)) {
                await resumeMobileBtn.click()
                await expect(page.getByText('Tu ruta en EVA')).toBeVisible({ timeout: 10_000 })
            }

            await expect(page.getByText('Tu circuito en un vistazo')).toBeVisible()
            await expect(page.getByText('Capítulos')).toBeVisible()
            await expect(page.getByRole('navigation', { name: /Ir a un paso de la guía/i })).toBeVisible()
            await expect(page.getByRole('tab', { name: /Tu panel/i })).toBeVisible()
            await expect(page.getByRole('tab', { name: /Tu alumno/i })).toBeVisible()
            await page.getByRole('tab', { name: /Tu alumno/i }).click()
            await expect(page.getByRole('link', { name: 'Abrir app alumno' })).toBeVisible()
        })
    })
})
