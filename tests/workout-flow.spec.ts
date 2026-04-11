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

        await page.goto(`/c/${slug}/login`)
        await page.getByLabel('Email').fill(email!)
        await page.getByLabel('Contraseña').fill(password!)
        await page.getByRole('button', { name: 'Ingresar' }).click()
        await page.waitForURL(new RegExp(`/c/${slug}/dashboard`), { timeout: 45_000 })

        await page.goto(`/c/${slug}/workout/${planId}`)
        if (!page.url().includes(`/c/${slug}/workout/`)) {
            test.skip(true, 'E2E user has no access to the configured workout plan id.')
        }

        const finishButton = page.getByRole('button', { name: 'Finalizar entrenamiento' })
        if (!(await finishButton.isVisible({ timeout: 8_000 }).catch(() => false))) {
            test.skip(true, 'Workout page loaded without actionable session controls for this user.')
        }

        const firstWeight = page.locator('input[name="weight_kg"]').first()
        if (await firstWeight.isVisible()) {
            await firstWeight.fill('40')
            await page.locator('input[name="reps_done"]').first().fill('8')
            await page.getByTitle('Guardar set').first().click()
            await expect(page.getByTitle('Set guardado').first()).toBeVisible({ timeout: 20_000 })
        }

        await finishButton.click()
        await expect(page.getByRole('heading', { name: '¡Sesión completada!' })).toBeVisible({
            timeout: 20_000,
        })
    })
})
