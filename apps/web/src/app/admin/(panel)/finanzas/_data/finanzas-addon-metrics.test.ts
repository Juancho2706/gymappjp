import { describe, expect, it, vi, beforeEach } from 'vitest'

// El admin client se construye dentro de getAddonMetrics — se mockea para inyectar filas.
const liveRows: Array<Record<string, unknown>> = []
const churnRows: Array<Record<string, unknown>> = []

function makeBuilder(resolved: () => { data: unknown }) {
    // Builder encadenable y "thenable": cada método devuelve el mismo builder, y await
    // resuelve al payload final (replica el shape de PostgREST de supabase-js).
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    for (const m of ['select', 'in', 'eq', 'not', 'order', 'limit']) {
        builder[m] = vi.fn(chain)
    }
    builder.then = (onF: (v: { data: unknown }) => unknown) => Promise.resolve(resolved()).then(onF)
    return builder
}

const fromMock = vi.fn(() => {
    // Distingue live vs churn por el método terminal usado: live termina en .in(),
    // churn termina en .limit(). Devolvemos un builder que conoce ambos datasets según
    // qué cadena se arme. Simplificación: un contador alterna entre live (1ra) y churn (2da).
    return makeBuilder(() => ({ data: nextDataset() }))
})

let callIdx = 0
function nextDataset() {
    // getAddonMetrics dispara live primero, churn segundo (Promise.all en ese orden).
    const ds = callIdx === 0 ? liveRows : churnRows
    callIdx += 1
    return ds
}

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({ from: fromMock }),
}))

const TEST_COACH_ID = 'test-coach-uuid'
const REAL_COACH_ID = 'real-coach-uuid'

vi.mock('@/lib/test-accounts', () => ({
    getTestCoachIds: vi.fn(async () => new Set([TEST_COACH_ID])),
}))

describe('getAddonMetrics — excludes test coaches', () => {
    beforeEach(() => {
        callIdx = 0
        liveRows.length = 0
        churnRows.length = 0
        vi.resetModules()
    })

    it('drops a test coach self_service add-on from MRR / adoption / count', async () => {
        liveRows.push(
            // add-on PAGO de un coach REAL (active) → debe contar
            {
                coach_id: REAL_COACH_ID,
                module_key: 'cardio',
                status: 'active',
                source: 'self_service',
                price_clp: 9990,
                first_charged_at: '2026-06-01T00:00:00Z',
            },
            // add-on PAGO de una cuenta de PRUEBA (active) → debe excluirse
            {
                coach_id: TEST_COACH_ID,
                module_key: 'cardio',
                status: 'active',
                source: 'self_service',
                price_clp: 9990,
                first_charged_at: '2026-06-01T00:00:00Z',
            },
        )
        churnRows.push(
            { coach_id: REAL_COACH_ID, cancelled_at: '2026-05-10T00:00:00Z' },
            { coach_id: TEST_COACH_ID, cancelled_at: '2026-05-12T00:00:00Z' },
        )

        // import dinámico tras los mocks + resetModules para evitar el cache de React.cache.
        const { getAddonMetrics } = await import('./finanzas.queries')
        const metrics = await getAddonMetrics()

        // Solo el coach real cuenta: 1 add-on facturable, $9.990 MRR, 1 coach.
        expect(metrics.addonMrrClp).toBe(9990)
        expect(metrics.billableAddonCount).toBe(1)
        expect(metrics.coachesWithAddons).toBe(1)

        const cardio = metrics.adoptionByModule.find((m) => m.moduleKey === 'cardio')
        expect(cardio?.payingCoaches).toBe(1)

        // Churn: solo la baja del coach real (mayo 2026 = 1).
        const may = metrics.churnSeries.find((c) => c.ym === '2026-05')
        expect(may?.cancelled).toBe(1)
    })
})
