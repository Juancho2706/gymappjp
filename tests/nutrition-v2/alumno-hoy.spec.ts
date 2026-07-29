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
 *   prescrito con "Lo comí" y el MISMO spec lo revierte con "Retirar registro". Desde NUT-010
 *   (opción A) el retiro es TERMINAL: la entry queda `entry_status = 'voided'` y desaparece de
 *   todos los read models, sin insertar ninguna entry correctora. Precondición: el alumno E2E
 *   tiene un plan V2 con una prescripción pendiente hoy (lo crea builder-publish). Si no la hay,
 *   hace skip.
 *
 * QUÉ CAMBIÓ RESPECTO DE LA VERSIÓN ANTERIOR (y por qué):
 *   La versión vieja afirmaba "por diseño, retirar NO des-registra" y solo validaba la ausencia de
 *   errores de runtime. Peor: su bucle de auto-limpieza hacía hasta 12 clicks en "Retirar registro"
 *   esperando que la lista se vaciara, cuando cada retiro creaba OTRA entry correctora activa con
 *   su propio botón "Retirar" — el bucle nunca convergía, agotaba las 12 iteraciones creando 12
 *   fantasmas y después hacía skip porque "Lo comí" ya no estaba visible. Era un no-op contaminante.
 *   Ahora el bucle SÍ converge y el spec afirma el ESTADO FINAL:
 *     · "Consumido hoy" queda vacío (empty-state visible);
 *     · el botón "Lo comí" del item vuelve a estar disponible (la fila se des-registra de verdad).
 *
 * Entorno: Preview de Vercel (PLAYWRIGHT_BASE_URL) con el canary activo para la alumna.
 */
test.describe('Nutrición V2 · Alumna registra consumo (canary)', () => {
  test.beforeEach(requireCanaryStudent)

  test('ve "Hoy", marca "Lo comí" y el retiro devuelve el item a pendiente', async ({ page }) => {
    test.setTimeout(150_000)
    await loginStudent(page)

    await page.goto(`/c/${COACH_SLUG}/nutrition-v2`)
    // Con el canary ON NO debe redirigir a la V1 (/c/[slug]/nutrition).
    await expect(page).toHaveURL(new RegExp(`/c/${COACH_SLUG}/nutrition-v2`), { timeout: 25_000 })

    const consumedRegion = page.getByRole('region', { name: 'Consumido hoy' })
    const emptyState = consumedRegion.getByText('Todavía no registras alimentos')

    // Sin plan vigente, la vista "Hoy" no muestra prescripción: corre builder-publish primero.
    // OJO: no se usa "Registrar alimento" como señal — con `canRegisterFreely = false` (NUT-009)
    // ese botón NO se renderiza aunque el plan exista.
    const loComi = page.getByTestId('nutrition-v2-lo-comi').first()
    const retirarPrevio = consumedRegion.getByRole('button', { name: 'Retirar registro' }).first()
    const hasPlan =
      (await loComi.isVisible({ timeout: 12_000 }).catch(() => false)) ||
      (await retirarPrevio.isVisible({ timeout: 2_000 }).catch(() => false))
    test.skip(!hasPlan, `${STUDENT_NAME} no tiene plan V2 vigente hoy. Corre builder-publish primero.`)

    // AUTO-LIMPIEZA: corridas anteriores pueden haber dejado consumos sin retirar. Con el retiro
    // terminal este bucle CONVERGE (cada iteración quita una fila y no crea ninguna).
    for (let i = 0; i < 12; i += 1) {
      const hayPrevio = await retirarPrevio.isVisible({ timeout: 4_000 }).catch(() => false)
      if (!hayPrevio) break
      await retirarPrevio.click()
      const dlg = page.getByRole('dialog', { name: 'Retirar registro' })
      await dlg.getByPlaceholder('Ej: lo registré por error').fill('Limpieza E2E previa')
      await dlg.getByRole('button', { name: 'Retirar registro' }).click()
      await expect(dlg).toBeHidden({ timeout: 20_000 })
    }
    // La convergencia es una ASERCIÓN, no una esperanza: si quedan filas, el retiro no es terminal.
    await expect(emptyState).toBeVisible({ timeout: 20_000 })

    // Necesitamos una prescripción pendiente (botón "Lo comí"). Si no la hay, skip.
    const hasPrescription = await loComi.isVisible({ timeout: 10_000 }).catch(() => false)
    test.skip(
      !hasPrescription,
      'No hay prescripción pendiente para hoy (nada que marcar con "Lo comí"). Corre builder-publish primero.',
    )

    // Marca el consumo prescrito: la fila pasa a "Registrado" y aparece en "Consumido hoy".
    await loComi.click()
    const retirar = consumedRegion.getByRole('button', { name: 'Retirar registro' }).first()
    await expect(retirar).toBeVisible({ timeout: 20_000 })
    await expect(loComi).toBeHidden({ timeout: 20_000 })

    // Retira el registro desde la misma UI: motivo (mín. 3 chars) + confirmar.
    await retirar.click()
    const dialog = page.getByRole('dialog', { name: 'Retirar registro' })
    await dialog.getByPlaceholder('Ej: lo registré por error').fill('Limpieza E2E')
    await dialog.getByRole('button', { name: 'Retirar registro' }).click()
    await expect(dialog).toBeHidden({ timeout: 20_000 })

    // ESTADO FINAL (lo que el spec viejo no validaba y el bug rompía):
    //  1. "Consumido hoy" queda VACÍO — no quedó ninguna entry correctora fantasma;
    //  2. el item prescrito vuelve a estar pendiente, con su botón "Lo comí" disponible.
    await expect(emptyState).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('nutrition-v2-lo-comi').first()).toBeVisible({ timeout: 20_000 })

    await expectNoRuntimeError(page)
  })
})
