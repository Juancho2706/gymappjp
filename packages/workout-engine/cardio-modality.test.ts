import { describe, it, expect } from 'vitest'
import {
    CARDIO_MODALITIES,
    CARDIO_MODALITY_GENERIC_LABEL,
    CARDIO_MODALITY_LABEL,
    CARDIO_MODALITY_OPTIONS,
    CARDIO_REPS_UNITS,
    cardioAxesFor,
    cardioAxesHint,
    cardioAxisLabels,
    cardioHasDistanceAxis,
    cardioModalityLabel,
    cardioRepsLabel,
    cardioRepsUnitShort,
    formatCardioReps,
    normalizeCardioModality,
    normalizeCardioRepsUnit,
    repsUnitForModality,
    type CardioModality,
} from './cardio-modality'
import { typedKeypadFields } from './typed-keypad'

/**
 * Ejes de captura por modalidad (Fase C · mapa aprobado por el owner):
 *   run/bike/row → Min · Distancia · FC · elliptical → Min · FC
 *   jump_rope → Min · Saltos · FC · hiit_reps → Min · Reps · FC · stairs → Min · Pisos · FC
 *   null/desconocida → Min · Distancia · FC (comportamiento histórico, planes viejos intactos)
 */
const keys = (m: string | null) => cardioAxesFor(m).map((f) => f.key)
const labels = (m: string | null) => cardioAxesFor(m).map((f) => f.label)

describe('normalizeCardioModality', () => {
    it('acepta las 7 modalidades del CHECK de la migración', () => {
        expect(CARDIO_MODALITIES).toEqual(['run', 'bike', 'row', 'elliptical', 'jump_rope', 'hiit_reps', 'stairs'])
        for (const m of CARDIO_MODALITIES) expect(normalizeCardioModality(m)).toBe(m)
    })

    it('null / vacío / desconocida ⇒ null (genérica)', () => {
        expect(normalizeCardioModality(null)).toBeNull()
        expect(normalizeCardioModality(undefined)).toBeNull()
        expect(normalizeCardioModality('')).toBeNull()
        expect(normalizeCardioModality('swim')).toBeNull()
        expect(normalizeCardioModality('RUN')).toBeNull()
    })
})

describe('repsUnitForModality / cardioHasDistanceAxis', () => {
    it('solo cuerda, HIIT y escaladora capturan conteo', () => {
        expect(repsUnitForModality('jump_rope')).toBe('jumps')
        expect(repsUnitForModality('hiit_reps')).toBe('reps')
        expect(repsUnitForModality('stairs')).toBe('floors')
        for (const m of ['run', 'bike', 'row', 'elliptical', null, 'swim'] as const) {
            expect(repsUnitForModality(m)).toBeNull()
        }
    })

    it('elíptica y las rep-based no piden distancia; el resto sí (genérica incluida)', () => {
        expect(cardioHasDistanceAxis('run')).toBe(true)
        expect(cardioHasDistanceAxis('bike')).toBe(true)
        expect(cardioHasDistanceAxis('row')).toBe(true)
        expect(cardioHasDistanceAxis(null)).toBe(true)
        expect(cardioHasDistanceAxis('swim')).toBe(true)
        expect(cardioHasDistanceAxis('elliptical')).toBe(false)
        expect(cardioHasDistanceAxis('jump_rope')).toBe(false)
        expect(cardioHasDistanceAxis('hiit_reps')).toBe(false)
        expect(cardioHasDistanceAxis('stairs')).toBe(false)
    })

    it('unidades rep-based: lista, normalización y etiquetas', () => {
        expect(CARDIO_REPS_UNITS).toEqual(['jumps', 'floors', 'reps'])
        expect(normalizeCardioRepsUnit('jumps')).toBe('jumps')
        expect(normalizeCardioRepsUnit('floors')).toBe('floors')
        expect(normalizeCardioRepsUnit('reps')).toBe('reps')
        // Unidades de OTROS tipos (roller/movilidad) no son rep-based de cardio.
        expect(normalizeCardioRepsUnit('passes')).toBeNull()
        expect(normalizeCardioRepsUnit('breaths')).toBeNull()
        expect(normalizeCardioRepsUnit(null)).toBeNull()
        expect(cardioRepsLabel('jumps')).toBe('Saltos')
        expect(cardioRepsLabel('floors')).toBe('Pisos')
        expect(cardioRepsLabel('reps')).toBe('Reps')
        expect(cardioRepsUnitShort('jumps')).toBe('saltos')
        expect(cardioRepsUnitShort('floors')).toBe('pisos')
        expect(cardioRepsUnitShort('reps')).toBe('reps')
    })

    it('formatCardioReps: singular correcto y fallback genérico', () => {
        expect(formatCardioReps(420, 'jumps')).toBe('420 saltos')
        expect(formatCardioReps(1, 'jumps')).toBe('1 salto')
        expect(formatCardioReps(45, 'floors')).toBe('45 pisos')
        expect(formatCardioReps(1, 'floors')).toBe('1 piso')
        expect(formatCardioReps(30, 'reps')).toBe('30 reps')
        expect(formatCardioReps(1, null)).toBe('1 rep')
        expect(formatCardioReps(12, null)).toBe('12 reps')
    })
})

