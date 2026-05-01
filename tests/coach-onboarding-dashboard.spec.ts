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
