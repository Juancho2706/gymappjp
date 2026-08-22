import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    loadPersonaArtifactScopeMock,
    loadPersonaScopedSignalsMock,
    getDemoClientIdMock,
    deleteDemoStudentMock,
    seedDemoStudentMock,
    recordOnboardingEventMock,
} = vi.hoisted(() => ({
    loadPersonaArtifactScopeMock: vi.fn(),
    loadPersonaScopedSignalsMock: vi.fn(),
    getDemoClientIdMock: vi.fn(),
    deleteDemoStudentMock: vi.fn(),
    seedDemoStudentMock: vi.fn(),
    recordOnboardingEventMock: vi.fn(),
}))

vi.mock('./onboarding-v2.queries', () => ({
    loadPersonaArtifactScope: loadPersonaArtifactScopeMock,
    loadPersonaScopedSignals: loadPersonaScopedSignalsMock,
}))
vi.mock('./demo-student.service', () => ({
    getDemoClientId: getDemoClientIdMock,
    deleteDemoStudent: deleteDemoStudentMock,
    seedDemoStudent: seedDemoStudentMock,
}))
vi.mock('@/services/coach/persona.service', () => ({
    recordOnboardingEvent: recordOnboardingEventMock,
}))

import {
    archivePersonaGuideProgress,
    demoChangeNotice,
    reseedDemoForPersonaChange,
} from './persona-switch.service'

/**
 * Cambiar de especialidad en «Mi panel» (TASKS W8.1.3). QA del owner 22-08: hizo la guía como
 * fuerza, se pasó a rehabilitación y le quedaron tildados pasos que no había hecho, apuntando a un
 * Pedro que no existía.
 */

type SupabaseLike = Parameters<typeof archivePersonaGuideProgress>[0]

function fakeDb(updateError: { message: string } | null = null) {
    const eq = vi.fn(async () => ({ error: updateError }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    return { db: { from } as unknown as SupabaseLike, from, update, eq }
}

function scope(guide: unknown, personaEpoch: string | null = '2026-08-22T18:00:00.000Z') {
    loadPersonaArtifactScopeMock.mockResolvedValue({ guide, personaEpoch, cutoff: personaEpoch })
}

describe('archivePersonaGuideProgress', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        loadPersonaScopedSignalsMock.mockResolvedValue({ vive_tu_app: false, first_artifact: false })
    })

    it('fuerza → rehab: archiva lo de fuerza y deja los pasos 2 y 3 en false EXPLÍCITO', async () => {
        scope({ completed: { profile_branding: true, vive_tu_app: true, first_artifact: true } })
        const { db, update } = fakeDb()

        const result = await archivePersonaGuideProgress(db, {
            coachId: 'coach-1',
            from: 'strength',
            to: 'rehab',
        })

        expect(result).toMatchObject({
            changed: true,
            archived: { vive_tu_app: true, first_artifact: true },
            restored: {},
            error: null,
        })
        const payload = (update.mock.calls as unknown as unknown[][])[0][0] as unknown as { onboarding_guide: Record<string, unknown> }
        expect(payload.onboarding_guide.progress).toEqual({
            strength: { vive_tu_app: true, first_artifact: true },
        })
        expect(payload.onboarding_guide.completed).toEqual({
            profile_branding: true,
            vive_tu_app: false,
            first_artifact: false,
        })
    })

    it('mide la señal VIVA con la rama vieja: lo recién hecho no se pierde por el debounce del checklist', async () => {
        scope({ completed: {} })
        loadPersonaScopedSignalsMock.mockResolvedValue({ vive_tu_app: false, first_artifact: true })
        const { db, update } = fakeDb()

        const result = await archivePersonaGuideProgress(db, {
            coachId: 'coach-1',
            from: 'strength',
            to: 'nutrition',
        })

        // La persona vieja es la que se mide (todavía no se guardó la nueva).
        expect(loadPersonaScopedSignalsMock).toHaveBeenCalledWith(db, 'coach-1', 'strength', expect.anything())
        expect(result.archived).toEqual({ first_artifact: true })
        const payload = (update.mock.calls as unknown as unknown[][])[0][0] as unknown as { onboarding_guide: Record<string, unknown> }
        expect(payload.onboarding_guide.progress).toEqual({ strength: { first_artifact: true } })
    })

    it('volver a fuerza recupera lo de fuerza', async () => {
        scope({
            completed: { vive_tu_app: false, first_artifact: false },
            progress: { strength: { vive_tu_app: true, first_artifact: true } },
        })
        const { db, update } = fakeDb()

        const result = await archivePersonaGuideProgress(db, {
            coachId: 'coach-1',
            from: 'rehab',
            to: 'strength',
        })

        expect(result.restored).toEqual({ vive_tu_app: true, first_artifact: true })
        const payload = (update.mock.calls as unknown as unknown[][])[0][0] as unknown as { onboarding_guide: Record<string, unknown> }
        expect(payload.onboarding_guide.completed).toEqual({ vive_tu_app: true, first_artifact: true })
    })

    it('guardar la MISMA especialidad sin nada nuevo no gasta un UPDATE', async () => {
        scope({ progress: { strength: {} } })
        const { db, update } = fakeDb()

        const result = await archivePersonaGuideProgress(db, {
            coachId: 'coach-1',
            from: 'strength',
            to: 'strength',
        })

        expect(result.changed).toBe(false)
        expect(update).not.toHaveBeenCalled()
    })

    it('un fallo de escritura se informa y no se disfraza', async () => {
        scope({ completed: { vive_tu_app: true } })
        const { db } = fakeDb({ message: 'permission denied' })

        const result = await archivePersonaGuideProgress(db, {
            coachId: 'coach-1',
            from: 'strength',
            to: 'rehab',
        })

        expect(result.error).toBe('permission denied')
    })

    it('nunca pisa las otras claves del jsonb (inventario del demo, tour de marca…)', async () => {
        scope({ demo: { clientId: 'demo-1' }, brand_tour_seen: true, completed: { aha: true } })
        const { db, update } = fakeDb()

        await archivePersonaGuideProgress(db, { coachId: 'coach-1', from: 'strength', to: 'rehab' })

        const payload = (update.mock.calls as unknown as unknown[][])[0][0] as unknown as { onboarding_guide: Record<string, unknown> }
        expect(payload.onboarding_guide.demo).toEqual({ clientId: 'demo-1' })
        expect(payload.onboarding_guide.brand_tour_seen).toBe(true)
        expect(payload.onboarding_guide.completed).toMatchObject({ aha: true })
    })
})

