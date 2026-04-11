import { expect, test } from '@playwright/test'

const coachEmail = process.env.E2E_PAYMENT_COACH_EMAIL
const coachPassword = process.env.E2E_PAYMENT_COACH_PASSWORD

/**
 * Mocks Mercado Pago checkout + confirm so the coach app flow can be exercised without real MP.
 * Best with a coach in `pending_payment` (can open processing). Active coaches are redirected away from processing by middleware.
 */
test.describe('payment flow (mocked MP)', () => {
    test('register flow: create-preference mock returns in-app URL then confirm activates', async ({ page }) => {
        test.setTimeout(120_000)
        test.skip(
            !coachEmail || !coachPassword,
            'Set E2E_PAYMENT_COACH_EMAIL and E2E_PAYMENT_COACH_PASSWORD (coach user)'
        )

        await page.route('**/api/payments/create-preference', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    provider: 'mercadopago',
                    tier: 'starter',
                    billingCycle: 'monthly',
                    amountClp: 14990,
                    subscriptionId: 'e2e-mock-preapproval',
                    checkoutUrl: '/coach/subscription/processing?preapproval_id=e2e-mock-preapproval',
                }),
            })
        })

        await page.route('**/api/payments/confirm-subscription', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ok: true,
                    subscriptionStatus: 'active',
                    providerStatus: 'authorized',
                }),
            })
        })

        await page.goto('/login')
        await page.getByLabel('Email').fill(coachEmail!)
        await page.getByLabel('Contraseña').fill(coachPassword!)
        await page.getByRole('button', { name: 'Ingresar al Panel' }).click()
        await page.waitForURL(/\/coach\/(dashboard|reactivate|subscription)/, { timeout: 45_000 })

        await page.goto('/coach/subscription/processing?from=register&tier=starter&cycle=monthly')

        await page.waitForURL(/\/coach\/dashboard/, { timeout: 60_000 })
        await expect(page).toHaveURL(/subscription=active/)
    })
})
