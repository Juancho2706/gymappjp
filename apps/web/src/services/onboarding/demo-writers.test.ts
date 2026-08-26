import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ExerciseRef } from './demo-content/types'
import { resolveExercises } from './demo-writers'

/**
 * `resolveExercises` — PREFERENCIA POR MULTIMEDIA.
 *
 * El alumno de ejemplo es lo primero que el coach abre en la app: un bloque colgado de un
 * ejercicio sin video se ve pobre. Estos tests pinnean la regla completa —el orden de `names`
 * manda, pero primero entre los que tienen media— y, sobre todo, que la degradación legada
 * («ninguno tiene media ⇒ gana el primero que existe») sigue viva.
 */

interface FakeRow {
    id: string
    name: string
    video_url: string | null
    gif_url: string | null
    muscle_group?: string
    exercise_type?: string
}

interface QueryLog {
    requiresVideo: boolean
    eqs: [string, unknown][]
}

/** Doble mínimo del builder de Supabase: solo lo que toca `resolveExercises`. */
class FakeQuery implements PromiseLike<{ data: FakeRow[]; error: null }> {
    private names: string[] | null = null
    private readonly eqs: [string, unknown][] = []
    private requiresVideo = false
    private max: number | null = null

    constructor(
        private readonly rows: readonly FakeRow[],
        private readonly log: QueryLog[],
    ) {}

    select(): this {
        return this
    }
    in(_column: string, values: readonly string[]): this {
        this.names = [...values]
        return this
    }
    is(): this {
        return this
    }
    eq(column: string, value: unknown): this {
        this.eqs.push([column, value])
        return this
    }
    not(column: string, operator: string, value: unknown): this {
        if (column === 'video_url' && operator === 'is' && value === null) this.requiresVideo = true
        return this
    }
    limit(count: number): this {
        this.max = count
        return this
    }

    private run(): FakeRow[] {
        this.log.push({ requiresVideo: this.requiresVideo, eqs: this.eqs })
        let out = this.rows.filter((row) => this.names == null || this.names.includes(row.name))
        if (this.requiresVideo) out = out.filter((row) => row.video_url != null)
        for (const [column, value] of this.eqs) {
            out = out.filter((row) => (row as unknown as Record<string, unknown>)[column] === value)
        }
        return this.max == null ? out : out.slice(0, this.max)
    }

    then<R1 = { data: FakeRow[]; error: null }, R2 = never>(
        onFulfilled?: ((value: { data: FakeRow[]; error: null }) => R1 | PromiseLike<R1>) | null,
        onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): PromiseLike<R1 | R2> {
        return Promise.resolve({ data: this.run(), error: null as null }).then(onFulfilled, onRejected)
    }
}

function makeDb(rows: readonly FakeRow[]): { db: SupabaseClient<Database>; queries: QueryLog[] } {
    const queries: QueryLog[] = []
    const db = { from: () => new FakeQuery(rows, queries) } as unknown as SupabaseClient<Database>
    return { db, queries }
}

const withVideo = (id: string, name: string, extra: Partial<FakeRow> = {}): FakeRow => ({
    id,
    name,
    video_url: `https://videos/${id}`,
    gif_url: null,
    ...extra,
})
const noMedia = (id: string, name: string, extra: Partial<FakeRow> = {}): FakeRow => ({
    id,
    name,
    video_url: null,
    gif_url: null,
    ...extra,
})

