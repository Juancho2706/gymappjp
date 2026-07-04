import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { searchCoachWorkspace } from './coach-search.service'

/**
 * Builder de Supabase encadenable + thenable que registra cada operación (método + args) por tabla.
 * No filtra: devuelve las filas sembradas de la tabla al hacer `await`. Los tests asertan sobre las
 * operaciones REGISTRADAS (scope 3-vías, cap por grupo) y sobre la forma mapeada del resultado.
 */
type Recorded = { table: string; method: string; args: unknown[] }

function makeSupabaseMock(tableData: Record<string, unknown[]>) {
    const recorded: Recorded[] = []
    const chainMethods = ['select', 'ilike', 'order', 'limit', 'eq', 'is', 'or', 'in', 'not']

    function makeBuilder(table: string) {
        const rows = tableData[table] ?? []
        const builder: Record<string, unknown> = {}
        for (const method of chainMethods) {
            builder[method] = vi.fn((...args: unknown[]) => {
                recorded.push({ table, method, args })
                return builder
            })
        }
        // Thenable: `await builder` resuelve { data, error } con las filas sembradas.
        builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
        return builder
    }

    const from = vi.fn((table: string) => makeBuilder(table))
    const db = { from } as unknown as SupabaseClient<Database>

    const argsFor = (table: string, method: string): unknown[][] =>
        recorded.filter((r) => r.table === table && r.method === method).map((r) => r.args)

    return { db, from, recorded, argsFor }
}

const COACH = 'coach-1'

describe('searchCoachWorkspace — short-circuit', () => {
    it('query < 2 chars → resultados vacíos SIN golpear DB', async () => {
        const { db, from } = makeSupabaseMock({})
        const res = await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: null },
            query: 'a',
        })
        expect(res).toEqual({ clients: [], programs: [], exercises: [], recipes: [] })
        expect(from).not.toHaveBeenCalled()
    })

    it('query solo-espacios → vacío (trim) sin golpear DB', async () => {
        const { db, from } = makeSupabaseMock({})
        const res = await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: null },
            query: '   ',
        })
        expect(res.clients).toHaveLength(0)
        expect(from).not.toHaveBeenCalled()
    })
})

describe('searchCoachWorkspace — scope 3-vías (filtros distintos por workspace)', () => {
    it('standalone: coach_id propio + org_id NULL + team_id NULL', async () => {
        const { db, argsFor } = makeSupabaseMock({})
        await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: null },
            query: 'cat',
        })
        // Alumnos
        expect(argsFor('clients', 'eq')).toContainEqual(['coach_id', COACH])
        expect(argsFor('clients', 'is')).toContainEqual(['org_id', null])
        expect(argsFor('clients', 'is')).toContainEqual(['team_id', null])
        // Programas
        expect(argsFor('workout_programs', 'eq')).toContainEqual(['coach_id', COACH])
        expect(argsFor('workout_programs', 'is')).toContainEqual(['org_id', null])
        // Ejercicios: el scopeFilter (primer .or) acota a coach standalone
        expect(argsFor('exercises', 'or')[0]?.[0]).toContain(`coach_id.eq.${COACH}`)
        // Recetas: scope coach (team_id NULL)
        expect(argsFor('nutrition_recipes', 'eq')).toContainEqual(['coach_id', COACH])
        expect(argsFor('nutrition_recipes', 'is')).toContainEqual(['team_id', null])
    })

    it('enterprise: coach_id + org_id activo (ejercicios por org)', async () => {
        const { db, argsFor } = makeSupabaseMock({})
        await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: 'org-9', activeTeamId: null },
            query: 'cat',
        })
        expect(argsFor('clients', 'eq')).toContainEqual(['coach_id', COACH])
        expect(argsFor('clients', 'eq')).toContainEqual(['org_id', 'org-9'])
        expect(argsFor('workout_programs', 'eq')).toContainEqual(['org_id', 'org-9'])
        expect(argsFor('exercises', 'or')[0]?.[0]).toContain('org_id.eq.org-9')
        // Recetas: nutrition_recipes NO tiene scope org → cae a scope coach (team_id NULL)
        expect(argsFor('nutrition_recipes', 'eq')).toContainEqual(['coach_id', COACH])
        expect(argsFor('nutrition_recipes', 'is')).toContainEqual(['team_id', null])
    })

    it('team-pool: por team_id, NUNCA por coach_id (no-fuga cross-workspace)', async () => {
        const { db, argsFor } = makeSupabaseMock({
            clients: [{ id: 'poolA' }, { id: 'poolB' }],
        })
        await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: 'team-7' },
            query: 'cat',
        })
        // Alumnos del pool: org_id NULL + team_id = team activo, SIN coach_id
        expect(argsFor('clients', 'is')).toContainEqual(['org_id', null])
        expect(argsFor('clients', 'eq')).toContainEqual(['team_id', 'team-7'])
        // Cero fuga: ninguna query de clients filtra por coach_id en contexto team
        expect(argsFor('clients', 'eq').some(([col]) => col === 'coach_id')).toBe(false)
        // Recetas: scope team, NUNCA coach
        expect(argsFor('nutrition_recipes', 'eq')).toContainEqual(['team_id', 'team-7'])
        expect(argsFor('nutrition_recipes', 'eq').some(([col]) => col === 'coach_id')).toBe(false)
        // Ejercicios: scopeFilter por team, sin coach_id.eq
        const exScope = argsFor('exercises', 'or')[0]?.[0] as string
        expect(exScope).toContain('team_id.eq.team-7')
        expect(exScope).not.toContain('coach_id.eq.')
        // Programas del pool: org_id NULL + or() con los ids del pool
        expect(argsFor('workout_programs', 'is')).toContainEqual(['org_id', null])
        const progOr = argsFor('workout_programs', 'or').map((a) => a[0] as string).join('|')
        expect(progOr).toContain('client_id.in.(poolA,poolB)')
    })
})

