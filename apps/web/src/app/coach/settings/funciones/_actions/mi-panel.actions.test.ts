import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    createServiceRoleClientMock,
    revalidatePathMock,
    capturePostHogServerEventMock,
    readCoachPersonaMock,
    saveCoachPersonaMock,
    writePersonaDomainPrefsMock,
    recordOnboardingEventMock,
    archivePersonaGuideProgressMock,
    reseedDemoForPersonaChangeMock,
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceRoleClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    capturePostHogServerEventMock: vi.fn(),
    readCoachPersonaMock: vi.fn(),
    saveCoachPersonaMock: vi.fn(),
    writePersonaDomainPrefsMock: vi.fn(),
    recordOnboardingEventMock: vi.fn(),
    archivePersonaGuideProgressMock: vi.fn(),
    reseedDemoForPersonaChangeMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/lib/posthog/server-capture', () => ({ capturePostHogServerEvent: capturePostHogServerEventMock }))
vi.mock('@/services/onboarding/demo-student.service', () => ({
    deleteDemoStudent: vi.fn(),
    seedDemoStudent: vi.fn(),
}))
vi.mock('@/services/coach/persona.service', () => ({
    readCoachPersona: readCoachPersonaMock,
    saveCoachPersona: saveCoachPersonaMock,
    writePersonaDomainPrefs: writePersonaDomainPrefsMock,
    recordOnboardingEvent: recordOnboardingEventMock,
    setCoachDomainEnabled: vi.fn(),
}))
vi.mock('@/services/onboarding/persona-switch.service', async () => {
    // `demoChangeNotice` es copy puro: se usa el REAL para que el test valide el mensaje que ve el
    // coach, no una imitación.
    const real = await vi.importActual<typeof import('@/services/onboarding/persona-switch.service')>(
        '@/services/onboarding/persona-switch.service',
    )
    return {
        demoChangeNotice: real.demoChangeNotice,
        archivePersonaGuideProgress: archivePersonaGuideProgressMock,
        reseedDemoForPersonaChange: reseedDemoForPersonaChangeMock,
    }
})

import { saveMiPanelPersonaAction } from './mi-panel.actions'

/**
 * «Opciones › Mi panel» — cambiar de especialidad (TASKS W8.1.3). Lo que se prueba es el ORDEN y
 * las ramas, que es donde estaba el bug del QA del owner: la memoria de la guía se archiva ANTES
 * de escribir la persona (después, el `persona_set_at` ya sería el nuevo y mediría la rama
 * equivocada) y el alumno de ejemplo se re-siembra SOLO cuando la especialidad cambió de verdad.
 */

function setup(previousPersona: string | null = 'strength') {
    const supabase = {
        auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: 'coach-1' } } })) },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                        data: { id: 'coach-1', subscription_status: 'active' },
                    })),
                })),
            })),
        })),
    }
    createClientMock.mockResolvedValue(supabase)
    const admin = { from: vi.fn() }
    createServiceRoleClientMock.mockReturnValue(admin)

    readCoachPersonaMock.mockResolvedValue({ persona: previousPersona, alsoOther: false, personaSetAt: null })
    saveCoachPersonaMock.mockResolvedValue({ ok: true })
    writePersonaDomainPrefsMock.mockResolvedValue({ ok: true })
    archivePersonaGuideProgressMock.mockResolvedValue({
        changed: true,
        archived: { vive_tu_app: true, first_artifact: true },
        restored: {},
        error: null,
    })
    reseedDemoForPersonaChangeMock.mockResolvedValue({
        action: 'reseeded',
        demoName: 'Pedro',
        demoClientId: 'pedro-1',
        error: null,
    })
    return { supabase, admin }
}