describe('resolveExercises · preferencia por multimedia', () => {
    it('con dos nombres que existen y solo el segundo con video, gana el segundo', async () => {
        const { db } = makeDb([noMedia('ex-clinico', 'Báscula pélvica en supino'), withVideo('ex-video', 'Crunch inverso')])
        const ref: ExerciseRef = { names: ['Báscula pélvica en supino', 'Crunch inverso'] }

        const { byRef, missing } = await resolveExercises(db, [ref])

        expect(byRef.get(ref)).toEqual({ id: 'ex-video', name: 'Crunch inverso' })
        expect(missing).toEqual([])
    })

    it('sin ningún nombre con media gana el PRIMERO que existe (comportamiento legado)', async () => {
        const { db } = makeDb([noMedia('ex-uno', 'Báscula pélvica en supino'), noMedia('ex-dos', 'Crunch inverso')])
        const ref: ExerciseRef = { names: ['Báscula pélvica en supino', 'Crunch inverso'] }

        const { byRef } = await resolveExercises(db, [ref])

        expect(byRef.get(ref)).toEqual({ id: 'ex-uno', name: 'Báscula pélvica en supino' })
    })

    it('el gif también cuenta como media', async () => {
        const { db } = makeDb([
            noMedia('ex-clinico', 'Dead bug (bicho muerto)'),
            { id: 'ex-gif', name: 'Press pallof horizontal con banda', video_url: null, gif_url: 'https://gifs/pallof' },
        ])
        const ref: ExerciseRef = { names: ['Dead bug (bicho muerto)', 'Press pallof horizontal con banda'] }

        const { byRef } = await resolveExercises(db, [ref])

        expect(byRef.get(ref)?.id).toBe('ex-gif')
    })

    it('dentro de los que tienen media sigue mandando el orden de `names`', async () => {
        const { db } = makeDb([
            noMedia('ex-clinico', 'Perro-pájaro (bird dog)'),
            withVideo('ex-segundo', 'Rotación torácica en cuadrupedia (lumbar bloqueada)'),
            withVideo('ex-tercero', 'Rotación con estabilidad de tronco (rodillas flexionadas)'),
        ])
        const ref: ExerciseRef = {
            names: [
                'Perro-pájaro (bird dog)',
                'Rotación torácica en cuadrupedia (lumbar bloqueada)',
                'Rotación con estabilidad de tronco (rodillas flexionadas)',
            ],
        }

        const { byRef } = await resolveExercises(db, [ref])

        expect(byRef.get(ref)?.id).toBe('ex-segundo')
    })

    it('un nombre que no existe no bloquea al siguiente', async () => {
        const { db } = makeDb([withVideo('ex-video', 'Sentadilla con banda')])
        const ref: ExerciseRef = { names: ['Sentadilla a la silla', 'Sentadilla con banda'] }

        const { byRef, missing } = await resolveExercises(db, [ref])

        expect(byRef.get(ref)?.id).toBe('ex-video')
        expect(missing).toEqual([])
    })
})

describe('resolveExercises · fallback por grupo/tipo', () => {
    it('el fallback prefiere una fila CON video antes que cualquiera del grupo', async () => {
        const { db, queries } = makeDb([
            noMedia('ex-sin', 'Otro de glúteos sin video', { muscle_group: 'Glúteos' }),
            withVideo('ex-con', 'Otro de glúteos con video', { muscle_group: 'Glúteos' }),
        ])
        const ref: ExerciseRef = { names: ['Ejercicio que no existe'], fallbackMuscleGroup: 'Glúteos' }

        const { byRef, missing } = await resolveExercises(db, [ref])

        expect(byRef.get(ref)).toEqual({ id: 'ex-con', name: 'Otro de glúteos con video' })
        // El nombre preferido sigue anotándose como faltante para el inventario.
        expect(missing).toEqual(['Ejercicio que no existe'])
        // Consulta por nombre + UNA sola de fallback: con video alcanzó, no hubo segunda vuelta.
        expect(queries).toHaveLength(2)
        expect(queries[1]?.requiresVideo).toBe(true)
    })

    it('si el grupo no tiene ninguna fila con video, cae en la que haya', async () => {
        const { db, queries } = makeDb([noMedia('ex-sin', 'Único del grupo', { muscle_group: 'Glúteos' })])
        const ref: ExerciseRef = { names: ['Ejercicio que no existe'], fallbackMuscleGroup: 'Glúteos' }

        const { byRef } = await resolveExercises(db, [ref])

        expect(byRef.get(ref)).toEqual({ id: 'ex-sin', name: 'Único del grupo' })
        // Nombre + fallback con video (vacío) + fallback sin filtro.
        expect(queries).toHaveLength(3)
        expect(queries[1]?.requiresVideo).toBe(true)
        expect(queries[2]?.requiresVideo).toBe(false)
    })

    it('sin fallback declarado el ref queda fuera del mapa y solo se anota como faltante', async () => {
        const { db } = makeDb([])
        const ref: ExerciseRef = { names: ['Ejercicio que no existe'] }

        const { byRef, missing } = await resolveExercises(db, [ref])

        expect(byRef.has(ref)).toBe(false)
        expect(missing).toEqual(['Ejercicio que no existe'])
    })
})
