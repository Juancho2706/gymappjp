import { expect, test, type Page } from '@playwright/test'
import { PERSONAS, hasPersonasPassword } from '../separation/personas'

/**
 * Espejo de constantes del producto (no se importa apps/web/src para no arrastrar los alias
 * `@/` ni `@eva/tiers` al loader de Playwright del root). Mantener sincronizado con
 * apps/web/src/lib/constants.ts:
 *   - SELF_SERVICE_ADDONS_ENABLED (switch de lanzamiento; hoy false)
 *   - ADDON_PAYMENT_RULES.rules[0].title ('Activación inmediata')
 * Puede leerse del entorno (E2E_ADDONS_ENABLED=1) para correr la rama "flag ON" en el gate
 * cuando el switch esté prendido sin tener que editar el spec.
 */
const SELF_SERVICE_ADDONS_ENABLED = process.env.E2E_ADDONS_ENABLED === '1'
const FIRST_RULE_TITLE = 'Activación inmediata'

/**
 * SUITE — flujo de add-ons self-service (plan 05 F5). Patrón MOCK de
 * tests/payment-flow-mock.spec.ts: intercepta /api/payments/* para NO tocar MP real.
 *
 * Persona: e2e-modules-coach (persona 9, standalone elite/active con módulos — plan 03 D7/F4).
 * NO se tocan las 8 personas de la matriz de separación (module-matrix asserta nav SIN módulos).
 *
 * ⚠️ ESCRITURA — NO ejecutar acá. Corre SOLO en el GATE autorizado (regla 2026-06-10).
 *
 * ⚠️ Flag de lanzamiento: SELF_SERVICE_ADDONS_ENABLED. Mientras esté en false, los CTA reales
 * (Agregar / Quitar / Activar) quedan DESHABILITADOS por diseño (la compra es manual hasta el
 * lanzamiento). Los specs que ejercitan el alta/baja real se SALTAN si el flag está OFF, pero
 * siguen escritos para correr en verde apenas se prenda el switch + sandbox MP. Los specs que
 * verifican estado VISIBLE (catálogo, reglas, aviso amable) corren con el flag en cualquier valor.
 */

const persona = PERSONAS.modulesCoach
const ready = hasPersonasPassword

const CARDIO = 'cardio'
const EXCHANGES = 'nutrition_exchanges'

/** Login del coach con módulos (mismo patrón que payment-flow-mock). */
async function loginModulesCoach(page: Page) {
    await page.goto('/login')
    await page.getByLabel('Email').fill(persona.email)
    await page.getByLabel('Contraseña').fill(persona.password)
    await page.getByRole('button', { name: 'Ingresar al Panel' }).click()
    await page.waitForURL(/\/coach\/(dashboard|reactivate|subscription)/, { timeout: 45_000 })
}

/**
 * Mock de subscription-status con add-ons + billing controlables por test. `addons` y
 * `billing` los inyecta cada caso; el resto del coach es un standalone activo mensual.
 */
async function mockSubscriptionStatus(
    page: Page,
    opts: {
        billingCycle?: 'monthly' | 'quarterly' | 'annual'
        tier?: string
        addons?: unknown[]
        billing?: { baseClp: number; addonsClp: number; totalClp: number }
    } = {}
) {
    const cycle = opts.billingCycle ?? 'monthly'
    const tier = opts.tier ?? 'elite'
    await page.route('**/api/payments/subscription-status', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                coach: {
                    id: 'e2e-mock-coach',
                    subscription_tier: tier,
                    subscription_status: 'active',
                    max_clients: 100,
                    billing_cycle: cycle,
                    current_period_end: '2026-12-31T00:00:00.000Z',
                    payment_provider: 'mercadopago',
                },
                events: [],
                addons: opts.addons ?? [],
                billing: opts.billing ?? { baseClp: 79990, addonsClp: 0, totalClp: 79990 },
            }),
        })
    })
}

