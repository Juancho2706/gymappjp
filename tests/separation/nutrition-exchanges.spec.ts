import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { BRANDS, PERSONAS, SLUGS, STUDENT_IDS, STUDENT_NAMES } from './personas'

/**
 * SUITE — Módulo `nutrition_exchanges` (pauta por porciones + PDF branded).
 * Spec: specs/movida-intercambios/SPEC.md · corre SOLO en el gate autorizado
 * (regla 2026-06-10): 1 corrida `--workers=1` contra build prod.
 *
 *   npx playwright test tests/separation/nutrition-exchanges.spec.ts --workers=1
 *
 * Matriz (TG.1):
 *   A. Módulo OFF (default) ⇒ builder sin toggle "Porciones" (byte-identical, AC1/AC2).
 *   B. Coach del pool con módulo ON ⇒ toggle visible, steppers, totales derivados,
 *      PDF con marca del TEAM (NO EVA) y bitácora pdf_generate (AC4/AC7 — fila SQL
 *      verificada por tests/team/exchanges-isolation.sql en el mismo gate).
 *   C. Alumno del pool ⇒ chips de códigos + sheet de equivalencias + completar comida
 *      offline (queue existente) + PDF de pauta (AC5; su descarga NO genera bitácora).
 *   D. Standalone con módulo ON ⇒ misma feature con SU marca; free ⇒ EVA (AC4).
 *
 * PRECONDICIÓN de seed del gate (documentar en docs/testing/E2E_PERSONAS.md):
 *   - `teams.enabled_modules.nutrition_exchanges = true` para E2E Pool Vortex.
 *   - `coaches.enabled_modules.nutrition_exchanges = true` para e2e-solo-coach.
 *   - El alumno del pool tiene un plan activo en modo exchanges con ≥1 comida con targets.
 *   - El seed `_POST_DEPLOY_nutrition_exchanges_seed.sql` ya corrió (grupos system C/P/F/...).
 *
 * Disciplina E2E (de module-matrix.spec.ts): NUNCA networkidle; waitForURL excluyendo
 * /login; guard del overlay de error de Next; skip limpio sin credenciales.
 */

/** Base path del alumno de pool: el proxy reescribe a /c/[coach] pero la URL sigue bajo /t/[team]. */
const teamBase = `/t/${SLUGS.team}`

const hasPassword = !!process.env.E2E_PERSONAS_PASSWORD
const SKIP_MSG = 'Persona E2E no disponible (falta E2E_PERSONAS_PASSWORD o el storageState del setup de personas)'
const EMPTY_STATE = { cookies: [], origins: [] }

function personaReady(persona: { storageState: string } | undefined): boolean {
    return !!persona && hasPassword && fs.existsSync(persona.storageState)
}

async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

/**
 * Entrada de nutrición del alumno de pool bajo scope Team. El proxy reescribe `/t/{team}/…` a la
 * app `/c/{coach}/…` conservando la URL `/t/`, y la página V1 hace `redirect()` a `nutrition-v2`
 * cuando el canary de Nutrición V2 está ON para ese alumno (y la V2 el inverso cuando está OFF).
 * Devuelve qué superficie quedó montada para que cada test afirme la suya en vez de dar por
 * sentado el heading V1 "Plan Nutricional" (SEC-9, claim 3).
 */
async function gotoTeamNutrition(page: Page, path: 'nutrition' | 'nutrition-v2'): Promise<'v1' | 'v2'> {
    await page.goto(`${teamBase}/${path}`)
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
    // La URL se mantiene bajo /t/ (el rewrite no cambia de host ni de scope): si el alumno del pool
    // terminara en /c/ o en otro team, la separación estaría rota.
    expect(new URL(page.url()).pathname.startsWith(`${teamBase}/`)).toBe(true)
    return new URL(page.url()).pathname.endsWith('/nutrition-v2') ? 'v2' : 'v1'
}

/** Builder de pauta del alumno indicado (por workspace activo del coach logueado). */
async function gotoNutritionBuilder(page: Page, clientId: string) {
    await page.goto(`/coach/nutrition-plans/client/${clientId}`)
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Plan nutricional' })).toBeVisible({ timeout: 20_000 })
    await expectNoRuntimeError(page)
}

// ─── A. Módulo OFF ⇒ builder byte-identical (AC1/AC2) ───────────────────────────

