import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryPulseRow } from '@/services/dashboard.service'

/**
 * El KPI «En riesgo» del panel del coach venía TOPEADO EN 5: se leía el largo de `topRiskClients`,
 * una lista ya recortada con `.slice(0, 5)` para la card oscura. Un coach con 12 alumnos en riesgo
 * leía «5». Acá se fija el corte entre el conteo (completo) y la lista (top 5), y de paso el
 * contrato de `kpi.deltas` que consumen web y RN.
 *
 * La cadena real de `getCoachDashboardDataInner` son ~12 consultas en paralelo: el doble de abajo
 * responde a cualquier tabla con filas vacías salvo las que el test necesita, y los repositorios
 * y el pulse entran mockeados. Cero red, cero DB.
 */

/** Instante fijo: 2026-09-01 11:00 en Santiago (UTC-4 en septiembre, antes del cambio de hora). */
const NOW = new Date('2026-09-01T15:00:00.000Z')
const TODAY_KEY = '01/09'
const YESTERDAY_KEY = '31/08'

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
    adherenceHistory4w: [0, 0, 40, 60],
    oneRMDelta: null,
    planDaysRemaining: null,
    planCurrentWeek: null,
    planTotalWeeks: null,
    attentionScore: 25,
    attentionFlags: [],
    streak: 0,
    latestEnergyLevel: null,
    ...over,
})

/** 12 en riesgo (score descendente) + 3 sanos. */
const PULSE: DirectoryPulseRow[] = [
    ...Array.from({ length: 12 }, (_, i) =>
        pulseRow({
            clientId: `riesgo-${i + 1}`,
            attentionScore: 100 - i,
            attentionFlags: i % 2 === 0 ? ['SIN_CHECKIN_1M'] : ['SIN_EJERCICIO_7D'],
        })
    ),
    ...Array.from({ length: 3 }, (_, i) =>
        pulseRow({ clientId: `sano-${i + 1}`, attentionScore: 5, attentionFlags: ['PROGRAMA_POR_VENCER'] })
    ),
]

/** Sesiones: 3 alumnos distintos hoy, 1 ayer ⇒ delta +2. */
const WORKOUT_LOGS = [
    { id: 'l1', logged_at: '2026-09-01T14:00:00.000Z', client_id: 'riesgo-1', clients: { id: 'riesgo-1', full_name: 'Uno' } },
    { id: 'l2', logged_at: '2026-09-01T13:00:00.000Z', client_id: 'riesgo-2', clients: { id: 'riesgo-2', full_name: 'Dos' } },
    { id: 'l3', logged_at: '2026-09-01T12:00:00.000Z', client_id: 'riesgo-3', clients: { id: 'riesgo-3', full_name: 'Tres' } },
    { id: 'l4', logged_at: '2026-08-31T14:00:00.000Z', client_id: 'riesgo-1', clients: { id: 'riesgo-1', full_name: 'Uno' } },
]

/** Altas: 2 dentro de los últimos 7 días, 1 fuera. */
const SIGNUP_DATES = [
    { created_at: '2026-08-31T00:00:00.000Z' },
    { created_at: '2026-08-30T00:00:00.000Z' },
    { created_at: '2026-01-15T00:00:00.000Z' },
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

const TABLE_RESULTS: Record<string, { data?: unknown[] | null; count?: number | null }> = {
    workout_plans: { count: 5 },
    workout_logs: { data: WORKOUT_LOGS },
    // El repositorio del snapshot está mockeado más abajo: acá solo se garantiza que, si alguna
    // vez llegara a `from`, la tabla responde vacío en vez de inventar una fila.
    coach_kpi_snapshots: { data: null },
}

const fakeDb = {
    from: (table: string) => thenable({ error: null, data: [], count: 0, ...(TABLE_RESULTS[table] ?? {}) }),
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeDb }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => fakeDb }))
vi.mock('@/lib/coach/directory-pulse-cache', () => ({ getCachedDirectoryPulse: async () => PULSE }))
vi.mock('@/services/auth/workspace-render-cache', () => ({
    getPreferredWorkspaceForRender: async () => null,
    listUserWorkspacesForRender: async () => [],
}))
/**
 * Fila `coach_kpi_snapshots` de hace 7 días (7C fase 2). `null` por default: el repositorio está
 * mockeado, así que el fake db nunca ve la tabla; cada test decide si el coach tiene historial.
 */