describe('cardioAxesFor — mapa completo aprobado', () => {
    it('run · bike · row ⇒ Min · Metros · FC', () => {
        for (const m of ['run', 'bike', 'row'] as CardioModality[]) {
            expect(keys(m)).toEqual(['cardio_min', 'actual_distance_m', 'actual_avg_hr'])
            expect(labels(m)).toEqual(['Min', 'Metros', 'FC'])
        }
    })

    it('elliptical ⇒ SOLO Min · FC (sin caja de distancia)', () => {
        expect(keys('elliptical')).toEqual(['cardio_min', 'actual_avg_hr'])
        expect(labels('elliptical')).toEqual(['Min', 'FC'])
    })

    it('jump_rope ⇒ Min · Saltos · FC (conteo entero en reps_done)', () => {
        expect(keys('jump_rope')).toEqual(['cardio_min', 'reps_done', 'actual_avg_hr'])
        expect(cardioAxesFor('jump_rope')[1]).toEqual({
            key: 'reps_done',
            label: 'Saltos',
            unit: 'saltos',
            allowDecimal: false,
        })
    })

    it('hiit_reps ⇒ Min · Reps · FC', () => {
        expect(labels('hiit_reps')).toEqual(['Min', 'Reps', 'FC'])
        expect(cardioAxesFor('hiit_reps')[1]).toMatchObject({ key: 'reps_done', unit: 'reps', allowDecimal: false })
    })

    it('stairs ⇒ Min · Pisos · FC', () => {
        expect(labels('stairs')).toEqual(['Min', 'Pisos', 'FC'])
        expect(cardioAxesFor('stairs')[1]).toMatchObject({ key: 'reps_done', unit: 'pisos', allowDecimal: false })
    })

    it('null / desconocida ⇒ los 3 ejes de siempre, byte-idénticos', () => {
        const generico = [
            { key: 'cardio_min', label: 'Min', unit: 'min', allowDecimal: true },
            { key: 'actual_distance_m', label: 'Metros', unit: 'm', allowDecimal: true },
            { key: 'actual_avg_hr', label: 'FC', unit: 'bpm', allowDecimal: false },
        ]
        expect(cardioAxesFor(null)).toEqual(generico)
        expect(cardioAxesFor(undefined)).toEqual(generico)
        expect(cardioAxesFor('swim')).toEqual(generico)
        expect(cardioAxesFor(null)).toEqual(typedKeypadFields('cardio'))
    })

    it('minutos siempre primero y FC siempre última, en todas las modalidades', () => {
        for (const m of [...CARDIO_MODALITIES, null]) {
            const axes = cardioAxesFor(m)
            expect(axes[0].key).toBe('cardio_min')
            expect(axes[axes.length - 1].key).toBe('actual_avg_hr')
            expect(axes.length).toBe(m === 'elliptical' ? 2 : 3)
        }
    })
})

