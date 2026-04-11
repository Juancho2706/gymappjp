import path from 'path'
import { expect, test } from '@playwright/test'

const slug = process.env.E2E_COACH_SLUG
const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD

const tinyPng = path.join(__dirname, 'fixtures', 'checkin-tiny.png')

test.describe('QA-015 student check-in flow', () => {
    test('three steps with optional photos', async ({ page }) => {
        test.skip(
            !slug || !email || !password,
            'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD'
        )

        await page.goto(`/c/${slug}/login`)
        await page.getByLabel('Email').fill(email!)
        await page.getByLabel('Contraseña').fill(password!)
        await page.getByRole('button', { name: 'Ingresar' }).click()
        await page.waitForURL(new RegExp(`/c/${slug}/`), { timeout: 45_000 })

        await page.goto(`/c/${slug}/check-in`)

        await page.getByLabel('Peso actual (kg)').fill('75.2')
        await page.getByRole('button', { name: /Continuar/i }).click()

        const fileInputs = page.locator('input[type="file"]')
        await fileInputs.nth(0).setInputFiles(tinyPng)
        await fileInputs.nth(1).setInputFiles(tinyPng)
        await page.getByRole('button', { name: /Continuar/i }).click()

        await page.getByRole('button', { name: 'Enviar Check-in' }).click()
        await expect(page.getByRole('heading', { name: '¡Check-in Enviado!' })).toBeVisible({
            timeout: 45_000,
        })
    })
})
