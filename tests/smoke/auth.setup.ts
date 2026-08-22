import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'
import { assertAllowedE2eEmail } from '../e2e-accounts'
import { QA_AUTH_DIR, QA_COACH_STORAGE_STATE } from '../_fixtures/storage-state'

/**
 * EL UNICO login de la tanda suave.
 *
 * Cada `/login` es un round-trip a Supabase Auth mas la carga completa del panel. Repetirlo en
 * cada spec es la forma mas cara de no obtener informacion nueva, asi que se hace una vez aca y
 * los specs de `tests/smoke/**` arrancan con la sesion ya puesta (`storageState`).
 *
 * Credenciales SOLO por env (`E2E_QA_COACH_EMAIL` / `E2E_QA_COACH_PASSWORD`). Sin ellas la tanda
 * se salta entera en vez de fallar: no hay fallback literal en el repo, ni lo va a haber.
 */

const email = process.env.E2E_QA_COACH_EMAIL ?? ''
const password = process.env.E2E_QA_COACH_PASSWORD ?? ''

setup('autenticar al coach QA una sola vez', async ({ page, context }) => {
    setup.skip(
        !email || !password,
        'Faltan E2E_QA_COACH_EMAIL / E2E_QA_COACH_PASSWORD: la tanda suave no corre sin cuenta QA.',
    )

    // Guard duro contra la fuga historica al workspace del CEO: solo cuentas @evatest.cl.
    // Lanza en seco si alguien apunta la tanda a una cuenta real (ver tests/e2e-accounts.ts).
    assertAllowedE2eEmail(email, 'qa:prod:suave')

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Bienvenido de vuelta' })).toBeVisible()

    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: /Ingresar al Panel/i }).click()

    // El panel decide a donde aterriza: `/coach/dashboard` manda a `/coach/guia` en la primera
    // entrada del coach. Cualquier ruta bajo `/coach/` significa sesion valida.
    await page.waitForURL(/\/coach\//, { timeout: 30_000 })

    fs.mkdirSync(QA_AUTH_DIR, { recursive: true })
    await context.storageState({ path: QA_COACH_STORAGE_STATE })
})
