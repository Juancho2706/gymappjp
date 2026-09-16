import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonthReportJson } from '@eva/client-dossier'

/**
 * Service del informe mensual (R16). Lo que se prueba acá es el CONTRATO DE BORDE, no el modelo
 * (eso vive en `packages/client-dossier/src/month-dossier.test.ts`):
 *
 *  1. el 42501 del guard SQL sale como un mensaje de producto, no como un error de Postgres;
 *  2. `includePhotos: false` no firma NADA (ni instancia el cliente service-role);
 *  3. los topes de fotos (3 por mes, 18 por exportación) se aplican ANTES del firmador;
 *  4. los RPC se llaman con el cliente de COOKIES, nunca con service-role.
 */

const h = vi.hoisted(() => ({
    getClaims: vi.fn(),
    rpc: vi.fn(),
    maybeSingle: vi.fn(),
    resolveCheckinPhotoUrls: vi.fn(),
    createServiceRoleClient: vi.fn(),
    assertCoachClientReadAccess: vi.fn(),
    /** Registra qué cliente se usó en cada `rpc()` (cookies vs service-role). */
    rpcCallers: [] as string[],
}))

const COOKIE_CLIENT = {
    __kind: 'cookies',
    auth: { getClaims: h.getClaims },
    rpc: (...args: unknown[]) => {
        h.rpcCallers.push('cookies')
        return h.rpc(...args)
    },
    from: () => ({
        select: () => ({
            eq: () => ({ maybeSingle: h.maybeSingle }),
        }),
    }),
}

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => COOKIE_CLIENT,
}))
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: h.createServiceRoleClient,
}))
vi.mock('@/lib/storage/checkin-photos', () => ({
    resolveCheckinPhotoUrls: h.resolveCheckinPhotoUrls,
}))
vi.mock('@/services/client/client-scope.service', () => ({
    assertCoachClientReadAccess: h.assertCoachClientReadAccess,
    getCoachClientScope: vi.fn(),
}))

import {
    getClientMonthReports,
    getClientReportBounds,
    MAX_PHOTOS_PER_EXPORT,
    MAX_PHOTOS_PER_MONTH,
} from './client-month-report.service'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const CLIENT_ROW = {
    full_name: '  Pame Cid  ',
    email: 'pame@evatest.cl',
    phone: '+56900000000',
    is_active: true,
    subscription_start_date: '2026-01-15',
    created_at: '2025-12-01T10:00:00.000Z',
}

/** Mes del contrato R10 con `n` check-ins, todos con foto frontal. */
function monthFixture(monthKey: string, checkInsWithPhoto = 0): MonthReportJson {
    return {
        month: `${monthKey}-01`,
        period: { from: `${monthKey}-01`, to: `${monthKey}-28` },
        training_days: [`${monthKey}-02`, `${monthKey}-04`],
        sessions: 2,
        planned_days: 8,
        planned_per_week: 2,
        volume_total: 1000,
        volume_by_group: [{ muscle_group: 'Glúteos', volume: 1000 }],
        prs: [],
        program: null,
        plan_names_from_logs: [],
        check_ins: Array.from({ length: checkInsWithPhoto }, (_, i) => ({
            id: `${monthKey}-ci-${i}`,
            created_at: `${monthKey}-1${i}T12:00:00.000Z`,
            weight: 64.4,
            energy_level: 8,
            notes: null,
            front_photo_url: `${monthKey}/front-${i}.jpg`,
        })),
        weight: null,
        nutrition: null,
    }
}

