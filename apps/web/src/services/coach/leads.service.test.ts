import { beforeEach, describe, expect, it, vi } from 'vitest'

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/posthog/server-capture', () => ({ capturePostHogServerEvent: captureMock }))

import { convertCoachLead, listCoachLeads, updateCoachLeadStatus } from './leads.service'

/**
 * Mock encadenable de PostgREST. Cada método devuelve el mismo objeto y el objeto es «thenable»:
 * así sirve tanto para las cadenas que terminan en `await` (el update) como para las que terminan
 * en `.limit()` / `.maybeSingle()`.
 */
function chain(results: { list?: unknown; single?: unknown; write?: unknown }) {
    const calls: Record<string, unknown[][]> = {}
    const record = (name: string, args: unknown[]) => {
        ;(calls[name] ??= []).push(args)
    }
    const q: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'in', 'order', 'update']) {
        q[name] = vi.fn((...args: unknown[]) => {
            record(name, args)
            return q
        })
    }
    q.limit = vi.fn(async (...args: unknown[]) => {
        record('limit', args)
        return results.list ?? { data: [], error: null }
    })
    q.maybeSingle = vi.fn(async () => results.single ?? { data: null, error: null })
    // El update se resuelve por `await` sobre la cadena, sin método terminal.
    q.then = (resolve: (value: unknown) => unknown) => resolve(results.write ?? { error: null })

    const from = vi.fn(() => q)
    const db = { from }
    return { db: db as never, from, q, calls }
}

const ROW = {
    id: 'lead-1',
    full_name: 'Ana Pérez',
    phone: '912345678',
    email: null,
    message: 'Quiero entrenar contigo',
    status: 'new',
    created_at: '2026-08-21T02:00:00.000Z',
    referred_by_client_id: 'client-9',
    referral_card_kind: 'placa',
    referral_source: 'share_card',
    referrer: { full_name: 'Dani Referente' },
}

