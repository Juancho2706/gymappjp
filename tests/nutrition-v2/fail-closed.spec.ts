import { expect, test } from '@playwright/test'
import {
  COACH_SLUG,
  expectNoRuntimeError,
  hasCoachCreds,
  hasPreview,
  hasStudentCreds,
  loginCoach,
  loginStudent,
} from './_helpers'

/**
 * MUTACIONES EN PRODUCCIÓN: ninguna. Spec de SOLO LECTURA.
 *
 * Fail-closed: sin el canary habilitado, Nutrición V2 no existe para el usuario y la V1 queda
 * intacta. Corre en DEV LOCAL sin EDGE_CONFIG (donde el rollout resuelve OFF para todos):
 *   - /coach/nutrition-v2   → redirige a /coach/nutrition-plans (hub V1 del coach).
 *   - /c/[slug]/nutrition-v2 → redirige a /c/[slug]/nutrition (nutrición V1 del alumno).
 *
 * Se OMITE cuando PLAYWRIGHT_BASE_URL está seteado: ahí se apunta a un entorno que puede tener
 * el canary encendido (Preview), donde estas aserciones de redirección no aplican. Usa las
 * mismas envs de credenciales, pero apuntando a cuentas del stack LOCAL (personas E2E).
 */
test.describe('Nutrición V2 · Fail-closed sin canary (dev local)', () => {
  test.beforeEach(() => {
    test.skip(
      hasPreview,
      'fail-closed corre solo en dev local sin EDGE_CONFIG. Con PLAYWRIGHT_BASE_URL apuntas a un entorno con posible canary → omitido.',
    )
  })

  test('coach sin canary aterriza en la nutrición V1', async ({ page }) => {
    test.setTimeout(90_000)
    test.skip(!hasCoachCreds, 'Falta E2E_COACH_EMAIL / E2E_COACH_PASSWORD (cuenta del stack local).')
    await loginCoach(page)

    await page.goto('/coach/nutrition-v2')
    await expect(page).toHaveURL(/\/coach\/nutrition-plans/, { timeout: 25_000 })
    await expect(page).not.toHaveURL(/\/coach\/nutrition-v2/)
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
    await expectNoRuntimeError(page)
  })

  test('alumna sin canary aterriza en la nutrición V1', async ({ page }) => {
    test.setTimeout(90_000)
    test.skip(
      !hasStudentCreds,
      'Falta E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD / E2E_COACH_SLUG (cuenta del stack local).',
    )
    await loginStudent(page)

    await page.goto(`/c/${COACH_SLUG}/nutrition-v2`)
    // "nutrition" sin "-v2": matchea la V1 y excluye explícitamente la ruta V2.
    await expect(page).toHaveURL(new RegExp(`/c/${COACH_SLUG}/nutrition(?!-v2)`), { timeout: 25_000 })
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
    await expectNoRuntimeError(page)
  })
})
