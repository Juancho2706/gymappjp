import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W8.4.2B — disparo en línea desde la actividad del alumno. Lo que se prueba es el FILTRO BARATO:
 * cada serie y cada comida llama a `enqueueBehaviorCheckForClient`, así que todo lo que no puede
 * terminar en un correo tiene que cortarse antes del snapshot pesado (auth.users, roster, ledger).
 */

const pending: Promise<unknown>[] = []
vi.mock('next/server', () => ({
    after: (fn: () => Promise<unknown>) => {
        pending.push(fn())
    },
}))

import {
    enqueueBehaviorCheckForClient,
    isInBehaviorWindow,
} from './behavior-emails'

type Row = Record<string, unknown> | null

/** Cliente admin falso: registra qué tablas se leyeron y devuelve una fila fija por tabla. */
function fakeAdmin(rows: Record<string, Row>) {
    const reads: string[] = []
    const admin = {
        from(table: string) {
            reads.push(table)
            const chain = {
                select: () => chain,
                eq: () => chain,
                maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
            }
            return chain
        },
    }
    return { admin: admin as never, reads }
}

async function flush() {
    // `scheduleInline` pasa por un `import()` dinámico antes de llegar a `after`.
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
    await Promise.all(pending.splice(0))
}

// 15:00 UTC = 12:00 en Chile (dentro de 09–20 h); 03:00 UTC = 00:00 en Chile (fuera).
const IN_HOURS = new Date('2026-10-02T15:00:00Z')
const OUT_OF_HOURS = new Date('2026-10-03T03:00:00Z')
const LAUNCH = '2026-10-02T00:00:00Z'

describe('enqueueBehaviorCheckForClient — filtro barato', () => {
    beforeEach(() => {
        vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_ENABLED', 'true')
        vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_SINCE', LAUNCH)
    })
    afterEach(() => {
        vi.unstubAllEnvs()
        pending.splice(0)
    })

    it('con el flag apagado no lee nada', async () => {
        vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_ENABLED', '')
        const { admin, reads } = fakeAdmin({})
        enqueueBehaviorCheckForClient('client-1', { admin, now: IN_HOURS })
        await flush()
        expect(reads).toEqual([])
    })

    it('fuera del horario de envío no lee nada (el barrido de las 09:00 lo recoge)', async () => {
        const { admin, reads } = fakeAdmin({})
        enqueueBehaviorCheckForClient('client-1', { admin, now: OUT_OF_HOURS })
        await flush()
        expect(reads).toEqual([])
    })

    it('alumno demo: corta después de leer el alumno, sin tocar al coach', async () => {
        const { admin, reads } = fakeAdmin({
            clients: { coach_id: 'coach-1', is_demo: true, is_archived: false },
        })
        enqueueBehaviorCheckForClient('client-1', { admin, now: IN_HOURS })
        await flush()
        expect(reads).toEqual(['clients'])
    })

    it('alumno archivado o sin coach: no sigue', async () => {
        for (const client of [
            { coach_id: 'coach-1', is_demo: false, is_archived: true },
            { coach_id: null, is_demo: false, is_archived: false },
        ]) {
            const { admin, reads } = fakeAdmin({ clients: client })
            enqueueBehaviorCheckForClient('client-1', { admin, now: IN_HOURS })
            await flush()
            expect(reads).toEqual(['clients'])
        }
    })

    it('coach anterior al encendido: 2 lecturas por PK y nada más (sin snapshot)', async () => {
        const { admin, reads } = fakeAdmin({
            clients: { coach_id: 'coach-1', is_demo: false, is_archived: false },
            coaches: { id: 'coach-1', slug: 'viejo', created_at: '2026-07-01T00:00:00Z' },
        })
        enqueueBehaviorCheckForClient('client-1', { admin, now: IN_HOURS })
        await flush()
        expect(reads).toEqual(['clients', 'coaches'])
    })

    it('nunca lanza hacia el caller aunque la base explote', async () => {
        const admin = {
            from() {
                throw new Error('boom')
            },
        } as never
        expect(() => enqueueBehaviorCheckForClient('client-1', { admin, now: IN_HOURS })).not.toThrow()
        await expect(flush()).resolves.toBeUndefined()
    })
})

describe('isInBehaviorWindow — mismo `since` que el barrido', () => {
    const policy = { launchCutover: LAUNCH }

    it('creado en o después del encendido y con menos de 90 d: adentro', () => {
        expect(isInBehaviorWindow('2026-10-02T00:00:00Z', IN_HOURS, policy)).toBe(true)
        expect(isInBehaviorWindow('2026-10-02T10:00:00Z', IN_HOURS, policy)).toBe(true)
    })

    it('anterior al encendido: afuera', () => {
        expect(isInBehaviorWindow('2026-10-01T23:59:59Z', IN_HOURS, policy)).toBe(false)
    })

    it('con 90 d o más: afuera', () => {
        const later = new Date('2027-01-01T15:00:00Z') // 91 d después del alta
        expect(isInBehaviorWindow('2026-10-02T10:00:00Z', later, policy)).toBe(false)
    })

    it('sin corte o sin fecha legible: afuera (fail-closed)', () => {
        expect(isInBehaviorWindow('2026-10-02T10:00:00Z', IN_HOURS, { launchCutover: null })).toBe(false)
        expect(isInBehaviorWindow(null, IN_HOURS, policy)).toBe(false)
        expect(isInBehaviorWindow('no-es-fecha', IN_HOURS, policy)).toBe(false)
    })
})
