import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pricing v2 (P2, wave B1) + pricing v3 (D4=A): la bajada a Free usa
// `tierMaxClientsFor('free', coach.created_at)` — muere el freeLimit plano del catálogo. Regla del
// dueño (literal): «los free actuales retienen sus 3». La escalera tiene 3 peldaños: un coach
// PRE-v2 conserva 3; uno de la ventana v2 (18-08 a 20-08) entra con 2; uno creado desde el corte v3
// (21-08) entra con 1. Fecha ausente ⇒ fail-safe pre-v2 (generoso).

const COACH_ID = 'coach-gf-1'
const BEFORE_CUTOVER = '2026-01-15T12:00:00Z'
// Ventana v2: >= 2026-08-18 y < 2026-08-21.
const IN_V2_WINDOW = '2026-08-19T10:00:00Z'
// Mundo v3 (día D en adelante).
const AFTER_V3_CUTOVER = '2026-09-01T00:00:00Z'

// Conteo de activos standalone, controlado por test.
let activeCount = 0
vi.mock('./capacity.service', () => ({
    countActiveStandaloneClients: async () => activeCount,
}))

// Provider best-effort: no interviene en el cupo.
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProviderForCoach: () => ({
        name: 'mercadopago',
        cancelCheckoutAtProvider: async () => {},
    }),
}))

// Admin service-role: SELECT devuelve coachRow; capturamos los UPDATE.
let coachRow: Record<string, unknown> | null = null
const coachUpdates: Array<Record<string, unknown>> = []
const fakeAdmin = {
    from: (table: string) => {
        if (table === 'coaches') {
            return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: coachRow, error: null }) }) }),
                update: (row: Record<string, unknown>) => {
                    coachUpdates.push(row)
                    return { eq: async () => ({ error: null }) }
                },
            }
        }
        // subscription_events / admin_audit_logs
        return { insert: async () => ({ error: null }) }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

import { activateFreePlanForCoach } from './activate-free.service'

function blockedCoach(createdAt: string | null) {
    return {
        id: COACH_ID,
        created_at: createdAt,
        subscription_status: 'expired',
        subscription_mp_id: null,
        subscription_provider: 'mercadopago',
        subscription_provider_external_id: null,
    }
}

beforeEach(() => {
    coachUpdates.length = 0
    activeCount = 0
    coachRow = null
})

describe('activateFreePlanForCoach — cupo free con grandfather (pricing v2 P2 + v3 D4)', () => {
    it('coach creado 2026-01 con 3 activos reactiva a free (límite viejo 3) y escribe max_clients=3', async () => {
        coachRow = blockedCoach(BEFORE_CUTOVER)
        activeCount = 3
        const res = await activateFreePlanForCoach(fakeAdmin, COACH_ID)
        expect(res.ok).toBe(true)
        const upd = coachUpdates.at(-1)!
        expect(upd.subscription_tier).toBe('free')
        expect(upd.max_clients).toBe(3)
    })

    it('coach de la ventana v2 con 3 activos NO puede bajar a free (límite 2): 400 con el cupo v2', async () => {
        coachRow = blockedCoach(IN_V2_WINDOW)
        activeCount = 3
        const res = await activateFreePlanForCoach(fakeAdmin, COACH_ID)
        expect(res.ok).toBe(false)
        if (!res.ok) {
            expect(res.status).toBe(400)
            expect(res.freeLimit).toBe(2)
            expect(res.activeCount).toBe(3)
        }
        expect(coachUpdates).toHaveLength(0)
    })

    it('coach de la ventana v2 con 2 activos baja a free y escribe max_clients=2', async () => {
        coachRow = blockedCoach(IN_V2_WINDOW)
        activeCount = 2
        const res = await activateFreePlanForCoach(fakeAdmin, COACH_ID)
        expect(res.ok).toBe(true)
        expect(coachUpdates.at(-1)!.max_clients).toBe(2)
    })

    it('coach POST-v3 con 1 activo baja a free y escribe max_clients=1 (catálogo v3)', async () => {
        coachRow = blockedCoach(AFTER_V3_CUTOVER)
        activeCount = 1
        const res = await activateFreePlanForCoach(fakeAdmin, COACH_ID)
        expect(res.ok).toBe(true)
        expect(coachUpdates.at(-1)!.max_clients).toBe(1)
    })

    it('coach POST-v3 con 2 activos NO puede bajar a free: 400 pidiendo archivar 1 (singular)', async () => {
        coachRow = blockedCoach(AFTER_V3_CUTOVER)
        activeCount = 2
        const res = await activateFreePlanForCoach(fakeAdmin, COACH_ID)
        expect(res.ok).toBe(false)
        if (!res.ok) {
            expect(res.status).toBe(400)
            expect(res.freeLimit).toBe(1)
            expect(res.activeCount).toBe(2)
            expect(res.error).toBe(
                'Tienes 2 alumnos activos. Para continuar con el plan gratuito necesitas archivar 1 alumno.'
            )
        }
        expect(coachUpdates).toHaveLength(0)
    })

    it('el corte v3 es inclusivo: creado EXACTO el 21-08 ⇒ límite 1', async () => {
        coachRow = blockedCoach('2026-08-21T00:00:00Z')
        activeCount = 1
        const res = await activateFreePlanForCoach(fakeAdmin, COACH_ID)
        expect(res.ok).toBe(true)
        expect(coachUpdates.at(-1)!.max_clients).toBe(1)
    })

    it('created_at ausente ⇒ fail-safe PRE-v2 (generoso): 3 activos pasan con límite 3', async () => {
        coachRow = blockedCoach(null)
        activeCount = 3
        const res = await activateFreePlanForCoach(fakeAdmin, COACH_ID)
        expect(res.ok).toBe(true)
        expect(coachUpdates.at(-1)!.max_clients).toBe(3)
    })
})
