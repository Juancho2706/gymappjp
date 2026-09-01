import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryPulseRow } from '@/services/dashboard.service'

/**
 * La foto diaria de KPI (`coach_kpi_snapshots`, 7C fase 2) es la ÚNICA fuente del delta de «En
 * riesgo»: lo que se escriba mal hoy se lee como tendencia falsa dentro de siete días, sin forma
 * de auditarlo desde la UI. Acá se fija qué números lleva la fila y que un coach roto no puede
 * tumbar la corrida entera.
 *
 * Lo mockeado es la DB: el pulse (`DashboardService.getDirectoryPulse`), `countCoachClients` y el
 * upsert. `splitRiskClients` y `mapDirectoryPulseToAdherenceStats` corren REALES, porque el punto
 * del test es que la fila use exactamente el mismo criterio que el KPI vivo del panel.
 */

/** 2026-09-01 11:00 en Santiago (UTC−4 en septiembre). */
const NOW = new Date('2026-09-01T15:00:00.000Z')

const pulseRow = (over: Partial<DirectoryPulseRow> & { clientId: string }): DirectoryPulseRow => ({
    clientName: `Alumno ${over.clientId}`,
    percentage: 60,
    lastPlan: 'Full body',
    completedSets: 6,
    totalSets: 10,
    consumed: { cal: 0, prot: 0, carb: 0, fat: 0 },
    target: { cal: 0, prot: 0, carb: 0, fat: 0 },
    nutritionPercentage: 0,
    lastWorkoutDate: null,
    lastCheckinDate: null,
    currentWeight: null,
    weightDelta7d: null,
    weightHistory30d: [],
    adherenceHistory4w: [],
    oneRMDelta: null,
    planDaysRemaining: null,
    planCurrentWeek: null,
    planTotalWeeks: null,
    attentionScore: 30,
    attentionFlags: [],
    streak: 0,
    latestEnergyLevel: null,
    ...over,
})

/** 3 en riesgo (flags críticos) + 2 sanos. Porcentajes 50/60/70/80/91 ⇒ promedio 70,2 ⇒ 70. */
const PULSE: DirectoryPulseRow[] = [
    pulseRow({ clientId: 'r1', percentage: 50, attentionFlags: ['SIN_CHECKIN_1M'] }),
    pulseRow({ clientId: 'r2', percentage: 60, attentionFlags: ['SIN_EJERCICIO_7D'] }),
    pulseRow({ clientId: 'r3', percentage: 70, attentionFlags: ['SIN_CHECKIN_1M', 'PROGRAMA_VENCIDO'] }),
    pulseRow({ clientId: 's1', percentage: 80, attentionFlags: ['PROGRAMA_POR_VENCER'] }),
    pulseRow({ clientId: 's2', percentage: 91, attentionFlags: [] }),
]

/** 2 alumnos × 2 días, con una sesión repetida el mismo día ⇒ 4 sesiones únicas, no 5. */
const WORKOUT_LOGS = [
    { client_id: 'r1', logged_at: '2026-09-01T12:00:00.000Z' },
    { client_id: 'r1', logged_at: '2026-09-01T18:00:00.000Z' },
    { client_id: 'r1', logged_at: '2026-08-31T12:00:00.000Z' },
    { client_id: 'r2', logged_at: '2026-09-01T12:00:00.000Z' },
    { client_id: 'r2', logged_at: '2026-08-31T12:00:00.000Z' },
]

/** Builder awaitable: cualquier método encadena, el `await` entrega el resultado de la tabla. */
function thenable(result: unknown) {
    const proxy: Record<string | symbol, unknown> = new Proxy(
        {},
        {
            get(_target, prop) {
                if (prop === 'then') {
                    return (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
                        Promise.resolve(result).then(onFulfilled, onRejected)
                }
                return () => proxy
            },
        }
    )
    return proxy
}

let coachRows: { id: string }[] = []
const TABLE_RESULTS = () => ({
    workout_logs: { error: null, data: WORKOUT_LOGS },
    coaches: { error: null, data: coachRows },
})

const fakeDb = {
    from: (table: string) =>
        thenable({ error: null, data: [], count: 0, ...((TABLE_RESULTS() as Record<string, unknown>)[table] ?? {}) }),
} as never

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => ({}) }))
vi.mock('@/lib/coach/directory-pulse-cache', () => ({ getCachedDirectoryPulse: async () => [] }))
vi.mock('@/services/auth/workspace-render-cache', () => ({
    getPreferredWorkspaceForRender: async () => null,
    listUserWorkspacesForRender: async () => [],
}))
// Standalone: sin org ni team. Es el scope del 100 % de los coaches vivos.
vi.mock('@/services/auth/workspace.service', () => ({ resolvePreferredWorkspace: async () => null }))

