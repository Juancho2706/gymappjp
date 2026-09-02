import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Unit del resolver de ownership (specs/movida-entrenamiento F3, mustFix AC6/AC11):
 * `createExerciseAction` debe persistir exactamente UNO de coach_id | org_id | team_id según
 * el contexto activo, y el chequeo de duplicado de nombre debe scopearse por ese mismo owner.
 * Sin el 3er caso team, un coach de Movida en workspace team creaba ejercicios PERSONALES:
 * invisibles para los otros miembros y no legibles por los alumnos del pool (bloque fantasma).
 */

const { createClientMock, revalidatePathMock, resolvePreferredWorkspaceMock, getCoachOrgContextMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    resolvePreferredWorkspaceMock: vi.fn(),
    getCoachOrgContextMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock,
}))

vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: resolvePreferredWorkspaceMock,
}))

vi.mock('@/lib/coach-context', () => ({
    getCoachOrgContext: getCoachOrgContextMock,
}))

// Side effect de limpieza de storage — fuera del alcance del unit.
vi.mock('./exercise-media.actions', () => ({
    deleteExerciseMediaByUrlAction: vi.fn().mockResolvedValue(undefined),
}))

// Mirror del thumbnail: pega a Storage con service-role, fuera del alcance del unit.
vi.mock('@/lib/exercises/thumbnail-mirror', () => ({
    mirrorAndSaveExerciseThumbnail: vi.fn().mockResolvedValue(null),
    clearExerciseThumbnail: vi.fn().mockResolvedValue(undefined),
}))

import {
    createExerciseAction,
    restoreExerciseAction,
    softDeleteExerciseAction,
    updateExerciseAction,
} from './exercises.actions'

type EqCall = [string, string]

/**
 * Builder thenable de exercises: nameQuery (select→ilike→eq…), insert(…).select.single y
 * update(…).eq(…)+scope→select('id'). `updatedRows` simula cuántas filas tocó el UPDATE:
 * `[]` = el scope del owner no matcheó (ejercicio ajeno/inexistente), el caso que PostgREST
 * devuelve como éxito silencioso.
 */
function makeExercisesTable(options: { updatedRows?: { id: string }[] } = {}) {
    const updatedRows = options.updatedRows ?? [{ id: 'ex-1' }]
    const eqCalls: EqCall[] = []
    const insertPayloads: Record<string, unknown>[] = []
    const updatePayloads: Record<string, unknown>[] = []
    let updating = false
    const insertBuilder = {
        select: vi.fn(() => insertBuilder),
        single: vi.fn().mockResolvedValue({ data: { id: 'ex-1' }, error: null }),
    }
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
        select: vi.fn(() => builder),
        ilike: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        // Lectura de la media vieja en el update: sin fila previa no hay limpieza de storage.
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        eq: vi.fn((col: string, val: string) => {
            eqCalls.push([col, val])
            return builder
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
            insertPayloads.push(payload)
            return insertBuilder
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
            updatePayloads.push(payload)
            updating = true
            return builder
        }),
        // El builder es thenable: el nameQuery resuelve count 0 (sin duplicados) y, una vez que
        // hubo `.update()`, resuelve las filas devueltas por `.select('id')`.
        then: (resolve: (value: { count?: number; data?: { id: string }[]; error: null }) => void) =>
            resolve(updating ? { data: updatedRows, error: null } : { count: 0, error: null }),
    })
    return { builder, eqCalls, insertPayloads, updatePayloads }
}

function makeCoachesTable(tier = 'pro') {
    return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'coach-1', subscription_tier: tier } }),
    }
}

function buildExerciseForm() {
    const form = new FormData()
    form.set('name', 'Sentadilla goblet')
    form.set('muscle_group', 'Piernas')
    form.set('exercise_type', 'strength')
    form.set('media_kind', 'none')
    return form
}

function wireSupabase(exercises: ReturnType<typeof makeExercisesTable>, coaches = makeCoachesTable()) {
    const supabase = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
        from: vi.fn((table: string) => {
            if (table === 'coaches') return coaches
            if (table === 'exercises') return exercises.builder
            throw new Error(`Unexpected table: ${table}`)
        }),
    }
    createClientMock.mockResolvedValue(supabase)
    return supabase
}

