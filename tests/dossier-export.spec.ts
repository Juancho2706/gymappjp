import { expect, test } from '@playwright/test'
import { assertE2eAccounts } from './e2e-accounts'

/**
 * E2E del diálogo «Exportar informe» de la ficha del alumno (R25, docs/specs/dossier-por-meses).
 *
 * MUTACIONES: ninguna. Solo abre el diálogo y cambia de modo — NO descarga ningún PDF (generar
 * el archivo es trabajo del cliente y no agrega señal a este spec).
 *
 * Se auto-omite sin credenciales, como el resto de los specs de la raíz (`workout-flow`,
 * `navigation-perf-smoke`): nunca hay credenciales en el repo. El guard `assertE2eAccounts`
 * revienta EN SECO si alguien apunta las envs a una cuenta que no es de prueba propia
 * (el incidente de 2026-07: la suite archivó el plan de una alumna real).
 *
 * Correr SOLO en el gate final autorizado por el owner:
 *   E2E_COACH_EMAIL=… E2E_COACH_PASSWORD=… E2E_STUDENT_CLIENT_ID=… \
 *     pnpm exec playwright test tests/dossier-export.spec.ts --project=chromium
 */

const COACH_EMAIL = process.env.E2E_COACH_EMAIL ?? ''
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD ?? ''
/** Alumno E2E permanente (E2E Solo Alumno). Determinista: sin búsqueda por nombre en el roster. */
const STUDENT_CLIENT_ID =
    process.env.E2E_STUDENT_CLIENT_ID ?? '01c36cde-a95d-42a7-b165-ba08a8599d22'

test.describe('Dossier por meses · diálogo de exportación', () => {
    test('el botón Exportar PDF abre el diálogo y el modo «Por meses» arma el CTA', async ({
        page,
    }) => {
        test.setTimeout(120_000)
        assertE2eAccounts(
            { coachEmail: COACH_EMAIL, clientId: STUDENT_CLIENT_ID },
            'dossier-export'
        )
        test.skip(
            !COACH_EMAIL || !COACH_PASSWORD,
            'Definí E2E_COACH_EMAIL y E2E_COACH_PASSWORD para habilitar este spec.'
        )

        // ── Login del coach ───────────────────────────────────────────────────
        await page.goto('/login')
        await page.getByRole('textbox', { name: /email/i }).fill(COACH_EMAIL)
        await page.getByRole('textbox', { name: /contraseña/i }).fill(COACH_PASSWORD)
        await page.getByRole('button', { name: /entrar|ingresar|iniciar/i }).click()
        await page.waitForURL(/\/(workspace\/select|coach\/|org\/)/, { timeout: 30_000 })

        // ── Ficha del alumno ──────────────────────────────────────────────────
        await page.goto(`/coach/clients/${STUDENT_CLIENT_ID}`)
        await expect(page).toHaveURL(new RegExp(`/coach/clients/${STUDENT_CLIENT_ID}`), {
            timeout: 30_000,
        })

        // ── El botón del hero abre el diálogo ─────────────────────────────────
        await page.getByRole('button', { name: 'Exportar PDF' }).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog.getByText('Exportar informe')).toBeVisible({ timeout: 15_000 })
        // «Estado actual» viene preseleccionado ⇒ el CTA es la descarga directa.
        await expect(dialog.getByRole('button', { name: 'Descargar PDF' })).toBeVisible()

        // ── Modo «Por meses» ──────────────────────────────────────────────────
        await dialog.getByRole('radio', { name: 'Por meses' }).click()

        const chips = dialog.getByRole('group', { name: 'Meses del informe' }).getByRole('button')
        await expect(chips.first()).toBeVisible({ timeout: 20_000 })

        // Un solo mes seleccionado ⇒ «Descargar 1 PDF». El primer chip (mes en curso) ya viene
        // marcado: se apaga y se vuelve a encender para ejercitar el toggle de verdad.
        const firstChip = chips.first()
        await firstChip.click()
        await expect(firstChip).toHaveAttribute('aria-pressed', 'false')
        await firstChip.click()
        await expect(firstChip).toHaveAttribute('aria-pressed', 'true')

        await expect(dialog.getByRole('button', { name: 'Descargar 1 PDF' })).toBeEnabled()

        // Escape cierra sin descargar nada.
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden({ timeout: 10_000 })
    })
})
