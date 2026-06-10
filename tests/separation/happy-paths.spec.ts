import { test, expect, type Page } from '@playwright/test'

/**
 * SUITE F — Happy paths de los 3 flujos separados (standalone / enterprise / team).
 *
 * Personas Wave 2 (todas @evatest.cl, password unica via E2E_PERSONAS_PASSWORD):
 *   - e2e-solo-coach / e2e-solo-alumno        -> coach standalone "Aurora Strength" (/c/e2e-aurora-strength)
 *   - e2e-org-coach  / e2e-org-alumno         -> org "E2E Performance Lab" (/e/e2e-performance-lab)
 *   - e2e-team-owner / e2e-team-coach / e2e-pool-alumno -> team "E2E Pool Vortex" (/t/e2e-pool-vortex)
 *
 * ESCRITURAS permitidas SOLO sobre personas e2e-* (sets de workout, check-ins,
 * habitos diarios, comidas completadas). Cada caso asevera el round-trip del
 * WRITE via UI (reload o lectura desde el otro rol).
 *
 * Disciplina E2E (de tests/team/team-flows.spec.ts):
 *   - NUNCA networkidle (RSC streaming no asienta).
 *   - waitForURL con patrones que EXCLUYEN la pagina de login.
 *   - Guard de overlay de error de Next dev ([data-nextjs-dialog]).
 *   - mode: 'serial' + correr con --workers=1.
 *   - Credenciales/ids via env; test.skip si faltan.
 *
 * Flujos fragiles OMITIDOS a proposito (documentado para el integrador):
 *   - Editar el nombre de un programa creado por el owner via /coach/builder
 *     (DnD + autosave del builder: demasiado fragil para un happy path).
 *   - Asercion coach-side del board de nutricion del org alumno (opcional en el
 *     encargo; el round-trip se asevera alumno-side via reload).
 *
 * Ejecutar: npx playwright test tests/separation/happy-paths.spec.ts --project=separation --workers=1
 */

const PASSWORD = process.env.E2E_PERSONAS_PASSWORD ?? ''

const SOLO_SLUG = 'e2e-aurora-strength'
const ORG_SLUG = 'e2e-performance-lab'
const TEAM_SLUG = 'e2e-pool-vortex'

const SOLO_COACH_EMAIL = 'e2e-solo-coach@evatest.cl'
const SOLO_ALUMNO_EMAIL = 'e2e-solo-alumno@evatest.cl'
const ORG_COACH_EMAIL = 'e2e-org-coach@evatest.cl'
const ORG_ALUMNO_EMAIL = 'e2e-org-alumno@evatest.cl'
const TEAM_OWNER_EMAIL = 'e2e-team-owner@evatest.cl'
const TEAM_COACH_EMAIL = 'e2e-team-coach@evatest.cl'
const POOL_ALUMNO_EMAIL = 'e2e-pool-alumno@evatest.cl'

// Ids opcionales para navegar directo a /coach/clients/<id> (fallback: click por email en el directorio).
const SOLO_ALUMNO_ID = process.env.E2E_SOLO_ALUMNO_ID ?? ''
const ORG_ALUMNO_ID = process.env.E2E_ORG_ALUMNO_ID ?? ''
const POOL_ALUMNO_ID = process.env.E2E_POOL_ALUMNO_ID ?? ''

// Pesos de check-in que luego se buscan coach-side como "<peso> kg".
const SOLO_CHECKIN_WEIGHT = '68.8'
const POOL_CHECKIN_WEIGHT = '70.4'

/**
 * Overlay de ERROR de Next dev (no el portal: <nextjs-portal> siempre existe en dev 16
 * como host del boton DevTools). Los locators CSS de Playwright atraviesan shadow roots.
 */
async function expectNoRuntimeError(page: Page) {
    await expect(page.locator('[data-nextjs-dialog], [data-nextjs-error-overlay]')).toHaveCount(0)
}

