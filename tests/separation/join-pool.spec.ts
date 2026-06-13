import { test, expect } from '@playwright/test'
import { SLUGS, BRANDS } from './personas'

/**
 * A.bis2 — entrada al POOL vía código de invitación del TEAM (/join/[teams.invite_code]).
 * El código E2E es estable (backfill 2026-06-10, team "E2E Pool Vortex"); overrideable por env.
 *
 * El test de registro usa un email FIJO (cuenta permanente e2e-*, regla: nunca borrar):
 * la primera corrida la crea, las siguientes validan el rechazo por duplicado — ambos
 * outcomes prueban que la rama team del action resuelve y responde.
 */
const TEAM_INVITE_CODE = process.env.E2E_TEAM_INVITE_CODE ?? '9WVEG'
const JOIN_EMAIL = 'e2e-pool-join@evatest.cl'

test.describe('A.bis2 — /join con código de team', () => {
    test('la página de join muestra la marca del TEAM y el login /t', async ({ page }) => {
        await page.goto(`/join/${TEAM_INVITE_CODE}`)

        // Branding del team (no del coach owner ni de EVA).
        await expect(page.getByRole('heading', { name: BRANDS.team.name })).toBeVisible()

        // El link "ya tenés cuenta" apunta al shell /t del team, nunca a /c.
        const loginLink = page.getByRole('link', { name: /inicia sesi/i })
        await expect(loginLink).toHaveAttribute('href', `/t/${SLUGS.team}/login`)
    })

    test('código inválido → 404', async ({ page }) => {
        const res = await page.goto('/join/ZZZZ9')
        expect(res?.status()).toBe(404)
    })

    test('registro con código de team crea (o reconoce) al alumno del pool', async ({ page }) => {
        // rateLimitInviteAccept es fail-CLOSED: sin Upstash (dev local) el action SIEMPRE
        // devuelve "Demasiados intentos". Solo corre donde el rate limit es real (preview/CI).
        test.skip(!process.env.UPSTASH_REDIS_REST_URL, 'sin UPSTASH el join está fail-closed en local')

        await page.goto(`/join/${TEAM_INVITE_CODE}`)
        await expect(page.getByRole('heading', { name: BRANDS.team.name })).toBeVisible()

        await page.getByPlaceholder('Juan Pérez').fill('E2E Pool Join')
        await page.getByPlaceholder('juan@email.com').fill(JOIN_EMAIL)
        await page.getByPlaceholder('Mínimo 8 caracteres').fill(process.env.E2E_PERSONAS_PASSWORD ?? 'EvaE2E.2026!')
        await page.getByRole('button', { name: /crear cuenta/i }).click()

        // Primera corrida: redirect al login del TEAM (?registered=1).
        // Corridas siguientes: la cuenta permanente ya existe → error de duplicado.
        const registered = page.waitForURL(`**/t/${SLUGS.team}/login?registered=1`, { timeout: 15_000 }).then(() => 'registered' as const)
        const duplicate = expect(page.getByText(/ya existe una cuenta/i)).toBeVisible({ timeout: 15_000 }).then(() => 'duplicate' as const)
        const outcome = await Promise.race([registered, duplicate])
        expect(['registered', 'duplicate']).toContain(outcome)
    })
})
