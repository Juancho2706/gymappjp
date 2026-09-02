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
    cloneExerciseAction,
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
 *
 * `sourceRow`/`nameCount` cubren las 3 queries encadenadas del CLON: lectura de la fila origen
 * (`maybeSingle`), conteo de nombre duplicado scopeado al owner (thenable) e insert.
 */
function makeExercisesTable(options: {
    updatedRows?: { id: string }[]
    /** Fila devuelta por `maybeSingle()`: origen del clon, o media vieja en el update. */
    sourceRow?: Record<string, unknown> | null
    /** Duplicados de nombre en el catálogo del owner (>0 ⇒ la action rechaza). */
    nameCount?: number
} = {}) {
    const updatedRows = options.updatedRows ?? [{ id: 'ex-1' }]
    const nameCount = options.nameCount ?? 0
    const eqCalls: EqCall[] = []
    const ilikeCalls: string[] = []
    const insertPayloads: Record<string, unknown>[] = []
    const updatePayloads: Record<string, unknown>[] = []
    let updating = false
    const insertBuilder: Record<string, unknown> = {}
    Object.assign(insertBuilder, {
        select: vi.fn(() => insertBuilder),
        single: vi.fn().mockResolvedValue({ data: { id: 'ex-1' }, error: null }),
        // El clon hace `await ...insert(...)` sin `.select()`: el insert también es thenable.
        then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
    })
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
        select: vi.fn(() => builder),
        ilike: vi.fn((_col: string, val: string) => {
            ilikeCalls.push(val)
            return builder
        }),
        neq: vi.fn(() => builder),
        // Lectura de la media vieja en el update: sin fila previa no hay limpieza de storage.
        // En el clon es la FILA ORIGEN (tipo + media que el FormData no trae).
        maybeSingle: vi.fn().mockResolvedValue({ data: options.sourceRow ?? null, error: null }),
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
        // El builder es thenable: el nameQuery resuelve el count de duplicados y, una vez que
        // hubo `.update()`, resuelve las filas devueltas por `.select('id')`.
        then: (resolve: (value: { count?: number; data?: { id: string }[]; error: null }) => void) =>
            resolve(updating ? { data: updatedRows, error: null } : { count: nameCount, error: null }),
    })
    return { builder, eqCalls, ilikeCalls, insertPayloads, updatePayloads }
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

// ── Clon (E6) ────────────────────────────────────────────────────────────────
function buildCloneForm(overrides: Record<string, string> = {}) {
    const form = new FormData()
    form.set('id', 'ex-origen')
    form.set('name', 'Press banca')
    form.set('muscle_group', 'Pecho')
    form.set('equipment', 'Barra')
    form.set('difficulty', 'intermediate')
    // Las listas viajan como JSON desde la UI (un paso con coma no debe partirse en dos).
    form.set('instructions', JSON.stringify(['Baja controlado, sube fuerte']))
    form.set('secondary_muscles', JSON.stringify(['Tríceps', 'Hombro']))
    for (const [k, v] of Object.entries(overrides)) form.set(k, v)
    return form
}

/** Fila origen típica del catálogo del SISTEMA: media externa + thumbnail ya espejado. */
const CLONE_SOURCE_ROW = {
    exercise_type: 'strength',
    cardio_modality: null,
    body_part: 'chest',
    video_url: 'https://www.youtube.com/embed/abc12345678',
    gif_url: 'https://cdn.exercisedb.dev/press.gif',
    image_url: null,
    thumbnail_url: 'https://sb.example/storage/v1/object/public/exercise-media/yt/abc12345678.webp',
    video_start_time: 5,
    video_end_time: 30,
}

/**
 * `cloneExerciseAction` encadena TRES queries sobre `exercises` (fila origen → conteo de nombre
 * duplicado scopeado al owner → insert) y hasta ahora no tenía red: un cambio en cualquiera de
 * las tres se colaba a producción. La media y el tipo salen de la FILA ORIGEN leída en DB, no del
 * FormData (los ejercicios del sistema traen GIFs de un CDN externo que el schema rechazaría).
 *
 * OJO: el clon NO renombra («… (copia)»): copia el nombre tal cual y por eso duplicar un
 * ejercicio PROPIO choca con el dup-check. Es el comportamiento vigente de la UI (ExerciseCatalogClient).
 */
