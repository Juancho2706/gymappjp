import { test, expect, type Page } from '@playwright/test'
import * as personasModule from './personas'

/**
 * SUITE B — Aislamiento de datos entre los 3 flujos de coach
 * (coach_standalone / enterprise_coach / coach_team), bidireccional:
 * cada contexto ve SOLO sus alumnos y recursos, y NUNCA los de los otros dos.
 *
 * Sesiones: storageState por persona generado por tests/separation/auth.setup.ts
 * (project 'setup', dependencia del project 'separation').
 *
 * Env requerido / opcional:
 *   E2E_PERSONAS_PASSWORD   -> password compartida de TODAS las personas (sin esto, la suite se salta)
 *   E2E_SOLO_ALUMNO_ID / E2E_ORG_ALUMNO_ID / E2E_POOL_ALUMNO_ID
 *       -> uuids de `clients` para las denegaciones por URL directa (opcionales; sin id, ese caso
 *          se salta). Si personas.ts llegara a exportar STUDENT_IDS, esos valores tienen prioridad.
 *   E2E_SOLO_MEAL_GROUP_NAME / E2E_FOREIGN_MEAL_GROUP_NAME
 *       -> nombre de un grupo de comidas propio del solo coach y de uno ajeno (opcionales;
 *          sin ellos el test de meal-groups queda como smoke estructural).
 *
 * Disciplina E2E (aprendida en tests/team/team-flows.spec.ts):
 *   - JAMAS networkidle (RSC streaming no asienta).
 *   - Guard del overlay de error de Next dev al cierre de cada test
 *     (salvo en las denegaciones, donde el overlay ES una señal válida de denegación).
 *
 * Ejecutar: npx playwright test --project=separation --workers=1
 *       (o: npx playwright test tests/separation/data-isolation.spec.ts --project=separation --workers=1)
 */

const { PERSONAS, hasPersonasPassword } = personasModule

// Contrato laxo para exports que personas.ts puede agregar más adelante
// (hoy no existen: caemos a defaults del seed / env sin romper el typecheck).
type OptionalPersonasExports = {
    STUDENT_NAMES?: { solo?: string; org?: string; pool?: string }
    STUDENT_IDS?: { solo?: string; org?: string; pool?: string }
}
const optional = personasModule as unknown as OptionalPersonasExports

const STUDENT_NAMES = {
    solo: optional.STUDENT_NAMES?.solo ?? 'E2E Solo Alumno',
    org: optional.STUDENT_NAMES?.org ?? 'E2E Org Alumno',
    pool: optional.STUDENT_NAMES?.pool ?? 'E2E Pool Alumno',
}

const STUDENT_IDS = {
    solo: optional.STUDENT_IDS?.solo ?? process.env.E2E_SOLO_ALUMNO_ID ?? '',
    org: optional.STUDENT_IDS?.org ?? process.env.E2E_ORG_ALUMNO_ID ?? '',
    pool: optional.STUDENT_IDS?.pool ?? process.env.E2E_POOL_ALUMNO_ID ?? '',
}

/** Programa creado por el OWNER del team — el pool plano lo comparte con todos los coaches. */
const TEAM_PROGRAM_NAME = 'E2E-SEED Programa Base'

const SOLO_MEAL_GROUP = process.env.E2E_SOLO_MEAL_GROUP_NAME ?? ''
const FOREIGN_MEAL_GROUP = process.env.E2E_FOREIGN_MEAL_GROUP_NAME ?? ''

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Overlay de ERROR de Next dev (no el portal: <nextjs-portal> siempre existe en dev como host
 * del botón DevTools). El diálogo vive en shadow DOM y los locators CSS lo atraviesan.
 */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

/**
 * Directorio /coach/clients: el alumno propio es visible y los ajenos tienen count 0.
 * Primero anclamos al nombre propio (contenido ya hidratado) y recién después
 * afirmamos ausencia — evita falsos verdes por streaming a medio render.
 */
async function expectDirectoryExactly(page: Page, visibleName: string, hiddenNames: string[]) {
    await page.goto('/coach/clients')
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(visibleName).first()).toBeVisible({ timeout: 20_000 })
    for (const name of hiddenNames) {
        await expect(page.getByText(name)).toHaveCount(0)
    }
    await expectNoRuntimeError(page)
}