/** Responde el RPC pedido; `months` para el informe, bounds fijos. */
function mockRpc(months: MonthReportJson[]) {
    h.rpc.mockImplementation((fn: string) => {
        if (fn === 'get_client_month_reports') {
            return Promise.resolve({ data: { months }, error: null })
        }
        return Promise.resolve({
            data: { first_month: '2026-06-01', current_month: '2026-09-01' },
            error: null,
        })
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    h.rpcCallers.length = 0
    h.getClaims.mockResolvedValue({ data: { claims: { sub: 'coach-1' } } })
    h.assertCoachClientReadAccess.mockResolvedValue({
        orgId: null,
        activeTeamId: null,
        viaTeam: false,
    })
    h.maybeSingle.mockResolvedValue({ data: CLIENT_ROW, error: null })
    h.createServiceRoleClient.mockReturnValue({ __kind: 'service-role' })
    // Firmador: devuelve las mismas filas con una URL firmada por path.
    h.resolveCheckinPhotoUrls.mockImplementation(
        async (_admin: unknown, rows: { id: string; front_photo_url: string | null }[]) =>
            rows.map((r) => ({ ...r, front_photo_url: `https://signed/${r.front_photo_url}` }))
    )
    mockRpc([monthFixture('2026-07')])
})

describe('getClientMonthReports — traducción de errores del RPC', () => {
    it('42501 (guard de 3 vías) sale como un mensaje legible, no como error de Postgres', async () => {
        h.rpc.mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'client_month_reports_denied' },
        })
        await expect(getClientMonthReports(CLIENT_ID, ['2026-07'])).rejects.toThrow(
            'No tenés acceso a este alumno'
        )
    })

    it('22023 se lee como selección de meses inválida', async () => {
        h.rpc.mockResolvedValue({
            data: null,
            error: { code: '22023', message: 'too many months' },
        })
        await expect(getClientMonthReports(CLIENT_ID, ['2026-07'])).rejects.toThrow(
            'Selección de meses inválida'
        )
    })

    it('un error inesperado NO filtra el mensaje de Postgres: genérico afuera, detalle al log', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        h.rpc.mockResolvedValue({
            data: null,
            error: {
                code: '42P01',
                message: 'relation "public.workout_logs_v9" does not exist',
            },
        })
        await expect(getClientMonthReports(CLIENT_ID, ['2026-07'])).rejects.toThrow(
            'No se pudo leer el informe del alumno'
        )
        expect(logged).toHaveBeenCalledWith('[client-month-report] RPC error', {
            code: '42P01',
            message: 'relation "public.workout_logs_v9" does not exist',
        })
        logged.mockRestore()
    })

    it('más de 24 meses ni siquiera llega a la red', async () => {
        const keys = Array.from({ length: 25 }, (_, i) => `20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`)
        await expect(getClientMonthReports(CLIENT_ID, keys)).rejects.toThrow(
            'Selección de meses inválida'
        )
        expect(h.rpc).not.toHaveBeenCalled()
    })
})

describe('getClientMonthReports — fotos', () => {
    it('includePhotos: false no llama al firmador ni instancia el cliente service-role', async () => {
        mockRpc([monthFixture('2026-07', 3)])
        const dossiers = await getClientMonthReports(CLIENT_ID, ['2026-07'], {
            includePhotos: false,
        })
        expect(h.resolveCheckinPhotoUrls).not.toHaveBeenCalled()
        expect(h.createServiceRoleClient).not.toHaveBeenCalled()
        expect(dossiers[0]!.checkIns.every((c) => c.photoUrl === null)).toBe(true)
    })

    it('firma como máximo 3 fotos por mes y 18 por exportación', async () => {
        // 10 meses × 5 check-ins con foto = 50 candidatas.
        const months = Array.from({ length: 10 }, (_, i) =>
            monthFixture(`2026-${String(i + 1).padStart(2, '0')}`, 5)
        )
        mockRpc(months)
        const keys = months.map((m) => m.month.slice(0, 7))

        await getClientMonthReports(CLIENT_ID, keys, { includePhotos: true })

        expect(h.resolveCheckinPhotoUrls).toHaveBeenCalledTimes(1)
        const rows = h.resolveCheckinPhotoUrls.mock.calls[0]![1] as { id: string }[]
        expect(rows).toHaveLength(MAX_PHOTOS_PER_EXPORT)
        // Ninguna clave de mes aporta más de 3 filas.
        const perMonth = new Map<string, number>()
        for (const r of rows) {
            const key = r.id.slice(0, 7)
            perMonth.set(key, (perMonth.get(key) ?? 0) + 1)
        }
        expect(Math.max(...perMonth.values())).toBeLessThanOrEqual(MAX_PHOTOS_PER_MONTH)
    })

    it('firma SOLO la foto frontal (fullPhotoRows: 0 + tailFields) y la pega por checkInId', async () => {
        mockRpc([monthFixture('2026-07', 1)])
        const dossiers = await getClientMonthReports(CLIENT_ID, ['2026-07'], {
            includePhotos: true,
        })
        expect(h.resolveCheckinPhotoUrls.mock.calls[0]![2]).toEqual({
            fullPhotoRows: 0,
            tailFields: ['front_photo_url'],
        })
        expect(dossiers[0]!.checkIns[0]!.photoUrl).toBe('https://signed/2026-07/front-0.jpg')
    })
})