async function acceptCookiesIfPresent(page: Page) {
    const accept = page.getByRole('button', { name: 'Aceptar', exact: true })
    if (await accept.isVisible().catch(() => false)) {
        await accept.click().catch(() => undefined)
    }
}

/**
 * Login de alumno en su shell (/c, /e o /t — los tres usan el mismo form rewriteado).
 * El patron de waitForURL apunta a /dashboard, EXCLUYENDO la propia pagina de login.
 */
async function loginStudent(page: Page, base: string, email: string) {
    await page.goto(`${base}/login`)
    // Matar service workers viejos (cache offline del PWA puede servir HTML rancio).
    await page.evaluate(async () => {
        const registrations = await navigator.serviceWorker?.getRegistrations?.()
        await Promise.all((registrations ?? []).map((registration) => registration.unregister()))
    })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/contraseña/i).fill(PASSWORD)
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.waitForURL(`**${base}/dashboard**`, { timeout: 30_000 })
    await acceptCookiesIfPresent(page)
}

/**
 * Login de coach via /login. Las personas 1, 4, 6 y 7 son single-context (sin
 * switcher), asi que el destino esperado es /coach/dashboard directo; el branch
 * de /workspace/select queda como red de seguridad (click por texto, igual que
 * el patron multi-context de Jose Fit en team-flows).
 */
async function loginCoach(page: Page, email: string, workspaceText: string | RegExp) {
    await page.goto('/login')
    await page.getByRole('textbox', { name: /email/i }).fill(email)
    await page.getByRole('textbox', { name: /contraseña/i }).fill(PASSWORD)
    await page.getByRole('button', { name: /ingresar|iniciar/i }).click()
    await page.waitForURL(/\/(coach\/dashboard|workspace\/select)/, { timeout: 30_000 })
    if (page.url().includes('/workspace/select')) {
        await page.getByText(workspaceText).first().click()
        await page.waitForURL('**/coach/dashboard**', { timeout: 30_000 })
    }
}

/**
 * Abre el detalle de un alumno: directo por id si hay env var, si no via el
 * directorio (la fila del directorio navega con router.push al hacer click y
 * muestra el email del alumno, asi que el click por email es estable).
 */
async function openClientDetail(page: Page, opts: { id?: string; email: string }) {
    if (opts.id) {
        await page.goto(`/coach/clients/${opts.id}`)
    } else {
        await page.goto('/coach/clients')
        const emailCell = page.getByText(opts.email).first()
        await expect(emailCell).toBeVisible({ timeout: 25_000 })
        await emailCell.click()
    }
    // El patron exige un segmento despues de /clients/ -> nunca matchea el listado.
    await page.waitForURL(/\/coach\/clients\/[^/?]+/, { timeout: 30_000 })
    await expect(page.getByRole('main')).toBeVisible({ timeout: 25_000 })
    await expectNoRuntimeError(page)
}

/** Flujo de check-in de alumno (3 pasos, fotos opcionales se saltan). */
async function submitCheckin(page: Page, base: string, weight: string) {
    await page.goto(`${base}/check-in`)
    const weightInput = page.getByLabel('Peso actual (kg)')
    await expect(weightInput).toBeVisible({ timeout: 30_000 })
    await weightInput.click()
    await weightInput.pressSequentially(weight)

    const continuar = page.getByRole('button', { name: /Continuar/i })
    await expect(continuar).toBeEnabled()
    await continuar.click()
    // Paso 2 (fotos opcionales) — anclar al texto del paso antes de seguir.
    await expect(page.getByText(/fotos son opcionales/i)).toBeVisible({ timeout: 15_000 })
    await continuar.click()

    const enviar = page.getByRole('button', { name: 'Enviar Check-in' })
    await expect(enviar).toBeVisible({ timeout: 15_000 })
    await enviar.click()
    await expect(page.getByRole('heading', { name: /Check-in Enviado/i })).toBeVisible({
        timeout: 45_000,
    })
    await expectNoRuntimeError(page)
}

