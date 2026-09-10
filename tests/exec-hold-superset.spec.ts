import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

/**
 * Caso CANÓNICO del hold — tren «cuenta atrás en pantalla» (W6.10, escenario de
 * `docs/specs/cuenta-atras-en-pantalla/DATA-TESTING.md` §6.5).
 *
 * Qué prueba, en un solo recorrido de alumno y con UN navegador:
 *   V1  el media NUNCA se colapsa: el módulo de reloj va DEBAJO (se verifica geométricamente).
 *   V2  al llegar a 0 la serie se ANOTA y se ENVÍA sola, sin que el alumno toque nada.
 *   V4  dentro de la superserie la tarjeta activa pasa sola al miembro siguiente de la ronda.
 *   D2  el último miembro de la ronda ofrece «Ronda lista · Descansar 90 s» y el descanso NO arranca solo.
 *   V3  en fuerza por tiempo (pantalla sola) a 0 queda «10 kg × 5 s» y el alumno elige
 *       «Descansar 90 s» o «Siguiente serie»: nunca se pasa solo.
 *
 * Archivo PROPIO (no una ampliación de `workout-flow.spec.ts`): el project `chromium` de
 * `playwright.config.ts:60-75` corre `tests/**\/*.spec.ts`, así que este spec entra al mismo gate sin
 * tocar el otro archivo.
 *
 * DATOS: 100% sintéticos. El plan lo siembra `scripts/seed-e2e-personas.mjs`
 * (`seedHoldCanonicalPlan`, plan «E2E-SEED Dia B (hold)» del alumno E2E standalone) y su id se pasa
 * por `E2E_HOLD_PLAN_ID`. NUNCA se corre contra datos de Movens ni de ningún coach real.
 *
 * RELOJ REAL, sin reloj falso: los bloques del seed prescriben 5 s (el mínimo del rango duro 5..600
 * de `WorkoutBlockSchema`), así que la cuenta atrás llega a 0 sola en segundos.
 *
 * LIMPIEZA: este spec NO borra nada. Las filas de `workout_logs` que deja son del alumno E2E y de
 * un plan sintético; se quedan ahí (una corrida futura del seed no las toca, y el plan es
 * idempotente por título). Si alguna vez estorban, se limpian a mano contra ese `plan_id`.
 *
 * Cómo correr:
 *   pnpm exec playwright test tests/exec-hold-superset.spec.ts --workers=1
 * Variables: `docs/testing/E2E_PERSONAS.md` §«Plan canónico del hold».
 */

const slug = process.env.E2E_COACH_SLUG
const email = process.env.E2E_CLIENT_EMAIL
const password = process.env.E2E_CLIENT_PASSWORD
const holdPlanId = process.env.E2E_HOLD_PLAN_ID
/** Assert de DB, SOLO LECTURA y con la anon key + el login del propio alumno (RLS). Nunca service_role. */
const supabaseUrl = process.env.E2E_SUPABASE_URL
const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY

const UI_ENV_HINT = 'Set E2E_COACH_SLUG, E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD, E2E_HOLD_PLAN_ID'
const DB_ENV_HINT = `${UI_ENV_HINT} + E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY (assert de DB, solo lectura)`

const uiReady = Boolean(slug && email && password && holdPlanId)
const dbReady = Boolean(uiReady && supabaseUrl && supabaseAnonKey)

/** El hold es de 5 s reales + red de producción: los tiempos de espera son generosos a propósito. */
const HOLD_SETTLE_MS = 60_000

// Un solo navegador y en orden: el assert de DB lee la fila que escribe el recorrido de arriba.
test.describe.configure({ mode: 'serial' })

