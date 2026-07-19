import { expect, test } from '@playwright/test'
import {
  STUDENT_NAME,
  expectNoRuntimeError,
  loginCoachStandalone,
  requireCanaryCoach,
  resolveStudentClientId,
} from './_helpers'

/**
 * MUTACIONES EN PRODUCCIÓN: ninguna. Spec de SOLO LECTURA.
 *
 * Verifica que la ficha del alumno en el Centro V2 muestra el plan vigente (sección
 * "Plan vigente" + badge de versión/estrategia). Precondición: el alumno de prueba E2E tiene un
 * plan V2 publicado (lo crea builder-publish). Si no hay plan vigente, hace skip en vez de fallar.
 *
 * Entorno: Preview de Vercel (PLAYWRIGHT_BASE_URL) con Nutrición V2 activo para el coach E2E.
 */
test.describe('Nutrición V2 · Ficha del coach — plan vigente (canary)', () => {
  test.beforeEach(requireCanaryCoach)

  test('la ficha muestra el plan vigente', async ({ page }) => {
    test.setTimeout(120_000)
    await loginCoachStandalone(page)

    const clientId = await resolveStudentClientId(page)
    test.skip(
      !clientId,
      `No se pudo ubicar a ${STUDENT_NAME} en la página 1 del roster; setea E2E_STUDENT_CLIENT_ID con su clientId.`,
    )

    await page.goto(`/coach/nutrition-v2/${clientId}`)
    // Con el canary ON NO debe redirigir a la V1.
    await expect(page).toHaveURL(new RegExp(`/coach/nutrition-v2/${clientId}`), { timeout: 25_000 })

    // Si la alumna aún no tiene plan vigente (ficha vacía), no hay nada que verificar:
    // corre builder-publish primero. Skip en vez de fallar.
    const emptyState = page.getByTestId('nutrition-v2-plan-empty')
    const isEmpty = await emptyState.isVisible({ timeout: 8_000 }).catch(() => false)
    test.skip(isEmpty, `${STUDENT_NAME} no tiene plan V2 vigente. Corre builder-publish primero.`)

    const vigente = page.getByTestId('nutrition-v2-plan-vigente')
    await expect(vigente).toBeVisible({ timeout: 20_000 })
    await expect(vigente.getByRole('heading', { name: 'Plan vigente' })).toBeVisible()
    // Badge de versión ("vX") de la prescripción vigente.
    await expect(vigente.getByText(/^v\d+/).first()).toBeVisible({ timeout: 15_000 })

    await expectNoRuntimeError(page)
  })
})