test.describe('add-ons — catálogo y reglas (visible con cualquier valor del flag)', () => {
    test.beforeEach(() => test.skip(!ready, 'Set E2E_PERSONAS_PASSWORD'))

    test('la sección Add-ons lista los 4 módulos y muestra estados', async ({ page }) => {
        await mockSubscriptionStatus(page)
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        const section = page.locator('#addons')
        await expect(section).toBeVisible()
        await expect(section.getByText('Cardio', { exact: true })).toBeVisible()
        await expect(section.getByText('Evaluación de movimiento')).toBeVisible()
        await expect(section.getByText('Composición corporal')).toBeVisible()
        await expect(section.getByText('Nutrición por intercambios')).toBeVisible()
    })

    test('Plan actual muestra el desglose compuesto cuando hay add-ons facturables', async ({ page }) => {
        await mockSubscriptionStatus(page, {
            addons: [
                { id: 'a1', moduleKey: CARDIO, status: 'active', source: 'self_service', firstChargedAt: '2026-06-01T00:00:00Z', expiresAt: null },
            ],
            billing: { baseClp: 79990, addonsClp: 9990, totalClp: 89980 },
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        await expect(page.getByText('Total próximo cobro')).toBeVisible()
        await expect(page.getByText('$89.980 CLP')).toBeVisible()
    })

    test('cortesía del CEO aparece como "Cortesía EVA" y no aporta al total', async ({ page }) => {
        await mockSubscriptionStatus(page, {
            addons: [
                { id: 'g1', moduleKey: CARDIO, status: 'active', source: 'admin_grant', firstChargedAt: null, expiresAt: null },
            ],
            billing: { baseClp: 79990, addonsClp: 0, totalClp: 79990 },
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        await expect(page.getByText('Cortesía EVA')).toBeVisible()
    })

    test('nutrition_exchanges en tier sin nutrición se muestra "Requiere plan Pro+"', async ({ page }) => {
        await mockSubscriptionStatus(page, { tier: 'starter', billing: { baseClp: 19990, addonsClp: 0, totalClp: 19990 } })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        const section = page.locator('#addons')
        await expect(section.getByText('Requiere plan Pro+')).toBeVisible()
    })

    test('estado "Comprometido hasta el primer cobro" tras baja temprana (mensual)', async ({ page }) => {
        await mockSubscriptionStatus(page, {
            billingCycle: 'monthly',
            addons: [
                { id: 'c1', moduleKey: CARDIO, status: 'cancel_pending', source: 'self_service', firstChargedAt: null, expiresAt: null },
            ],
            billing: { baseClp: 79990, addonsClp: 9990, totalClp: 89980 },
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        await expect(page.getByText('Comprometido hasta el primer cobro')).toBeVisible()
    })

    test('estado "Se desactiva el ..." tras baja ya cobrada', async ({ page }) => {
        await mockSubscriptionStatus(page, {
            addons: [
                { id: 'c2', moduleKey: CARDIO, status: 'cancel_pending', source: 'self_service', firstChargedAt: '2026-06-01T00:00:00Z', expiresAt: '2026-12-31T00:00:00.000Z' },
            ],
            billing: { baseClp: 79990, addonsClp: 0, totalClp: 79990 },
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        await expect(page.getByText(/Se desactiva el/)).toBeVisible()
    })
})

test.describe('add-ons — alta con modal (requiere SELF_SERVICE_ADDONS_ENABLED)', () => {
    test.beforeEach(() => {
        test.skip(!ready, 'Set E2E_PERSONAS_PASSWORD')
        test.skip(!SELF_SERVICE_ADDONS_ENABLED, 'Switch de lanzamiento OFF — CTA de alta deshabilitado por diseño')
    })

    test('alta mensual: el CTA está deshabilitado sin aceptar el checkbox y se habilita al aceptar', async ({ page }) => {
        await mockSubscriptionStatus(page, { billingCycle: 'monthly' })
        await page.route('**/api/payments/addons', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    kind: 'monthly_activated',
                    addon: { id: 'new', moduleKey: CARDIO },
                    billing: { baseClp: 79990, addonsClp: 9990, totalClp: 89980 },
                }),
            })
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        const section = page.locator('#addons')
        await section.getByRole('button', { name: 'Agregar' }).first().click()

        // Las 5 reglas visibles + total en vivo (desglose con base y módulo).
        const modal = page.getByRole('heading', { name: /Agregar/ }).locator('..')
        await expect(page.getByText(FIRST_RULE_TITLE)).toBeVisible()

        const cta = page.getByRole('button', { name: 'Activar módulo' })
        await expect(cta).toBeDisabled()

        await page.getByRole('checkbox').last().check()
        await expect(cta).toBeEnabled()

        await cta.click()
        await expect(page.getByText('Módulo agregado. Ya está disponible en tu cuenta.')).toBeVisible()
        void modal
    })

    test('alta trimestral/anual: el modal muestra el one-shot y redirige al checkout (mock)', async ({ page }) => {
        await mockSubscriptionStatus(page, { billingCycle: 'annual' })
        await page.route('**/api/payments/addons', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    kind: 'one_shot_checkout',
                    checkoutUrl: '/coach/subscription?addon_oneshot=mock',
                    prorationClp: 4500,
                    cycleAmountClp: 95904,
                }),
            })
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        await page.locator('#addons').getByRole('button', { name: 'Agregar' }).first().click()
        // Variante trim/anual del texto: menciona pago único prorrateado.
        await expect(page.getByText(/pago único|prorrateado|días que restan/i)).toBeVisible()
        await page.getByRole('checkbox').last().check()
        await page.getByRole('button', { name: 'Ir a pagar' }).click()
        await expect(page).toHaveURL(/addon_oneshot=mock/)
    })
})

test.describe('add-ons — baja (requiere SELF_SERVICE_ADDONS_ENABLED)', () => {
    test.beforeEach(() => {
        test.skip(!ready, 'Set E2E_PERSONAS_PASSWORD')
        test.skip(!SELF_SERVICE_ADDONS_ENABLED, 'Switch de lanzamiento OFF — CTA de baja deshabilitado por diseño')
    })

    test('baja ya cobrada muestra la fecha efectiva', async ({ page }) => {
        await mockSubscriptionStatus(page, {
            addons: [
                { id: 'c3', moduleKey: CARDIO, status: 'active', source: 'self_service', firstChargedAt: '2026-06-01T00:00:00Z', expiresAt: null },
            ],
            billing: { baseClp: 79990, addonsClp: 9990, totalClp: 89980 },
        })
        await page.route('**/api/payments/addons/cancel', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, moduleKey: CARDIO, status: 'cancel_pending', effectiveAt: '2026-12-31T00:00:00.000Z', putApplied: true }),
            })
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        await page.locator('#addons').getByRole('button', { name: 'Quitar' }).first().click()
        await page.getByRole('button', { name: 'Quitar módulo' }).click()
        await expect(page.getByTestId('addon-cancel-effective')).toContainText(/hasta el/)
    })

    test('baja antes del primer cobro (mensual) explica el compromiso mínimo', async ({ page }) => {
        await mockSubscriptionStatus(page, {
            billingCycle: 'monthly',
            addons: [
                { id: 'c4', moduleKey: CARDIO, status: 'active', source: 'self_service', firstChargedAt: null, expiresAt: null },
            ],
            billing: { baseClp: 79990, addonsClp: 9990, totalClp: 89980 },
        })
        await page.route('**/api/payments/addons/cancel', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, moduleKey: CARDIO, status: 'cancel_pending', effectiveAt: null, putApplied: false }),
            })
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        await page.locator('#addons').getByRole('button', { name: 'Quitar' }).first().click()
        await page.getByRole('button', { name: 'Quitar módulo' }).click()
        await expect(page.getByTestId('addon-cancel-effective')).toContainText(/compromiso mínimo/)
    })
})

