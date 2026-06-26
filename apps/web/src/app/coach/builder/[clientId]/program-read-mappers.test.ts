import { describe, it, expect } from 'vitest'
import type { Tables } from '@/lib/database.types'
import {
    parseProgramPhases,
    embeddedExerciseRow,
    mapDbBlockToBuilderBlock,
    enrichDaysWithExerciseMedia,
    createDefaultBlock,
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