describe('saveMiPanelPersonaAction', () => {
    beforeEach(() => vi.clearAllMocks())

    it('cambiar de fuerza a rehabilitación: archiva la guía ANTES de guardar y re-siembra el ejemplo', async () => {
        const { supabase, admin } = setup('strength')
        const order: string[] = []
        archivePersonaGuideProgressMock.mockImplementation(async () => {
            order.push('archive')
            return { changed: true, archived: {}, restored: {}, error: null }
        })
        saveCoachPersonaMock.mockImplementation(async () => {
            order.push('save')
            return { ok: true }
        })
        reseedDemoForPersonaChangeMock.mockImplementation(async () => {
            order.push('reseed')
            return { action: 'reseeded', demoName: 'Pedro', demoClientId: 'pedro-1', error: null }
        })

        const result = await saveMiPanelPersonaAction({ persona: 'rehab' })

        expect(order).toEqual(['archive', 'save', 'reseed'])
        expect(archivePersonaGuideProgressMock).toHaveBeenCalledWith(supabase, {
            coachId: 'coach-1',
            from: 'strength',
            to: 'rehab',
        })
        expect(reseedDemoForPersonaChangeMock).toHaveBeenCalledWith(admin, {
            coachId: 'coach-1',
            persona: 'rehab',
            surface: 'web',
        })
        expect(result).toEqual({
            ok: true,
            message: 'Especialidad guardada. Cambiamos tu alumno de ejemplo: ahora es Pedro.',
            demo: { action: 'reseeded', demoName: 'Pedro', demoClientId: 'pedro-1', error: null },
        })
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/guia')
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/clients')
    })

    it('guardar la MISMA especialidad no toca el alumno de ejemplo', async () => {
        setup('strength')

        const result = await saveMiPanelPersonaAction({ persona: 'strength', reorderPanel: true })

        expect(reseedDemoForPersonaChangeMock).not.toHaveBeenCalled()
        expect(result).toEqual({
            ok: true,
            message: 'Especialidad guardada y panel reordenado.',
            demo: { action: 'kept', demoName: 'Matías', demoClientId: null, error: null },
        })
        expect(revalidatePathMock).not.toHaveBeenCalledWith('/coach/clients')
    })

    it('coach sin especialidad previa: no hay ejemplo viejo que mover', async () => {
        setup(null)

        const result = await saveMiPanelPersonaAction({ persona: 'nutrition' })

        expect(reseedDemoForPersonaChangeMock).not.toHaveBeenCalled()
        expect(result.ok).toBe(true)
    })

    it('a «panel completo» (other): el aviso dice que se borró el ejemplo', async () => {
        setup('rehab')
        reseedDemoForPersonaChangeMock.mockResolvedValue({
            action: 'deleted',
            demoName: null,
            demoClientId: null,
            error: null,
        })

        const result = await saveMiPanelPersonaAction({ persona: 'other' })

        expect(result).toMatchObject({
            ok: true,
            message: 'Especialidad guardada. Borramos tu alumno de ejemplo: el panel completo no trae uno.',
        })
    })

    it('si el sembrado falla, la especialidad IGUAL queda guardada y el error se reporta', async () => {
        setup('strength')
        reseedDemoForPersonaChangeMock.mockResolvedValue({
            action: 'failed',
            demoName: 'Pedro',
            demoClientId: null,
            error: 'Guardamos tu especialidad, pero no pudimos crear a Pedro, tu nuevo alumno de ejemplo. Toca «Volver a sembrar» para intentarlo de nuevo.',
        })

        const result = await saveMiPanelPersonaAction({ persona: 'rehab' })

        expect(saveCoachPersonaMock).toHaveBeenCalledWith(expect.anything(), 'coach-1', 'rehab', false)
        expect(result.ok).toBe(false)
        expect(result).toMatchObject({ demo: { action: 'failed' } })
        if (!result.ok) expect(result.error).toContain('Volver a sembrar')
    })

    it('si la memoria de la guía no se puede escribir, el cambio de especialidad sigue', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        setup('strength')
        archivePersonaGuideProgressMock.mockResolvedValue({
            changed: true,
            archived: {},
            restored: {},
            error: 'permission denied',
        })

        const result = await saveMiPanelPersonaAction({ persona: 'rehab' })

        expect(saveCoachPersonaMock).toHaveBeenCalled()
        expect(result.ok).toBe(true)
        spy.mockRestore()
    })

    it('el evento y PostHog llevan qué pasó con el ejemplo', async () => {
        setup('strength')

        await saveMiPanelPersonaAction({ persona: 'rehab' })

        expect(recordOnboardingEventMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                eventType: 'persona_selected',
                metadata: expect.objectContaining({ changed: true, demo: 'reseeded', source: 'mi_panel' }),
            }),
        )
        expect(capturePostHogServerEventMock).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'persona_selected',
                properties: expect.objectContaining({ demo: 'reseeded', changed: true }),
            }),
        )
    })

    it('coach administrado por org/team: ni memoria ni ejemplo se tocan', async () => {
        createClientMock.mockResolvedValue({
            auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: 'coach-1' } } })) },
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({
                            data: { id: 'coach-1', subscription_status: 'org_managed' },
                        })),
                    })),
                })),
            })),
        })

        const result = await saveMiPanelPersonaAction({ persona: 'rehab' })

        expect(result.ok).toBe(false)
        expect(archivePersonaGuideProgressMock).not.toHaveBeenCalled()
        expect(reseedDemoForPersonaChangeMock).not.toHaveBeenCalled()
    })
})