describe('searchCoachWorkspace — cap por grupo', () => {
    it('límite por defecto = 5 en cada sub-búsqueda', async () => {
        const { db, argsFor } = makeSupabaseMock({})
        await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: null },
            query: 'cat',
        })
        expect(argsFor('clients', 'limit')).toContainEqual([5])
        expect(argsFor('workout_programs', 'limit')).toContainEqual([5])
        expect(argsFor('exercises', 'limit')).toContainEqual([5])
        expect(argsFor('nutrition_recipes', 'limit')).toContainEqual([5])
    })

    it('limitPerGroup override se propaga a las 4 sub-búsquedas', async () => {
        const { db, argsFor } = makeSupabaseMock({})
        await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: null },
            query: 'cat',
            limitPerGroup: 3,
        })
        expect(argsFor('clients', 'limit')).toContainEqual([3])
        expect(argsFor('nutrition_recipes', 'limit')).toContainEqual([3])
    })
})

describe('searchCoachWorkspace — forma y hrefs del resultado', () => {
    it('mapea cada grupo a SearchHit con href canónico', async () => {
        const { db } = makeSupabaseMock({
            clients: [{ id: 'c1', full_name: 'Catalina Ruiz' }],
            workout_programs: [
                { id: 'p1', name: 'Fuerza base', client_id: null },
                { id: 'p2', name: 'Plan Cata', client_id: 'c1' },
            ],
            exercises: [
                {
                    id: 'e1',
                    name: 'Sentadilla',
                    muscle_group: 'Piernas',
                    thumbnail_url: 'https://cdn/e1.webp',
                    gif_url: null,
                    video_url: null,
                },
            ],
            nutrition_recipes: [{ id: 'r1', name: 'Caldo de pollo', image_url: 'https://cdn/r1.jpg' }],
        })
        const res = await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: null },
            query: 'cat',
        })

        expect(res.clients[0]).toEqual({
            id: 'c1',
            label: 'Catalina Ruiz',
            href: '/coach/clients/c1',
        })
        // Plantilla (client_id null) → builder de plantillas
        expect(res.programs[0]).toMatchObject({
            href: '/coach/workout-programs/builder?programId=p1',
            sublabel: 'Plantilla',
        })
        // Asignado → builder del alumno
        expect(res.programs[1]).toMatchObject({
            href: '/coach/builder/c1?programId=p2',
            sublabel: 'Programa asignado',
        })
        expect(res.exercises[0]).toMatchObject({
            href: '/coach/exercises?q=Sentadilla',
            sublabel: 'Piernas',
            thumbUrl: 'https://cdn/e1.webp',
        })
        expect(res.recipes[0]).toMatchObject({
            href: '/coach/nutrition-plans?tab=recipes',
            thumbUrl: 'https://cdn/r1.jpg',
        })
    })

    it('ejercicio sin espejo estático (thumbnail_url null) → thumbUrl null, NUNCA el gif', async () => {
        const { db } = makeSupabaseMock({
            exercises: [
                {
                    id: 'e2',
                    name: 'Peso muerto',
                    muscle_group: 'Espalda',
                    thumbnail_url: null,
                    gif_url: 'https://cdn/e2-animado.gif',
                    video_url: null,
                },
            ],
        })
        const res = await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: null },
            query: 'peso',
        })
        // El dropdown cae al ícono de grupo; jamás anima el gif crudo.
        expect(res.exercises[0]?.thumbUrl).toBeNull()
    })

    it('siempre devuelve las 4 claves como arrays', async () => {
        const { db } = makeSupabaseMock({})
        const res = await searchCoachWorkspace(db, {
            coachId: COACH,
            scope: { orgId: null, activeTeamId: null },
            query: 'zzz',
        })
        expect(Array.isArray(res.clients)).toBe(true)
        expect(Array.isArray(res.programs)).toBe(true)
        expect(Array.isArray(res.exercises)).toBe(true)
        expect(Array.isArray(res.recipes)).toBe(true)
    })
})