describe('createExerciseAction — ownership por contexto activo (3 vías)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('workspace team ⇒ team_id del pool, coach_id/org_id null, dup-check por team_id', async () => {
        resolvePreferredWorkspaceMock.mockResolvedValue({
            type: 'coach_team',
            userId: 'coach-1',
            coachId: 'coach-1',
            teamId: 'team-1',
        })
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await createExerciseAction({}, buildExerciseForm())

        expect(result.success).toBe(true)
        expect(insertOf(exercises)).toMatchObject({
            coach_id: null,
            org_id: null,
            team_id: 'team-1',
            source: 'team',
        })
        expect(exercises.eqCalls).toContainEqual(['team_id', 'team-1'])
        // En contexto team NO se consulta el contexto org: el workspace activo manda.
        expect(getCoachOrgContextMock).not.toHaveBeenCalled()
    })

    it('standalone ⇒ coach_id propio, org_id/team_id null, dup-check por coach_id', async () => {
        resolvePreferredWorkspaceMock.mockResolvedValue({
            type: 'coach_standalone',
            userId: 'coach-1',
            coachId: 'coach-1',
        })
        getCoachOrgContextMock.mockResolvedValue({ isOrgUser: false, isOrgAdmin: false, orgId: null })
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await createExerciseAction({}, buildExerciseForm())

        expect(result.success).toBe(true)
        expect(insertOf(exercises)).toMatchObject({
            coach_id: 'coach-1',
            org_id: null,
            team_id: null,
            source: 'coach',
        })
        expect(exercises.eqCalls).toContainEqual(['coach_id', 'coach-1'])
    })

    it('org admin ⇒ org_id de la org, coach_id/team_id null, dup-check por org_id', async () => {
        resolvePreferredWorkspaceMock.mockResolvedValue({
            type: 'enterprise_staff',
            userId: 'coach-1',
            orgId: 'org-1',
            memberId: 'member-1',
            role: 'org_admin',
        })
        getCoachOrgContextMock.mockResolvedValue({ isOrgUser: true, isOrgAdmin: true, orgId: 'org-1' })
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await createExerciseAction({}, buildExerciseForm())

        expect(result.success).toBe(true)
        expect(insertOf(exercises)).toMatchObject({
            coach_id: null,
            org_id: 'org-1',
            team_id: null,
            source: 'org',
        })
        expect(exercises.eqCalls).toContainEqual(['org_id', 'org-1'])
    })

    it('org coach (rol coach dentro de org, sin workspace team) ⇒ rechazado', async () => {
        resolvePreferredWorkspaceMock.mockResolvedValue({
            type: 'enterprise_coach',
            userId: 'coach-1',
            orgId: 'org-1',
            coachId: 'coach-1',
        })
        getCoachOrgContextMock.mockResolvedValue({ isOrgUser: true, isOrgAdmin: false, orgId: 'org-1' })
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await createExerciseAction({}, buildExerciseForm())

        expect(result.error).toBe('Tu rol no permite crear ejercicios.')
        expect(exercises.insertPayloads).toHaveLength(0)
    })
})

function insertOf(exercises: ReturnType<typeof makeExercisesTable>) {
    expect(exercises.insertPayloads).toHaveLength(1)
    return exercises.insertPayloads[0]
}

// ── Contextos activos reutilizables (mismo resolver que el create) ────────────
function asStandalone() {
    resolvePreferredWorkspaceMock.mockResolvedValue({
        type: 'coach_standalone',
        userId: 'coach-1',
        coachId: 'coach-1',
    })
    getCoachOrgContextMock.mockResolvedValue({ isOrgUser: false, isOrgAdmin: false, orgId: null })
}

function asWorkspaceTeam() {
    resolvePreferredWorkspaceMock.mockResolvedValue({
        type: 'coach_team',
        userId: 'coach-1',
        coachId: 'coach-1',
        teamId: 'team-1',
    })
}