test.describe.configure({ mode: 'serial' })

test.describe('Suite F — happy paths por flujo', () => {
    test.skip(!PASSWORD, 'E2E_PERSONAS_PASSWORD no seteado')

    // ── F1 · STANDALONE: alumno registra un set del workout de hoy ────────────
    test('F1 solo alumno: registra un set del workout de hoy y persiste tras reload', async ({ page }) => {
        test.setTimeout(150_000)
        await loginStudent(page, `/c/${SOLO_SLUG}`, SOLO_ALUMNO_EMAIL)

        // Hero del dashboard: "Empezar entrenamiento" (pendiente) o "Ver registro" (ya logueado).
        const heroLink = page.getByRole('link', { name: /Empezar entrenamiento|Ver registro/ }).first()
        const hasWorkout = await heroLink
            .waitFor({ state: 'visible', timeout: 20_000 })
            .then(() => true)
            .catch(() => false)
        test.skip(!hasWorkout, 'El seed no tiene workout para hoy (rest day) — F1 no aplica')

        await heroLink.click()
        await page.waitForURL('**/workout/**', { timeout: 30_000 })
        await expectNoRuntimeError(page)

        const loggedButtons = page.getByRole('button', { name: 'Set guardado, toca para editar' })
        const saveButtons = page.getByRole('button', { name: 'Guardar set', exact: true })
        await expect(saveButtons.or(loggedButtons).first()).toBeVisible({ timeout: 25_000 })

        const loggedBefore = await loggedButtons.count()

        if ((await saveButtons.count()) > 0) {
            // Primera fila NO logueada: peso + reps + check.
            const row = page
                .locator('form')
                .filter({ has: page.getByRole('button', { name: 'Guardar set', exact: true }) })
                .first()
            await row.locator('input[name="weight_kg"]').fill('42.5')
            await row.locator('input[name="reps_done"]').fill('10')
            await row.getByRole('button', { name: 'Guardar set', exact: true }).click()

            // Optimistic UI primero…
            await expect
                .poll(() => loggedButtons.count(), { timeout: 20_000 })
                .toBeGreaterThanOrEqual(loggedBefore + 1)
            // …y round-trip real: el server action tiene que haber persistido.
            await page.waitForTimeout(1500)
            await page.reload()
            await expect
                .poll(() => loggedButtons.count(), { timeout: 25_000 })
                .toBeGreaterThanOrEqual(loggedBefore + 1)
        } else {
            // Todos los sets ya estaban logueados (re-run de la suite): verificar
            // al menos que el estado persistido se sirve desde el server.
            await page.reload()
            await expect(loggedButtons.first()).toBeVisible({ timeout: 25_000 })
        }
        await expectNoRuntimeError(page)
    })

    // ── F2 · STANDALONE: alumno envia check-in (peso 68.8) ───────────────────
    test('F2 solo alumno: envia check-in con peso 68.8', async ({ page }) => {
        test.setTimeout(120_000)
        await loginStudent(page, `/c/${SOLO_SLUG}`, SOLO_ALUMNO_EMAIL)
        await submitCheckin(page, `/c/${SOLO_SLUG}`, SOLO_CHECKIN_WEIGHT)
    })

    // ── F3 · STANDALONE: coach ve el ultimo check-in en el detalle ───────────
    test('F3 solo coach: ve el check-in 68.8 kg en el detalle del alumno', async ({ page }) => {
        test.setTimeout(120_000)
        await loginCoach(page, SOLO_COACH_EMAIL, /Aurora Strength/)
        await openClientDetail(page, { id: SOLO_ALUMNO_ID || undefined, email: SOLO_ALUMNO_EMAIL })

        await expect(page.getByText('Último check-in').first()).toBeVisible({ timeout: 25_000 })
        await expect(page.getByText(`${SOLO_CHECKIN_WEIGHT} kg`).first()).toBeVisible({ timeout: 15_000 })
        await expectNoRuntimeError(page)
    })

    // ── F4 · STANDALONE: alumno registra un habito diario y persiste ─────────
    test('F4 solo alumno: registra pasos en "Hábitos del día" y persiste tras reload', async ({ page }) => {
        test.setTimeout(150_000)
        await loginStudent(page, `/c/${SOLO_SLUG}`, SOLO_ALUMNO_EMAIL)

        // El tracker vive en el dashboard (widget RSC) y tambien en /nutrition.
        // Probar dashboard primero; fallback a nutrition.
        let header = page.getByText('Hábitos del día', { exact: true }).first()
        let found = await header
            .waitFor({ state: 'visible', timeout: 15_000 })
            .then(() => true)
            .catch(() => false)
        if (!found) {
            await page.goto(`/c/${SOLO_SLUG}/nutrition`)
            header = page.getByText('Hábitos del día', { exact: true }).first()
            found = await header
                .waitFor({ state: 'visible', timeout: 20_000 })
                .then(() => true)
                .catch(() => false)
        }
        test.skip(!found, 'Tracker "Hábitos del día" no visible ni en dashboard ni en nutrition')

        await header.click()
        const stepsInput = page.getByPlaceholder('Ej: 8000')
        await expect(stepsInput).toBeVisible({ timeout: 10_000 })

        // Valor unico por corrida para asegurar que el round-trip es de ESTE write.
        const stepsValue = String(7000 + (Date.now() % 900))
        await stepsInput.fill(stepsValue)
        await stepsInput.blur() // save() se dispara onBlur
        await expect(page.getByText('Guardando…')).toHaveCount(0, { timeout: 15_000 })

        // Round-trip: recargar y leer el valor que devuelve el server (el
        // componente re-fetchea via getDailyHabits en un useEffect — darle un beat).
        let persisted = ''
        for (let attempt = 0; attempt < 3 && persisted !== stepsValue; attempt++) {
            await page.waitForTimeout(1500)
            await page.reload()
            const reloadedHeader = page.getByText('Hábitos del día', { exact: true }).first()
            await expect(reloadedHeader).toBeVisible({ timeout: 25_000 })
            await reloadedHeader.click()
            const reloadedInput = page.getByPlaceholder('Ej: 8000')
            await expect(reloadedInput).toBeVisible({ timeout: 10_000 })
            await page.waitForTimeout(800)
            persisted = await reloadedInput.inputValue()
        }
        expect(persisted).toBe(stepsValue)
        await expectNoRuntimeError(page)
    })

    // ── F5 · ENTERPRISE: org coach abre el detalle del org alumno ────────────
    test('F5 org coach: abre el detalle del org alumno sin error overlay', async ({ page }) => {
        test.setTimeout(120_000)
        await loginCoach(page, ORG_COACH_EMAIL, /E2E Performance Lab/)
        await openClientDetail(page, { id: ORG_ALUMNO_ID || undefined, email: ORG_ALUMNO_EMAIL })

        // Anclar a contenido real del perfil (snapshot de check-in en cualquiera de sus 2 estados).
        await expect(
            page.getByText(/Último check-in|Aún no hay check-ins/).first()
        ).toBeVisible({ timeout: 25_000 })
        await expectNoRuntimeError(page)
    })

    // ── F6 · ENTERPRISE: org alumno completa una comida en /e ────────────────
    test('F6 org alumno: completa/descompleta una comida y persiste tras reload', async ({ page }) => {
        test.setTimeout(150_000)
        await loginStudent(page, `/e/${ORG_SLUG}`, ORG_ALUMNO_EMAIL)

        await page.goto(`/e/${ORG_SLUG}/nutrition`)
        // La URL debe QUEDARSE en /e (rewrite, no redirect a /c).
        expect(page.url()).toContain(`/e/${ORG_SLUG}/nutrition`)
        await expect(page.getByRole('heading', { name: 'Plan Nutricional' })).toBeVisible({
            timeout: 30_000,
        })

        const toggles = page.locator(
            'button[aria-label="Marcar completa"], button[aria-label="Marcar incompleta"]'
        )
        const hasMeals = await toggles
            .first()
            .waitFor({ state: 'visible', timeout: 15_000 })
            .then(() => true)
            .catch(() => false)
        test.skip(!hasMeals, 'El seed no tiene plan nutricional con comidas para hoy — F6 no aplica')

        // Round-trip preciso sobre la PRIMERA comida (orden de plan estable):
        // se invierte su estado y se verifica el estado nuevo despues del reload.
        const before = await toggles.first().getAttribute('aria-label')
        const after = before === 'Marcar completa' ? 'Marcar incompleta' : 'Marcar completa'
        await toggles.first().click()
        await expect(toggles.first()).toHaveAttribute('aria-label', after, { timeout: 15_000 })

        await page.waitForTimeout(1500) // settle del server action (optimistic UI primero)
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Plan Nutricional' })).toBeVisible({
            timeout: 30_000,
        })
        await expect(
            page
                .locator('button[aria-label="Marcar completa"], button[aria-label="Marcar incompleta"]')
                .first()
        ).toHaveAttribute('aria-label', after, { timeout: 20_000 })
        await expectNoRuntimeError(page)
    })

    // ── F7 · TEAM: coach del pool (can_manage=false) abre el perfil del alumno ─
    test('F7 team coach: abre el detalle del pool alumno sin error overlay', async ({ page }) => {
        test.setTimeout(120_000)
        await loginCoach(page, TEAM_COACH_EMAIL, /E2E Pool Vortex/)
        await openClientDetail(page, { id: POOL_ALUMNO_ID || undefined, email: POOL_ALUMNO_EMAIL })

        await expect(
            page.getByText(/Último check-in|Aún no hay check-ins/).first()
        ).toBeVisible({ timeout: 25_000 })
        await expectNoRuntimeError(page)
    })

    // ── F8 · TEAM: pool alumno envia check-in via /t (sin consent gate) ──────
    test('F8 pool alumno: envia check-in 70.4 via /t y la URL se queda en /t', async ({ page }) => {
        test.setTimeout(120_000)
        await loginStudent(page, `/t/${TEAM_SLUG}`, POOL_ALUMNO_EMAIL)
        // Consent ya otorgado por el seed: nunca debe pasar por /consent.
        expect(page.url()).not.toContain('/consent')

        await submitCheckin(page, `/t/${TEAM_SLUG}`, POOL_CHECKIN_WEIGHT)
        // El shell rewriteado mantiene el base path /t.
        expect(page.url()).toContain(`/t/${TEAM_SLUG}/`)
    })

    // ── F9 · TEAM: owner Y coach del pool ven el mismo check-in ──────────────
    test('F9 team owner y team coach ven el check-in 70.4 kg del pool alumno', async ({ browser }) => {
        test.setTimeout(240_000)
        test.skip(!POOL_ALUMNO_ID, 'E2E_POOL_ALUMNO_ID no seteado')

        for (const email of [TEAM_OWNER_EMAIL, TEAM_COACH_EMAIL]) {
            const context = await browser.newContext()
            const page = await context.newPage()
            try {
                await loginCoach(page, email, /E2E Pool Vortex/)
                await openClientDetail(page, { id: POOL_ALUMNO_ID, email: POOL_ALUMNO_EMAIL })

                await expect(page.getByText('Último check-in').first()).toBeVisible({ timeout: 25_000 })
                await expect(page.getByText(`${POOL_CHECKIN_WEIGHT} kg`).first()).toBeVisible({
                    timeout: 15_000,
                })
                await expectNoRuntimeError(page)
            } finally {
                await context.close()
            }
        }
    })
})
