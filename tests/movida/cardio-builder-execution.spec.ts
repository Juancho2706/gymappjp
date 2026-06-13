/**
 * E2E Plan 2 Movida (specs/movida-entrenamiento, AC1/AC4/AC7):
 * coach prescribe un bloque cardio → alumno lo ve con sus campos (zona/duración) y
 * registra duración/distancia/FC → el log queda en workout_logs polimórfico.
 *
 * REGLA 2026-06-10: este spec se ESCRIBE en la tanda pero SOLO corre en el gate
 * final autorizado (1 corrida, --workers=1, contra build prod).
 *
 * Env requerido:
 *   E2E_COACH_EMAIL / E2E_COACH_PASSWORD     — coach con módulo cardio ON
 *   E2E_CARDIO_CLIENT_ID                     — alumno del coach (uuid)
 *   E2E_COACH_SLUG / E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD — sesión del alumno
 */
import { expect, test } from '@playwright/test'

const coachEmail = process.env.E2E_COACH_EMAIL
const coachPassword = process.env.E2E_COACH_PASSWORD
const clientId = process.env.E2E_CARDIO_CLIENT_ID
const slug = process.env.E2E_COACH_SLUG
const clientEmail = process.env.E2E_CLIENT_EMAIL
const clientPassword = process.env.E2E_CLIENT_PASSWORD

const PROGRAM_NAME = `E2E Cardio ${Date.now()}`

test.describe('Movida Plan 2 — cardio builder → ejecución', () => {
    test('coach prescribe cardio (AC1) y el builder hace round-trip', async ({ page }) => {
        test.setTimeout(180_000)
        test.skip(!coachEmail || !coachPassword || !clientId, 'Set E2E_COACH_EMAIL/PASSWORD y E2E_CARDIO_CLIENT_ID')

        await page.goto('/login')
        await page.getByLabel('Email').fill(coachEmail!)
        await page.getByLabel('Contraseña').fill(coachPassword!)
        await page.getByRole('button', { name: /Ingresar|Iniciar/i }).click()
        await page.waitForURL(/\/coach\//, { timeout: 30_000 })

        // Builder del alumno
        await page.goto(`/coach/builder/${clientId}`)
        await expect(page.getByText('NUEVO PROGRAMA')).toBeVisible({ timeout: 30_000 })

        // Nombre del programa (panel Configurar)
        await page.getByTitle('Configurar programa').click()
        await page.getByPlaceholder(/nombre del programa/i).first().fill(PROGRAM_NAME)
        await page.getByTitle('Configurar programa').click()

        // Agregar el primer ejercicio del catálogo al día 1 (drag o tap según viewport)
        const firstCatalogItem = page.locator('[data-tour-id="exercise-catalog"] button, [data-tour-id="exercise-catalog"] [draggable]').first()
        await firstCatalogItem.waitFor({ timeout: 15_000 })
        await firstCatalogItem.dblclick().catch(() => firstCatalogItem.click())

        // Abrir el sheet del bloque y forzar tipo cardio (override — AC1)
        const blockCard = page.locator('[class*="border-l-4"]').first()
        await blockCard.click()
        await expect(page.getByText('Tipo de ejercicio')).toBeVisible({ timeout: 10_000 })
        await page.getByRole('button', { name: 'Cardio', exact: true }).click()

        // Prescripción: 20 min @ Z4
        await page.getByPlaceholder('Ej. 20').fill('20')
        await page.getByRole('button', { name: 'Z4', exact: true }).click()
        await page.getByRole('button', { name: 'SINCRONIZAR BLOQUE' }).click()

        // El resumen del bloque muestra la prescripción cardio, no "8-12 reps" (AC1)
        await expect(page.getByText(/20min Z4/i).first()).toBeVisible({ timeout: 10_000 })

        // Guardar y verificar round-trip
        await page.getByRole('button', { name: /GUARDAR/i }).click()
        await expect(page.getByText('Programa guardado exitosamente.')).toBeVisible({ timeout: 30_000 })
    })

    test('alumno ve el bloque cardio y registra duración/FC (AC4)', async ({ page }) => {
        test.setTimeout(180_000)
        test.skip(!slug || !clientEmail || !clientPassword, 'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD')

        await page.goto(`/c/${slug}/login`)
        await page.getByLabel('Email').fill(clientEmail!)
        await page.getByLabel('Contraseña').fill(clientPassword!)
        await page.getByRole('button', { name: 'Ingresar' }).click()
        await page.waitForTimeout(1500)

        // Dashboard → rutina de hoy
        await page.goto(`/c/${slug}/dashboard`)
        const workoutLink = page.locator('a[href*="/workout/"]').first()
        await workoutLink.waitFor({ timeout: 30_000 })
        await workoutLink.click()
        await page.waitForURL(/\/workout\//, { timeout: 30_000 })

        // Card cardio: muestra Duración y Zona FC (chip "Z4" — con perfil completo y módulo ON
        // muestra además el rango bpm, ej. "Z4 · 150–168 bpm" — AC7)
        await expect(page.getByText('Duración', { exact: false }).first()).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(/Z4/).first()).toBeVisible()

        // Registro polimórfico: minutos + FC promedio
        await page.getByLabel('Minutos').first().fill('20')
        await page.getByLabel('FC promedio').first().fill('152')
        await page.getByRole('button', { name: /Guardar set/i }).first().click()

        // Optimistic UI: queda marcado como guardado
        await expect(page.getByRole('button', { name: /Set guardado/i }).first()).toBeVisible({ timeout: 15_000 })
    })

    // AC11 (anti-fantasma del pool): "Copiar al team" quedó DIFERIDO en esta tanda
    // (ver tasksDeferred de specs/movida-entrenamiento/TASKS.md F3). Cuando se implemente,
    // este caso valida: coach del pool copia un ejercicio personal al team → lo prescribe →
    // el alumno del pool ve nombre/gif/instrucciones (nunca bloque vacío por RLS) y otro
    // coach del pool abre el programa y ve el mismo ejercicio.
    test.fixme('AC11: ejercicio personal se prescribe vía "Copiar al team" (diferido)', async () => {
        // Implementación pendiente de F3 (copy-on-use a scope team).
    })
})
