/**
 * Agenda «Pendientes de hoy» del dashboard móvil (N4, carril C del tren «Señales honestas para el
 * coach»).
 *
 * Dos contratos:
 *  1. `mapApiDashboard` conserva `dueAt`/`days`/`severity` de cada fila y el `agendaTotal` del
 *     servidor, con `?? agenda.rows.length` para el teléfono que le pegue a un deploy VIEJO.
 *  2. El fallback local (`buildLocalAgenda`, extraído del camino degradado) produce EXACTAMENTE los
 *     mismos strings que `buildAgendaLabel` del package para los tres `kind`, incluida la fecha
 *     corta («2 sept», sin punto): el fallback formatea con `shortDayMonthEs` y **nunca** con
 *     `Intl`/`toLocaleDateString`, así offline y online dicen lo mismo carácter por carácter.
 *     Y `agendaTotal` se cuenta ANTES de los `slice` (R17): 9 riesgos ⇒ total 9 y 8 filas.
 *
 * GOTCHA de resolución (mismo patrón que `coach-dashboard-deltas.test.ts`): los ids bare resuelven
 * distinto desde `tests/` que desde `apps/mobile/`, así que las dependencias del módulo se
 * mockean por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico. `date-utils.ts` NO se mockea: es
 * el helper real de zona horaria (`getSantiagoIsoYmdForUtcInstant`) y es parte de lo que se prueba.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAgendaLabel, shortDayMonthEs } from '@eva/profile-analytics'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

type Mod = typeof import('../../apps/mobile/lib/coach-dashboard')

async function loadModule(): Promise<Mod> {
  vi.resetModules()
  vi.doMock(mobileDep('@sentry/react-native'), () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }))
  vi.doMock(mobileLib('supabase.ts'), () => ({ supabase: {} }))
  vi.doMock(mobileLib('coach.ts'), () => ({ getCoachProfile: vi.fn() }))
  vi.doMock(mobileLib('api.ts'), () => ({ apiFetch: vi.fn(), getApiBaseUrl: () => 'https://www.eva-app.cl' }))
  vi.doMock(mobileLib('workspace.ts'), () => ({ getActiveCoachWorkspace: vi.fn() }))
  vi.doMock(mobileLib('branding.ts'), () => ({ loadStoredBranding: vi.fn(async () => null) }))
  return (await import(mobileLib('coach-dashboard.ts'))) as Mod
}

// UUIDs reales: `mapApiDashboard` descarta las filas cuyo `clientId` no es uuid (barrera de nav).
const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const CLIENT_B = '22222222-2222-4222-8222-222222222222'

/** Payload mínimo del endpoint `/api/mobile/coach/dashboard` con la agenda que se quiera probar. */
function apiPayload(dashboard: Record<string, unknown>): Parameters<Mod['mapApiDashboard']>[0] {
  return {
    coach: { id: 'coach-1', full_name: 'Coach' },
    dashboard: {
      kpi: {
        mrrCurrentMonth: 0,
        mrrPreviousMonth: 0,
        mrrDeltaPct: 0,
        totalClients: 2,
        riskCount: 1,
        avgAdherence: 50,
        avgNutrition: 0,
      },
      activePlans: 0,
      hasStudentSignal30d: true,
      clientList: [],
      clientPaymentSummary: [],
      adherenceStats: [],
      nutritionStats: [],
      topRiskClients: [],
      agenda: [],
      expiringPrograms: [],
      recentActivities: [],
      areaData: [],
      barData: [],
      ...dashboard,
    },
  } as unknown as Parameters<Mod['mapApiDashboard']>[0]
}