/**
 * Denegación por URL directa de un perfil ajeno: el service lanza 'Client not found',
 * que en la app termina en error boundary ('Oops! Algo falló'), en el overlay de error
 * de dev, en la página 404 o en un redirect — cualquiera de las cuatro es denegación válida.
 * Lo INNEGOCIABLE: el nombre del alumno ajeno jamás se renderiza.
 */
async function expectClientProfileDenied(page: Page, clientId: string, foreignName: string) {
    await page.goto(`/coach/clients/${clientId}`)
    await expect
        .poll(
            async () => {
                const pathname = new URL(page.url()).pathname
                if (!pathname.includes(`/coach/clients/${clientId}`)) return 'redirected'
                const errorCard = page.getByText(/Algo falló|No pudimos cargar/i).first()
                if (await errorCard.isVisible().catch(() => false)) return 'error-boundary'
                const notFound = page.getByText('Página no encontrada').first()
                if (await notFound.isVisible().catch(() => false)) return 'not-found'
                const overlay = page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')
                if ((await overlay.count().catch(() => 0)) > 0) return 'dev-error-overlay'
                return 'pending'
            },
            {
                timeout: 25_000,
                message: 'el perfil ajeno debe terminar en error/redirect, nunca renderizar datos',
            },
        )
        .not.toBe('pending')
    await expect(page.getByText(foreignName)).toHaveCount(0)
}

// ----------------------------------------------------------------------------
// Suite B — agrupada por persona (cada describe reutiliza SU storageState)
// ----------------------------------------------------------------------------