describe('listCoachLeads', () => {
    beforeEach(() => vi.clearAllMocks())

    it('sin filtro pide la bandeja abierta del coach, ordenada por más nueva y con techo', async () => {
        const { db, q, calls } = chain({ list: { data: [ROW], error: null } })

        const result = await listCoachLeads(db, 'coach-1')

        expect(result).toEqual({
            ok: true,
            leads: [
                {
                    id: 'lead-1',
                    fullName: 'Ana Pérez',
                    phone: '912345678',
                    email: null,
                    message: 'Quiero entrenar contigo',
                    status: 'new',
                    createdAt: '2026-08-21T02:00:00.000Z',
                    referrerName: 'Dani Referente',
                    referralCardKind: 'placa',
                    referralSource: 'share_card',
                },
            ],
        })
        expect(calls.eq).toContainEqual(['coach_id', 'coach-1'])
        expect(calls.in).toContainEqual(['status', ['new', 'contacted']])
        expect(calls.order).toContainEqual(['created_at', { ascending: false }])
        expect(calls.limit).toContainEqual([50])
        // Sin el hint de FK PostgREST responde 300: la tabla tiene DOS FKs a `clients`.
        const selected = (q.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(selected).toContain('clients!coach_leads_referred_by_client_id_fkey')
    })

    it('con `statuses` filtra por ese estado y nada más', async () => {
        const { db, calls } = chain({ list: { data: [], error: null } })

        await listCoachLeads(db, 'coach-1', { statuses: ['dismissed'] })

        expect(calls.in).toContainEqual(['status', ['dismissed']])
    })

    it('normaliza el embed to-one llegue como objeto o como array, y el status desconocido cae a new', async () => {
        const { db } = chain({
            list: {
                data: [
                    { ...ROW, id: 'a', referrer: [{ full_name: 'Dani Referente' }] },
                    { ...ROW, id: 'b', referrer: null, status: 'basura' },
                ],
                error: null,
            },
        })

        const result = await listCoachLeads(db, 'coach-1')

        expect(result).toMatchObject({ ok: true })
        if (!result.ok) return
        expect(result.leads[0].referrerName).toBe('Dani Referente')
        expect(result.leads[1].referrerName).toBeNull()
        expect(result.leads[1].status).toBe('new')
    })

    it('un error de lectura se propaga como `ok:false` (el route decide el 500)', async () => {
        const { db } = chain({ list: { data: null, error: { message: 'permission denied' } } })

        await expect(listCoachLeads(db, 'coach-1')).resolves.toEqual({
            ok: false,
            error: 'permission denied',
        })
    })
})

describe('updateCoachLeadStatus', () => {
    beforeEach(() => vi.clearAllMocks())

    it('lead ajeno (o uuid inventado) → NOT_FOUND y CERO escrituras', async () => {
        const user = chain({ single: { data: null, error: null } })
        const admin = chain({})

        const result = await updateCoachLeadStatus(
            { userDb: user.db, admin: admin.db },
            'coach-1',
            'lead-ajeno',
            'dismissed',
        )

        expect(result).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Solicitud no encontrada.' })
        expect(admin.from).not.toHaveBeenCalled()
        // La verificación de pertenencia SIEMPRE acota por el coach de la sesión.
        expect(user.calls.eq).toContainEqual(['coach_id', 'coach-1'])
    })

    it('descartar escribe con service_role repitiendo `coach_id` en el where', async () => {
        const user = chain({ single: { data: { id: 'lead-1', status: 'new' }, error: null } })
        // El read-back devuelve la fila ya movida.
        user.q.maybeSingle = vi
            .fn()
            .mockResolvedValueOnce({ data: { id: 'lead-1', status: 'new' }, error: null })
            .mockResolvedValueOnce({ data: { ...ROW, status: 'dismissed' }, error: null })
        const admin = chain({ write: { error: null } })

        const result = await updateCoachLeadStatus(
            { userDb: user.db, admin: admin.db },
            'coach-1',
            'lead-1',
            'dismissed',
        )

        expect(result).toMatchObject({ ok: true, lead: { id: 'lead-1', status: 'dismissed' } })
        expect(admin.calls.update).toContainEqual([{ status: 'dismissed' }])
        expect(admin.calls.eq).toContainEqual(['id', 'lead-1'])
        expect(admin.calls.eq).toContainEqual(['coach_id', 'coach-1'])
    })

    it('no-downgrade: una solicitud ya convertida no vuelve a `contacted` ni toca la DB', async () => {
        const user = chain({ single: { data: { id: 'lead-1', status: 'converted' }, error: null } })
        user.q.maybeSingle = vi
            .fn()
            .mockResolvedValueOnce({ data: { id: 'lead-1', status: 'converted' }, error: null })
            .mockResolvedValueOnce({ data: { ...ROW, status: 'converted' }, error: null })
        const admin = chain({})

        const result = await updateCoachLeadStatus(
            { userDb: user.db, admin: admin.db },
            'coach-1',
            'lead-1',
            'contacted',
        )

        expect(result).toMatchObject({ ok: true, lead: { status: 'converted' } })
        expect(admin.from).not.toHaveBeenCalled()
    })

    it('si el write falla, UPDATE_FAILED con copy humano', async () => {
        const user = chain({ single: { data: { id: 'lead-1', status: 'new' }, error: null } })
        const admin = chain({ write: { error: { message: 'boom' } } })

        const result = await updateCoachLeadStatus(
            { userDb: user.db, admin: admin.db },
            'coach-1',
            'lead-1',
            'dismissed',
        )

        expect(result).toEqual({
            ok: false,
            code: 'UPDATE_FAILED',
            error: 'No pudimos actualizar la solicitud.',
        })
    })

    it('si el write de la conversión falla, el copy es el de convertir', async () => {
        const user = chain({ single: { data: { id: 'lead-1', status: 'new' }, error: null } })
        const admin = chain({ write: { error: { message: 'boom' } } })

        const result = await updateCoachLeadStatus(
            { userDb: user.db, admin: admin.db },
            'coach-1',
            'lead-1',
            'converted',
        )

        expect(result).toEqual({
            ok: false,
            code: 'UPDATE_FAILED',
            error: 'No pudimos marcar la solicitud como convertida.',
        })
        // Un write fallido no puede dejar el embudo contando una conversión que no ocurrió.
        expect(captureMock).not.toHaveBeenCalled()
    })
})

/**
 * Cierre de la conversión — la MISMA implementación que corre el panel web
 * (`markLeadConvertedAction`) y el PATCH móvil con `clientId`. Acá se prueba una sola vez.
 */
function convertBuilder(result: unknown = { data: null, error: null }) {
    const obj: Record<string, unknown> = {}
    Object.assign(obj, {
        select: vi.fn(() => obj),
        update: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        maybeSingle: vi.fn(async () => result),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(result).then(res, rej),
    })
    return obj as Record<string, ReturnType<typeof vi.fn>> & { then: unknown }
}

const OWNED_LEAD = {
    id: 'lead-1',
    status: 'new',
    referred_by_client_id: 'client-referente',
    referral_source: 'share_card',
    referral_card_kind: 'placa',
}

function convertSetup(options?: {
    lead?: Record<string, unknown> | null
    client?: Record<string, unknown> | null
    writeError?: { message: string } | null
}) {
    const lead = options?.lead === undefined ? OWNED_LEAD : options.lead
    const leadRead = convertBuilder()
    // 1er `maybeSingle` = verificación de pertenencia; 2º = read-back del item para la app.
    leadRead.maybeSingle = vi
        .fn()
        .mockResolvedValueOnce({ data: lead, error: null })
        .mockResolvedValueOnce({ data: { ...ROW, status: 'converted' }, error: null })
    const clientRead = convertBuilder({
        data: options?.client === undefined ? { id: 'client-nuevo', referred_by_client_id: null } : options.client,
        error: null,
    })
    const userFrom = vi.fn((table: string) => (table === 'coach_leads' ? leadRead : clientRead))

    const leadWrite = convertBuilder({ error: options?.writeError ?? null })
    const clientWrite = convertBuilder({ error: null })
    const adminFrom = vi.fn((table: string) => (table === 'coach_leads' ? leadWrite : clientWrite))

    return {
        clients: { userDb: { from: userFrom } as never, admin: { from: adminFrom } as never },
        leadRead,
        clientRead,
        leadWrite,
        clientWrite,
        adminFrom,
    }
}

describe('convertCoachLead (web) y `converted` con clientId (móvil)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        captureMock.mockResolvedValue(undefined)
    })

    it('copia las tres columnas de atribución al alumno, cierra el lead y emite los dos eventos', async () => {
        const t = convertSetup()

        const result = await convertCoachLead(t.clients, 'coach-1', 'lead-1', 'client-nuevo')

        expect(result).toEqual({ ok: true, referred: true })
        expect(t.clientWrite.update).toHaveBeenCalledWith({
            referred_by_client_id: 'client-referente',
            referral_source: 'share_card',
            referral_card_kind: 'placa',
        })
        expect(t.leadWrite.update).toHaveBeenCalledWith({
            status: 'converted',
            converted_client_id: 'client-nuevo',
        })
        // Verificar y escribir son dos viajes: el write repite el `coach_id`.
        expect(t.leadWrite.eq).toHaveBeenCalledWith('coach_id', 'coach-1')
        expect(t.clientWrite.eq).toHaveBeenCalledWith('coach_id', 'coach-1')

        expect(captureMock.mock.calls.map((call) => call[0].event)).toEqual([
            'coach_client_referred',
            'coach_lead_converted',
        ])
        expect(captureMock.mock.calls[0][0]).toMatchObject({
            distinctId: 'coach-1',
            properties: { referred_by_client_id: 'client-referente', card_kind: 'placa', surface: 'web' },
        })
        expect(captureMock.mock.calls[1][0].properties).toEqual({ referred: true, surface: 'web' })
    })

    it('sin atribución no toca `clients` ni emite coach_client_referred', async () => {
        const t = convertSetup({
            lead: { ...OWNED_LEAD, referred_by_client_id: null, referral_source: null, referral_card_kind: null },
        })

        const result = await convertCoachLead(t.clients, 'coach-1', 'lead-1', 'client-nuevo')

        expect(result).toEqual({ ok: true, referred: false })
        expect(t.clientWrite.update).not.toHaveBeenCalled()
        expect(captureMock.mock.calls.map((call) => call[0].event)).toEqual(['coach_lead_converted'])
    })

    it('no pisa la atribución de un alumno que ya tenía referente', async () => {
        const t = convertSetup({ client: { id: 'client-nuevo', referred_by_client_id: 'otro-referente' } })

        await convertCoachLead(t.clients, 'coach-1', 'lead-1', 'client-nuevo')

        expect(t.clientWrite.update).not.toHaveBeenCalled()
        expect(t.leadWrite.update).toHaveBeenCalled()
    })

    it('alumno ajeno (o inexistente) → CLIENT_NOT_FOUND y CERO escrituras', async () => {
        const t = convertSetup({ client: null })

        const result = await convertCoachLead(t.clients, 'coach-1', 'lead-1', 'client-ajeno')

        expect(result).toEqual({ ok: false, code: 'CLIENT_NOT_FOUND', error: 'Alumno no encontrado.' })
        expect(t.adminFrom).not.toHaveBeenCalled()
        expect(captureMock).not.toHaveBeenCalled()
    })

    it('lead ajeno → NOT_FOUND antes de mirar al alumno', async () => {
        const t = convertSetup({ lead: null })

        const result = await convertCoachLead(t.clients, 'coach-1', 'lead-de-otro', 'client-nuevo')

        expect(result).toEqual({ ok: false, code: 'NOT_FOUND', error: 'Solicitud no encontrada.' })
        expect(t.adminFrom).not.toHaveBeenCalled()
    })

    it('el camino móvil con `clientId` corre el MISMO cierre y devuelve el item releído', async () => {
        const t = convertSetup()

        const result = await updateCoachLeadStatus(t.clients, 'coach-1', 'lead-1', 'converted', {
            clientId: 'client-nuevo',
            surface: 'mobile',
        })

        expect(result).toMatchObject({ ok: true, lead: { id: 'lead-1', status: 'converted' } })
        expect(t.clientWrite.update).toHaveBeenCalledWith({
            referred_by_client_id: 'client-referente',
            referral_source: 'share_card',
            referral_card_kind: 'placa',
        })
        expect(t.leadWrite.update).toHaveBeenCalledWith({
            status: 'converted',
            converted_client_id: 'client-nuevo',
        })
        expect(captureMock.mock.calls.map((call) => call[0].event)).toEqual([
            'coach_client_referred',
            'coach_lead_converted',
        ])
        expect(captureMock.mock.calls[1][0].properties).toEqual({ referred: true, surface: 'mobile' })
    })

    it('compatibilidad OTA: sin `clientId` mueve el estado sin `converted_client_id` ni atribución', async () => {
        const t = convertSetup()

        const result = await updateCoachLeadStatus(t.clients, 'coach-1', 'lead-1', 'converted')

        expect(result).toMatchObject({ ok: true })
        expect(t.clientRead.select).not.toHaveBeenCalled()
        expect(t.clientWrite.update).not.toHaveBeenCalled()
        expect(t.leadWrite.update).toHaveBeenCalledWith({ status: 'converted' })
        // Sin alumno no hay a quién atribuir: declarar `coach_client_referred` sería mentir.
        expect(captureMock.mock.calls.map((call) => call[0].event)).toEqual(['coach_lead_converted'])
        expect(captureMock.mock.calls[0][0].properties).toEqual({ referred: true, surface: 'mobile' })
    })
})