describe('mapApiDashboard · agenda', () => {
  let mapApiDashboard: Mod['mapApiDashboard']

  beforeEach(async () => {
    mapApiDashboard = (await loadModule()).mapApiDashboard
  })

  it('conserva dueAt/days/severity de cada fila y el agendaTotal del servidor', () => {
    const mapped = mapApiDashboard(
      apiPayload({
        agendaTotal: 11,
        agenda: [
          {
            id: `workout-${CLIENT_A}`,
            clientId: CLIENT_A,
            clientName: 'Ana',
            kind: 'sin_ejercicio',
            label: 'Sin entrenos desde el 2 sept · 8 d',
            dueAt: '2026-09-02T14:00:00.000Z',
            days: 8,
            severity: 'warning',
          },
          {
            id: `expire-${CLIENT_B}`,
            clientId: CLIENT_B,
            clientName: 'Beto',
            kind: 'programa_vence',
            label: '«Fuerza 4 días» vence hoy',
            dueAt: null,
            days: null,
            severity: 'danger',
          },
        ],
      }),
    )

    expect(mapped.agenda).toEqual([
      {
        id: `workout-${CLIENT_A}`,
        clientId: CLIENT_A,
        clientName: 'Ana',
        kind: 'sin_ejercicio',
        label: 'Sin entrenos desde el 2 sept · 8 d',
        dueAt: '2026-09-02T14:00:00.000Z',
        days: 8,
        severity: 'warning',
      },
      {
        id: `expire-${CLIENT_B}`,
        clientId: CLIENT_B,
        clientName: 'Beto',
        kind: 'programa_vence',
        label: '«Fuerza 4 días» vence hoy',
        dueAt: null,
        days: null,
        severity: 'danger',
      },
    ])
    // El total del servidor manda: son 11 pendientes aunque solo viajen 2 filas.
    expect(mapped.agendaTotal).toBe(11)
  })

  it('deploy viejo sin agendaTotal ⇒ cae a la cantidad de filas que sobrevivieron el guard de uuid', () => {
    const mapped = mapApiDashboard(
      apiPayload({
        agenda: [
          {
            id: 'workout-ok',
            clientId: CLIENT_A,
            clientName: 'Ana',
            kind: 'sin_ejercicio',
            label: 'Todavía no registra entrenos',
            dueAt: null,
            days: null,
            severity: 'none',
          },
          {
            id: 'workout-roto',
            clientId: 'null',
            clientName: 'Sin id',
            kind: 'sin_ejercicio',
            label: 'Todavía no registra entrenos',
            dueAt: null,
            days: null,
            severity: 'none',
          },
        ],
      }),
    )

    expect(mapped.agenda).toHaveLength(1)
    expect(mapped.agendaTotal).toBe(1)
  })
})

const TODAY_YMD = '2026-09-10'
const NO_MAPS = {
  lastWorkoutByClient: new Map<string, { logged_at: string }>(),
  lastCheckInByClient: new Map<string, { created_at: string }>(),
}

