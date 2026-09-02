import { describe, it, expect } from 'vitest'
import type { Tables } from '@/lib/database.types'
import {
    parseProgramPhases,
    embeddedExerciseRow,
    mapDbBlockToBuilderBlock,
    enrichDaysWithExerciseMedia,
    createDefaultBlock,
    reconcileDaysWithExercise,
} from './program-read-mappers'
import type { DayState } from './types'

/**
 * Golden master del slice (Fase 2 — el archivo más riesgoso). Fija el camino de LECTURA del
 * builder (DB row -> estado), porque alimenta lo que el coach ve y luego guarda. Cualquier drift
 * aquí cambiaría programas. Extraído verbatim; este test garantiza el split behavior-preserving.
 */

type Exercise = Tables<'exercises'>
const ex = (p: Partial<Exercise>): Exercise => p as Exercise

describe('parseProgramPhases', () => {
    it('null / inválido -> []', () => {
        expect(parseProgramPhases(null)).toEqual([])
        expect(parseProgramPhases(undefined)).toEqual([])
        expect(parseProgramPhases('{no-json')).toEqual([])
        expect(parseProgramPhases(42)).toEqual([])
    })
    it('clampa weeks 1..52, name slice 80, color # default', () => {
        expect(parseProgramPhases([{ name: 'Volumen', weeks: 4, color: '#abc' }])).toEqual([
            { name: 'Volumen', weeks: 4, color: '#abc' },
        ])
        expect(parseProgramPhases([{ weeks: 0 }, { weeks: 999, color: 'rojo' }])).toEqual([
            { name: 'Fase 1', weeks: 1, color: '#6366F1' },
            { name: 'Fase 2', weeks: 52, color: '#6366F1' },
        ])
    })
    it('acepta JSON string', () => {
        expect(parseProgramPhases('[{"name":"X","weeks":3,"color":"#fff"}]')).toEqual([
            { name: 'X', weeks: 3, color: '#fff' },
        ])
    })
})

describe('embeddedExerciseRow', () => {
    it('objeto / array-de-uno / vacío / primitivo', () => {
        expect(embeddedExerciseRow({ name: 'A' })).toEqual({ name: 'A' })
        expect(embeddedExerciseRow([{ name: 'B' }])).toEqual({ name: 'B' })
        expect(embeddedExerciseRow([])).toBeNull()
        expect(embeddedExerciseRow(null)).toBeNull()
        expect(embeddedExerciseRow(7)).toBeNull()
    })
})

describe('mapDbBlockToBuilderBlock', () => {
    it('fila legacy (polimórfico todo NULL) mapea byte-identical', () => {
        const block = mapDbBlockToBuilderBlock(
            { exercise_id: 'e1', sets: 4, reps: '10', target_weight_kg: 20, section: 'warmup', section_template_id: 'tpl-1', is_override: 1, exercises: { name: 'Press', muscle_group: 'Pecho' } },
            new Map(),
            'uid-1',
            3,
        )
        expect(block).toMatchObject({
            uid: 'uid-1',
            exercise_id: 'e1',
            exercise_name: 'Press',
            muscle_group: 'Pecho',
            sets: 4,
            reps: '10',
            target_weight_kg: '20',
            section: 'warmup',
            section_template_id: 'tpl-1',
            is_override: true,
            exercise_type: null,
            load_value: '',
            distance_value: '',
            dayId: 3,
        })
    })
    it('preserva is_unilateral y extra_targets (cardio/movilidad: antes se perdían al guardar)', () => {
        const block = mapDbBlockToBuilderBlock(
            { exercise_id: 'e3', sets: 3, reps: '30s', duration_sec: 30, is_unilateral: true, extra_targets: { glutes: 0.3, core: 0.2 } },
            new Map(),
            'uid-3',
            2,
        )
        expect(block.is_unilateral).toBe(true)
        expect(block.extra_targets).toEqual({ glutes: 0.3, core: 0.2 })
    })
    it('warmup_rest_time: viaja cuando existe; ausente -> "" (Fase M 8b)', () => {
        const withWarmup = mapDbBlockToBuilderBlock(
            { exercise_id: 'e4', sets: 4, reps: '5', rest_time: '3min', warmup_rest_time: '60s' },
            new Map(),
            'uid-4',
            1,
        )
        expect(withWarmup.warmup_rest_time).toBe('60s')
        expect(withWarmup.rest_time).toBe('3min')

        const legacy = mapDbBlockToBuilderBlock(
            { exercise_id: 'e5', sets: 3, reps: '10' },
            new Map(),
            'uid-5',
            1,
        )
        expect(legacy.warmup_rest_time).toBe('')
    })
    it('section desconocida -> main; usa catálogo si no hay FK embebida', () => {
        const cat = ex({ id: 'e2', name: 'Sentadilla', muscle_group: 'Pierna', gif_url: 'g.gif' })
        const block = mapDbBlockToBuilderBlock(
            { exercise_id: 'e2', section: 'xxx', target_weight_kg: null },
            new Map([['e2', cat]]),
            'uid-2',
            1,
        )
        expect(block.section).toBe('main')
        expect(block.exercise_name).toBe('Sentadilla')
        expect(block.gif_url).toBe('g.gif')
        expect(block.target_weight_kg).toBe('')
    })
})

