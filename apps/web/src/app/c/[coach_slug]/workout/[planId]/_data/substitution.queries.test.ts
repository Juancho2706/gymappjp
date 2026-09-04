import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W2.10 (tren «ciclo real y por lado», R5): el candidate set de «máquina ocupada» se filtra por el
 * tipo EFECTIVO del bloque —`exercise_type_override` del bloque > `exercise_type` del catálogo >
 * 'strength'—, no por el tipo del ejercicio prescrito. Sin esto, una sentadilla prescrita como
 * movilidad ofrecía reemplazos de fuerza y el bloque perdía su prescripción tipada.
 */

const { createClientMock, resolveCatalogScopeMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    resolveCatalogScopeMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/app/c/[coach_slug]/exercises/_data/exercises.queries', () => ({
    resolveCatalogScope: resolveCatalogScopeMock,
}))

const BLOCK_ID = '11111111-1111-4111-8111-111111111111'
const EXERCISE_ID = '22222222-2222-4222-8222-222222222222'
const SCOPE_FILTER = 'coach_id.is.null,coach_id.eq.c1'

type CatalogRow = Record<string, unknown>

/** Llamadas de filtro que hace la query de candidatos, en orden. */
type FilterCall = [string, ...unknown[]]

function wireSupabase(opts: {
    override?: string | null
    catalogType?: string | null
    candidates?: CatalogRow[]
}) {
    const filters: FilterCall[] = []

    const blocksBuilder: Record<string, unknown> = {}
    Object.assign(blocksBuilder, {
        select: vi.fn(() => blocksBuilder),
        eq: vi.fn(() => blocksBuilder),
        maybeSingle: vi.fn(async () => ({
            data: {
                exercise_id: EXERCISE_ID,
                exercise_type_override: opts.override ?? null,
                exercises: {
                    id: EXERCISE_ID,
                    name: 'Sentadilla',
                    muscle_group: 'piernas',
                    equipment: 'barra',
                    exercise_type: opts.catalogType ?? null,
                    secondary_muscles: null,
                },
            },
        })),
    })

    const exercisesBuilder: Record<string, unknown> = {}
    const record = (name: string) =>
        vi.fn((...args: unknown[]) => {
            filters.push([name, ...args])
            return exercisesBuilder
        })
    Object.assign(exercisesBuilder, {
        select: record('select'),
        or: record('or'),
        is: record('is'),
        eq: record('eq'),
        neq: record('neq'),
        order: record('order'),
        limit: vi.fn(async (...args: unknown[]) => {
            filters.push(['limit', ...args])
            return { data: opts.candidates ?? [] }
        }),
    })

    createClientMock.mockResolvedValue({
        from: vi.fn((table: string) => {
            if (table === 'workout_blocks') return blocksBuilder
            if (table === 'exercises') return exercisesBuilder
            throw new Error(`Unexpected table: ${table}`)
        }),
    })
    return { filters, blocksBuilder }
}

/** `getSubstitutionCandidates` está envuelta en `React.cache`: módulo nuevo por caso. */
async function loadFresh() {
    vi.resetModules()
    return await import('./substitution.queries')
}

function typeFilters(filters: FilterCall[]) {
    return filters.filter(
        ([name, col]) =>
            (name === 'eq' && col === 'exercise_type') ||
            (name === 'or' && typeof col === 'string' && col.includes('exercise_type'))
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    resolveCatalogScopeMock.mockResolvedValue({ scopeFilter: SCOPE_FILTER })
})

describe('getSubstitutionCandidates — tipo efectivo (W2.10 · R5)', () => {
    it('override mobility sobre un ejercicio strength ⇒ los candidatos son de movilidad', async () => {
        const { filters } = wireSupabase({
            override: 'mobility',
            catalogType: 'strength',
            candidates: [{ id: 'x', name: 'Movilidad de cadera' }],
        })
        const { getSubstitutionCandidates } = await loadFresh()

        const set = await getSubstitutionCandidates(BLOCK_ID)

        expect(set).not.toBeNull()
        // El filtro de tipo usa el override, NO el 'strength' del catálogo.
        expect(typeFilters(filters)).toEqual([['eq', 'exercise_type', 'mobility']])
        expect(set?.current.exercise_type).toBe('mobility')
        expect(set?.candidates).toHaveLength(1)
    })

    it('sin candidatos del tipo efectivo ⇒ lista vacía (la UI dirá «No hay reemplazos de este tipo»)', async () => {
        const { filters } = wireSupabase({ override: 'cardio', catalogType: 'strength', candidates: [] })
        const { getSubstitutionCandidates } = await loadFresh()

        const set = await getSubstitutionCandidates(BLOCK_ID)

        expect(set?.candidates).toEqual([])
        expect(typeFilters(filters)).toEqual([['eq', 'exercise_type', 'cardio']])
    })

    it('sin override ⇒ manda el tipo del catálogo (comportamiento previo intacto)', async () => {
        const { filters } = wireSupabase({ override: null, catalogType: 'mobility' })
        const { getSubstitutionCandidates } = await loadFresh()

        const set = await getSubstitutionCandidates(BLOCK_ID)

        expect(typeFilters(filters)).toEqual([['eq', 'exercise_type', 'mobility']])
        expect(set?.current.exercise_type).toBe('mobility')
    })

    it('bloque legacy (sin override, ejercicio sin tipo) ⇒ strength, incluyendo el catálogo sin tipo', async () => {
        const { filters } = wireSupabase({ override: null, catalogType: null })
        const { getSubstitutionCandidates } = await loadFresh()

        const set = await getSubstitutionCandidates(BLOCK_ID)

        // Los ejercicios del catálogo sin `exercise_type` tienen tipo efectivo 'strength': excluirlos
        // vaciaría el sheet en los catálogos legacy, que es de donde vienen esos bloques.
        expect(typeFilters(filters)).toEqual([['or', 'exercise_type.eq.strength,exercise_type.is.null']])
        expect(set?.current.exercise_type).toBe('strength')
    })

    it('un override basura no es un tipo: cae al del catálogo (asExerciseType del motor)', async () => {
        const { filters } = wireSupabase({ override: 'yoga', catalogType: 'cardio' })
        const { getSubstitutionCandidates } = await loadFresh()

        await getSubstitutionCandidates(BLOCK_ID)

        expect(typeFilters(filters)).toEqual([['eq', 'exercise_type', 'cardio']])
    })

    it('el scope de catálogo se sigue aplicando junto al filtro de tipo (AND en PostgREST)', async () => {
        const { filters } = wireSupabase({ override: 'mobility', catalogType: 'strength' })
        const { getSubstitutionCandidates } = await loadFresh()

        await getSubstitutionCandidates(BLOCK_ID)

        expect(filters).toContainEqual(['or', SCOPE_FILTER])
        expect(filters).toContainEqual(['is', 'deleted_at', null])
        expect(filters).toContainEqual(['eq', 'muscle_group', 'piernas'])
        expect(filters).toContainEqual(['neq', 'id', EXERCISE_ID])
    })

    it('bloque sin ejercicio o sin grupo muscular ⇒ null, sin consultar el catálogo', async () => {
        const { blocksBuilder } = wireSupabase({})
        ;(blocksBuilder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: { exercise_id: null, exercise_type_override: null, exercises: null },
        })
        const { getSubstitutionCandidates } = await loadFresh()

        expect(await getSubstitutionCandidates(BLOCK_ID)).toBeNull()
    })
})
