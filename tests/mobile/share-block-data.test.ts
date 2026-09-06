// Las LÍNEAS del bloque de Share Entreno
// (`apps/mobile/components/alumno/share/share-block.ts`).
//
// El sticker no decide una sola palabra: pinta lo que devuelve `blockLines`. Por eso lo que se
// testea acá es la gramática y los fallbacks, que son donde el card puede MENTIR o quedar feo:
//
//   · sin volumen (cardio, movilidad, peso corporal) la cifra héroe pasa a ser las series — un
//     "0 kg" gigante sería la peor tarjeta posible justo cuando el alumno sí entrenó;
//   · con UNA serie el label es «Serie», no «Series» (y el eyebrow del fallback, «SERIE COMPLETADA»);
//   · sin músculos identificados la línea del grupo NO se imprime — un hueco con un nombre inventado
//     es peor que no decir nada;
//   · sin cronómetro la duración es lo que devuelva `formatSessionDuration`, que ya resuelve el "—"
//     (el bug de lectura del CEO, "0:40" leído como 40 minutos, se arregló ahí y no se re-implementa).
//
// El módulo es lógica pura (sin react-native): se importa directo, sin mocks.
import { describe, expect, it } from 'vitest'
import { formatSessionDuration } from '@eva/workout-engine'
import { blockLines } from '../../apps/mobile/components/alumno/share/share-block'
import type { WorkoutShareData } from '../../apps/mobile/components/alumno/share/share-types'

function data(over: Partial<WorkoutShareData> = {}): WorkoutShareData {
    return {
        title: 'Superior Día 1',
        contextLine: null,
        dateISO: '2026-09-06',
        durationSec: 42 * 60,
        totalVolumeKg: 960,
        completedSets: 12,
        totalReps: 96,
        records: [],
        muscles: [
            { group: 'hombros', vol: 520 },
            { group: 'tríceps', vol: 240 },
        ],
        exercises: [],
        streakCopy: null,
        brand: { name: 'Costa Fitness', logoUrl: null, accent: '#1462DC', instagramHandle: null },
        inviteUrl: null,
        ...over,
    }
}

describe('blockLines — entreno de fuerza normal', () => {
    it('imprime volumen, unidad y la fila de contexto', () => {
        const l = blockLines(data())
        expect(l.eyebrow).toBe('VOLUMEN TOTAL')
        expect(l.value).toBe('960')
        expect(l.unit).toBe('kg')
        expect(l.tiles).toEqual([
            { value: '42 min', label: 'Duración' },
            { value: '12', label: 'Series' },
            { value: '96', label: 'Reps' },
        ])
    })

    it('redondea el volumen: la cifra héroe no muestra decimales', () => {
        expect(blockLines(data({ totalVolumeKg: 12340.6 })).value).toBe('12341')
    })
})

describe('blockLines — sin volumen: la cifra pasa a ser las series', () => {
    it('cae al fallback y se queda SIN unidad', () => {
        const l = blockLines(data({ totalVolumeKg: 0, completedSets: 8 }))
        expect(l.eyebrow).toBe('SERIES COMPLETADAS')
        expect(l.value).toBe('8')
        expect(l.unit).toBeNull()
    })

    it('con una sola serie el eyebrow va en singular', () => {
        const l = blockLines(data({ totalVolumeKg: 0, completedSets: 1 }))
        expect(l.eyebrow).toBe('SERIE COMPLETADA')
        expect(l.value).toBe('1')
    })
})

describe('blockLines — singular de la fila', () => {
    it('«Serie» con una, «Series» con cualquier otra cantidad', () => {
        expect(blockLines(data({ completedSets: 1 })).tiles[1]).toEqual({ value: '1', label: 'Serie' })
        expect(blockLines(data({ completedSets: 2 })).tiles[1]).toEqual({ value: '2', label: 'Series' })
        expect(blockLines(data({ completedSets: 0 })).tiles[1]).toEqual({ value: '0', label: 'Series' })
    })
})

describe('blockLines — duración', () => {
    it('sin cronómetro devuelve lo que ya resuelve `formatSessionDuration`', () => {
        expect(blockLines(data({ durationSec: null })).tiles[0]).toEqual({
            value: formatSessionDuration(null),
            label: 'Duración',
        })
        // Y ese valor es el guion, no un "0 min" que se leería como un entreno de cero minutos.
        expect(formatSessionDuration(null)).toBe('—')
    })
})

describe('blockLines — grupo muscular', () => {
    it('toma el de más volumen y lo capitaliza (el catálogo trae formatos mixtos)', () => {
        expect(blockLines(data()).muscleLabel).toBe('Hombros')
        expect(blockLines(data({ muscles: [{ group: 'Piernas', vol: 1200 }] })).muscleLabel).toBe('Piernas')
    })

    it('sin músculos la línea no existe', () => {
        expect(blockLines(data({ muscles: [] })).muscleLabel).toBeNull()
    })

    it('con todos los grupos en cero tampoco: no se afirma un músculo que no se trabajó', () => {
        expect(blockLines(data({ muscles: [{ group: 'core', vol: 0 }] })).muscleLabel).toBeNull()
    })

    it('saltea los grupos en cero que vengan antes que uno con volumen', () => {
        const l = blockLines(
            data({
                muscles: [
                    { group: 'core', vol: 0 },
                    { group: 'espalda', vol: 800 },
                ],
            }),
        )
        expect(l.muscleLabel).toBe('Espalda')
    })
})