describe('cardioAxesFor — la distancia respeta la unidad prescrita (A1/RF4)', () => {
    it('km ⇒ caja "Km" decimal con factor a metros, en las modalidades con distancia', () => {
        for (const m of ['run', 'bike', 'row', null]) {
            expect(cardioAxesFor(m, { distanceUnit: 'km' })[1]).toEqual({
                key: 'actual_distance_m',
                label: 'Km',
                unit: 'km',
                allowDecimal: true,
                toColumnFactor: 1000,
            })
        }
    })

    it('la unidad prescrita no inventa distancia donde la modalidad no la tiene', () => {
        expect(keys('elliptical')).toEqual(cardioAxesFor('elliptical', { distanceUnit: 'km' }).map((f) => f.key))
        expect(cardioAxesFor('jump_rope', { distanceUnit: 'km' }).map((f) => f.key)).toEqual([
            'cardio_min',
            'reps_done',
            'actual_avg_hr',
        ])
    })
})

describe('etiquetas del selector del coach (fuente única web + RN)', () => {
    it('label por modalidad + fallback genérico', () => {
        expect(cardioModalityLabel('jump_rope')).toBe('Saltar la cuerda')
        expect(cardioModalityLabel('stairs')).toBe('Escaladora')
        expect(cardioModalityLabel(null)).toBe(CARDIO_MODALITY_GENERIC_LABEL)
        expect(cardioModalityLabel('swim')).toBe(CARDIO_MODALITY_GENERIC_LABEL)
        for (const m of CARDIO_MODALITIES) expect(cardioModalityLabel(m)).toBe(CARDIO_MODALITY_LABEL[m])
    })

    it('los chips de preview salen del mapa de ejes, no de una lista paralela', () => {
        expect(cardioAxisLabels(null)).toEqual(['Min', 'Distancia', 'FC'])
        expect(cardioAxisLabels('run')).toEqual(['Min', 'Distancia', 'FC'])
        expect(cardioAxisLabels('elliptical')).toEqual(['Min', 'FC'])
        expect(cardioAxisLabels('jump_rope')).toEqual(['Min', 'Saltos', 'FC'])
        expect(cardioAxisLabels('hiit_reps')).toEqual(['Min', 'Reps', 'FC'])
        expect(cardioAxisLabels('stairs')).toEqual(['Min', 'Pisos', 'FC'])
        expect(cardioAxesHint('jump_rope')).toBe('Min · Saltos · FC')
        // Un eje nuevo/renombrado en `cardioAxesFor` viaja solo al preview del formulario.
        for (const m of [...CARDIO_MODALITIES, null]) {
            expect(cardioAxisLabels(m)).toHaveLength(cardioAxesFor(m).length)
        }
    })

    it('con unidad prescrita la distancia usa el label real del eje', () => {
        expect(cardioAxisLabels('run', { distanceUnit: 'km' })).toEqual(['Min', 'Km', 'FC'])
        expect(cardioAxisLabels('run', { distanceUnit: 'm' })).toEqual(['Min', 'Metros', 'FC'])
    })

    it('opciones del selector: genérica primero y las 7 modalidades del CHECK', () => {
        expect(CARDIO_MODALITY_OPTIONS.map((o) => o.value)).toEqual(['', ...CARDIO_MODALITIES])
        expect(CARDIO_MODALITY_OPTIONS[0]).toEqual({
            value: '',
            label: 'Genérica',
            axisLabels: ['Min', 'Distancia', 'FC'],
            hint: 'Min · Distancia · FC',
        })
        for (const o of CARDIO_MODALITY_OPTIONS) {
            expect(o.label).toBe(cardioModalityLabel(o.value || null))
            expect(o.hint).toBe(cardioAxesHint(o.value || null))
        }
    })
})

describe('typedKeypadFields delega la modalidad al motor de ejes', () => {
    it('cardioModality en el contexto ⇒ mismos ejes que cardioAxesFor', () => {
        for (const m of [...CARDIO_MODALITIES, null]) {
            expect(typedKeypadFields('cardio', { cardioModality: m })).toEqual(cardioAxesFor(m))
            expect(typedKeypadFields('cardio', { cardioModality: m, distanceUnit: 'km' })).toEqual(
                cardioAxesFor(m, { distanceUnit: 'km' }),
            )
        }
    })

    it('la modalidad no toca movilidad ni roller', () => {
        expect(typedKeypadFields('mobility', { cardioModality: 'jump_rope' })).toEqual(typedKeypadFields('mobility'))
        expect(typedKeypadFields('roller', { cardioModality: 'stairs' })).toEqual(typedKeypadFields('roller'))
    })
})