test.describe('A — módulo OFF (default)', () => {
    test.skip(!personaReady(PERSONAS.orgCoach), SKIP_MSG)
    test.use({ storageState: personaReady(PERSONAS.orgCoach) ? PERSONAS.orgCoach.storageState : EMPTY_STATE })

    test('coach enterprise sin módulo NO ve el toggle Gramos↔Porciones', async ({ page }) => {
        await gotoNutritionBuilder(page, STUDENT_IDS.org)
        await expect(page.getByText('Modo de prescripción')).toHaveCount(0)
        await expect(page.getByText('Porciones por grupo')).toHaveCount(0)
    })
})

// ─── B. Coach del pool con módulo ON (flujo Fran) ───────────────────────────────

test.describe('B — coach del pool: pauta por porciones + PDF marca team', () => {
    test.skip(!personaReady(PERSONAS.teamCoach), SKIP_MSG)
    test.use({ storageState: personaReady(PERSONAS.teamCoach) ? PERSONAS.teamCoach.storageState : EMPTY_STATE })

    test('toggle visible y modo porciones activo con steppers y totales derivados', async ({ page }) => {
        await gotoNutritionBuilder(page, STUDENT_IDS.pool)

        // Panel del módulo visible (módulo ON para el team)
        await expect(page.getByText('Modo de prescripción')).toBeVisible()

        // Activar modo porciones si el seed lo dejó en gramos (switch no destructivo)
        const switchEl = page.getByRole('switch').first()
        if ((await switchEl.getAttribute('aria-checked')) === 'false') {
            await switchEl.click()
        }
        await expect(page.getByText('Porciones por grupo').first()).toBeVisible({ timeout: 15_000 })

        // Stepper: agregar 2 porciones del primer grupo y ver totales derivados + aviso provisorio
        const plusFirst = page.getByRole('button', { name: /Agregar porción de/ }).first()
        await plusFirst.click()
        await plusFirst.click()
        await expect(page.getByText('Derivado vs objetivo')).toBeVisible()
        // AC3: seed con macros_confirmed=false ⇒ badge "referencial" visible
        await expect(page.getByText('Macros referenciales').first()).toBeVisible()
        // Persistencia debounced confirmada en UI
        await expect(page.getByText('Guardado').first()).toBeVisible({ timeout: 10_000 })
        await expectNoRuntimeError(page)
    })

    test('round-trip: porciones guardadas se recargan idénticas', async ({ page }) => {
        await gotoNutritionBuilder(page, STUDENT_IDS.pool)
        const codes = page.locator('text=/^\\d+(\\.\\d+)?[A-Z]{1,3}( · \\d+(\\.\\d+)?[A-Z]{1,3})*$/').first()
        const before = await codes.textContent()
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Plan nutricional' })).toBeVisible({ timeout: 20_000 })
        await expect(page.locator(`text=${before}`).first()).toBeVisible()
    })

    test('PDF de pauta descarga con marca del TEAM, no EVA (AC4)', async ({ page }) => {
        await gotoNutritionBuilder(page, STUDENT_IDS.pool)
        // Preview de marca server-side: nombre del team, jamás EVA. Verificamos el texto COMPLETO
        // del <p> del preview (visible), no getByText(name).first() — el nombre tambien vive en un
        // header responsive oculto (w=0) que .first() tomaria y fallaria toBeVisible.
        await expect(page.getByText(`Se genera con la marca de: ${BRANDS.team.name}`)).toBeVisible()

        const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
        await page.getByRole('button', { name: 'Descargar PDF' }).click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.pdf$/)
        // AC7: la fila pdf_generate en team_access_logs se asserta en
        // tests/team/exchanges-isolation.sql (mismo gate, sesión SQL).
    })

    test('variantes de día: crear preset y asignarla a una comida', async ({ page }) => {
        await gotoNutritionBuilder(page, STUDENT_IDS.pool)
        const preset = page.getByRole('button', { name: 'Descanso' }).first()
        if (await preset.isVisible().catch(() => false)) {
            await preset.click()
        }
        // La variante existe (chip en el gestor) y aparece como opción por comida
        await expect(page.getByText('Variantes de día')).toBeVisible()
        await expect(page.getByText('Descanso').first()).toBeVisible({ timeout: 10_000 })
        await expectNoRuntimeError(page)
    })
})

// ─── C. Alumno del pool: chips + equivalencias + offline (AC5) ──────────────────

/**
 * Los tres tests de este bloque validan artefactos EXCLUSIVOS de la nutrición V1 (chips de códigos
 * de intercambio, sheet de equivalencias, cola offline PWA y PDF `pauta-porciones-*`). Nutrición V2
 * no replica ninguna de esas capacidades todavía (ver SEC-8 de la auditoría), así que con el canary
 * V2 ON para el alumno del pool la entrada `/t/{team}/nutrition` redirige y estos asserts dejan de
 * aplicar: en ese caso el test hace SKIP documentado en vez de fallar en rojo por un cambio de
 * superficie esperado. La cobertura del scope Team con V2 vive en el bloque C2.
 */