function asOrgAdmin() {
    resolvePreferredWorkspaceMock.mockResolvedValue({
        type: 'enterprise_staff',
        userId: 'coach-1',
        orgId: 'org-1',
        memberId: 'member-1',
        role: 'org_admin',
    })
    getCoachOrgContextMock.mockResolvedValue({ isOrgUser: true, isOrgAdmin: true, orgId: 'org-1' })
}

/**
 * Borrar/restaurar/editar hacen `update(...).eq('id', …)` + scope del owner. Con 0 filas afectadas
 * PostgREST responde éxito (204/200 vacío): sin el `.select('id')` la UI cantaba "listo" sobre un
 * ejercicio ajeno o ya inexistente. Estos tests fijan el scope por contexto y el error de 0 filas.
 */
describe('softDeleteExerciseAction — scope del owner y 0 filas', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('standalone ⇒ scope por coach_id y deleted_at seteado', async () => {
        asStandalone()
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await softDeleteExerciseAction('ex-9')

        expect(result.success).toBe(true)
        expect(exercises.eqCalls).toContainEqual(['id', 'ex-9'])
        expect(exercises.eqCalls).toContainEqual(['coach_id', 'coach-1'])
        expect(exercises.updatePayloads).toHaveLength(1)
        expect(typeof exercises.updatePayloads[0].deleted_at).toBe('string')
    })

    it('workspace team ⇒ scope por team_id del pool', async () => {
        asWorkspaceTeam()
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await softDeleteExerciseAction('ex-9')

        expect(result.success).toBe(true)
        expect(exercises.eqCalls).toContainEqual(['team_id', 'team-1'])
        expect(exercises.eqCalls).not.toContainEqual(['coach_id', 'coach-1'])
    })

    it('org admin ⇒ scope por org_id', async () => {
        asOrgAdmin()
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await softDeleteExerciseAction('ex-9')

        expect(result.success).toBe(true)
        expect(exercises.eqCalls).toContainEqual(['org_id', 'org-1'])
    })

    it('0 filas afectadas (ejercicio ajeno o inexistente) ⇒ error, no éxito silencioso', async () => {
        asStandalone()
        const exercises = makeExercisesTable({ updatedRows: [] })
        wireSupabase(exercises)

        const result = await softDeleteExerciseAction('ex-ajeno')

        expect(result.success).toBeUndefined()
        expect(result.error).toBe('No se pudo eliminar: el ejercicio no es tuyo o ya no existe.')
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })
})

describe('restoreExerciseAction — scope del owner y 0 filas', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('standalone ⇒ deleted_at null con scope por coach_id', async () => {
        asStandalone()
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await restoreExerciseAction('ex-9')

        expect(result.success).toBe(true)
        expect(exercises.updatePayloads[0]).toEqual({ deleted_at: null })
        expect(exercises.eqCalls).toContainEqual(['coach_id', 'coach-1'])
    })

    it('0 filas afectadas ⇒ error', async () => {
        asStandalone()
        const exercises = makeExercisesTable({ updatedRows: [] })
        wireSupabase(exercises)

        const result = await restoreExerciseAction('ex-ajeno')

        expect(result.error).toBe('No se pudo restaurar: el ejercicio no es tuyo o ya no existe.')
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })
})

describe('updateExerciseAction — 0 filas', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('standalone con filas afectadas ⇒ éxito y scope por coach_id', async () => {
        asStandalone()
        const exercises = makeExercisesTable()
        wireSupabase(exercises)

        const result = await updateExerciseAction('ex-9', {}, buildExerciseForm())

        expect(result.success).toBe(true)
        expect(exercises.eqCalls).toContainEqual(['coach_id', 'coach-1'])
        expect(exercises.updatePayloads[0]).toMatchObject({ name: 'Sentadilla goblet' })
    })

    it('0 filas afectadas ⇒ error de guardado, sin revalidar', async () => {
        asStandalone()
        const exercises = makeExercisesTable({ updatedRows: [] })
        wireSupabase(exercises)

        const result = await updateExerciseAction('ex-ajeno', {}, buildExerciseForm())

        expect(result.success).toBeUndefined()
        expect(result.error).toBe('No se pudo guardar: el ejercicio no es tuyo o ya no existe.')
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })
})
