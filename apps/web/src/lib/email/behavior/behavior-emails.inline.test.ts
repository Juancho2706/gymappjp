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

const ledgerRows = vi.hoisted(() => ({ aha: [] as Array<{ id: string; template_key: string }> }))
const scheduleCoachEmail = vi.hoisted(() => vi.fn())
vi.mock('@/infrastructure/db/coach-email-ledger.repository', () => ({
    findActiveByCoachAndKeys: vi.fn(async (_admin: unknown, _coachId: string, keys: readonly string[]) => {
        reads.push(`ledger:${keys.join(',')}`)
        return ledgerRows.aha.filter((r) => keys.includes(r.template_key))
    }),
}))
vi.mock('@/services/email/coach-email-ledger.service', () => ({ scheduleCoachEmail }))
vi.mock('@/services/email/automated-email-history.service', () => ({
    loadAutomatedEmailHistory: vi.fn(async (_admin: unknown, ids: string[]) =>
        new Map(ids.map((id) => [id, { sentAts: [], optedOut: false }]))
    ),
}))

import {
    INLINE_SEND_DELAY_MS,
    enqueueBehaviorCheckForClient,
    isInBehaviorWindow,
} from './behavior-emails'

type Row = Record<string, unknown> | null

/** Lecturas de la corrida, en orden (tablas + ledger + auth). */
const reads: string[] = []

/**
 * Cliente admin falso: `maybeSingle` devuelve la fila de `rows[tabla]`; las listas (await directo
 * del builder) devuelven `lists[tabla]`. Registra cada tabla leída.
 */
function fakeAdmin(rows: Record<string, Row>, lists: Record<string, unknown[]> = {}) {
    reads.length = 0
    const admin = {
        auth: {
            admin: {
                getUserById: async () => {
                    reads.push('auth')
                    return { data: { user: { email: 'ana@coach-real.cl' } } }
                },
            },
        },
        from(table: string) {
            reads.push(table)
            const chain: Record<string, unknown> = {}
            for (const m of ['select', 'eq', 'in', 'is', 'gte', 'order', 'limit']) chain[m] = () => chain
            chain.maybeSingle = async () => ({ data: rows[table] ?? null, error: null })
            chain.then = (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: lists[table] ?? [], error: null }).then(resolve)
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
        ledgerRows.aha = []
        scheduleCoachEmail.mockReset()
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

    const IN_WINDOW_COACH = {
        id: 'coach-1',
        slug: 'nueva',
        full_name: 'Ana',
        created_at: '2026-10-02T10:00:00Z',
        subscription_tier: 'free',
    }

    it('coach en ventana con el aha ya en el ledger: corta antes del snapshot', async () => {
        ledgerRows.aha = [{ id: 'l1', template_key: 'behavior_aha' }]
        const { admin, reads } = fakeAdmin({
            clients: { coach_id: 'coach-1', is_demo: false, is_archived: false },
            coaches: IN_WINDOW_COACH,
        })
        enqueueBehaviorCheckForClient('client-1', { admin, now: IN_HOURS })
        await flush()
        expect(reads).toEqual(['clients', 'coaches', 'ledger:behavior_aha'])
        expect(scheduleCoachEmail).not.toHaveBeenCalled()
    })

    it('primer registro real: manda el aha AGENDADO (retirable si otra ejecución gana el ledger)', async () => {
        scheduleCoachEmail.mockResolvedValue({ ok: true, deduped: false, ledgerId: 'l1', providerMessageId: 'm1' })
        const { admin } = fakeAdmin(
            {
                clients: { coach_id: 'coach-1', is_demo: false, is_archived: false },
                coaches: IN_WINDOW_COACH,
            },
            {
                clients: [{ id: 'client-1', created_at: '2026-10-02T11:00:00Z', first_login_at: '2026-10-02T12:00:00Z' }],
                workout_logs: [{ id: 'log-1' }],
            }
        )
        enqueueBehaviorCheckForClient('client-1', { admin, now: IN_HOURS })
        await flush()
        expect(scheduleCoachEmail).toHaveBeenCalledTimes(1)
        const [, arg] = scheduleCoachEmail.mock.calls[0]
        expect(arg.templateKey).toBe('behavior_aha')
        expect(arg.scheduledAt).toBe(new Date(IN_HOURS.getTime() + INLINE_SEND_DELAY_MS).toISOString())
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
