import { test as base, expect, type Page } from '@playwright/test'
import { shouldAbort } from './route-diet'
import {
    decideHealth,
    healthSkipMessage,
    HEALTH_REQUEST_TIMEOUT_MS,
    type HealthBody,
    type HealthProbe,
} from './health-decision'
import { abortSession, sessionAbortReason } from './qa-session'

/**
 * MODO SUAVE — fixtures de QA contra produccion.
 *
 * Un `test` de Playwright normal abre lo que puede, tan rapido como puede. Contra un preview eso
 * es una virtud; contra produccion es un ataque de carga. El 2026-08-22 una tanda con 6
 * navegadores en paralelo tumbo la base de datos de EVA. Este archivo es la respuesta: mismos
 * specs, mismo Playwright, pero con freno de mano.
 *
 * Cuatro fixtures automaticos, todos activos sin que el spec haga nada:
 *
 *  - `pace`         ritmo humano: ~400 ms de reposo despues de cada navegacion y ~1,2 s entre
 *                   tests. Un smoke que abre tres pantallas seguidas sin respirar genera mas
 *                   concurrencia que un coach real usando la app.
 *  - `diet`         dieta de red: aborta imagenes/fuentes/medios de Supabase Storage y todo lo de
 *                   los terceros de telemetria. Nunca toca `/rest/`, `/auth/`, `/api/` ni los
 *                   chunks JS/CSS (ver `route-diet.ts`).
 *  - `healthGuard`  el guardian: antes de cada test le toma el pulso a `/api/health` y, si la DB
 *                   esta sufriendo, marca la TANDA y se saltan este test y todos los que siguen.
 *                   Un solo intento, sin reintentos (ver `health-decision.ts`).
 *  - `consoleGuard` recolecta errores de consola, `pageerror` y respuestas 5xx y los adjunta al
 *                   reporte. No falla el test: es evidencia, no asercion.
 *
 * Uso: `import { test, expect } from '../_fixtures/suave'` en vez de `@playwright/test`.
 */

/** Reposo despues de cada `page.goto`, para que la app termine de asentarse sin apurarla. */
export const NAVIGATION_SETTLE_MS = 400

/** Reposo entre tests. Con `workers: 1` esto es, literalmente, el intervalo entre pantallas. */
export const BETWEEN_TESTS_MS = 1200

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Reposo explicito para navegaciones que NO pasan por `page.goto` (un click que cambia de ruta,
 * un `page.reload`). `pace` solo puede envolver `goto`; para el resto se llama a mano.
 */
export async function settle(page: Page, ms: number = NAVIGATION_SETTLE_MS): Promise<void> {
    await page.waitForLoadState('domcontentloaded')
    await sleep(ms)
}

type SuaveFixtures = {
    credentialsGuard: void
    pace: void
    diet: void
    healthGuard: void
    consoleGuard: void
}