/** Coaches que revientan al pedir su pulse (caso «uno roto no tumba la corrida»). */
let failingCoaches = new Set<string>()
const getDirectoryPulse = vi.fn(async (coachId: string) => {
    if (failingCoaches.has(coachId)) throw new Error('pulse caido')
    return PULSE
})
vi.mock('@/services/dashboard.service', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    DashboardService: class {
        constructor(_db: unknown) {}
        getDirectoryPulse(coachId: string) {
            return getDirectoryPulse(coachId)
        }
    },
}))

const countCoachClients = vi.fn(async () => 4)
const upsertCoachKpiSnapshots = vi.fn(async (_db: unknown, _rows: unknown[]) => ({ error: null as string | null }))
vi.mock('@/infrastructure/db', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    countCoachClients: (...a: unknown[]) => countCoachClients(...(a as [])),
    upsertCoachKpiSnapshots: (...a: unknown[]) => upsertCoachKpiSnapshots(a[0], a[1] as unknown[]),
}))

const { computeCoachKpiSnapshot, snapshotAllCoachKpis, snapshotCoachKpis } = await import('./kpi-snapshot.queries')

beforeEach(() => {
    vi.clearAllMocks()
    failingCoaches = new Set()
    coachRows = []
    countCoachClients.mockResolvedValue(4)
    upsertCoachKpiSnapshots.mockResolvedValue({ error: null })
})

describe('computeCoachKpiSnapshot — la fila que se guarda', () => {
    it('cuenta el riesgo completo, promedia adherencia y dedup sesiones por alumno+dia', async () => {
        const row = await computeCoachKpiSnapshot(fakeDb, 'coach-1', NOW)

        expect(row).toEqual({
            coach_id: 'coach-1',
            day: '2026-09-01',
            risk_count: 3,
            active_clients: 4,
            // (50 + 60 + 70 + 80 + 91) / 5 = 70,2 ⇒ 70, con el mismo Math.round que avgAdherence.
            avg_adherence: 70,
            sessions_7d: 4,
        })
    })

    it('el «day» es el dia calendario de Santiago, no el UTC del runtime', async () => {
        // 02:00 UTC del 2 de septiembre = 22:00 del 1 en Chile: la fila sigue siendo del 1.
        const row = await computeCoachKpiSnapshot(fakeDb, 'coach-1', new Date('2026-09-02T02:00:00.000Z'))
        expect(row.day).toBe('2026-09-01')
    })
})

describe('snapshotCoachKpis — un coach roto no tumba la corrida', () => {
    it('2 de 3 se guardan, el fallido queda en errors con su id y el upsert es uno solo', async () => {
        failingCoaches = new Set(['coach-2'])

        const result = await snapshotCoachKpis(fakeDb, ['coach-1', 'coach-2', 'coach-3'], NOW)

        expect(result.snapshotted).toBe(2)
        expect(result.day).toBe('2026-09-01')
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0]).toContain('coach-2')

        expect(upsertCoachKpiSnapshots).toHaveBeenCalledTimes(1)
        const rows = upsertCoachKpiSnapshots.mock.calls[0][1] as { coach_id: string }[]
        expect(rows).toHaveLength(2)
        expect(rows.map((r) => r.coach_id)).toEqual(['coach-1', 'coach-3'])
    })

    it('un upsert fallido no cuenta las filas como guardadas', async () => {
        upsertCoachKpiSnapshots.mockResolvedValue({ error: 'permission denied' })

        const result = await snapshotCoachKpis(fakeDb, ['coach-1'], NOW)

        expect(result.snapshotted).toBe(0)
        expect(result.errors[0]).toContain('permission denied')
    })

    it('sin coaches no escribe nada', async () => {
        const result = await snapshotCoachKpis(fakeDb, [], NOW)
        expect(result).toEqual({ day: '2026-09-01', snapshotted: 0, errors: [] })
        expect(upsertCoachKpiSnapshots).not.toHaveBeenCalled()
    })
})

describe('snapshotAllCoachKpis — todos los coaches, incluido el que no tiene alumnos', () => {
    it('lista coaches y snapshotea cada uno', async () => {
        coachRows = [{ id: 'coach-1' }, { id: 'coach-2' }]

        const result = await snapshotAllCoachKpis(fakeDb, NOW)

        expect(result.snapshotted).toBe(2)
        expect(result.errors).toEqual([])
        expect(getDirectoryPulse).toHaveBeenCalledTimes(2)
    })
})
