import { expect, test } from '@playwright/test'
import {
  FOOD_QUERY,
  STUDENT_NAME,
  expectNoRuntimeError,
  loginCoachStandalone,
  requireCanaryCoach,
  resolveStudentClientId,
} from './_helpers'

/**
 * MUTACIÓN EN PRODUCCIÓN (mínima, auto-contenida, identificable):
 *   Publica UN plan de Nutrición V2 sobre la alumna QA designada (Camila) con nombre
 *   prefijado "E2E-<timestamp>". No toca a ningún otro alumno ni coach.
 *
 * El plan queda VIGENTE a propósito: es la precondición que leen los specs ficha-coach y
 * alumno-hoy. Cada corrida crea una nueva versión que supersede la anterior (no acumula
 * planes activos, solo versiones). Limpieza: archivar el plan desde la ficha del alumno
 * (botón "Archivar plan"). Ver tests/nutrition-v2/README.md → "Limpieza en producción".
 *
 * Entorno: Preview de Vercel (PLAYWRIGHT_BASE_URL) con el canary activo para josefit.
 */
test.describe('Nutrición V2 · Builder publica un plan (canary)', () => {
  test.beforeEach(requireCanaryCoach)

  test('el flujo de 4 pasos publica un plan con catálogo', async ({ page }) => {
    test.setTimeout(180_000)
    await loginCoachStandalone(page)

    const clientId = await resolveStudentClientId(page)
    test.skip(
      !clientId,
      `No se pudo ubicar a ${STUDENT_NAME} en la página 1 del roster; setea E2E_STUDENT_CLIENT_ID con su clientId.`,
    )

    const planName = `E2E-${Date.now()}`
    await page.goto(`/coach/nutrition-v2/${clientId}/builder`)
    await expect(page.getByTestId('nutrition-v2-builder-stepper')).toBeVisible({ timeout: 25_000 })

    // Paso 1 · Estrategia: plan estructurado (usa franjas + catálogo; no requiere Nutrición Pro).
    await page.getByRole('button', { name: /Plan estructurado/i }).click()
    await page.getByRole('button', { name: 'Siguiente' }).click()

    // Paso 2 · Objetivos: nombre del plan (prefijo E2E-) + metas diarias.
    await page.getByLabel('Nombre del plan').fill(planName)
    await page.locator('#target-calories').fill('2000')
    await page.locator('#target-proteinG').fill('150')
    await page.locator('#target-carbsG').fill('200')
    await page.locator('#target-fatsG').fill('60')
    await page.getByRole('button', { name: 'Siguiente' }).click()

    // Paso 3 · Construcción: nombra la franja y agrega un alimento del catálogo local.
    await page.getByLabel('Nombre de la franja').first().fill('Desayuno')
    await page.getByLabel('Buscar alimento del catalogo').first().fill(FOOD_QUERY)
    await page.getByRole('button', { name: 'Buscar' }).first().click()

    // Elige el primer resultado del catálogo (cada card es un botón "Agregar <alimento>").
    const firstResult = page.getByRole('button', { name: /^Agregar / }).first()
    await expect(firstResult).toBeVisible({ timeout: 20_000 })
    await firstResult.click()

    // El alimento entra como fila prescrita: fija una cantidad válida.
    await page.getByLabel('Cantidad').first().fill('100')
    await page.getByRole('button', { name: 'Siguiente' }).click()

    // Paso 4 · Revisar y publicar (la fecha "Vigente desde" ya trae hoy por defecto).
    await expect(page.getByText(planName, { exact: false })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Publicar plan' }).click()

    // Al publicar aterriza en la ficha del alumno con el banner de éxito y el plan vigente.
    await page.waitForURL(new RegExp(`/coach/nutrition-v2/${clientId}\\?published=1`), {
      timeout: 30_000,
    })
    await expect(
      page.getByText('Plan publicado. La version quedo vigente para el alumno.'),
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('nutrition-v2-plan-vigente')).toBeVisible({ timeout: 20_000 })

    await expectNoRuntimeError(page)
  })
})