describe('cloneExerciseAction — 3 queries encadenadas, owner y media del origen', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('standalone ⇒ copia campos del form + tipo/media/thumbnail del origen, owner coach_id', async () => {
        asStandalone()
        const exercises = makeExercisesTable({ sourceRow: CLONE_SOURCE_ROW })
        wireSupabase(exercises)

        const result = await cloneExerciseAction(buildCloneForm())

        expect(result).toEqual({ success: true })
        const payload = insertOf(exercises)
        expect(payload).toMatchObject({
            coach_id: 'coach-1',
            org_id: null,
            team_id: null,
            source: 'coach',
            // Del FormData (contrato CloneExerciseSchema)
            name: 'Press banca',
            muscle_group: 'Pecho',
            equipment: 'Barra',
            difficulty: 'intermediate',
            instructions: ['Baja controlado, sube fuerte'],
            secondary_muscles: ['Tríceps', 'Hombro'],
            // De la fila origen (el FormData ni siquiera los manda)
            exercise_type: 'strength',
            cardio_modality: null,
            body_part: 'chest',
            video_url: CLONE_SOURCE_ROW.video_url,
            gif_url: CLONE_SOURCE_ROW.gif_url,
            image_url: null,
            video_start_time: 5,
            video_end_time: 30,
        })
        // E5: sin esto el clon caía al hotlink de YouTube mientras el original se veía bien.
        expect(payload.thumbnail_url).toBe(CLONE_SOURCE_ROW.thumbnail_url)
        // La fila origen se lee por id y el dup-check se scopea al owner.
        expect(exercises.eqCalls).toContainEqual(['id', 'ex-origen'])
        expect(exercises.eqCalls).toContainEqual(['coach_id', 'coach-1'])
        expect(exercises.ilikeCalls).toEqual(['Press banca'])
    })

    it('workspace team ⇒ el clon nace en el catálogo del POOL y el dup-check va por team_id', async () => {
        asWorkspaceTeam()
        const exercises = makeExercisesTable({ sourceRow: CLONE_SOURCE_ROW })
        wireSupabase(exercises)

        const result = await cloneExerciseAction(buildCloneForm())

        expect(result).toEqual({ success: true })
        expect(insertOf(exercises)).toMatchObject({
            coach_id: null,
            org_id: null,
            team_id: 'team-1',
            source: 'team',
        })
        expect(exercises.eqCalls).toContainEqual(['team_id', 'team-1'])
        expect(exercises.eqCalls).not.toContainEqual(['coach_id', 'coach-1'])
    })

    it('org admin ⇒ owner org_id y source org', async () => {
        asOrgAdmin()
        const exercises = makeExercisesTable({ sourceRow: CLONE_SOURCE_ROW })
        wireSupabase(exercises)

        const result = await cloneExerciseAction(buildCloneForm())

        expect(result).toEqual({ success: true })
        expect(insertOf(exercises)).toMatchObject({ coach_id: null, org_id: 'org-1', team_id: null, source: 'org' })
    })

    it('no es dueño de nada (rol coach dentro de org) ⇒ rechazado sin tocar exercises', async () => {
        resolvePreferredWorkspaceMock.mockResolvedValue({
            type: 'enterprise_coach',
            userId: 'coach-1',
            orgId: 'org-1',
            coachId: 'coach-1',
        })
        getCoachOrgContextMock.mockResolvedValue({ isOrgUser: true, isOrgAdmin: false, orgId: 'org-1' })
        const exercises = makeExercisesTable({ sourceRow: CLONE_SOURCE_ROW })
        wireSupabase(exercises)

        const result = await cloneExerciseAction(buildCloneForm())

        expect(result).toEqual({ error: 'Tu rol no permite crear ejercicios.' })
        expect(exercises.insertPayloads).toHaveLength(0)
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('la fila origen no existe o la RLS no la deja ver ⇒ error explícito, sin insert', async () => {
        asStandalone()
        const exercises = makeExercisesTable({ sourceRow: null })
        wireSupabase(exercises)

        const result = await cloneExerciseAction(buildCloneForm())

        expect(result).toEqual({ error: 'No se pudo duplicar: el ejercicio no existe o no es visible.' })
        expect(exercises.insertPayloads).toHaveLength(0)
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('ya hay un ejercicio con ese nombre en el catálogo del owner ⇒ error, sin insert', async () => {
        asStandalone()
        const exercises = makeExercisesTable({ sourceRow: CLONE_SOURCE_ROW, nameCount: 1 })
        wireSupabase(exercises)

        const result = await cloneExerciseAction(buildCloneForm())

        expect(result).toEqual({ error: 'Ya existe un ejercicio con ese nombre.' })
        expect(exercises.insertPayloads).toHaveLength(0)
    })

    it('datos inválidos (sin muscle_group) ⇒ mensaje legible, no el ZodError crudo', async () => {
        asStandalone()
        const exercises = makeExercisesTable({ sourceRow: CLONE_SOURCE_ROW })
        wireSupabase(exercises)
        const form = buildCloneForm()
        form.delete('muscle_group')

        const result = await cloneExerciseAction(form)

        expect(result).toEqual({ error: 'No se pudo duplicar: datos del ejercicio inválidos.' })
        expect(exercises.insertPayloads).toHaveLength(0)
    })

    it('al duplicar revalida también la ruta DINÁMICA del builder (E2)', async () => {
        asStandalone()
        const exercises = makeExercisesTable({ sourceRow: CLONE_SOURCE_ROW })
        wireSupabase(exercises)

        await cloneExerciseAction(buildCloneForm())

        // `/coach/builder` no matchea el archivo real `coach/builder/[clientId]/page.tsx`.
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/builder/[clientId]', 'page')
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/exercises')
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/workout-programs/builder')
    })
})