export const test = base.extend<SuaveFixtures>({
    /**
     * VA PRIMERO Y NO DEPENDE DE NADA, a proposito.
     *
     * Sin `E2E_QA_COACH_*` el proyecto `setup` se salta y nunca escribe `.auth/qa-coach.json`.
     * Un skip NO es un fallo, asi que Playwright igual corre este proyecto... y el
     * `storageState` de la config apunta a un archivo que no existe. Ese ENOENT explota al
     * construir el `request` o el `context`, es decir ANTES de cualquier fixture que los pida:
     * por eso este guard no pide ninguno. Sin dependencias se arma primero y corta limpio.
     */
    credentialsGuard: [
        async ({}, use, testInfo) => {
            if (!process.env.E2E_QA_COACH_EMAIL || !process.env.E2E_QA_COACH_PASSWORD) {
                testInfo.skip(
                    true,
                    'Faltan E2E_QA_COACH_EMAIL / E2E_QA_COACH_PASSWORD: no hay sesion QA, la tanda no corre.',
                )
                return
            }
            await use()
        },
        { auto: true },
    ],

    /**
     * Va primero porque es el unico que puede cancelar el test: si la base esta sufriendo, ni
     * siquiera queremos abrir la pagina. `testInfo.skip()` desde un fixture aborta el test en curso.
     */
    healthGuard: [
        async ({ request }, use, testInfo) => {
            // Cinturon contra la causa raiz del incidente: el modo suave es de UN navegador.
            // `parallelIndex` va de 0 a workers-1, asi que un indice distinto de 0 significa que
            // hay un segundo worker vivo golpeando la misma base. No se mira `config.workers`:
            // ese es el limite GLOBAL, y el proyecto `prod-suave` fija el suyo aparte.
            if (testInfo.parallelIndex !== 0) {
                throw new Error(
                    `MODO SUAVE: hay mas de un worker corriendo (parallelIndex=${testInfo.parallelIndex}). ` +
                        'La tanda contra produccion es de UN navegador: usa `pnpm qa:prod:suave`.',
                )
            }

            const previous = sessionAbortReason()
            if (previous) {
                testInfo.skip(true, previous)
                return
            }

            const startedAt = Date.now()
            let probe: HealthProbe
            try {
                const response = await request.get('/api/health', {
                    timeout: HEALTH_REQUEST_TIMEOUT_MS,
                    failOnStatusCode: false,
                })
                const elapsedMs = Date.now() - startedAt
                let body: HealthBody | null = null
                try {
                    body = (await response.json()) as HealthBody
                } catch {
                    body = null
                }
                probe = { ok: true, status: response.status(), elapsedMs, body }
            } catch (error) {
                probe = {
                    ok: false,
                    status: null,
                    elapsedMs: Date.now() - startedAt,
                    body: null,
                    transportError: error instanceof Error ? error.message : String(error),
                }
            }

            const decision = decideHealth(probe)
            await testInfo.attach('health.txt', {
                body: `${decision.healthy ? 'OK' : 'CORTE'} - ${decision.detail}\n`,
                contentType: 'text/plain',
            })

            if (!decision.healthy) {
                const message = healthSkipMessage(decision)
                abortSession(message)
                testInfo.skip(true, message)
                return
            }

            await use()
        },
        { auto: true },
    ],

    /** Dieta de red. La decision de que cae vive en `route-diet.ts` y esta testeada en Vitest. */
    diet: [
        async ({ context }, use) => {
            await context.route('**/*', async (route) => {
                const request = route.request()
                if (shouldAbort({ url: request.url(), resourceType: request.resourceType() })) {
                    await route.abort()
                    return
                }
                await route.continue()
            })

            await use()
        },
        { auto: true },
    ],

    /**
     * Evidencia, no asercion: si produccion escupe un 500 o un error de consola queremos verlo en
     * el reporte, pero un smoke de solo lectura no deberia ponerse rojo por telemetria rota.
     */
    consoleGuard: [
        async ({ page }, use, testInfo) => {
            const consoleErrors: string[] = []
            const serverErrors: string[] = []

            page.on('console', (message) => {
                if (message.type() !== 'error') return
                // Los aborts de la dieta se ven como errores de consola ("Failed to load
                // resource"). Reportarlos seria ruido generado por nosotros mismos.
                const url = message.location()?.url ?? ''
                if (url && shouldAbort({ url, resourceType: 'other' })) return
                consoleErrors.push(`${message.text()}${url ? ` - ${url}` : ''}`)
            })

            page.on('pageerror', (error) => {
                consoleErrors.push(`pageerror: ${error.message}`)
            })

            page.on('response', (response) => {
                if (response.status() >= 500) {
                    serverErrors.push(`HTTP ${response.status()} - ${response.url()}`)
                }
            })

            await use()

            if (consoleErrors.length > 0) {
                await testInfo.attach('console-errors.txt', {
                    body: consoleErrors.join('\n') + '\n',
                    contentType: 'text/plain',
                })
            }
            if (serverErrors.length > 0) {
                await testInfo.attach('server-5xx.txt', {
                    body: serverErrors.join('\n') + '\n',
                    contentType: 'text/plain',
                })
            }
        },
        { auto: true },
    ],

    /**
     * Ritmo humano. Envuelve `page.goto` (la navegacion que hace el 99 % de los specs) y descansa
     * al terminar el test. El reposo va en el TEARDOWN para que tambien aplique al ultimo test:
     * si la tanda termina y arranca otra cosa, la base igual respiro.
     */
    pace: [
        async ({ page }, use) => {
            const goto = page.goto.bind(page)
            page.goto = async (...args: Parameters<Page['goto']>) => {
                const response = await goto(...args)
                await sleep(NAVIGATION_SETTLE_MS)
                return response
            }

            await use()

            await sleep(BETWEEN_TESTS_MS)
        },
        { auto: true },
    ],
})

export { expect }
