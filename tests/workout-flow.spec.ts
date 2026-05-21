import { expect, test } from '@playwright/test'

const slug = process.env.E2E_COACH_SLUG
const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD
const planId = process.env.E2E_WORKOUT_PLAN_ID

test.describe('QA-014 student workout flow', () => {
    test('login → workout → completar → summary', async ({ page }) => {
        test.setTimeout(90_000)
        test.skip(
            !slug || !email || !password || !planId,
            'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD, E2E_WORKOUT_PLAN_ID'
        )

        await page.goto('/')
        await page.evaluate(async () => {
            const registrations = await navigator.serviceWorker?.getRegistrations?.()
            await Promise.all((registrations ?? []).map((registration) => registration.unregister()))
        })

        await page.goto(`/c/${slug}/login`)
        await page.getByLabel('Email').fill(email!)
        await page.getByLabel('Contraseña').fill(password!)
        await page.getByRole('button', { name: 'Ingresar' }).click()
        await page.waitForTimeout(1500)

        await page.goto(`/c/${slug}/workout/${planId}`)
        await expect(page).toHaveURL(new RegExp(`/c/${slug}/workout/${planId}`), { timeout: 30_000 })

        const acceptCookies = page.getByRole('button', { name: 'Aceptar' })
        if (await acceptCookies.isVisible().catch(() => false)) {
            await acceptCookies.click()
        }

        const finishButton = page.getByRole('button', { name: 'Finalizar entrenamiento' })
        await expect(finishButton).toBeVisible({ timeout: 30_000 })

        await finishButton.click()
        await finishButton.dispatchEvent('click')
        await expect(page.getByRole('heading', { name: /Sesi.n completada/i })).toBeVisible({
            timeout: 10_000,
        })
        await expect(page.getByRole('button', { name: /Volver al inicio/i })).toBeVisible()
    })
})