let snapshotRow: { day: string; risk_count: number; active_clients: number; avg_adherence: number; sessions_7d: number } | null =
    null
vi.mock('@/infrastructure/db', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    countCoachClients: async () => 15,
    findCoachRecentClients: async () => [],
    findCoachClientSignupDates: async () => SIGNUP_DATES,
    findCoachById: async () => null,
    findCoachKpiSnapshotForDay: async () => snapshotRow,
}))

const { buildAgendaFromPulse, getCoachDashboardDataV2, splitRiskClients } = await import('./dashboard.queries')

describe('splitRiskClients — el conteo no es el largo de la card', () => {
    it('12 en riesgo ⇒ riskCount 12 y solo 5 en la lista', () => {
        const { riskCount, topRiskClients } = splitRiskClients(PULSE)
        expect(riskCount).toBe(12)
        expect(topRiskClients).toHaveLength(5)
    })

    it('el top 5 es por attentionScore descendente', () => {
        const { topRiskClients } = splitRiskClients(PULSE)
        expect(topRiskClients.map((r) => r.clientId)).toEqual([
            'riesgo-1',
            'riesgo-2',
            'riesgo-3',
            'riesgo-4',
            'riesgo-5',
        ])
    })

    it('solo cuentan los dos flags criticos (sin check-in 1 mes / sin ejercicio 7 dias)', () => {
        const soloOtrosFlags = [
            pulseRow({ clientId: 'a', attentionFlags: ['NUTRICION_RIESGO'] }),
            pulseRow({ clientId: 'b', attentionFlags: ['PROGRAMA_VENCIDO', 'FUERZA_CAYENDO'] }),
        ]
        expect(splitRiskClients(soloOtrosFlags).riskCount).toBe(0)
        expect(splitRiskClients([]).riskCount).toBe(0)
    })
})

describe('getCoachDashboardDataV2 — kpi.riskCount y kpi.deltas', () => {
    beforeAll(() => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
    })
    afterAll(() => {
        vi.useRealTimers()
    })
    beforeEach(() => {
        snapshotRow = null
    })

    it('el KPI cuenta los 12 y la card sigue mostrando 5', async () => {
        const data = await getCoachDashboardDataV2('coach-1')
        expect(data.kpi.riskCount).toBe(12)
        expect(data.topRiskClients).toHaveLength(5)
    })

    it('sin fila T−7: «risk» queda en null y «clients» son las altas de la semana', async () => {
        const data = await getCoachDashboardDataV2('coach-1')
        expect(Object.keys(data.kpi.deltas).sort()).toEqual(['adherence', 'clients', 'risk', 'sessionsToday'])
        expect(data.kpi.deltas.risk).toBeNull()
        expect(data.kpi.deltas.clients).toEqual({ value: 2, text: '+2 esta semana', tone: 'positive' })
    })

    it('con fila T−7: «risk» es el delta real y «clients» pasa a saldo neto', async () => {
        snapshotRow = { day: '2026-08-25', risk_count: 9, active_clients: 13, avg_adherence: 55, sessions_7d: 8 }
        const data = await getCoachDashboardDataV2('coach-1')

        // riskCount 12 contra 9 hace una semana: subió, y subir riesgo es malo.
        expect(data.kpi.deltas.risk).toEqual({ value: 3, text: '+3 vs. hace 7 días', tone: 'negative' })
        // totalClients 15 contra 13: saldo neto, no altas brutas (que darían +2 «esta semana»).
        expect(data.kpi.deltas.clients).toEqual({ value: 2, text: '+2 vs. hace 7 días', tone: 'positive' })
    })

    it('los tres deltas calculables salen de los datos ya cargados', async () => {
        const data = await getCoachDashboardDataV2('coach-1')
        // areaData agrupa en zona Santiago: 3 alumnos distintos hoy, 1 ayer.
        expect(data.areaData.find((p) => p.name === TODAY_KEY)?.sesiones).toBe(3)
        expect(data.areaData.find((p) => p.name === YESTERDAY_KEY)?.sesiones).toBe(1)

        expect(data.kpi.deltas.sessionsToday).toEqual({ value: 2, text: '+2 vs. ayer', tone: 'positive' })
        expect(data.kpi.deltas.clients).toEqual({ value: 2, text: '+2 esta semana', tone: 'positive' })
        // adherenceHistory4w = [0, 0, 40, 60] en las 15 filas del pulse ⇒ +20 pts.
        expect(data.kpi.deltas.adherence).toEqual({
            value: 20,
            text: '+20 pts vs. semana previa',
            tone: 'positive',
        })
    })

    it('no filtra al cliente las entradas internas de los deltas', async () => {
        snapshotRow = { day: '2026-08-25', risk_count: 9, active_clients: 13, avg_adherence: 55, sessions_7d: 8 }
        const data = await getCoachDashboardDataV2('coach-1')
        expect(data).not.toHaveProperty('_rawSignupDates')
        expect(data).not.toHaveProperty('areaTodayKey')
        expect(data).not.toHaveProperty('areaYesterdayKey')
        expect(data).not.toHaveProperty('_snapshot7d')
    })

    it('expone agendaTotal con los pendientes reales, no con el largo de la lista topeada', async () => {
        // Los 12 en riesgo del pulse llevan uno de los dos flags criticos ⇒ 12 filas de pendiente.
        const data = await getCoachDashboardDataV2('coach-1')
        expect(data.agendaTotal).toBe(12)
        expect(data.agenda).toHaveLength(8)
    })
})

