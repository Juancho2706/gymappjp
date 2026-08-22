import { describe, it, expect } from 'vitest'
import {
    decideHealth,
    healthSkipMessage,
    HEALTH_LATENCY_BUDGET_MS,
    type HealthProbe,
} from './health-decision'

/** Sonda sana por defecto: cada test cambia SOLO lo que está probando. */
function probe(overrides: Partial<HealthProbe> = {}): HealthProbe {
    return {
        ok: true,
        status: 200,
        elapsedMs: 180,
        body: { status: 'ok', db: 'ok', latencyMs: 40, },
        ...overrides,
    }
}

describe('decideHealth — sano', () => {
    it('acepta el 200 con db ok y latencias bajas', () => {
        const decision = decideHealth(probe())
        expect(decision.healthy).toBe(true)
        expect(decision.detail).toContain('ok en 180 ms')
    })

    it('acepta un 200 sin latencyMs (campo opcional para el guardián)', () => {
        const decision = decideHealth(probe({ body: { status: 'ok', db: 'ok' } }))
        expect(decision.healthy).toBe(true)
        expect(decision.detail).toContain('sin latencyMs')
    })

    it('acepta el borde exacto del presupuesto (no es > )', () => {
        const decision = decideHealth(
            probe({
                elapsedMs: HEALTH_LATENCY_BUDGET_MS,
                body: { status: 'ok', db: 'ok', latencyMs: HEALTH_LATENCY_BUDGET_MS },
            }),
        )
        expect(decision.healthy).toBe(true)
    })
})

describe('decideHealth — transporte y status', () => {
    it('corta si el GET nunca respondió (timeout de 5 s)', () => {
        const decision = decideHealth(
            probe({ ok: false, status: null, body: null, elapsedMs: 5000, transportError: 'Timeout' }),
        )
        expect(decision).toMatchObject({ healthy: false, reason: 'unreachable' })
        expect(decision.detail).toContain('Timeout')
    })

    it('corta con 503 (el health route contesta 503 cuando la DB falla)', () => {
        const decision = decideHealth(
            probe({ status: 503, body: { status: 'degraded', db: 'error', latencyMs: 12 } }),
        )
        expect(decision).toMatchObject({ healthy: false, reason: 'http-status' })
    })

    it('corta con 500 aunque el body diga que todo está bien', () => {
        const decision = decideHealth(probe({ status: 500 }))
        expect(decision).toMatchObject({ healthy: false, reason: 'http-status' })
    })
})

describe('decideHealth — latencia', () => {
    it('corta si el round-trip del cliente pasa el techo', () => {
        const decision = decideHealth(probe({ elapsedMs: 2001 }))
        expect(decision).toMatchObject({ healthy: false, reason: 'client-slow' })
        expect(decision.detail).toContain('2001 ms')
    })

    it('corta si la DB tarda de más aunque Vercel conteste rápido', () => {
        const decision = decideHealth(probe({ elapsedMs: 120, body: { status: 'ok', db: 'ok', latencyMs: 3400 } }))
        expect(decision).toMatchObject({ healthy: false, reason: 'db-slow' })
        expect(decision.detail).toContain('3400 ms')
    })

    it('respeta un presupuesto custom más estricto', () => {
        const decision = decideHealth(probe({ elapsedMs: 900 }), 500)
        expect(decision).toMatchObject({ healthy: false, reason: 'client-slow' })
        expect(decision.detail).toContain('techo 500 ms')
    })

    it('prioriza la latencia por sobre el contenido del body', () => {
        const decision = decideHealth(probe({ elapsedMs: 9000, body: { status: 'down', db: 'unreachable' } }))
        expect(decision).toMatchObject({ healthy: false, reason: 'client-slow' })
    })
})

describe('decideHealth — shape del body', () => {
    it('corta si el 200 no trae JSON legible', () => {
        const decision = decideHealth(probe({ body: null }))
        expect(decision).toMatchObject({ healthy: false, reason: 'bad-shape' })
    })

    it('corta si db no es "ok"', () => {
        const decision = decideHealth(probe({ body: { status: 'ok', db: 'error', latencyMs: 10 } }))
        expect(decision).toMatchObject({ healthy: false, reason: 'db-not-ok' })
        expect(decision.detail).toContain('db="error"')
    })

    it('corta si status no es "ok" aunque db diga ok', () => {
        const decision = decideHealth(probe({ body: { status: 'degraded', db: 'ok', latencyMs: 10 } }))
        expect(decision).toMatchObject({ healthy: false, reason: 'status-not-ok' })
    })

    it('ignora un latencyMs no numérico en vez de romperse', () => {
        const decision = decideHealth(probe({ body: { status: 'ok', db: 'ok', latencyMs: 'rapido' } }))
        expect(decision.healthy).toBe(true)
    })

    it('trata db ausente como no-ok (fail-closed)', () => {
        const decision = decideHealth(probe({ body: { status: 'ok' } }))
        expect(decision).toMatchObject({ healthy: false, reason: 'db-not-ok' })
    })
})

describe('healthSkipMessage', () => {
    it('nombra la causa y deja claro que no hay reintento', () => {
        const decision = decideHealth(probe({ status: 503 }))
        if (decision.healthy) throw new Error('la sonda debía estar enferma')
        const message = healthSkipMessage(decision)
        expect(message).toContain('http-status')
        expect(message).toContain('No se reintenta')
    })
})