describe('buildLocalAgenda · fallback offline', () => {
  let buildLocalAgenda: Mod['buildLocalAgenda']

  beforeEach(async () => {
    buildLocalAgenda = (await loadModule()).buildLocalAgenda
  })

  it('sin_ejercicio: mismo string que buildAgendaLabel, con la fecha corta del package (sin Intl)', () => {
    const { items, total } = buildLocalAgenda({
      riskItems: [
        { clientId: CLIENT_A, clientName: 'Ana', attentionScore: 75, label: 'Adherencia critica - sin ejercicio en 7 dias', flags: ['SIN_EJERCICIO_7D'] },
      ],
      expiringPrograms: [],
      // 14:00Z del 2 de septiembre siguen siendo el 2 de septiembre en Santiago (UTC-4).
      lastWorkoutByClient: new Map([[CLIENT_A, { logged_at: '2026-09-02T14:00:00.000Z' }]]),
      lastCheckInByClient: new Map([[CLIENT_A, { created_at: '2026-09-09T14:00:00.000Z' }]]),
      todayYmd: TODAY_YMD,
    })

    expect(total).toBe(1)
    expect(items[0].label).toBe(buildAgendaLabel({ kind: 'sin_ejercicio', days: 8, dateText: '2 sept' }))
    expect(items[0].label).toBe('Sin entrenos desde el 2 sept · 8 d')
    expect(shortDayMonthEs('2026-09-02')).toBe('2 sept')
    expect(items[0]).toMatchObject({
      id: `risk-${CLIENT_A}`,
      kind: 'sin_ejercicio',
      dueAt: '2026-09-02T14:00:00.000Z',
      days: 8,
      severity: 'warning',
    })
    // Dejó de reusar el `label` del riesgo: ese copy viejo no puede volver a la pantalla.
    expect(items[0].label).not.toContain('Adherencia critica')
  })

  it('checkin_pendiente: gana el flag de check-in y la fecha sale del último check-in', () => {
    const { items } = buildLocalAgenda({
      riskItems: [
        {
          clientId: CLIENT_A,
          clientName: 'Ana',
          attentionScore: 95,
          label: 'Adherencia critica - sin check-in en 1 mes',
          // Con los dos flags manda el check-in: UNA sola fila por alumno, igual que el servidor.
          flags: ['SIN_CHECKIN_1M', 'SIN_EJERCICIO_7D'],
        },
      ],
      expiringPrograms: [],
      lastWorkoutByClient: new Map([[CLIENT_A, { logged_at: '2026-09-09T14:00:00.000Z' }]]),
      lastCheckInByClient: new Map([[CLIENT_A, { created_at: '2026-08-07T14:00:00.000Z' }]]),
      todayYmd: TODAY_YMD,
    })

    expect(items).toHaveLength(1)
    expect(items[0].label).toBe(buildAgendaLabel({ kind: 'checkin_pendiente', days: 34, dateText: '7 ago' }))
    expect(items[0].label).toBe('Sin check-in desde el 7 ago · 34 d')
    expect(items[0]).toMatchObject({ kind: 'checkin_pendiente', days: 34, severity: 'danger' })
  })

  it('alumno sin ninguna fecha: «Todavía no registra …», sin «· 0 d» y severidad none', () => {
    const { items } = buildLocalAgenda({
      riskItems: [
        { clientId: CLIENT_A, clientName: 'Ana', attentionScore: 75, label: 'x', flags: ['SIN_EJERCICIO_7D'] },
        { clientId: CLIENT_B, clientName: 'Beto', attentionScore: 85, label: 'x', flags: ['SIN_CHECKIN_1M'] },
      ],
      expiringPrograms: [],
      ...NO_MAPS,
      todayYmd: TODAY_YMD,
    })

    const byClient = new Map(items.map((item) => [item.clientId, item]))
    expect(byClient.get(CLIENT_A)?.label).toBe(buildAgendaLabel({ kind: 'sin_ejercicio', days: null, dateText: null }))
    expect(byClient.get(CLIENT_A)?.label).toBe('Todavía no registra entrenos')
    expect(byClient.get(CLIENT_B)?.label).toBe('Todavía no registra check-ins')
    expect(byClient.get(CLIENT_A)).toMatchObject({ dueAt: null, days: null, severity: 'none' })
  })

  it('programa_vence: las tres variantes del copy y la severidad por daysLeft', () => {
    const { items } = buildLocalAgenda({
      riskItems: [],
      expiringPrograms: [
        { id: 'p1', name: 'Fuerza 4 días', clientId: CLIENT_A, clientName: 'Ana', daysLeft: 2 },
        { id: 'p2', name: 'Hipertrofia', clientId: CLIENT_B, clientName: 'Beto', daysLeft: 0 },
        { id: 'p3', name: 'Full body', clientId: CLIENT_A, clientName: 'Ana', daysLeft: -3 },
      ],
      ...NO_MAPS,
      todayYmd: TODAY_YMD,
    })

    // Orden: danger (vencido, vence hoy) primero y, dentro del grupo, `daysLeft` ascendente.
    expect(items.map((item) => item.label)).toEqual([
      buildAgendaLabel({ kind: 'programa_vence', days: null, dateText: null, programName: 'Full body', daysLeft: -3 }),
      buildAgendaLabel({ kind: 'programa_vence', days: null, dateText: null, programName: 'Hipertrofia', daysLeft: 0 }),
      buildAgendaLabel({ kind: 'programa_vence', days: null, dateText: null, programName: 'Fuerza 4 días', daysLeft: 2 }),
    ])
    expect(items.map((item) => item.label)).toEqual([
      '«Full body» venció hace 3 d',
      '«Hipertrofia» vence hoy',
      '«Fuerza 4 días» vence en 2 d',
    ])
    expect(items.map((item) => item.severity)).toEqual(['danger', 'danger', 'warning'])
    expect(items.every((item) => item.days === null && item.dueAt === null)).toBe(true)
  })

  it('9 riesgos ⇒ agendaTotal 9 y 8 filas, ordenadas por urgencia (el total NO sale de la lista topada)', () => {
    // Un alumno por día de antigüedad: 9 d, 8 d, 7 d ⇒ warning; 6 d … 1 d ⇒ none.
    const riskItems = Array.from({ length: 9 }, (_, index) => {
      const daysAgo = 9 - index
      return {
        clientId: `3333333${index}-3333-4333-8333-333333333333`,
        clientName: `Alumno ${daysAgo} d`,
        attentionScore: 75,
        label: 'x',
        flags: ['SIN_EJERCICIO_7D'],
      }
    })
    const lastWorkoutByClient = new Map(
      riskItems.map((risk, index) => [
        risk.clientId,
        { logged_at: `2026-09-0${index + 1}T14:00:00.000Z` },
      ]),
    )

    const { items, total } = buildLocalAgenda({
      riskItems,
      expiringPrograms: [],
      lastWorkoutByClient,
      lastCheckInByClient: new Map<string, { created_at: string }>(),
      todayYmd: TODAY_YMD,
    })

    expect(total).toBe(9)
    expect(items).toHaveLength(8)
    // Más viejo arriba dentro de cada grupo de severidad; el de 1 d es el único que queda fuera.
    expect(items.map((item) => item.days)).toEqual([9, 8, 7, 6, 5, 4, 3, 2])
    expect(items.map((item) => item.severity)).toEqual([
      'warning',
      'warning',
      'warning',
      'none',
      'none',
      'none',
      'none',
      'none',
    ])
    // La fila «y N más en Alumnos» de la UI sale de esta resta: 9 - 8 = 1.
    expect(total - items.length).toBe(1)
  })

  it('programas y riesgos juntos: el orden es danger → warning → none', () => {
    const { items, total } = buildLocalAgenda({
      riskItems: [
        { clientId: CLIENT_A, clientName: 'Ana', attentionScore: 75, label: 'x', flags: ['SIN_EJERCICIO_7D'] },
        { clientId: CLIENT_B, clientName: 'Beto', attentionScore: 75, label: 'x', flags: ['SIN_EJERCICIO_7D'] },
      ],
      expiringPrograms: [{ id: 'p1', name: 'Fuerza', clientId: CLIENT_A, clientName: 'Ana', daysLeft: 2 }],
      lastWorkoutByClient: new Map([
        // 20 d ⇒ danger; 3 d ⇒ none.
        [CLIENT_A, { logged_at: '2026-08-21T14:00:00.000Z' }],
        [CLIENT_B, { logged_at: '2026-09-07T14:00:00.000Z' }],
      ]),
      lastCheckInByClient: new Map<string, { created_at: string }>(),
      todayYmd: TODAY_YMD,
    })

    expect(total).toBe(3)
    expect(items.map((item) => [item.kind, item.severity])).toEqual([
      ['sin_ejercicio', 'danger'],
      ['programa_vence', 'warning'],
      ['sin_ejercicio', 'none'],
    ])
  })

  it('dentro del mismo grupo: programas por daysLeft asc ANTES que las filas de pulse (espejo del ejemplo obligatorio de N6)', () => {
    const { items } = buildLocalAgenda({
      // 9 d sin entrenos ⇒ warning, igual que los dos programas (daysLeft 1..3).
      riskItems: [{ clientId: CLIENT_B, clientName: 'Beto', attentionScore: 60, label: 'x', flags: ['SIN_EJERCICIO_7D'] }],
      expiringPrograms: [
        { id: 'p3', name: 'Tres', clientId: CLIENT_A, clientName: 'Ana', daysLeft: 3 },
        { id: 'p1', name: 'Uno', clientId: CLIENT_A, clientName: 'Ana', daysLeft: 1 },
      ],
      lastWorkoutByClient: new Map([[CLIENT_B, { logged_at: '2026-09-01T14:00:00.000Z' }]]),
      lastCheckInByClient: new Map<string, { created_at: string }>(),
      todayYmd: TODAY_YMD,
    })

    expect(items.map((item) => item.severity)).toEqual(['warning', 'warning', 'warning'])
    expect(items.map((item) => item.id)).toEqual(['expire-p1', 'expire-p3', `risk-${CLIENT_B}`])
  })
})