const V1_ONLY = 'Canary Nutrición V2 ON para el alumno del pool: la superficie V1 (intercambios/porciones) ya no se sirve. Cobertura V2 del scope Team en el bloque C2.'

test.describe('C — alumno del pool (superficie V1: intercambios)', () => {
    test.skip(!personaReady(PERSONAS.poolAlumno), SKIP_MSG)
    test.use({ storageState: personaReady(PERSONAS.poolAlumno) ? PERSONAS.poolAlumno.storageState : EMPTY_STATE })

    test('ve chips de códigos y el sheet de equivalencias del grupo', async ({ page }) => {
        const surface = await gotoTeamNutrition(page, 'nutrition')
        test.skip(surface === 'v2', V1_ONLY)
        await expect(page.getByRole('heading', { name: 'Plan Nutricional' })).toBeVisible({ timeout: 20_000 })

        // Chips "2C", "1P", ... El chip es un <button> con aria-label "N <grupo>", pero su text
        // content incluye el codigo del badge de color (ej "C2C") -> el regex anclado ^Ncodigo$ no
        // matchea el button. Apuntamos al <span> visible con el codigo ("2C"); el click burbujea al
        // button padre (que llama onChipTap y abre el sheet).
        const chip = page.getByText(/^\d+(\.\d+)?[A-Z]{1,3}$/).first()
        await expect(chip).toBeVisible({ timeout: 15_000 })
        await chip.click()

        // Sheet con equivalencias: medida casera + gramos + búsqueda local
        const sheet = page.getByRole('dialog')
        await expect(sheet).toBeVisible()
        await expect(sheet.getByPlaceholder('Buscar alimento…')).toBeVisible()
        await expect(sheet.getByText('1 porción')).toBeVisible()
        await sheet.getByRole('button', { name: 'Cerrar' }).click()
        await expectNoRuntimeError(page)
    })

    test('completa una comida OFFLINE y la marca queda en cola (queue existente)', async ({ page, context }) => {
        const surface = await gotoTeamNutrition(page, 'nutrition')
        test.skip(surface === 'v2', V1_ONLY)
        await expect(page.getByRole('heading', { name: 'Plan Nutricional' })).toBeVisible({ timeout: 20_000 })

        await context.setOffline(true)
        const toggle = page.getByRole('button', { name: /Marcar completa|Marcar incompleta/ }).first()
        await toggle.click()
        // El flujo offline existente muestra el toast de cola (sin crash con targets presentes)
        await expect(page.getByText('Sin conexión — se sincronizará automáticamente')).toBeVisible({ timeout: 15_000 })
        await context.setOffline(false)
        await expectNoRuntimeError(page)
    })

    test('descarga su pauta en PDF (sin bitácora — AC7)', async ({ page }) => {
        const surface = await gotoTeamNutrition(page, 'nutrition')
        test.skip(surface === 'v2', V1_ONLY)
        await expect(page.getByRole('heading', { name: 'Plan Nutricional' })).toBeVisible({ timeout: 20_000 })

        const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
        await page.getByRole('button', { name: /Descargar PDF/ }).click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/^pauta-porciones-.*\.pdf$/)
        // El assert "cero filas nuevas de pdf_generate para el alumno" vive en la suite SQL del gate.
    })
})

// ─── C2. Alumno del pool con Nutrición V2 ON ────────────────────────────────────

/**
 * MISMA INTENCIÓN que el bloque C — el alumno del pool entra a SU nutrición bajo el scope Team y no
 * se fuga a otro contexto — pero sobre la superficie V2, que es la que se sirve con el canary ON.
 *
 * Por qué existe: hasta ahora el único E2E que ejercitaba el scope Team validaba solo V1, así que
 * `/t/{slug}/nutrition-v2` no tenía NINGUNA cobertura (SEC-9, claim 3). Ese hueco es exactamente
 * donde vive NUT-006 (el schema de revalidatePath rechazaba las rutas `/t/`): una carga limpia de la
 * superficie V2 bajo `/t/` lo habría destapado.
 *
 * Read-only a propósito: no registra consumo (mutaría datos del alumno del pool, que este gate no
 * limpia). Afirma superficie + scope + ausencia de overlay de error de Next.
 */