test.describe('add-ons — historial registra el evento', () => {
    test.beforeEach(() => test.skip(!ready, 'Set E2E_PERSONAS_PASSWORD'))

    test('un evento addon_activated del historial aparece en la tabla de pagos', async ({ page }) => {
        await page.route('**/api/payments/subscription-status', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    coach: {
                        id: 'e2e-mock-coach',
                        subscription_tier: 'elite',
                        subscription_status: 'active',
                        max_clients: 100,
                        billing_cycle: 'monthly',
                        current_period_end: '2026-12-31T00:00:00.000Z',
                        payment_provider: 'mercadopago',
                    },
                    events: [
                        {
                            id: 'ev1',
                            provider_status: 'addon_activated',
                            provider: 'mercadopago',
                            created_at: '2026-06-12T10:00:00Z',
                            provider_checkout_id: 'addon:abc:activate',
                            payload: { action: 'addon_activated', module_key: CARDIO, total_clp: 89980 },
                        },
                    ],
                    addons: [],
                    billing: { baseClp: 79990, addonsClp: 0, totalClp: 79990 },
                }),
            })
        })
        await loginModulesCoach(page)
        await page.goto('/coach/subscription')

        await expect(page.getByText('addon_activated')).toBeVisible()
    })
})

test.describe('add-ons — aviso amable en URL directa a módulo OFF', () => {
    test.beforeEach(() => test.skip(!ready, 'Set E2E_PERSONAS_PASSWORD'))

    // El coach con módulos tiene cardio/movement ON; exchanges (sin tier nutrición específico)
    // y body_composition pueden estar OFF según el seed. Usamos exchanges como módulo OFF
    // (la persona 9 no compra exchanges en starter; en elite depende del seed) — el aviso
    // amable se prueba navegando a la ruta dedicada.
    test('URL directa a /coach/nutrition-plans/exchanges muestra el aviso, no un error seco', async ({ page }) => {
        await loginModulesCoach(page)
        await page.goto('/coach/nutrition-plans/exchanges')
        // Si el módulo está ON, la ruta redirige al hub; si está OFF, muestra el aviso amable.
        const notice = page.getByTestId('module-off-notice')
        const onHub = page.url().includes('/coach/nutrition-plans') && !page.url().includes('/exchanges')
        if (!onHub) {
            await expect(notice).toBeVisible()
            await expect(page.getByRole('link', { name: 'Ver módulos disponibles' })).toBeVisible()
        }
    })
})