describe('reseedDemoForPersonaChange', () => {
    const admin = {} as Parameters<typeof reseedDemoForPersonaChange>[0]

    beforeEach(() => vi.clearAllMocks())

    it('con demo existente: borra el de la rama vieja y siembra el de la nueva', async () => {
        getDemoClientIdMock.mockResolvedValue('matias-1')
        deleteDemoStudentMock.mockResolvedValue({ ok: true, deleted: true })
        seedDemoStudentMock.mockResolvedValue({ ok: true, demoClientId: 'pedro-1', alreadyExisted: false })

        const result = await reseedDemoForPersonaChange(admin, {
            coachId: 'coach-1',
            persona: 'rehab',
            surface: 'web',
        })

        expect(deleteDemoStudentMock).toHaveBeenCalledWith(admin, { coachId: 'coach-1' })
        expect(seedDemoStudentMock).toHaveBeenCalledWith(admin, { coachId: 'coach-1', persona: 'rehab' })
        expect(result).toEqual({ action: 'reseeded', demoName: 'Pedro', demoClientId: 'pedro-1', error: null })
        expect(demoChangeNotice(result)).toBe('Cambiamos tu alumno de ejemplo: ahora es Pedro.')
        expect(recordOnboardingEventMock).toHaveBeenCalledWith(
            admin,
            expect.objectContaining({ eventType: 'demo_deleted' }),
        )
        expect(recordOnboardingEventMock).toHaveBeenCalledWith(
            admin,
            expect.objectContaining({ eventType: 'demo_seeded' }),
        )
    })

    it('a «panel completo» (other): SOLO borra, no siembra nada', async () => {
        getDemoClientIdMock.mockResolvedValue('matias-1')
        deleteDemoStudentMock.mockResolvedValue({ ok: true, deleted: true })

        const result = await reseedDemoForPersonaChange(admin, {
            coachId: 'coach-1',
            persona: 'other',
            surface: 'web',
        })

        expect(seedDemoStudentMock).not.toHaveBeenCalled()
        expect(result).toEqual({ action: 'deleted', demoName: null, demoClientId: null, error: null })
        expect(demoChangeNotice(result)).toBe('Borramos tu alumno de ejemplo: el panel completo no trae uno.')
    })

    it('sin demo (el coach lo borró a mano) no se resucita nada', async () => {
        getDemoClientIdMock.mockResolvedValue(null)

        const result = await reseedDemoForPersonaChange(admin, {
            coachId: 'coach-1',
            persona: 'rehab',
            surface: 'rn',
        })

        expect(deleteDemoStudentMock).not.toHaveBeenCalled()
        expect(seedDemoStudentMock).not.toHaveBeenCalled()
        expect(result).toEqual({ action: 'kept', demoName: 'Pedro', demoClientId: null, error: null })
        expect(demoChangeNotice(result)).toBeNull()
    })

    it('si el sembrado falla lo dice con el camino de salida, sin fingir que salió bien', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        getDemoClientIdMock.mockResolvedValue('matias-1')
        deleteDemoStudentMock.mockResolvedValue({ ok: true, deleted: true })
        seedDemoStudentMock.mockResolvedValue({ ok: false, reason: 'error', detail: 'auth.createUser' })

        const result = await reseedDemoForPersonaChange(admin, {
            coachId: 'coach-1',
            persona: 'rehab',
            surface: 'web',
        })

        expect(result.action).toBe('failed')
        expect(result.error).toContain('Volver a sembrar')
        spy.mockRestore()
    })

    it('si el borrado falla no se siembra encima', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        getDemoClientIdMock.mockResolvedValue('matias-1')
        deleteDemoStudentMock.mockResolvedValue({ ok: false, reason: 'error' })

        const result = await reseedDemoForPersonaChange(admin, {
            coachId: 'coach-1',
            persona: 'nutrition',
            surface: 'web',
        })

        expect(seedDemoStudentMock).not.toHaveBeenCalled()
        expect(result.action).toBe('failed')
        spy.mockRestore()
    })
})
