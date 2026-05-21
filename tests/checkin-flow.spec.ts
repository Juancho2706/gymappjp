import path from 'path'
import { expect, test } from '@playwright/test'

const slug = process.env.E2E_COACH_SLUG
const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD

const tinyPng = path.join(__dirname, 'fixtures', 'checkin-tiny.png')

test.describe('QA-015 student check-in flow', () => {
    test('three steps with optional photos', async ({ page }) => {
        test.setTimeout(90_000)
        test.skip(
            !slug || !email || !password,
            'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD'
        )

        await page.goto(`/c/${slug}/login`)
        await page.getByLabel('Email').fill(email!)
        await page.getByLabel(/Contrase|Password/i).fill(password!)
        await page.getByRole('button', { name: 'Ingresar' }).click()
        await page.waitForTimeout(1500)

        await page.goto(`/c/${slug}/check-in`)
        const weightInput = page.getByLabel('Peso actual (kg)')
        await expect(weightInput).toBeVisible({ timeout: 30_000 })

        await weightInput.click()
        await weightInput.pressSequentially('75.2')
        await expect(page.getByRole('button', { name: /Continuar/i })).toBeEnabled()
        await page.getByRole('button', { name: /Continuar/i }).click()

        const fileInputs = page.locator('input[type="file"]')
        await expect(fileInputs).toHaveCount(2)
        await fileInputs.nth(0).setInputFiles(tinyPng)
        await fileInputs.nth(1).setInputFiles(tinyPng)
        await page.getByRole('button', { name: /Continuar/i }).click()

        await page.getByRole('button', { name: 'Enviar Check-in' }).click()
        await expect(page.getByRole('heading', { name: /Check-in Enviado/i })).toBeVisible({
            timeout: 45_000,
        })
    })
})
