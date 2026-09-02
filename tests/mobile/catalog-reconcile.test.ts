import { describe, expect, it } from 'vitest'
import {
    catalogFactsById,
    reconcileBlockWithCatalog,
    reconcileDaysWithCatalog,
    type CatalogExerciseFacts,
} from '../../apps/mobile/lib/plan-builder/catalog-reconcile'
import type { BuilderBlock, DayState } from '../../apps/mobile/lib/plan-builder/types'

/**
 * E1-RN — el bloque ya colocado en el día conserva el nombre/media/tipo viejos después de editar
 * el ejercicio propio desde el catálogo del builder.
 *
 * Lo que este test pinnea:
 *  - que el espejo del catálogo (nombre, grupo muscular, media, tipo, modalidad de cardio) se
 *    actualice;
 *  - que la PRESCRIPCIÓN del coach (series, reps, descanso, notas, superserie, área, el override
 *    de tipo) NO se toque: es del bloque, no del ejercicio;
 *  - la IDENTIDAD estable cuando no hay nada que cambiar — de eso depende que el builder no marque
 *    el programa como «sin guardar» ni dispare autosave por una relectura que volvió idéntica;
 *  - que un ejercicio que ya no está en el catálogo (eliminado) deje el bloque intacto en vez de
 *    dejarlo sin nombre.
 *
 * PUREZA: el módulo bajo prueba no importa react-native, expo ni supabase. Si alguien le agrega
 * uno, este archivo deja de cargar en el runner de la raíz y CI lo muestra.
 */

function block(overrides: Partial<BuilderBlock> = {}): BuilderBlock {
    return {
        uid: 'block-1',
        exercise_id: 'ex-1',
        exercise_name: 'Press banca',
        muscle_group: 'Pecho',
        gif_url: 'https://cdn/viejo.gif',
        video_url: undefined,
        sets: 4,
        reps: '8-10',
        rest_time: '90s',
        notes: 'Codos a 45°',
        superset_group: 'A',
        section: 'main',
        exercise_type: 'strength',
        exercise_type_override: 'mobility',
        cardio_modality: null,
        ...overrides,
    } as BuilderBlock
}

function facts(overrides: Partial<CatalogExerciseFacts> = {}): CatalogExerciseFacts {
    return {
        id: 'ex-1',
        name: 'Press banca plano',
        muscle_group: 'Pectoral',
        gif_url: 'https://cdn/nuevo.gif',
        video_url: 'https://youtu.be/abc',
        exercise_type: 'strength',
        cardio_modality: null,
        ...overrides,
    }
}

function day(blocks: BuilderBlock[], id = 1): DayState {
    return { id, name: `Día ${id}`, title: `Día ${id}`, blocks }
}

