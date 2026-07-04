import { beforeEach, describe, expect, it, vi } from 'vitest'

// DoD de seguridad (specs/checkins-revisado): un coach NO puede marcar NI des-marcar
// check-ins de alumnos ajenos. Se garantiza en el service via assertCoachClientReadAccess
// (capa 1) + RLS check_ins_coach (capa 2, no cubierta por unit). Aca mockeamos el guard y
// verificamos que el rechazo cae ANTES de tocar `.update()`, y que el caso valido escribe
// scoped por `client_id` con los campos correctos.

const { createClientMock, assertAccessMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    assertAccessMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/services/client/client-scope.service', () => ({
    assertCoachClientReadAccess: assertAccessMock,
    getCoachClientScope: vi.fn(),
}))

import { markCheckInReviewed, unmarkCheckInReviewed } from './client-detail.service'

/**
 * Supabase mock: `from()` devuelve un builder encadenable (`update/eq/is`) que ademas es
 * thenable (resuelve `updateResult`) para soportar tanto la cadena de mark
 * (`.update().eq().eq().is()`) como la de unmark (`.update().eq().eq()`).
 */
function makeSupabase({
    user,
    updateResult = { error: null as { message: string } | null },
}: {
    user: { id: string } | null
    updateResult?: { error: { message: string } | null }
}) {
    const builder: Record<string, unknown> = {}
    builder.update = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
    ;(builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(updateResult)
    const from = vi.fn(() => builder)
    return {
        supabase: {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
            from,
        },
        from,
        builder: builder as {
            update: ReturnType<typeof vi.fn>
            eq: ReturnType<typeof vi.fn>
            is: ReturnType<typeof vi.fn>
        },
    }
}

const CASES = [
    ['markCheckInReviewed', markCheckInReviewed] as const,
    ['unmarkCheckInReviewed', unmarkCheckInReviewed] as const,
]

describe('check-in reviewed toggle — security scope', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it.each(CASES)('%s: rechaza alumno ajeno y NO llega al update', async (_name, fn) => {
        assertAccessMock.mockRejectedValue(new Error('Client not found'))
        const { supabase, from } = makeSupabase({ user: { id: 'coach-1' } })
        createClientMock.mockResolvedValue(supabase)

        await expect(fn('client-de-otro', 'checkin-1')).rejects.toThrow('Client not found')
        // Guard rechaza antes de tocar la tabla check_ins.
        expect(from).not.toHaveBeenCalled()
    })

    it.each(CASES)('%s: sin usuario autenticado lanza Unauthorized', async (_name, fn) => {
        const { supabase, from } = makeSupabase({ user: null })
        createClientMock.mockResolvedValue(supabase)

        await expect(fn('client-1', 'checkin-1')).rejects.toThrow('Unauthorized')
        expect(assertAccessMock).not.toHaveBeenCalled()
        expect(from).not.toHaveBeenCalled()
    })

    it('markCheckInReviewed: caso valido escribe scoped por client_id con reviewed_by = user.id', async () => {
        assertAccessMock.mockResolvedValue({ orgId: null, activeTeamId: null, viaTeam: false })
        const { supabase, from, builder } = makeSupabase({ user: { id: 'coach-1' } })
        createClientMock.mockResolvedValue(supabase)

        await expect(markCheckInReviewed('client-1', 'checkin-1')).resolves.toEqual({ success: true })

        expect(from).toHaveBeenCalledWith('check_ins')
        const payload = builder.update.mock.calls[0][0] as { reviewed_at: unknown; reviewed_by: unknown }
        expect(payload.reviewed_by).toBe('coach-1')
        expect(typeof payload.reviewed_at).toBe('string')
        expect(builder.eq).toHaveBeenCalledWith('id', 'checkin-1')
        expect(builder.eq).toHaveBeenCalledWith('client_id', 'client-1')
    })

    it('unmarkCheckInReviewed: caso valido limpia reviewed_at/reviewed_by scoped por client_id', async () => {
        assertAccessMock.mockResolvedValue({ orgId: null, activeTeamId: null, viaTeam: false })
        const { supabase, from, builder } = makeSupabase({ user: { id: 'coach-1' } })
        createClientMock.mockResolvedValue(supabase)

        await expect(unmarkCheckInReviewed('client-1', 'checkin-1')).resolves.toEqual({ success: true })

        expect(from).toHaveBeenCalledWith('check_ins')
        const payload = builder.update.mock.calls[0][0]
        expect(payload).toEqual({ reviewed_at: null, reviewed_by: null })
        expect(builder.eq).toHaveBeenCalledWith('id', 'checkin-1')
        expect(builder.eq).toHaveBeenCalledWith('client_id', 'client-1')
    })

    it('propaga el error de la DB (RLS/constraint) como throw', async () => {
        assertAccessMock.mockResolvedValue({ orgId: null, activeTeamId: null, viaTeam: false })
        const { supabase } = makeSupabase({
            user: { id: 'coach-1' },
            updateResult: { error: { message: 'permission denied' } },
        })
        createClientMock.mockResolvedValue(supabase)

        await expect(markCheckInReviewed('client-1', 'checkin-1')).rejects.toThrow('permission denied')
    })
})