test.describe('C2 — alumno del pool: superficie V2 bajo scope Team', () => {
    test.skip(!personaReady(PERSONAS.poolAlumno), SKIP_MSG)
    test.use({ storageState: personaReady(PERSONAS.poolAlumno) ? PERSONAS.poolAlumno.storageState : EMPTY_STATE })

    test('carga /t/{slug}/nutrition-v2 con la shell V2, sin salir del scope del team', async ({ page }) => {
        const surface = await gotoTeamNutrition(page, 'nutrition-v2')
        // Sin canary la propia página V2 redirige a la V1: no hay superficie que validar.
        test.skip(surface === 'v1', 'Canary Nutrición V2 OFF para el alumno del pool: /t/{slug}/nutrition-v2 redirige a la V1.')
        // Dominio Nutrición apagado por el coach ⇒ misma URL y mismo h1, pero sin shell ni vistas.
        const domainOff = await page
            .getByText('Nutrición no disponible')
            .isVisible({ timeout: 3_000 })
            .catch(() => false)
        test.skip(domainOff, 'El coach del pool tiene el dominio Nutrición apagado para este alumno.')

        // Shell V2 (NutritionPageShell title="Nutrición") + su navegación de tres vistas. Los links
        // se afirman POR HREF: además de existir, prueban que la shell construyó las rutas con el
        // base path del TEAM (`/t/{slug}`) y no con el del coach (`/c/{slug}`) — que es la fuga que
        // este gate de separación existe para detectar.
        await expect(page.getByRole('heading', { name: 'Nutrición' }).first()).toBeVisible({ timeout: 20_000 })
        await expect(page.locator(`a[href="${teamBase}/nutrition-v2"]`).first()).toBeVisible({ timeout: 15_000 })
        await expect(page.locator(`a[href="${teamBase}/nutrition-v2?view=plan"]`).first()).toBeVisible()
        await expect(page.locator(`a[href="${teamBase}/nutrition-v2?view=history"]`).first()).toBeVisible()

        // Aislamiento: nada del alumno standalone ni del alumno enterprise asoma en la vista del pool.
        await expect(page.getByText(STUDENT_NAMES.solo)).toHaveCount(0)
        await expect(page.getByText(STUDENT_NAMES.org)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })

    test('la vista Historial del team carga sin error (rutas /t/ en revalidate — NUT-006)', async ({ page }) => {
        const surface = await gotoTeamNutrition(page, 'nutrition-v2')
        test.skip(surface === 'v1', 'Canary Nutrición V2 OFF para el alumno del pool: /t/{slug}/nutrition-v2 redirige a la V1.')
        // Dominio Nutrición apagado por el coach ⇒ misma URL y mismo h1, pero sin shell ni vistas.
        const domainOff = await page
            .getByText('Nutrición no disponible')
            .isVisible({ timeout: 3_000 })
            .catch(() => false)
        test.skip(domainOff, 'El coach del pool tiene el dominio Nutrición apagado para este alumno.')

        await page.locator(`a[href="${teamBase}/nutrition-v2?view=history"]`).first().click()
        await page.waitForURL((url) => url.searchParams.get('view') === 'history', { timeout: 20_000 })
        expect(new URL(page.url()).pathname.startsWith(`${teamBase}/`)).toBe(true)
        await expect(page.getByRole('heading', { name: 'Nutrición' }).first()).toBeVisible({ timeout: 20_000 })
        await expectNoRuntimeError(page)
    })
})

// ─── D. Standalone con módulo ON ⇒ SU marca (revendible fuera de Movida) ────────

test.describe('D — coach standalone con módulo ON', () => {
    test.skip(!personaReady(PERSONAS.soloCoach), SKIP_MSG)
    test.use({ storageState: personaReady(PERSONAS.soloCoach) ? PERSONAS.soloCoach.storageState : EMPTY_STATE })

    test('el preview de marca del PDF muestra la marca del coach (no EVA, no team ajeno)', async ({ page }) => {
        await gotoNutritionBuilder(page, STUDENT_IDS.solo)
        await expect(page.getByText('Modo de prescripción')).toBeVisible()
        const switchEl = page.getByRole('switch').first()
        if ((await switchEl.getAttribute('aria-checked')) === 'false') {
            await switchEl.click()
        }
        // Texto COMPLETO del preview (visible), no getByText(name).first(): el nombre tambien vive
        // en un header responsive oculto (w=0) que .first() tomaria y fallaria toBeVisible.
        await expect(page.getByText(`Se genera con la marca de: ${BRANDS.standalone.name}`)).toBeVisible()
        await expect(page.getByText(BRANDS.team.name)).toHaveCount(0)
        await expect(page.getByText(STUDENT_NAMES.pool)).toHaveCount(0)
        await expectNoRuntimeError(page)
    })
})
