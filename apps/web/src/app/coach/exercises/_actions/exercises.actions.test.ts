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

import { createExerciseAction } from './exercises.actions'

type EqCall = [string, string]

/** Builder thenable de exercises: nameQuery (select→ilike→eq…) e insert(…).select.single. */
function makeExercisesTable() {
    const eqCalls: EqCall[] = []
    const insertPayloads: Record<string, unknown>[] = []
    const insertBuilder = {
        select: vi.fn(() => insertBuilder),
        single: vi.fn().mockResolvedValue({ data: { id: 'ex-1' }, error: null }),
    }
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
        select: vi.fn(() => builder),
        ilike: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        eq: vi.fn((col: string, val: string) => {
            eqCalls.push([col, val])
            return builder
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
            insertPayloads.push(payload)
            return insertBuilder
        }),
        // El nameQuery se await-ea directo: el builder es thenable y resuelve count 0 (sin duplicados).
        then: (resolve: (value: { count: number; error: null }) => void) =>
            resolve({ count: 0, error: null }),
    })
    return { builder, eqCalls, insertPayloads }
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