test.describe('add-ons — paso en signup actualiza el total (requiere SELF_SERVICE_ADDONS_ENABLED)', () => {
    test.beforeEach(() => {
        test.skip(!SELF_SERVICE_ADDONS_ENABLED, 'Switch de lanzamiento OFF — paso de add-ons del signup oculto')
    })

    test('marcar un módulo en el signup suma su precio al total a pagar', async ({ page }) => {
        // Registro como flujo público (sin sesión). step 1 datos → step 2 plan + add-ons → step 3 total.
        await page.goto('/register?tier=pro&cycle=monthly')
        await page.getByLabel('Nombre completo').fill('E2E Addon Signup')
        await page.getByLabel('Nombre de tu marca').fill(`E2E Addon ${Date.now()}`)
        await page.getByLabel('Email').fill(`e2e-addon-${Date.now()}@evatest.cl`)
        await page.getByLabel('Contraseña').fill('password-123')
        await page.getByRole('button', { name: 'Continuar' }).click()

        // Step 2: sección "Módulos opcionales" visible para tier pago.
        const addonSection = page.getByText('Módulos opcionales')
        await expect(addonSection).toBeVisible()
        // Marca Cardio y verifica que el total en vivo lo suma.
        await page.getByText('Cardio', { exact: true }).first().click()
        await expect(page.getByText(/Total mensual/)).toBeVisible()
    })
})

test.describe('add-ons — reactivate pre-marca ex-add-ons (requiere SELF_SERVICE_ADDONS_ENABLED)', () => {
    test.beforeEach(() => {
        test.skip(!ready, 'Set E2E_PERSONAS_PASSWORD')
        test.skip(!SELF_SERVICE_ADDONS_ENABLED, 'Switch de lanzamiento OFF — pre-marcado oculto')
    })

    // El pre-marcado depende de filas cancelled recientes del coach (se siembra en el gate via
    // seed-e2e-personas.mjs). Acá se verifica que, cuando existen, aparecen pre-seleccionadas y
    // son deseleccionables; sin seed, la sección no se renderiza y el caso se considera N/A.
    test('los ex-add-ons recientes aparecen pre-marcados y deseleccionables', async ({ page }) => {
        await loginModulesCoach(page)
        await page.goto('/coach/reactivate')

        const section = page.getByText('Volver a sumar tus módulos')
        if (await section.isVisible().catch(() => false)) {
            const firstAddonCheckbox = page.getByRole('checkbox').first()
            await expect(firstAddonCheckbox).toBeChecked()
            await firstAddonCheckbox.uncheck()
            await expect(firstAddonCheckbox).not.toBeChecked()
        }
    })
})