test.describe('W6.10 · caso canónico del hold (superserie + fuerza por tiempo)', () => {
    test('superserie con reloj, cierre de ronda y fuerza por tiempo', async ({ page }) => {
        test.skip(!uiReady, UI_ENV_HINT)
        test.setTimeout(240_000)

        // Preferencia D5 «Pasar solo al descanso» en OFF de forma determinista. `omni_autotimer` es el
        // carril que lee hoy `WorkoutExecutionClient` y sigue siendo el fallback de migración del
        // resolver por alumno (`resolveAutoRestDefault`, paso 2), así que vale para las dos versiones.
        // `omni_stepper` fija el modo paso a paso, que es donde viven `SupersetStepV3`/`ExerciseStepV3`.
        await page.addInitScript(() => {
            try {
                localStorage.setItem('omni_autotimer', 'false')
                localStorage.setItem('omni_stepper', 'true')
            } catch {
                /* modo privado: el default de V3 ya es stepper y el panel de descanso se verifica igual */
            }
        })

        await page.goto('/')
        await page.evaluate(async () => {
            const registrations = await navigator.serviceWorker?.getRegistrations?.()
            await Promise.all((registrations ?? []).map((registration) => registration.unregister()))
        })

        await page.goto(`/c/${slug}/login`)
        await page.getByLabel('Email').fill(email!)
        await page.getByLabel('Contraseña').fill(password!)
        await page.getByRole('button', { name: 'Ingresar' }).click()
        await page.waitForTimeout(1500)

        await page.goto(`/c/${slug}/workout/${holdPlanId}`)
        await expect(page).toHaveURL(new RegExp(`/c/${slug}/workout/${holdPlanId}`), { timeout: 30_000 })

        const acceptCookies = page.getByRole('button', { name: 'Aceptar' })
        if (await acceptCookies.isVisible().catch(() => false)) await acceptCookies.click()

        // Apertura V3: splash «Preparando tu sesión» (se puede saltar tocando) → Inicio → sesión.
        const intro = page.getByRole('button', { name: 'Preparando tu sesión — toca para saltar' })
        if (await intro.isVisible({ timeout: 10_000 }).catch(() => false)) await intro.click()
        const empezar = page.getByRole('button', { name: 'EMPEZAR' })
        if (await empezar.isVisible({ timeout: 20_000 }).catch(() => false)) await empezar.click()

        // Modal de una sola vez de D5: si aparece, se cierra con «Listo» DEJANDO el toggle en OFF (el
        // toggle nace con el valor resuelto, que acá es OFF por el `omni_autotimer` de arriba: no se
        // toca). Rama DEFENSIVA a propósito — el alumno E2E llega con historial, así que no entra en
        // la cohorte de «primer entreno» (`isFirstWorkout`) y normalmente el modal no sale.
        const d5Modal = page.getByTestId('autorest-modal')
        if (await d5Modal.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await expect(d5Modal).toContainText('¿Pasamos solo al descanso?')
            await expect(page.getByTestId('autorest-modal-toggle')).toHaveAttribute('aria-checked', 'false')
            await page.getByTestId('autorest-modal-cta').click()
            await expect(d5Modal).toBeHidden()
        }

        // ── Paso 1 · el media se ve y el módulo de reloj está DEBAJO (V1) ─────────────────────
        const activeCard = page.locator('.exec-v3-excard.is-active')
        await expect(activeCard).toBeVisible({ timeout: 45_000 })

        const media = activeCard.locator('.exec-v3-media')
        await expect(media).toBeVisible()
        const holdModule = activeCard.locator('[data-testid^="hold-ss-"][data-testid$="-module"]')
        await expect(holdModule).toBeVisible()

        const mediaBox = await media.boundingBox()
        const holdBox = await holdModule.boundingBox()
        expect(mediaBox, 'el media del ejercicio tiene que estar en pantalla').not.toBeNull()
        expect(holdBox, 'el módulo de hold tiene que estar en pantalla').not.toBeNull()
        // V1 en geometría pura: el borde superior del módulo no puede quedar por encima del pie del media.
        expect(holdBox!.y).toBeGreaterThanOrEqual(mediaBox!.y + mediaBox!.height - 1)

        // ── Paso 2 · «Iniciar hold» ⇒ el anillo corre ────────────────────────────────────────
        const startHold = activeCard.locator('[data-testid^="hold-ss-"][data-testid$="-start"]')
        await expect(startHold).toHaveText(/Iniciar hold/)
        await startHold.click()
        await expect(holdModule).toHaveAttribute('data-status', 'running', { timeout: 15_000 })
        await expect(holdModule.locator('[data-testid$="-clock"]')).toBeVisible()

        // ── Paso 3 · a 0 la serie queda guardada SIN tocar nada (V2) y la tarjeta activa pasa
        //            sola al miembro de fuerza (V4). `per_side`: izquierdo → derecho (una sola fila).
        const activeReps = activeCard.getByLabel('Repeticiones lado izquierdo')
        await expect(activeReps).toBeVisible({ timeout: HOLD_SETTLE_MS })
        // El miembro de fuerza clásica no monta reloj: si no hay módulo, la tarjeta activa ya cambió.
        await expect(activeCard.locator('[data-testid$="-module"]')).toHaveCount(0)

        // ── Paso 4 · cerrar la ronda con el miembro de fuerza ⇒ «Ronda lista · Descansar 90 s»
        //            y el descanso NO arranca solo (D2, con la preferencia en OFF).
        await activeReps.fill('10')
        await activeCard.getByLabel('Repeticiones lado derecho').fill('10')
        await activeCard.getByRole('button', { name: 'Aplastar serie' }).click()

        const roundRest = page.getByTestId('rest-offer-round-rest')
        await expect(roundRest).toBeVisible({ timeout: 30_000 })
        await expect(roundRest).toHaveText(/Ronda lista · Descansar 90 s/)
        // El interstitial de descanso es `role="dialog"` con `aria-label="Descanso"`: si no está
        // montado, nadie arrancó el descanso por su cuenta.
        await expect(page.getByRole('dialog', { name: 'Descanso' })).toHaveCount(0)

        // ── Paso 5 · bloque suelto de FUERZA POR TIEMPO ──────────────────────────────────────
        await page.getByRole('button', { name: 'Ejercicio siguiente' }).click()

        const strengthTimeModule = page.getByTestId('hold-strength-module')
        await expect(strengthTimeModule).toBeVisible({ timeout: 30_000 })

        // Tile KG con el peso prescrito por el seed (10 kg). Se acota a la serie ACTIVA: las otras
        // series del bloque siguen montadas (ocultas por CSS) con su propio input de peso.
        const activeSlot = page.locator('.exec-v3-slot.is-active')
        await expect(activeSlot.getByLabel('Peso en kilos')).toHaveValue(/^10([.,]0+)?$/)

        const startSerie = page.getByTestId('hold-strength-start')
        await expect(startSerie).toHaveText(/Iniciar serie/)
        await startSerie.click()
        await expect(strengthTimeModule).toHaveAttribute('data-status', 'running', { timeout: 15_000 })

        // A 0: la serie queda guardada con «10 kg × 5 s» (`formatStrengthTimeSetLine`) y aparecen los
        // DOS caminos manuales — V3: en pantalla sola nunca se pasa solo.
        await expect(page.getByText(/10 kg × 5 s/)).toBeVisible({ timeout: HOLD_SETTLE_MS })
        await expect(page.getByTestId('rest-offer-strength-rest')).toHaveText(/Descansar 90 s/)
        await expect(page.getByTestId('rest-offer-strength-next')).toHaveText(/Siguiente serie/)
        await expect(page.getByRole('dialog', { name: 'Descanso' })).toHaveCount(0)
    })

    // ── Paso 6 · assert de DB, SOLO LECTURA ──────────────────────────────────────────────────
    // Se loguea el PROPIO alumno con la anon key: la policy `workout_logs_client`
    // (`client_id = auth.uid()`) le deja leer sus series y `clients_read_blocks` los bloques de sus
    // planes. Cero service_role, cero escrituras, cero credenciales en el repo.
    test('la fila de fuerza por tiempo queda con reps_done NULL, 5 s y hold_source=timer', async () => {
        test.skip(!dbReady, DB_ENV_HINT)
        test.setTimeout(60_000)

        const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
            auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
            email: email!,
            password: password!,
        })
        expect(authError, `login del alumno E2E: ${authError?.message ?? ''}`).toBeNull()
        const clientId = auth?.user?.id
        expect(clientId, 'el login del alumno E2E tiene que devolver un user id').toBeTruthy()

        // El bloque de fuerza por tiempo del plan canónico es el único con `reps_unit = 'sec'`.
        const { data: blocks, error: blocksError } = await supabase
            .from('workout_blocks')
            .select('id')
            .eq('plan_id', holdPlanId!)
            .eq('reps_unit', 'sec')
        expect(blocksError, `lectura de workout_blocks: ${blocksError?.message ?? ''}`).toBeNull()
        expect(blocks ?? [], 'el seed tiene que dejar 1 bloque con reps_unit=sec en el plan del hold').toHaveLength(1)

        const { data: logs, error: logsError } = await supabase
            .from('workout_logs')
            .select('reps_done, actual_hold_sec, weight_kg, metadata, logged_at')
            .eq('block_id', blocks![0].id)
            .eq('client_id', clientId!)
            .order('logged_at', { ascending: false })
            .limit(1)
        expect(logsError, `lectura de workout_logs: ${logsError?.message ?? ''}`).toBeNull()
        expect(logs ?? [], 'la serie por tiempo del recorrido tiene que estar registrada').toHaveLength(1)

        const log = logs![0] as {
            reps_done: number | null
            actual_hold_sec: number | null
            weight_kg: number | string | null
            metadata: Record<string, unknown> | null
        }
        // R2: una serie por TIEMPO no tiene repeticiones — `reps_done` es NULL a propósito.
        expect(log.reps_done).toBeNull()
        expect(log.actual_hold_sec).toBe(5)
        expect(Number(log.weight_kg)).toBe(10)
        // A3/R19: el reloj llegó a 0 solo ⇒ la fuente del hold es el timer, no una edición a mano.
        expect(log.metadata?.hold_source).toBe('timer')

        await supabase.auth.signOut()
    })
})
