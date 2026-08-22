import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createServiceRoleClientMock, revalidatePathMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceRoleClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

import { openViveTuAppAction } from './vive-tu-app.actions'

type DemoRow = { id: string; email: string; full_name: string } | null

function setup(options: {
    user?: { id: string } | null
    coach?: { id: string; slug: string | null; invite_code: string | null } | null
    demo?: DemoRow
    generateLink?: { data: unknown; error: { message: string } | null }
}) {
    const {
        user = { id: 'coach-1' },
        coach = { id: 'coach-1', slug: 'mi-marca', invite_code: 'EVA123' },
        demo = { id: 'demo-1', email: 'demo@evatest.cl', full_name: 'Matías Soto' },
        generateLink = {
            data: { properties: { hashed_token: 'HASH_SECRETO' } },
            error: null,
        },
    } = options

    const coachQuery: Record<string, unknown> = {}
    Object.assign(coachQuery, {
        select: vi.fn(() => coachQuery),
        eq: vi.fn(() => coachQuery),
        maybeSingle: vi.fn(async () => ({ data: coach })),
    })
    createClientMock.mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user } })) },
        from: vi.fn(() => coachQuery),
    })

    const demoQuery: Record<string, unknown> = {}
    Object.assign(demoQuery, {
        select: vi.fn(() => demoQuery),
        eq: vi.fn(() => demoQuery),
        limit: vi.fn(() => demoQuery),
        maybeSingle: vi.fn(async () => ({ data: demo })),
    })
    const insert = vi.fn(async () => ({ error: null }))
    // El parámetro existe solo para tipar `mock.calls` (el assert lee el `redirectTo`).
    const generateLinkFn = vi.fn(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async (_args: { type: string; email: string; options?: { redirectTo?: string } }) => generateLink
    )
    const admin = {
        from: vi.fn((table: string) => (table === 'clients' ? demoQuery : { insert })),
        auth: { admin: { generateLink: generateLinkFn } },
    }
    createServiceRoleClientMock.mockReturnValue(admin)

    return { admin, demoQuery, insert, generateLinkFn }
}

describe('openViveTuAppAction', () => {
    beforeEach(() => vi.clearAllMocks())

    it('sin sesión no toca la base', async () => {
        const { admin } = setup({ user: null })
        await expect(openViveTuAppAction()).resolves.toEqual({ ok: false, reason: 'no_autenticado' })
        expect(admin.from).not.toHaveBeenCalled()
    })

    it('sin alumno de ejemplo devuelve `sin_demo` y no genera ningún link', async () => {
        const { generateLinkFn } = setup({ demo: null })
        await expect(openViveTuAppAction()).resolves.toEqual({ ok: false, reason: 'sin_demo' })
        expect(generateLinkFn).not.toHaveBeenCalled()
    })

    it('busca el demo SIEMPRE acotado al coach de la sesión y a `is_demo`', async () => {
        const { demoQuery } = setup({})
        await openViveTuAppAction()
        const eq = demoQuery.eq as ReturnType<typeof vi.fn>
        expect(eq.mock.calls).toEqual([
            ['coach_id', 'coach-1'],
            ['is_demo', true],
            ['is_archived', false],
        ])
    })

    it('genera el magic link del demo hacia /vive-tu-app con el identificador público y registra el evento', async () => {
        const { generateLinkFn, insert } = setup({})
        const result = await openViveTuAppAction()

        expect(generateLinkFn).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'magiclink', email: 'demo@evatest.cl' })
        )
        // Sin `redirectTo`: el link apunta a la ruta propia /vive-tu-app, no al action_link de GoTrue.
        expect(generateLinkFn.mock.calls[0]?.[0].options).toBeUndefined()

        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                coach_id: 'coach-1',
                event_type: 'vive_tu_app_opened',
                step_key: 'vive_tu_app',
            })
        )
        expect(result).toEqual({
            ok: true,
            // El identificador público es el invite_code cuando existe (mismo helper que el resto).
            url: expect.stringMatching(/\/vive-tu-app\?t=HASH_SECRETO&c=EVA123$/),
            demoName: 'Matías Soto',
        })
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/dashboard')
    })

    it('si GoTrue falla, ni el mensaje ni el log exponen el token', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        setup({ generateLink: { data: null, error: { message: 'rate limit' } } })

        const result = await openViveTuAppAction()

        expect(result.ok).toBe(false)
        expect(JSON.stringify(spy.mock.calls)).not.toContain('token')
        spy.mockRestore()
    })

    it('un coach sin slug ni código no puede abrir la app del alumno', async () => {
        const { generateLinkFn } = setup({
            coach: { id: 'coach-1', slug: null, invite_code: null },
        })
        await expect(openViveTuAppAction()).resolves.toEqual({ ok: false, reason: 'sin_marca' })
        expect(generateLinkFn).not.toHaveBeenCalled()
    })
})
