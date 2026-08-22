import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    createServiceRoleClientMock,
    revalidatePathMock,
    redirectMock,
    captureMock,
    seedDemoStudentMock,
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceRoleClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    redirectMock: vi.fn(),
    captureMock: vi.fn().mockResolvedValue(undefined),
    seedDemoStudentMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/lib/posthog/server-capture', () => ({ capturePostHogServerEvent: captureMock }))
vi.mock('@/services/onboarding/demo-student.service', () => ({
    seedDemoStudent: seedDemoStudentMock,
}))

import { setCoachPersonaAction } from './persona.actions'

/**
 * Action de la pantalla «¿A qué te dedicas?» (W2 F2.1). Lo que se prueba es el CONTRATO:
 * valida, escribe persona + las 5 filas de preferencias, deja el evento, tolera que el sembrador
 * del alumno de ejemplo todavía sea el stub de W3, y recién ahí redirige.
 */

type Result = { data?: unknown; error?: unknown }

/** Query builder falso: encadena todo y es `thenable` (los updates/upserts se awaitean sueltos). */
function builder(result: Result = { data: null, error: null }) {
    const obj: Record<string, unknown> = {}
    Object.assign(obj, {
        select: vi.fn(() => obj),
        update: vi.fn(() => obj),
        upsert: vi.fn(() => obj),
        insert: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        maybeSingle: vi.fn(async () => result),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve(result).then(res, rej),
    })
    return obj as Record<string, any>
}

const COACH_ID = 'coach-1'

function setupClients(options: { subscriptionStatus?: string; coachRow?: unknown | null } = {}) {
    const coachRead = builder({
        data:
            options.coachRow === undefined
                ? { id: COACH_ID, subscription_status: options.subscriptionStatus ?? 'active' }
                : options.coachRow,
        error: null,
    })
    const coachUpdate = builder({ error: null })
    const prefsRead = builder({ data: [], error: null })
    const prefsUpsert = builder({ error: null })
    let coachCalls = 0
    let prefsCalls = 0

    const supabase = {
        auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: COACH_ID } } }) },
        from: vi.fn((table: string) => {
            if (table === 'coaches') {
                coachCalls += 1
                return coachCalls === 1 ? coachRead : coachUpdate
            }
            prefsCalls += 1
            return prefsCalls === 1 ? prefsRead : prefsUpsert
        }),
    }

    const events = builder({ error: null })
    const admin = { from: vi.fn(() => events) }

    createClientMock.mockResolvedValue(supabase)
    createServiceRoleClientMock.mockReturnValue(admin)

    return { supabase, coachUpdate, prefsUpsert, events, admin }
}

describe('setCoachPersonaAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        captureMock.mockResolvedValue(undefined)
        seedDemoStudentMock.mockResolvedValue({ ok: false, reason: 'not_implemented' })
    })

    it('rechaza una persona fuera del contrato sin tocar la base', async () => {
        const { supabase } = setupClients()
        const result = await setCoachPersonaAction({ persona: 'crossfit' as never })

        expect(result).toEqual({ ok: false, error: 'Elige una de las opciones para continuar.' })
        expect(supabase.from).not.toHaveBeenCalled()
        expect(redirectMock).not.toHaveBeenCalled()
    })

    it('guarda persona + las 5 preferencias por dominio, deja el evento y redirige al día 1', async () => {
        const { coachUpdate, prefsUpsert, events, admin } = setupClients()

        await setCoachPersonaAction({ persona: 'endurance', alsoOther: true })

        // 1. La persona va a columnas propias (no jsonb) con su timestamp.
        const written = coachUpdate.update.mock.calls[0][0]
        expect(written.persona).toBe('endurance')
        expect(written.persona_also_other).toBe(true)
        expect(typeof written.persona_set_at).toBe('string')

        // 2. Las 5 filas de dominio, con la matriz de `endurance` + la segunda pregunta.
        const rows = prefsUpsert.upsert.mock.calls[0][0] as Array<{
            domain: string
            sections: Record<string, boolean>
        }>
        expect(rows).toHaveLength(5)
        const enabled = Object.fromEntries(rows.map((row) => [row.domain, row.sections._enabled]))
        expect(enabled).toEqual({
            nutrition: true, // alsoOther
            training: true,
            cardio: true,
            movement: false,
            bodycomp: false,
        })
        expect(prefsUpsert.upsert.mock.calls[0][1]).toEqual({ onConflict: 'coach_id,domain' })

        // 3. Telemetría: tabla + PostHog.
        expect(admin.from).toHaveBeenCalledWith('coach_onboarding_events')
        expect(events.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                coach_id: COACH_ID,
                event_type: 'persona_selected',
                metadata: { persona: 'endurance', alsoOther: true, surface: 'web' },
            }),
        )
        expect(captureMock).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'persona_selected', distinctId: COACH_ID }),
        )

        // 4. Nav revalidado + destino.
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/dashboard', 'layout')
        expect(redirectMock).toHaveBeenCalledWith('/coach/dashboard?bienvenida=1')
    })

    it('el escape («other») ignora la segunda pregunta y deja el panel completo', async () => {
        const { coachUpdate, prefsUpsert } = setupClients()

        await setCoachPersonaAction({ persona: 'other', alsoOther: true })

        expect(coachUpdate.update.mock.calls[0][0].persona_also_other).toBe(false)
        const rows = prefsUpsert.upsert.mock.calls[0][0] as Array<{ sections: Record<string, boolean> }>
        expect(rows.every((row) => row.sections._enabled === true)).toBe(true)
    })

    it('el sembrador todavía en stub (`not_implemented`) no rompe el alta', async () => {
        const { events } = setupClients()
        seedDemoStudentMock.mockResolvedValue({ ok: false, reason: 'not_implemented' })

        await setCoachPersonaAction({ persona: 'strength' })

        expect(seedDemoStudentMock).toHaveBeenCalledWith(expect.anything(), {
            coachId: COACH_ID,
            persona: 'strength',
        })
        const eventTypes = events.insert.mock.calls.map((call: unknown[]) => (call[0] as { event_type: string }).event_type)
        expect(eventTypes).toEqual(['persona_selected'])
        expect(redirectMock).toHaveBeenCalledWith('/coach/dashboard?bienvenida=1')
    })

    it('cuando W3 siembra de verdad, queda el evento `demo_seeded`', async () => {
        const { events } = setupClients()
        seedDemoStudentMock.mockResolvedValue({ ok: true, demoClientId: 'demo-1', alreadyExisted: false })

        await setCoachPersonaAction({ persona: 'rehab' })

        const eventTypes = events.insert.mock.calls.map((call: unknown[]) => (call[0] as { event_type: string }).event_type)
        expect(eventTypes).toEqual(['persona_selected', 'demo_seeded'])
    })

    it('coach administrado por org/team: no elige persona', async () => {
        setupClients({ subscriptionStatus: 'org_managed' })

        const result = await setCoachPersonaAction({ persona: 'strength' })

        expect(result).toEqual({
            ok: false,
            error: 'Tu panel lo administra tu organización o tu equipo.',
        })
        expect(redirectMock).not.toHaveBeenCalled()
    })

    it('sin fila de coach: no escribe nada', async () => {
        setupClients({ coachRow: null })

        const result = await setCoachPersonaAction({ persona: 'strength' })

        expect(result).toEqual({ ok: false, error: 'No encontramos tu cuenta de coach.' })
        expect(redirectMock).not.toHaveBeenCalled()
    })
})