test.describe('Suite B — aislamiento de datos por flujo', () => {
    test.skip(!hasPersonasPassword, 'E2E_PERSONAS_PASSWORD no seteado')

    test.describe('solo coach (standalone — Aurora Strength)', () => {
        test.use({ storageState: PERSONAS.soloCoach.storageState })

        test('directorio: ve a su alumno y NUNCA a los alumnos org/pool', async ({ page }) => {
            await expectDirectoryExactly(page, STUDENT_NAMES.solo, [STUDENT_NAMES.org, STUDENT_NAMES.pool])
        })

        test('programas: el picker de asignación lista SOLO a su alumno', async ({ page }) => {
            await page.goto('/coach/workout-programs')
            await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })

            // Bidireccional extra: el programa del team JAMAS aparece en la biblioteca standalone.
            await expect(page.getByText(TEAM_PROGRAM_NAME)).toHaveCount(0)

            // El picker vive en el diálogo "Asignar programa" (solo plantillas muestran el botón).
            const assignButton = page.getByRole('button', { name: 'Asignar', exact: true }).first()
            await assignButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
            const hasAssign = await assignButton.isVisible().catch(() => false)
            test.skip(!hasAssign, 'seed sin plantilla de programa para el solo coach (sin botón Asignar)')

            await assignButton.click()
            const dialog = page.getByRole('dialog')
            await expect(dialog.getByText('Asignar programa')).toBeVisible({ timeout: 10_000 })
            await dialog.getByText('Seleccionar alumnos').click()

            await expect(page.getByText(STUDENT_NAMES.solo).first()).toBeVisible({ timeout: 15_000 })
            await expect(page.getByText(STUDENT_NAMES.org)).toHaveCount(0)
            await expect(page.getByText(STUDENT_NAMES.pool)).toHaveCount(0)
            await expectNoRuntimeError(page)
        })

        test('meal-groups: ve solo sus grupos de comidas', async ({ page }) => {
            await page.goto('/coach/meal-groups')
            await expect(page.getByText('Grupos de Alimentos').first()).toBeVisible({ timeout: 20_000 })

            // Asserts por nombre solo si el seed publica los nombres por env; sin ellos el test
            // queda como smoke estructural (la página del contexto standalone renderiza sin error).
            if (SOLO_MEAL_GROUP) {
                await expect(page.getByText(SOLO_MEAL_GROUP).first()).toBeVisible({ timeout: 15_000 })
            }
            if (FOREIGN_MEAL_GROUP) {
                await expect(page.getByText(FOREIGN_MEAL_GROUP)).toHaveCount(0)
            }
            await expectNoRuntimeError(page)
        })

        test('URL directa: NO abre el perfil del alumno enterprise', async ({ page }) => {
            test.skip(!STUDENT_IDS.org, 'E2E_ORG_ALUMNO_ID no seteado (y personas.ts no exporta STUDENT_IDS)')
            await expectClientProfileDenied(page, STUDENT_IDS.org, STUDENT_NAMES.org)
        })
    })

    test.describe('org coach (enterprise — E2E Performance Lab)', () => {
        test.use({ storageState: PERSONAS.orgCoach.storageState })

        test('directorio: ve solo al alumno enterprise (ni solo ni pool)', async ({ page }) => {
            await expectDirectoryExactly(page, STUDENT_NAMES.org, [STUDENT_NAMES.solo, STUDENT_NAMES.pool])
        })

        test('nutrición: el board de alumnos lista SOLO al alumno enterprise', async ({ page }) => {
            await page.goto('/coach/nutrition-plans')
            const alumnosTab = page.getByRole('tab', { name: 'Alumnos' })
            await expect(alumnosTab).toBeVisible({ timeout: 20_000 })
            await alumnosTab.click()

            await expect(page.getByText(STUDENT_NAMES.org).first()).toBeVisible({ timeout: 20_000 })
            await expect(page.getByText(STUDENT_NAMES.solo)).toHaveCount(0)
            await expect(page.getByText(STUDENT_NAMES.pool)).toHaveCount(0)
            await expectNoRuntimeError(page)
        })

        test('URL directa: NO abre el perfil del alumno del pool', async ({ page }) => {
            test.skip(!STUDENT_IDS.pool, 'E2E_POOL_ALUMNO_ID no seteado (y personas.ts no exporta STUDENT_IDS)')
            await expectClientProfileDenied(page, STUDENT_IDS.pool, STUDENT_NAMES.pool)
        })
    })

    test.describe('team owner (pool — E2E Pool Vortex)', () => {
        test.use({ storageState: PERSONAS.teamOwner.storageState })

        test('directorio: ve al alumno del pool (ni solo ni org)', async ({ page }) => {
            await expectDirectoryExactly(page, STUDENT_NAMES.pool, [STUDENT_NAMES.solo, STUDENT_NAMES.org])
        })
    })

    test.describe('team coach (miembro del pool, can_manage=false)', () => {
        test.use({ storageState: PERSONAS.teamCoach.storageState })

        test('directorio: ve el MISMO pool que el owner (pool plano full-access)', async ({ page }) => {
            await expectDirectoryExactly(page, STUDENT_NAMES.pool, [STUDENT_NAMES.solo, STUDENT_NAMES.org])
        })

        test('programas: lista el programa creado por el OWNER (visibilidad cruzada del pool)', async ({ page }) => {
            await page.goto('/coach/workout-programs')
            await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
            await expect(page.getByText(TEAM_PROGRAM_NAME).first()).toBeVisible({ timeout: 20_000 })
            await expectNoRuntimeError(page)
        })

        test('nutrición: el board muestra el plan del alumno del pool (y nada de solo/org)', async ({ page }) => {
            await page.goto('/coach/nutrition-plans')
            const alumnosTab = page.getByRole('tab', { name: 'Alumnos' })
            await expect(alumnosTab).toBeVisible({ timeout: 20_000 })
            await alumnosTab.click()

            await expect(page.getByText(STUDENT_NAMES.pool).first()).toBeVisible({ timeout: 20_000 })
            await expect(page.getByText(STUDENT_NAMES.solo)).toHaveCount(0)
            await expect(page.getByText(STUDENT_NAMES.org)).toHaveCount(0)
            await expectNoRuntimeError(page)
        })

        test('URL directa: NO abre el perfil del alumno standalone', async ({ page }) => {
            test.skip(!STUDENT_IDS.solo, 'E2E_SOLO_ALUMNO_ID no seteado (y personas.ts no exporta STUDENT_IDS)')
            await expectClientProfileDenied(page, STUDENT_IDS.solo, STUDENT_NAMES.solo)
        })
    })
})
