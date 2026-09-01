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
    setCoachNavOrderMock,
    clearCoachNavOrderMock,
    setTeamFeaturePrefsMock,
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
    setCoachNavOrderMock: vi.fn(),
    clearCoachNavOrderMock: vi.fn(),
    setTeamFeaturePrefsMock: vi.fn(),
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
    setCoachNavOrder: setCoachNavOrderMock,
    clearCoachNavOrder: clearCoachNavOrderMock,
}))
vi.mock('@/app/coach/settings/_actions/feature-prefs.actions', () => ({
    setTeamFeaturePrefs: setTeamFeaturePrefsMock,
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

import { saveMiPanelPersonaAction, setNavOrderAction, setTeamDomainAction } from './mi-panel.actions'

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
    setCoachNavOrderMock.mockResolvedValue({ ok: true })
    clearCoachNavOrderMock.mockResolvedValue({ ok: true })
    setTeamFeaturePrefsMock.mockResolvedValue({ success: true })
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

// ── Orden de la barra (QA del owner 01-09, ronda 2) ──────────────────────────────────────────

/**
 * `setNavOrderAction` es preferencia PERSONAL: escribe la fila reservada `_nav` de
 * `coach_feature_prefs` con el cliente de la SESIÓN y NO rechaza al coach de un pool — la barra es
 * su teléfono. Lo que se protege es el contrato del schema (los cinco dominios, sin repetir) y que
 * la identidad salga de la sesión, nunca del input.
 */
describe('setNavOrderAction', () => {
    beforeEach(() => vi.clearAllMocks())

    it('guarda el orden completo con el coach de la sesión', async () => {
        setup()
        const order = ['cardio', 'training', 'nutrition', 'movement', 'bodycomp'] as const

        const result = await setNavOrderAction({ order: [...order] })

        expect(result.ok).toBe(true)
        expect(setCoachNavOrderMock).toHaveBeenCalledWith(expect.anything(), 'coach-1', [...order])
        // El nav vive en el layout: sin revalidar, la cápsula vieja sobrevive.
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/dashboard', 'layout')
    })

    it('rechaza un orden incompleto o con repetidos sin escribir nada', async () => {
        setup()

        const short = await setNavOrderAction({ order: ['cardio', 'training'] })
        const dupe = await setNavOrderAction({
            order: ['cardio', 'cardio', 'nutrition', 'movement', 'bodycomp'],
        })

        expect(short.ok).toBe(false)
        expect(dupe.ok).toBe(false)
        expect(setCoachNavOrderMock).not.toHaveBeenCalled()
    })

    it('un coach de team TAMBIÉN puede reordenar su barra (no pasa por el gate de standalone)', async () => {
        createClientMock.mockResolvedValue({
            auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: 'coach-team' } } })) },
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn(async () => ({
                            data: { id: 'coach-team', subscription_status: 'team_managed' },
                        })),
                    })),
                })),
            })),
        })
        setCoachNavOrderMock.mockResolvedValue({ ok: true })

        const result = await setNavOrderAction({
            order: ['nutrition', 'training', 'cardio', 'movement', 'bodycomp'],
        })

        expect(result.ok).toBe(true)
        expect(setCoachNavOrderMock).toHaveBeenCalledWith(expect.anything(), 'coach-team', [
            'nutrition',
            'training',
            'cardio',
            'movement',
            'bodycomp',
        ])
    })

    it('«Ordenar mi panel según mi especialidad» borra el orden manual', async () => {
        setup('strength')

        await saveMiPanelPersonaAction({ persona: 'strength', reorderPanel: true })

        expect(clearCoachNavOrderMock).toHaveBeenCalledWith(expect.anything(), 'coach-1')
    })

    it('guardar la especialidad SIN reordenar respeta el orden manual', async () => {
        setup('strength')

        await saveMiPanelPersonaAction({ persona: 'rehab' })

        expect(clearCoachNavOrderMock).not.toHaveBeenCalled()
    })
})

// ── Master switch del POOL (QA del owner 01-09, ronda 2) ─────────────────────────────────────

/** Supabase de sesión cuya lectura de `team_feature_prefs` devuelve `existing`. */
function setupTeamPrefs(existing: { preset: string | null; sections: unknown } | null) {
    const maybeSingle = vi.fn(async () => ({ data: existing }))
    createClientMock.mockResolvedValue({
        auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: 'manager-1' } } })) },
        from: vi.fn(() => ({
            select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
        })),
    })
    setTeamFeaturePrefsMock.mockResolvedValue({ success: true })
}

describe('setTeamDomainAction', () => {
    beforeEach(() => vi.clearAllMocks())

    it('pisa SOLO `_enabled` y conserva el resto de la fila del pool', async () => {
        setupTeamPrefs({
            preset: 'profesional',
            sections: { _enabled: true, plate: true, habits: false, basura: 'no-boolean' },
        })

        const result = await setTeamDomainAction({
            teamId: '11111111-1111-4111-8111-111111111111',
            domain: 'nutrition',
            enabled: false,
        })

        expect(result.ok).toBe(true)
        expect(setTeamFeaturePrefsMock).toHaveBeenCalledWith({
            teamId: '11111111-1111-4111-8111-111111111111',
            domain: 'nutrition',
            preset: 'profesional',
            // La key con basura NO viaja: `setTeamFeaturePrefs` solo acepta booleans.
            sections: { _enabled: false, plate: true, habits: false },
        })
    })

    it('sin fila previa siembra `_enabled` con el preset seguro del catálogo', async () => {
        setupTeamPrefs(null)

        await setTeamDomainAction({
            teamId: '11111111-1111-4111-8111-111111111111',
            domain: 'cardio',
            enabled: true,
        })

        expect(setTeamFeaturePrefsMock).toHaveBeenCalledWith({
            teamId: '11111111-1111-4111-8111-111111111111',
            domain: 'cardio',
            preset: 'basico',
            sections: { _enabled: true },
        })
    })

    it('si la RLS de managers rechaza el upsert, el coach ve un error y nada queda a medias', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        setupTeamPrefs({ preset: 'basico', sections: {} })
        setTeamFeaturePrefsMock.mockResolvedValue({ error: 'new row violates row-level security policy' })

        const result = await setTeamDomainAction({
            teamId: '11111111-1111-4111-8111-111111111111',
            domain: 'cardio',
            enabled: false,
        })

        expect(result.ok).toBe(false)
        spy.mockRestore()
    })

    it('teamId inválido: ni siquiera se lee la fila', async () => {
        setupTeamPrefs({ preset: 'basico', sections: {} })

        const result = await setTeamDomainAction({ teamId: 'no-uuid', domain: 'cardio', enabled: false })

        expect(result.ok).toBe(false)
        expect(setTeamFeaturePrefsMock).not.toHaveBeenCalled()
    })
})
