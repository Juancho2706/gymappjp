import { expect, test } from '@playwright/test'
import { expectNoRuntimeError, loginCoachStandalone, requireCanaryCoach } from './_helpers'

/**
 * MUTACIONES EN PRODUCCIÓN: ninguna. Spec de SOLO LECTURA.
 *
 * Entorno: Preview de Vercel (PLAYWRIGHT_BASE_URL) con el canary de Nutrición V2 activo para
 * el coach josefit. Loguea al coach, fija su workspace standalone y verifica que
 * /coach/nutrition-v2 carga el Centro con el roster (no redirige a la V1). No crea, edita ni
 * borra datos de ningún alumno.
 */
test.describe('Nutrición V2 · Centro del coach (canary)', () => {
  test.beforeEach(requireCanaryCoach)

  test('el roster carga con el canary activo', async ({ page }) => {
    test.setTimeout(90_000)
    await loginCoachStandalone(page)

    await page.goto('/coach/nutrition-v2')
    // Con el canary ON NO debe redirigir a la V1 (/coach/nutrition-plans).
    await expect(page).toHaveURL(/\/coach\/nutrition-v2(\?|$)/, { timeout: 25_000 })
    await expect(
      page.getByRole('heading', { level: 1, name: 'Centro de Nutricion' }),
    ).toBeVisible({ timeout: 25_000 })

    const roster = page.getByTestId('nutrition-v2-hub-roster')
    await expect(roster).toBeVisible({ timeout: 25_000 })

    // Roster con datos reales del scope: descartamos el empty-state de scope vacío y
    // afirmamos que hay al menos una fila con link a la ficha de un alumno. Filtramos por
    // :visible porque el roster monta a la vez las cards móviles (ocultas en escritorio) y
    // la tabla; sin el filtro, .first() podría caer en un link oculto.
    await expect(page.getByText('No hay alumnos en este scope')).toHaveCount(0)
    await expect(
      roster.locator('a[href*="/coach/nutrition-v2/"]:visible').first(),
    ).toBeVisible({ timeout: 20_000 })

    await expectNoRuntimeError(page)
  })
})