describe('enrichDaysWithExerciseMedia', () => {
    it('rellena media faltante desde el catálogo, sin pisar la existente', () => {
        const days: DayState[] = [
            { id: 1, name: 'Lunes', title: 'L', is_rest: false, blocks: [
                { uid: 'b1', exercise_id: 'e1', gif_url: undefined, video_url: 'ya.mp4' } as DayState['blocks'][number],
            ] },
        ]
        const out = enrichDaysWithExerciseMedia(days, new Map([['e1', ex({ id: 'e1', gif_url: 'cat.gif', video_url: 'cat.mp4' })]]))
        expect(out[0].blocks[0].gif_url).toBe('cat.gif') // faltaba -> del catálogo
        expect(out[0].blocks[0].video_url).toBe('ya.mp4') // existía -> se preserva
    })
})

describe('createDefaultBlock', () => {
    it('strength: defaults de siempre (sets 3, reps 8-12, rest 90s)', () => {
        const b = createDefaultBlock(ex({ id: 'e1', name: 'Press', muscle_group: 'Pecho', exercise_type: 'strength' }))
        expect(b).toMatchObject({ sets: 3, reps: '8-12', rest_time: '90s', section: 'main' })
        expect(b.uid).toMatch(/^new-/)
    })
    it('cardio / mobility / roller: defaults por tipo', () => {
        expect(createDefaultBlock(ex({ id: 'c', name: 'Bici', muscle_group: '-', exercise_type: 'cardio' }))).toMatchObject({ sets: 1, reps: '10min', duration_sec: 600, rest_time: '' })
        expect(createDefaultBlock(ex({ id: 'm', name: 'Estiramiento', muscle_group: '-', exercise_type: 'mobility' }))).toMatchObject({ sets: 3, reps: '30s', duration_sec: 30, rest_time: '' })
        expect(createDefaultBlock(ex({ id: 'r', name: 'Foam', muscle_group: '-', exercise_type: 'roller' }))).toMatchObject({ sets: 1, reps: '10 pasadas', reps_value: 10, reps_unit: 'passes', rest_time: '' })
    })
})

/**
 * E1 — un bloque YA colocado conserva el nombre/media que copió al crearse. Al volver de editar el
 * ejercicio desde el propio builder hay que reconciliar, y a diferencia de `enrich…` acá el
 * catálogo PISA (incluso a vacío: si el coach le sacó el GIF, el bloque tiene que perderlo).
 */
describe('reconcileDaysWithExercise', () => {
    const daysWith = (blocks: Partial<DayState['blocks'][number]>[]): DayState[] => [
        { id: 1, name: 'Lunes', title: 'L', is_rest: false, blocks: blocks as DayState['blocks'] },
    ]

    it('pisa nombre, músculo y media de los bloques del ejercicio editado', () => {
        const days = daysWith([
            { uid: 'b1', exercise_id: 'e1', exercise_name: 'Press viejo', muscle_group: 'Pecho', gif_url: 'viejo.gif', sets: 4, reps: '10', notes: 'tocar el pecho' },
            { uid: 'b2', exercise_id: 'e2', exercise_name: 'Remo', muscle_group: 'Espalda', gif_url: 'remo.gif' },
        ])
        const out = reconcileDaysWithExercise(days, ex({
            id: 'e1', name: 'Press nuevo', muscle_group: 'Pectoral', gif_url: 'nuevo.gif',
            video_url: 'v.mp4', thumbnail_url: 't.webp', exercise_type: 'strength',
        }))

        expect(out[0].blocks[0]).toMatchObject({
            exercise_name: 'Press nuevo',
            muscle_group: 'Pectoral',
            gif_url: 'nuevo.gif',
            video_url: 'v.mp4',
            thumbnail_url: 't.webp',
            exercise_type: 'strength',
        })
        // La prescripción del coach queda intacta.
        expect(out[0].blocks[0]).toMatchObject({ sets: 4, reps: '10', notes: 'tocar el pecho' })
        // Los bloques de OTRO ejercicio no se tocan (misma referencia).
        expect(out[0].blocks[1]).toBe(days[0].blocks[1])
    })

    it('media borrada en el catálogo ⇒ el bloque la pierde (no la conserva como enrich)', () => {
        const days = daysWith([{ uid: 'b1', exercise_id: 'e1', exercise_name: 'Press', gif_url: 'viejo.gif', video_url: 'viejo.mp4' }])
        const out = reconcileDaysWithExercise(days, ex({ id: 'e1', name: 'Press', muscle_group: 'Pecho', gif_url: null, video_url: null }))
        expect(out[0].blocks[0].gif_url).toBeUndefined()
        expect(out[0].blocks[0].video_url).toBeUndefined()
    })

    it('preserva el override de tipo del bloque y actualiza modalidad de cardio', () => {
        const days = daysWith([{ uid: 'b1', exercise_id: 'e1', exercise_name: 'Cuerda', exercise_type: 'strength', exercise_type_override: 'mobility' }])
        const out = reconcileDaysWithExercise(days, ex({ id: 'e1', name: 'Cuerda', muscle_group: '-', exercise_type: 'cardio', cardio_modality: 'jump_rope' }))
        expect(out[0].blocks[0].exercise_type).toBe('cardio')
        expect(out[0].blocks[0].cardio_modality).toBe('jump_rope')
        expect(out[0].blocks[0].exercise_type_override).toBe('mobility')
    })

    it('ningún bloque referencia al ejercicio ⇒ devuelve el MISMO array (sin re-render)', () => {
        const days = daysWith([{ uid: 'b1', exercise_id: 'e2', exercise_name: 'Remo' }])
        expect(reconcileDaysWithExercise(days, ex({ id: 'e1', name: 'Press', muscle_group: 'Pecho' }))).toBe(days)
    })
})