describe('reconcileBlockWithCatalog', () => {
    it('trae nombre, grupo muscular y media nuevos del catálogo', () => {
        const next = reconcileBlockWithCatalog(block(), facts())

        expect(next.exercise_name).toBe('Press banca plano')
        expect(next.muscle_group).toBe('Pectoral')
        expect(next.gif_url).toBe('https://cdn/nuevo.gif')
        expect(next.video_url).toBe('https://youtu.be/abc')
    })

    it('NO toca la prescripción del coach ni su override de tipo', () => {
        const original = block()
        const next = reconcileBlockWithCatalog(original, facts({ exercise_type: 'cardio' }))

        expect(next.sets).toBe(4)
        expect(next.reps).toBe('8-10')
        expect(next.rest_time).toBe('90s')
        expect(next.notes).toBe('Codos a 45°')
        expect(next.superset_group).toBe('A')
        expect(next.section).toBe('main')
        expect(next.uid).toBe('block-1')
        // El override es del BLOQUE: el tipo del catálogo cambió, el override sigue siendo el suyo.
        expect(next.exercise_type_override).toBe('mobility')
        expect(next.exercise_type).toBe('cardio')
    })

    it('actualiza la modalidad de cardio (unidad propia del objetivo)', () => {
        const next = reconcileBlockWithCatalog(
            block({ exercise_type: 'cardio', cardio_modality: null }),
            facts({ exercise_type: 'cardio', cardio_modality: 'jump_rope' }),
        )

        expect(next.cardio_modality).toBe('jump_rope')
    })

    it('media borrada en el catálogo ⇒ el bloque se queda sin media (no con la vieja)', () => {
        const next = reconcileBlockWithCatalog(block(), facts({ gif_url: null, video_url: '  ' }))

        expect(next.gif_url).toBeUndefined()
        expect(next.video_url).toBeUndefined()
    })

    it('sin fila de catálogo (ejercicio eliminado) devuelve el MISMO bloque', () => {
        const original = block()

        expect(reconcileBlockWithCatalog(original, undefined)).toBe(original)
    })

    it('catálogo idéntico ⇒ misma referencia (no hay «cambio» que reportar)', () => {
        const original = block({
            exercise_name: 'Press banca plano',
            muscle_group: 'Pectoral',
            gif_url: 'https://cdn/nuevo.gif',
            video_url: 'https://youtu.be/abc',
            exercise_type: 'strength',
            cardio_modality: null,
        })

        expect(reconcileBlockWithCatalog(original, facts())).toBe(original)
    })

    it('un tipo desconocido del catálogo no borra el que el bloque ya tenía', () => {
        const original = block({ exercise_type: 'strength' })
        const next = reconcileBlockWithCatalog(original, facts({ exercise_type: 'yoga' }))

        // El resto del espejo sí se actualiza; lo único que se conserva es el tipo conocido.
        expect(next.exercise_type).toBe('strength')
        expect(next.exercise_name).toBe('Press banca plano')
    })

    it('un tipo desconocido, y nada más que cambiar, devuelve el MISMO bloque', () => {
        const original = block({
            exercise_name: 'Press banca plano',
            muscle_group: 'Pectoral',
            gif_url: 'https://cdn/nuevo.gif',
            video_url: 'https://youtu.be/abc',
            exercise_type: 'strength',
        })

        expect(reconcileBlockWithCatalog(original, facts({ exercise_type: 'yoga' }))).toBe(original)
    })

    it('un nombre vacío en el catálogo no deja el bloque anónimo', () => {
        const next = reconcileBlockWithCatalog(block(), facts({ name: '   ', muscle_group: '' }))

        expect(next.exercise_name).toBe('Press banca')
        expect(next.muscle_group).toBe('Pecho')
    })
})

describe('reconcileDaysWithCatalog', () => {
    const catalog = catalogFactsById([facts()])

    it('actualiza TODAS las apariciones del ejercicio, en todos los días', () => {
        const days = [
            day([block(), block({ uid: 'block-2' })], 1),
            day([block({ uid: 'block-3' })], 2),
        ]

        const next = reconcileDaysWithCatalog(days, catalog)

        expect(next.flatMap((d) => d.blocks).map((b) => b.exercise_name)).toEqual([
            'Press banca plano',
            'Press banca plano',
            'Press banca plano',
        ])
    })

    it('los bloques de OTROS ejercicios quedan intactos, y su día conserva identidad', () => {
        const otro = block({ uid: 'block-9', exercise_id: 'ex-9', exercise_name: 'Sentadilla' })
        const diaIntacto = day([otro], 2)
        const days = [day([block()], 1), diaIntacto]

        const next = reconcileDaysWithCatalog(days, catalog)

        expect(next[1]).toBe(diaIntacto)
        expect(next[1].blocks[0]).toBe(otro)
        expect(next[0]).not.toBe(days[0])
    })

    it('nada que cambiar ⇒ MISMO array (el builder no marca «sin guardar»)', () => {
        const days = [day([block({ exercise_id: 'ex-9' })], 1)]

        expect(reconcileDaysWithCatalog(days, catalog)).toBe(days)
    })

    it('catálogo vacío (la relectura falló) ⇒ MISMO array', () => {
        const days = [day([block()], 1)]

        expect(reconcileDaysWithCatalog(days, new Map())).toBe(days)
    })

    it('día de descanso sin bloques no rompe ni cambia de identidad', () => {
        const descanso: DayState = { id: 3, name: 'Día 3', title: 'Descanso', blocks: [], is_rest: true }
        const days = [descanso]

        expect(reconcileDaysWithCatalog(days, catalog)).toBe(days)
    })
})