describe('getClientMonthReports — salida', () => {
    it('arma un dossier por mes con identidad, índice y un generatedAtIso único', async () => {
        mockRpc([monthFixture('2026-07'), monthFixture('2026-08')])
        const dossiers = await getClientMonthReports(CLIENT_ID, ['2026-07', '2026-08'])

        expect(dossiers).toHaveLength(2)
        expect(dossiers[0]!.identity.fullName).toBe('Pame Cid')
        expect(dossiers[0]!.identity.clientSinceIso).toBe('2026-01-15')
        expect(dossiers[0]!.period).toMatchObject({ monthKey: '2026-07', index: 1, total: 2 })
        expect(dossiers[1]!.period).toMatchObject({ monthKey: '2026-08', index: 2, total: 2 })
        expect(dossiers[0]!.generatedAtIso).toBe(dossiers[1]!.generatedAtIso)
    })

    it('manda los meses al RPC como primer día del mes y ordenados, con el cliente de cookies', async () => {
        mockRpc([monthFixture('2026-07'), monthFixture('2026-08')])
        await getClientMonthReports(CLIENT_ID, ['2026-08', '2026-07', '2026-08'])

        expect(h.rpc).toHaveBeenCalledWith('get_client_month_reports', {
            p_client_id: CLIENT_ID,
            p_months: ['2026-07-01', '2026-08-01'],
        })
        expect(h.rpcCallers).toEqual(['cookies'])
    })

    it('exige el guard de scoping antes de tocar el RPC', async () => {
        h.assertCoachClientReadAccess.mockRejectedValue(new Error('Forbidden'))
        await expect(getClientMonthReports(CLIENT_ID, ['2026-07'])).rejects.toThrow('Forbidden')
        expect(h.rpc).not.toHaveBeenCalled()
    })
})

describe('getClientReportBounds', () => {
    it('devuelve las claves YYYY-MM del rango', async () => {
        mockRpc([])
        await expect(getClientReportBounds(CLIENT_ID)).resolves.toEqual({
            firstMonthKey: '2026-06',
            currentMonthKey: '2026-09',
        })
        expect(h.rpcCallers).toEqual(['cookies'])
    })

    it('sin first_month cae al mes en curso', async () => {
        h.rpc.mockResolvedValue({
            data: { first_month: null, current_month: '2026-09-01' },
            error: null,
        })
        await expect(getClientReportBounds(CLIENT_ID)).resolves.toEqual({
            firstMonthKey: '2026-09',
            currentMonthKey: '2026-09',
        })
    })

    it('42501 sale como mensaje legible', async () => {
        h.rpc.mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'client_report_bounds_denied' },
        })
        await expect(getClientReportBounds(CLIENT_ID)).rejects.toThrow(
            'No tenés acceso a este alumno'
        )
    })
})
