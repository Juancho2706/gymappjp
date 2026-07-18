import { expect, test } from '@playwright/test'
import {
  COACH_SLUG,
  STUDENT_NAME,
  expectNoRuntimeError,
  loginStudent,
  requireCanaryStudent,
} from './_helpers'

/**
 * MUTACIÓN EN PRODUCCIÓN (mínima, auto-revertida):
 *   El alumno de prueba E2E (E2E Solo Alumno — cuenta propia, nunca del CEO) marca UN alimento
 *   prescrito con "Lo comí" y el MISMO spec lo revierte retirando el registro desde la UI
 *   ("Retirar registro"). La adherencia queda neutralizada vía corrección; el registro original
 *   + la corrección persisten en la base por diseño (correction chain). No toca a ningún otro
 *   alumno. Precondición: el alumno E2E tiene un plan V2 con una prescripción pendiente hoy (lo
 *   crea builder-publish). Si no la hay, hace skip.
 *
 * Entorno: Preview de Vercel (PLAYWRIGHT_BASE_URL) con el canary activo para la alumna.
 */
test.describe('Nutrición V2 · Alumna registra consumo (canary)', () => {
  test.beforeEach(requireCanaryStudent)

  test('ve "Hoy", marca "Lo comí" y revierte el registro', async ({ page }) => {
    test.setTimeout(150_000)
    await loginStudent(page)

    await page.goto(`/c/${COACH_SLUG}/nutrition-v2`)
    // Con el canary ON NO debe redirigir a la V1 (/c/[slug]/nutrition).
    await expect(page).toHaveURL(new RegExp(`/c/${COACH_SLUG}/nutrition-v2`), { timeout: 25_000 })

    // Sin plan vigente, la vista "Hoy" no ofrece registrar: corre builder-publish primero.
    const registrar = page.getByRole('button', { name: 'Registrar alimento' })
    const hasPlan = await registrar.isVisible({ timeout: 12_000 }).catch(() => false)
    test.skip(!hasPlan, `${STUDENT_NAME} no tiene plan V2 vigente hoy. Corre builder-publish primero.`)

    // AUTO-LIMPIEZA: corridas anteriores pueden haber dejado consumos sin retirar
    // (contaminación de datos). Retira todo lo consumido antes de partir, para que
    // la prescripción vuelva a estar pendiente y el spec sea idempotente.
    const consumedRegion = page.getByRole('region', { name: 'Consumido hoy' })
    for (let i = 0; i < 12; i += 1) {
      const retirarPrevio = consumedRegion.getByRole('button', { name: 'Retirar registro' }).first()
      const hayPrevio = await retirarPrevio.isVisible({ timeout: 4_000 }).catch(() => false)
      if (!hayPrevio) break
      await retirarPrevio.click()
      const dlg = page.getByRole('dialog', { name: 'Retirar registro' })
      await dlg.getByPlaceholder('Ej: lo registré por error').fill('Limpieza E2E previa')
      await dlg.getByRole('button', { name: 'Retirar registro' }).click()
      await expect(dlg).toBeHidden({ timeout: 20_000 })
    }

    // Necesitamos una prescripción pendiente (botón "Lo comí"). Si ya está todo consumido, skip.
    const loComi = page.getByTestId('nutrition-v2-lo-comi').first()
    const hasPrescription = await loComi.isVisible({ timeout: 10_000 }).catch(() => false)
    test.skip(
      !hasPrescription,
      'No hay prescripción pendiente para hoy (nada que marcar con "Lo comí"). Corre builder-publish primero.',
    )

    // Marca el consumo prescrito.
    await loComi.click()

    // El consumo aparece en "Consumido hoy" con acción de retiro.
    const consumed = page.getByRole('region', { name: 'Consumido hoy' })
    const retirar = consumed.getByRole('button', { name: 'Retirar registro' }).first()
    await expect(retirar).toBeVisible({ timeout: 20_000 })
    await retirar.click()

    // Revierte el registro desde la misma UI: motivo (mín. 3 chars) + confirmar.
    const dialog = page.getByRole('dialog', { name: 'Retirar registro' })
    await dialog.getByPlaceholder('Ej: lo registré por error').fill('Limpieza E2E')
    await dialog.getByRole('button', { name: 'Retirar registro' }).click()

    // El diálogo cierra. Por diseño, retirar NO des-registra: crea una corrección a
    // contribución cero (el registro original se conserva en la cadena de auditoría),
    // así que el item puede seguir mostrándose como "Registrado" pero aportando 0.
    // La invariante que validamos es que el retiro se aplicó sin error de runtime.
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    await expectNoRuntimeError(page)
  })
})
