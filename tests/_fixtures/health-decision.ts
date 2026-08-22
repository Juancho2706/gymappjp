/**
 * Decisión del GUARDIÁN de salud del modo suave — helper PURO (sin Playwright, sin red).
 *
 * MOTIVO (incidente 2026-08-22): una tanda de QA con 6 navegadores en paralelo contra
 * https://www.eva-app.cl tumbó la base. El modo suave corre con 1 worker, pero eso no basta:
 * antes de CADA test le tomamos el pulso a `/api/health` y, si la DB está sufriendo, la tanda
 * se detiene sola en vez de seguir apretando.
 *
 * La lógica vive acá y no dentro del fixture para poder testearla con Vitest sin abrir un
 * navegador ni tocar producción (`pnpm vitest run tests/_fixtures`).
 *
 * Shape real de `apps/web/src/app/api/health/route.ts`:
 *   200 → { status: 'ok',       db: 'ok',          latencyMs, timestamp }
 *   503 → { status: 'degraded', db: 'error',       error, latencyMs, timestamp }
 *   503 → { status: 'down',     db: 'unreachable', error, latencyMs, timestamp }
 */

/** Techo de latencia, tanto del round-trip del guardián como del `latencyMs` que reporta la DB. */
export const HEALTH_LATENCY_BUDGET_MS = 2000

/** Timeout del GET a `/api/health`. Un solo intento: si no contesta en 5 s, es señal suficiente. */
export const HEALTH_REQUEST_TIMEOUT_MS = 5000

/** Cuerpo esperado de `/api/health` (los campos que nos importan; el resto se ignora). */
export type HealthBody = {
    status?: unknown
    db?: unknown
    latencyMs?: unknown
    error?: unknown
}

/** Lo que el fixture logra medir del GET. `ok: false` = ni siquiera hubo respuesta (timeout/red). */
export type HealthProbe = {
    /** `false` cuando el request falló/expiró y no hay `status` ni `body`. */
    ok: boolean
    /** Código HTTP; `null` si no hubo respuesta. */
    status: number | null
    /** Round-trip medido por el cliente, en ms. */
    elapsedMs: number
    /** JSON parseado; `null` si no vino o no parseó. */
    body: HealthBody | null
    /** Mensaje del error de transporte, si lo hubo. */
    transportError?: string | null
}

export type HealthReason =
    | 'unreachable'
    | 'http-status'
    | 'client-slow'
    | 'db-slow'
    | 'db-not-ok'
    | 'status-not-ok'
    | 'bad-shape'

export type HealthDecision =
    | { healthy: true; detail: string }
    | { healthy: false; reason: HealthReason; detail: string }

function asFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Traduce una medición de `/api/health` a "sigo" o "corto la tanda".
 *
 * Orden deliberado: primero lo que ni siquiera contestó, después el HTTP, después las latencias
 * y recién al final el contenido. Así el `detail` que llega al reporte nombra la causa más
 * gruesa disponible en vez de un síntoma derivado.
 */
export function decideHealth(
    probe: HealthProbe,
    budgetMs: number = HEALTH_LATENCY_BUDGET_MS,
): HealthDecision {
    if (!probe.ok || probe.status === null) {
        const cause = probe.transportError ? `: ${probe.transportError}` : ''
        return {
            healthy: false,
            reason: 'unreachable',
            detail: `/api/health no respondió en ${probe.elapsedMs} ms${cause}`,
        }
    }

    if (probe.status !== 200) {
        return {
            healthy: false,
            reason: 'http-status',
            detail: `/api/health devolvió HTTP ${probe.status}`,
        }
    }

    if (probe.elapsedMs > budgetMs) {
        return {
            healthy: false,
            reason: 'client-slow',
            detail: `/api/health tardó ${probe.elapsedMs} ms (techo ${budgetMs} ms)`,
        }
    }

    if (probe.body === null || typeof probe.body !== 'object') {
        return {
            healthy: false,
            reason: 'bad-shape',
            detail: '/api/health devolvió 200 sin JSON legible',
        }
    }

    // `latencyMs` es lo que tardó la consulta a `coaches` DENTRO del server: es la lectura más
    // directa de cuánto está sufriendo Supabase, aunque Vercel conteste rápido.
    const dbLatency = asFiniteNumber(probe.body.latencyMs)
    if (dbLatency !== null && dbLatency > budgetMs) {
        return {
            healthy: false,
            reason: 'db-slow',
            detail: `la consulta de salud a la DB tardó ${dbLatency} ms (techo ${budgetMs} ms)`,
        }
    }

    if (probe.body.db !== 'ok') {
        return {
            healthy: false,
            reason: 'db-not-ok',
            detail: `/api/health reporta db="${String(probe.body.db)}"`,
        }
    }

    if (probe.body.status !== 'ok') {
        return {
            healthy: false,
            reason: 'status-not-ok',
            detail: `/api/health reporta status="${String(probe.body.status)}"`,
        }
    }

    const dbDetail = dbLatency === null ? 'sin latencyMs' : `db ${dbLatency} ms`
    return { healthy: true, detail: `/api/health ok en ${probe.elapsedMs} ms (${dbDetail})` }
}

/** Texto que ve el operador cuando el guardián corta la tanda. */
export function healthSkipMessage(decision: Extract<HealthDecision, { healthy: false }>): string {
    return (
        `GUARDIÁN: tanda detenida (${decision.reason}) — ${decision.detail}. ` +
        `No se reintenta: esperá a que la DB se recupere y volvé a lanzar la tanda.`
    )
}
