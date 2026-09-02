import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listCoachLeads, updateCoachLeadStatus } from './leads.service'

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
            'converted',
        )

        expect(result).toEqual({
            ok: false,
            code: 'UPDATE_FAILED',
            error: 'No pudimos actualizar la solicitud.',
        })
    })
})
