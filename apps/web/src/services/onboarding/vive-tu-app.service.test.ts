import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createViveTuAppLink } from './vive-tu-app.service'

/**
 * Núcleo de «Vive tu app» (SPEC coach-onboarding-v2 §5) — el mismo que usan la server action de la
 * web y `POST /api/mobile/coach/vive-tu-app`. Lo que se prueba acá es lo que NO puede divergir
 * entre las dos superficies:
 *  - el demo se busca SIEMPRE acotado al coach y a `is_demo` (nunca por un id del body),
 *  - el link apunta a la ruta propia `/vive-tu-app`, no al `action_link` de GoTrue,
 *  - el token no se filtra a los logs ni al mensaje de error,
 *  - la superficie viaja en el evento del funnel (es la única forma de saber si el «wow» del
 *    white-label pasa en el panel o en el teléfono).
 */

type DemoRow = { id: string; email: string; full_name: string } | null

function setup(options: {
    coach?: { id: string; slug: string | null; invite_code: string | null } | null
    demo?: DemoRow
    generateLink?: { data: unknown; error: { message: string } | null }
    insertError?: { message: string } | null
} = {}) {
    const {
        coach = { id: 'coach-1', slug: 'mi-marca', invite_code: 'EVA123' },
        demo = { id: 'demo-1', email: 'demo@evatest.cl', full_name: 'Matías Soto' },
        generateLink = { data: { properties: { hashed_token: 'HASH_SECRETO' } }, error: null },
        insertError = null,
    } = options

    const coachQuery: Record<string, unknown> = {}
    Object.assign(coachQuery, {
        select: vi.fn(() => coachQuery),
        eq: vi.fn(() => coachQuery),
        maybeSingle: vi.fn(async () => ({ data: coach })),
    })
    const db = { from: vi.fn(() => coachQuery) }

    const demoQuery: Record<string, unknown> = {}
    Object.assign(demoQuery, {
        select: vi.fn(() => demoQuery),
        eq: vi.fn(() => demoQuery),
        limit: vi.fn(() => demoQuery),
        maybeSingle: vi.fn(async () => ({ data: demo })),
    })
    const insert = vi.fn(async () => ({ error: insertError }))
    const generateLinkFn = vi.fn(async () => generateLink)
    const admin = {
        from: vi.fn((table: string) => (table === 'clients' ? demoQuery : { insert })),
        auth: { admin: { generateLink: generateLinkFn } },
    }

    type Client = Parameters<typeof createViveTuAppLink>[0]
    return {
        db: db as unknown as Client,
        admin: admin as unknown as Client,
        coachQuery,
        demoQuery,
        insert,
        generateLinkFn,
    }
}

describe('createViveTuAppLink', () => {
    beforeEach(() => vi.clearAllMocks())

    it('emite el link a la ruta propia con el identificador público y registra el evento con la superficie', async () => {
        const { db, admin, insert, generateLinkFn } = setup()

        const result = await createViveTuAppLink(db, admin, { coachId: 'coach-1', surface: 'rn' })

        expect(generateLinkFn).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'magiclink', email: 'demo@evatest.cl' }),
        )
        expect(result).toEqual({
            ok: true,
            // El identificador público es el invite_code cuando existe (mismo helper que el resto).
            url: expect.stringMatching(/\/vive-tu-app\?t=HASH_SECRETO&c=EVA123$/),
            demoName: 'Matías Soto',
        })
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                coach_id: 'coach-1',
                step_key: 'vive_tu_app',
                event_type: 'vive_tu_app_opened',
                metadata: { surface: 'rn' },
            }),
        )
    })

    it('busca el alumno de ejemplo SIEMPRE acotado al coach, a `is_demo` y sin archivados', async () => {
        const { db, admin, demoQuery } = setup()
        await createViveTuAppLink(db, admin, { coachId: 'coach-1', surface: 'web' })
        expect((demoQuery.eq as ReturnType<typeof vi.fn>).mock.calls).toEqual([
            ['coach_id', 'coach-1'],
            ['is_demo', true],
            ['is_archived', false],
        ])
    })

    it('sin alumno de ejemplo no se genera ningún magic link', async () => {
        const { db, admin, generateLinkFn } = setup({ demo: null })
        await expect(createViveTuAppLink(db, admin, { coachId: 'coach-1', surface: 'rn' })).resolves.toEqual({
            ok: false,
            reason: 'sin_demo',
        })
        expect(generateLinkFn).not.toHaveBeenCalled()
    })

    it('un coach sin slug ni código no puede abrir la app del alumno (no habría marca que mostrar)', async () => {
        const { db, admin, generateLinkFn } = setup({ coach: { id: 'coach-1', slug: null, invite_code: null } })
        await expect(createViveTuAppLink(db, admin, { coachId: 'coach-1', surface: 'web' })).resolves.toEqual({
            ok: false,
            reason: 'sin_marca',
        })
        expect(generateLinkFn).not.toHaveBeenCalled()
    })

    it('si GoTrue falla, ni el mensaje ni el log exponen el token', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { db, admin } = setup({ generateLink: { data: null, error: { message: 'rate limit' } } })

        const result = await createViveTuAppLink(db, admin, { coachId: 'coach-1', surface: 'rn' })

        expect(result).toEqual({
            ok: false,
            reason: 'error',
            detail: 'No pudimos abrir tu app. Intenta de nuevo.',
        })
        expect(JSON.stringify(spy.mock.calls)).not.toContain('token')
        spy.mockRestore()
    })

    it('un link sin `hashed_token` no se arma a medias', async () => {
        const { db, admin } = setup({ generateLink: { data: { properties: {} }, error: null } })
        const result = await createViveTuAppLink(db, admin, { coachId: 'coach-1', surface: 'rn' })
        expect(result.ok).toBe(false)
    })

    it('el evento es medición: si el insert falla, el coach igual recibe su link', async () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { db, admin } = setup({ insertError: { message: 'check constraint' } })
        const result = await createViveTuAppLink(db, admin, { coachId: 'coach-1', surface: 'rn' })
        expect(result.ok).toBe(true)
        spy.mockRestore()
    })

    it('la ficha del coach se lee con el cliente que recibe, no con el admin', async () => {
        const { db, admin, coachQuery } = setup()
        await createViveTuAppLink(db, admin, { coachId: 'coach-9', surface: 'web' })
        // La web pasa el cliente de la SESIÓN (RLS como techo); el endpoint móvil pasa el admin ya
        // acotado al coach del bearer. En los dos casos el filtro por id es explícito.
        expect((coachQuery.eq as ReturnType<typeof vi.fn>).mock.calls).toEqual([['id', 'coach-9']])
    })
})