/** «Pendientes de hoy» — 2026-09-10 11:00 en Santiago (UTC-4 en septiembre). */
const AGENDA_NOW = new Date('2026-09-10T15:00:00.000Z')

/** Programa por vencer con el shape minimo que consume el builder. */
const expiringProgram = (over: { id: string; daysLeft: number; name?: string }) => ({
    id: over.id,
    clientId: `cliente-${over.id}`,
    clientName: `Alumno ${over.id}`,
    daysLeft: over.daysLeft,
    name: over.name ?? `Programa ${over.id}`,
})

/**
 * `buildAgendaFromPulse` es la unica fuente del texto y del orden de «Pendientes de hoy»: el `now`
 * entra por parametro para que ni la cuenta de dias ni la fecha corta dependan del reloj de la
 * maquina que corre el gate (el servidor real corre en UTC y el corte es el dia de Santiago).
 */
describe('buildAgendaFromPulse — pendientes reales, ordenados por urgencia', () => {
    it('ordena danger → warning → none y, dentro del grupo, el mas viejo arriba', () => {
        const { items } = buildAgendaFromPulse(
            [
                pulseRow({ clientId: 'nunca', attentionFlags: ['SIN_EJERCICIO_7D'], lastWorkoutDate: null }),
                pulseRow({
                    clientId: 'ambar-8',
                    attentionFlags: ['SIN_EJERCICIO_7D'],
                    lastWorkoutDate: '2026-09-02T15:00:00.000Z',
                }),
                pulseRow({
                    clientId: 'rojo-20',
                    attentionFlags: ['SIN_EJERCICIO_7D'],
                    lastWorkoutDate: '2026-08-21T15:00:00.000Z',
                }),
                pulseRow({
                    clientId: 'rojo-40',
                    attentionFlags: ['SIN_EJERCICIO_7D'],
                    lastWorkoutDate: '2026-08-01T15:00:00.000Z',
                }),
            ],
            [],
            AGENDA_NOW
        )

        expect(items.map((i) => i.clientId)).toEqual(['rojo-40', 'rojo-20', 'ambar-8', 'nunca'])
        expect(items.map((i) => i.severity)).toEqual(['danger', 'danger', 'warning', 'none'])
        expect(items.map((i) => i.days)).toEqual([40, 20, 8, null])
    })

    it('ejemplo del PLAN: daysLeft 1 → daysLeft 3 → sin_ejercicio de 9 d (los tres «warning»)', () => {
        const { items } = buildAgendaFromPulse(
            [
                pulseRow({
                    clientId: 'sin-entrenos',
                    attentionFlags: ['SIN_EJERCICIO_7D'],
                    lastWorkoutDate: '2026-09-01T15:00:00.000Z',
                }),
            ],
            [expiringProgram({ id: 'p3', daysLeft: 3 }), expiringProgram({ id: 'p1', daysLeft: 1 })],
            AGENDA_NOW
        )

        expect(items.map((i) => i.id)).toEqual(['expire-p1', 'expire-p3', 'workout-sin-entrenos'])
        expect(items.map((i) => i.severity)).toEqual(['warning', 'warning', 'warning'])
    })

    it('el label llega armado con la fecha real de Santiago (sin Intl)', () => {
        const { items } = buildAgendaFromPulse(
            [
                pulseRow({
                    clientId: 'con-fecha',
                    attentionFlags: ['SIN_EJERCICIO_7D'],
                    lastWorkoutDate: '2026-09-02T15:00:00.000Z',
                }),
                pulseRow({ clientId: 'sin-fecha', attentionFlags: ['SIN_EJERCICIO_7D'], lastWorkoutDate: null }),
                pulseRow({
                    clientId: 'sin-checkin',
                    attentionFlags: ['SIN_CHECKIN_1M'],
                    lastCheckinDate: '2026-08-07T15:00:00.000Z',
                }),
            ],
            [expiringProgram({ id: 'pv', daysLeft: 2, name: 'Fuerza 4 días' })],
            AGENDA_NOW
        )
        const labelById = new Map(items.map((i) => [i.id, i.label]))

        expect(labelById.get('workout-con-fecha')).toBe('Sin entrenos desde el 2 sept · 8 d')
        expect(labelById.get('workout-sin-fecha')).toBe('Todavía no registra entrenos')
        expect(labelById.get('checkin-sin-checkin')).toBe('Sin check-in desde el 7 ago · 34 d')
        expect(labelById.get('expire-pv')).toBe('«Fuerza 4 días» vence en 2 d')
    })

    it('con mas de 8 pendientes el total es el real y la lista se topea en 8', () => {
        const rows = Array.from({ length: 10 }, (_, i) =>
            pulseRow({
                clientId: `pendiente-${i + 1}`,
                attentionFlags: ['SIN_EJERCICIO_7D'],
                lastWorkoutDate: '2026-09-02T15:00:00.000Z',
            })
        )

        const { items, total } = buildAgendaFromPulse(rows, [], AGENDA_NOW)

        expect(total).toBe(10)
        expect(items).toHaveLength(8)
    })

    it('un alumno con los dos flags aporta UNA fila y gana el check-in', () => {
        const { items, total } = buildAgendaFromPulse(
            [
                pulseRow({
                    clientId: 'ambos',
                    attentionFlags: ['SIN_CHECKIN_1M', 'SIN_EJERCICIO_7D'],
                    lastCheckinDate: '2026-08-07T15:00:00.000Z',
                    lastWorkoutDate: '2026-09-02T15:00:00.000Z',
                }),
            ],
            [],
            AGENDA_NOW
        )

        expect(total).toBe(1)
        expect(items).toHaveLength(1)
        expect(items[0].id).toBe('checkin-ambos')
        expect(items[0].kind).toBe('checkin_pendiente')
        expect(items[0].dueAt).toBe('2026-08-07T15:00:00.000Z')
    })

    it('cuenta FILAS, no alumnos: el mismo alumno con programa por vencer y sin entrenos son 2 (R14)', () => {
        const { items, total } = buildAgendaFromPulse(
            [
                pulseRow({
                    clientId: 'cliente-doble',
                    attentionFlags: ['SIN_EJERCICIO_7D'],
                    lastWorkoutDate: '2026-09-02T15:00:00.000Z',
                }),
            ],
            [{ id: 'doble', clientId: 'cliente-doble', clientName: 'Alumno doble', daysLeft: 2, name: 'Fuerza' }],
            AGENDA_NOW
        )

        expect(total).toBe(2)
        expect(items.map((i) => i.kind)).toEqual(['programa_vence', 'sin_ejercicio'])
    })
})
