import { describe, expect, it } from 'vitest'
import {
    compactDistance,
    compactDuration,
    effectiveExerciseType,
    formatProgressionTag,
    formatStrengthTimeObjective,
    formatStrengthTimeObjectiveLong,
    hasTypedPrescription,
    isStrengthTimeBlock,
    legacyRepsSummaryFor,
    sideRepsFromMetadata,
    sideSuffix,
    STRENGTH_TIME_REPS_UNIT,
    typedBlockSummary,
} from './workout-exercise-type'

describe('effectiveExerciseType', () => {
    it('prioriza el override del bloque', () => {
        expect(effectiveExerciseType({ exercise_type_override: 'cardio' }, { exercise_type: 'strength' })).toBe('cardio')
    })
    it('cae al tipo del ejercicio sin override', () => {
        expect(effectiveExerciseType({ exercise_type_override: null }, { exercise_type: 'mobility' })).toBe('mobility')
    })
    it('legacy sin nada → strength', () => {
        expect(effectiveExerciseType(null, null)).toBe('strength')
        expect(effectiveExerciseType({}, {})).toBe('strength')
    })
    it('ignora valores desconocidos', () => {
        expect(effectiveExerciseType({ exercise_type_override: 'garbage' }, { exercise_type: 'roller' })).toBe('roller')
        expect(effectiveExerciseType({ exercise_type_override: 'garbage' }, { exercise_type: 'nope' })).toBe('strength')
    })
})

describe('hasTypedPrescription', () => {
    it('detecta duración/distancia/zona/pace/intervalos/unidad no-reps', () => {
        expect(hasTypedPrescription({ duration_sec: 30 })).toBe(true)
        expect(hasTypedPrescription({ distance_value: 400 })).toBe(true)
        expect(hasTypedPrescription({ hr_zone: 4 })).toBe(true)
        expect(hasTypedPrescription({ target_pace_sec_per_km: 300 })).toBe(true)
        expect(hasTypedPrescription({ interval_config: {} })).toBe(true)
        expect(hasTypedPrescription({ reps_value: 10, reps_unit: 'passes' })).toBe(true)
    })
    it('bloque strength puro → false', () => {
        expect(hasTypedPrescription({ sets: 3, reps: '8-10', reps_value: 10, reps_unit: 'reps' })).toBe(false)
        expect(hasTypedPrescription({})).toBe(false)
    })
})

describe('compactDuration', () => {
    it('segundos, minutos exactos y mixtos', () => {
        expect(compactDuration(45)).toBe('45s')
        expect(compactDuration(300)).toBe('5min')
        expect(compactDuration(75)).toBe('1m15s')
    })
})

describe('compactDistance', () => {
    it('metros vs km', () => {
        expect(compactDistance(400, 'm')).toBe('400m')
        expect(compactDistance(5000, 'm')).toBe('5km')
        expect(compactDistance(3, 'km')).toBe('3km')
        expect(compactDistance(7.5, 'm')).toBe('7.5m')
    })
})

// ── R27 · lectura de los lados registrados ───────────────────────────────────

describe('sideRepsFromMetadata', () => {
    it('acepta enteros 0..9999 en los DOS lados', () => {
        expect(sideRepsFromMetadata({ left_reps: 10, right_reps: 8 })).toEqual({ left: 10, right: 8 })
        expect(sideRepsFromMetadata({ left_reps: 0, right_reps: 0 })).toEqual({ left: 0, right: 0 })
        expect(sideRepsFromMetadata({ left_reps: 9999, right_reps: 9999 })).toEqual({ left: 9999, right: 9999 })
    })

    it('acepta cadenas de 1 a 4 dígitos (paridad con el `->>` del SQL)', () => {
        expect(sideRepsFromMetadata({ left_reps: '10', right_reps: '10' })).toEqual({ left: 10, right: 10 })
        expect(sideRepsFromMetadata({ left_reps: '0010', right_reps: 8 })).toEqual({ left: 10, right: 8 })
    })

    it('rechaza el lado único', () => {
        expect(sideRepsFromMetadata({ left_reps: 10 })).toBeNull()
        expect(sideRepsFromMetadata({ right_reps: 10 })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: 10, right_reps: null })).toBeNull()
    })

    it('rechaza fuera de rango, decimales, negativos y desbordes', () => {
        expect(sideRepsFromMetadata({ left_reps: -1, right_reps: 10 })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: 10.5, right_reps: 10 })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: 99999, right_reps: 10 })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: 1e30, right_reps: 10 })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: NaN, right_reps: 10 })).toBeNull()
    })

    it('rechaza cadenas no numéricas, booleanos, objetos y arrays', () => {
        expect(sideRepsFromMetadata({ left_reps: 'abc', right_reps: '10' })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: '10.5', right_reps: '10' })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: '-1', right_reps: '10' })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: ' 10', right_reps: '10' })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: true, right_reps: 10 })).toBeNull()
        expect(sideRepsFromMetadata({ left_reps: { v: 10 }, right_reps: 10 })).toBeNull()
        expect(sideRepsFromMetadata([10, 10])).toBeNull()
    })

    it('rechaza metadata ausente, null o de otra forma (movilidad por lado)', () => {
        expect(sideRepsFromMetadata(null)).toBeNull()
        expect(sideRepsFromMetadata(undefined)).toBeNull()
        expect(sideRepsFromMetadata({})).toBeNull()
        expect(sideRepsFromMetadata({ left_sec: 30, right_sec: 25 })).toBeNull()
        expect(sideRepsFromMetadata('10/10')).toBeNull()
    })
})

describe('sideRepsFromMetadata ↔ SQL: paridad con el regex ^[0-9]{1,4}$', () => {
    // Espejo del `CASE WHEN metadata->>'left_reps' ~ '^[0-9]{1,4}$' AND … THEN suma ELSE reps_done`
    // de la migración: Postgres compara el TEXTO del valor jsonb, no su tipo.
    const SQL_PATTERN = /^[0-9]{1,4}$/
    /**
     * Texto que devolvería `->>` para cada valor: la cadena tal cual, el JSON de un array/objeto y
     * SQL NULL (que nunca matchea) para el campo ausente. `1e30` sale expandido en Postgres y como
     * "1e+30" acá: los dos fallan la regex, así que la equivalencia se sostiene igual.
     */
    const asSqlText = (v: unknown): string => {
        if (typeof v === 'string') return v
        if (v == null) return ' ' // `->>` da SQL NULL ⇒ el `~` nunca es true
        if (typeof v === 'object') return JSON.stringify(v) ?? ' '
        return String(v)
    }
    function sqlRepsEff(left: unknown, right: unknown, repsDone: number): number {
        const l = asSqlText(left)
        const r = asSqlText(right)
        return SQL_PATTERN.test(l) && SQL_PATTERN.test(r) ? Number(l) + Number(r) : repsDone
    }

    const CASES: unknown[] = [
        10, 0, 9999, '10', '0010', '9999',
        -1, 10.5, 99999, 1e30, NaN,
        'abc', '10.5', '-1', '', ' 10', '10 ',
        true, false, null, undefined, { v: 10 }, [10],
    ]

    it('el helper suma exactamente en los mismos casos que el SQL', () => {
        const REPS_DONE = 7
        for (const left of CASES) {
            for (const right of CASES) {
                const sides = sideRepsFromMetadata({ left_reps: left, right_reps: right })
                const ts = sides ? sides.left + sides.right : REPS_DONE
                expect({ left, right, ts }).toEqual({ left, right, ts: sqlRepsEff(left, right, REPS_DONE) })
            }
        }
    })
})

describe('identidad del carril de fuerza (el helper de lados no lo toca)', () => {
    const perSideStrength = { sets: 3, reps: '8-10', side_mode: 'per_side' as const }

    it('hasTypedPrescription sigue en false para un strength con side_mode', () => {
        expect(hasTypedPrescription(perSideStrength)).toBe(false)
    })

    it('typedBlockSummary sigue devolviendo null (el caller pinta el legacy sets × reps)', () => {
        expect(typedBlockSummary(perSideStrength, 'strength')).toBeNull()
    })

    it('el farmer carry por lado conserva su resumen de hoy', () => {
        expect(
            typedBlockSummary({ ...perSideStrength, distance_value: 20, distance_unit: 'm' }, 'strength'),
        ).toBe('3×8-10 · 20m/lado')
    })
})

describe('sideSuffix', () => {
    it('sufija sólo en unilateral', () => {
        expect(sideSuffix('per_side')).toBe('/lado')
        expect(sideSuffix('alternating')).toBe('/lado')
        expect(sideSuffix('bilateral')).toBe('')
        expect(sideSuffix(null)).toBe('')
        expect(sideSuffix(undefined)).toBe('')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Fuerza por tiempo (D3, specs/cuenta-atras-en-pantalla)
// ─────────────────────────────────────────────────────────────────────────────

describe('isStrengthTimeBlock — predicado ÚNICO del modo tiempo (R3)', () => {
    it('reps_unit "sec" + duración > 0 en un bloque de fuerza => true', () => {
        expect(isStrengthTimeBlock({ reps_unit: 'sec', duration_sec: 30 })).toBe(true)
        expect(isStrengthTimeBlock({ reps_unit: 'sec', duration_sec: 30 }, { exercise_type: 'strength' })).toBe(true)
        expect(
            isStrengthTimeBlock({ exercise_type_override: 'strength', reps_unit: 'sec', duration_sec: 45 }, null),
        ).toBe(true)
    })

    // H8 — los 2 bloques REALES de LIVE: fuerza con `duration_sec` y `reps_unit NULL` (residuo de un
    // cambio de tipo). Con un OR en vez del AND, esos 2 alumnos verían una cuenta atrás de 10 min y
    // de 2 min en un ejercicio de fuerza clásica.
    it('H8: fuerza con duración pero SIN reps_unit => false (el AND, nunca un OR)', () => {
        expect(isStrengthTimeBlock({ duration_sec: 600, reps_unit: null })).toBe(false)
        expect(isStrengthTimeBlock({ duration_sec: 120, reps_unit: null })).toBe(false)
    })

    it('reps_unit "sec" SIN duración (o en 0) => false: no hay reloj que montar', () => {
        expect(isStrengthTimeBlock({ reps_unit: 'sec', duration_sec: null })).toBe(false)
        expect(isStrengthTimeBlock({ reps_unit: 'sec', duration_sec: 0 })).toBe(false)
        expect(isStrengthTimeBlock({ reps_unit: 'sec' })).toBe(false)
    })

    it('si el tipo efectivo NO es fuerza => false (movilidad con duración no es fuerza por tiempo)', () => {
        expect(isStrengthTimeBlock({ reps_unit: 'sec', duration_sec: 30 }, { exercise_type: 'mobility' })).toBe(false)
        expect(
            isStrengthTimeBlock({ exercise_type_override: 'cardio', reps_unit: 'sec', duration_sec: 30 }, null),
        ).toBe(false)
    })

    it('otra unidad de reps => false', () => {
        expect(isStrengthTimeBlock({ reps_unit: 'reps', duration_sec: 30 })).toBe(false)
        expect(isStrengthTimeBlock({ reps_unit: 'breaths', duration_sec: 30 })).toBe(false)
    })

    it('fuerza clásica => false y STRENGTH_TIME_REPS_UNIT es la única unidad del modo', () => {
        expect(isStrengthTimeBlock({ sets: 3, reps: '8-10' })).toBe(false)
        expect(STRENGTH_TIME_REPS_UNIT).toBe('sec')
    })
})

describe('legacyRepsSummaryFor — rama strength en modo tiempo', () => {
    it('el objetivo por segundos manda ANTES que el texto viejo del coach', () => {
        // El bloque venía de Reps ("8-12") y el coach lo pasó a Segundos: sin esta rama el espejo
        // legacy seguiría diciendo "8-12" en chips, preview, print e historial.
        expect(legacyRepsSummaryFor({ reps: '8-12', reps_unit: 'sec', duration_sec: 30 }, 'strength')).toBe('30s')
    })

    it('unilateral suma el sufijo /lado', () => {
        expect(
            legacyRepsSummaryFor(
                { reps: '8-12', reps_unit: 'sec', duration_sec: 30, side_mode: 'per_side' },
                'strength',
            ),
        ).toBe('30s/lado')
        expect(
            legacyRepsSummaryFor({ reps_unit: 'sec', duration_sec: 30, side_mode: 'alternating' }, 'strength'),
        ).toBe('30s/lado')
    })

    it('un strength CLÁSICO sigue devolviendo el texto del coach, byte a byte', () => {
        expect(legacyRepsSummaryFor({ reps: '8-12' }, 'strength')).toBe('8-12')
        expect(legacyRepsSummaryFor({ reps: 'AMRAP' }, 'strength')).toBe('AMRAP')
        // Con duración pero sin `reps_unit` (los 2 bloques de LIVE de H8) tampoco cambia.
        expect(legacyRepsSummaryFor({ reps: '8-12', duration_sec: 600, reps_unit: null }, 'strength')).toBe('8-12')
        expect(legacyRepsSummaryFor({ reps: '10', distance_value: 20, distance_unit: 'm' }, 'strength')).toBe('10')
        expect(legacyRepsSummaryFor({ distance_value: 20, distance_unit: 'm' }, 'strength')).toBe('20m')
        expect(legacyRepsSummaryFor({}, 'strength')).toBe('—')
    })
})

describe('formatStrengthTimeObjective', () => {
    it('bilateral y por lado', () => {
        expect(formatStrengthTimeObjective({ sets: 3, reps_unit: 'sec', duration_sec: 30 })).toBe('3 × 30s')
        expect(
            formatStrengthTimeObjective({ sets: 3, reps_unit: 'sec', duration_sec: 30, side_mode: 'per_side' }),
        ).toBe('3 × 30s por lado')
        expect(
            formatStrengthTimeObjective({ sets: 3, reps_unit: 'sec', duration_sec: 30, side_mode: 'alternating' }),
        ).toBe('3 × 30s por lado')
    })

    it('sin sets asume 1 y usa el formato compacto de duración', () => {
        expect(formatStrengthTimeObjective({ reps_unit: 'sec', duration_sec: 90 })).toBe('1 × 1m30s')
        expect(formatStrengthTimeObjective({ sets: 4, reps_unit: 'sec', duration_sec: 120 })).toBe('4 × 2min')
    })
})

describe('typedBlockSummary — sin cambio en modo tiempo (el chip sale del espejo legacy)', () => {
    it('con reps = "30s" la rama de fuerza ya produce "3×30s"', () => {
        expect(typedBlockSummary({ sets: 3, reps: '30s', reps_unit: 'sec', duration_sec: 30 }, 'strength')).toBe(
            '3×30s',
        )
    })
})

describe('formatProgressionTag — la unidad correcta (D4/R30)', () => {
    const timeBlock = { sets: 3, reps: '30s', reps_unit: 'sec', duration_sec: 30 }

    it('modo tiempo con «+ Segundos» (progression_type "reps" remapeado por D4) => seg/ses', () => {
        expect(formatProgressionTag({ ...timeBlock, progression_type: 'reps', progression_value: 5 })).toBe(
            '+5 seg/ses',
        )
    })

    it('bloque de reps => rep/ses, byte-idéntico a lo que imprimían los 6 consumidores', () => {
        expect(formatProgressionTag({ sets: 3, reps: '8-12', progression_type: 'reps', progression_value: 2 })).toBe(
            '+2 rep/ses',
        )
    })

    it('progresión de peso => kg/sem, con coma decimal es-neutro', () => {
        expect(
            formatProgressionTag({ sets: 3, reps: '8-12', progression_type: 'weight', progression_value: 2.5 }),
        ).toBe('+2,5 kg/sem')
        // La unidad de peso NO depende del modo: una plancha que sube kg dice kg/sem igual.
        expect(formatProgressionTag({ ...timeBlock, progression_type: 'weight', progression_value: 2.5 })).toBe(
            '+2,5 kg/sem',
        )
    })

    it('sin progression_type => null; sin valor => "?" (plan a medio configurar)', () => {
        expect(formatProgressionTag({ ...timeBlock })).toBeNull()
        expect(formatProgressionTag({ ...timeBlock, progression_type: null, progression_value: 5 })).toBeNull()
        expect(formatProgressionTag({ ...timeBlock, progression_type: 'reps', progression_value: null })).toBe(
            '+? seg/ses',
        )
    })

    it('el tipo efectivo manda: el mismo bloque en movilidad NO dice seg/ses', () => {
        expect(
            formatProgressionTag(
                { ...timeBlock, progression_type: 'reps', progression_value: 5 },
                { exercise_type: 'mobility' },
            ),
        ).toBe('+5 rep/ses')
    })
})

describe('formatStrengthTimeObjectiveLong (R11, forma larga)', () => {
    it('imprime «3 × 30 s» con espacio y «por lado» en per_side', () => {
        expect(formatStrengthTimeObjectiveLong({ sets: 3, reps_unit: 'sec', duration_sec: 30 })).toBe('3 × 30 s')
        expect(formatStrengthTimeObjectiveLong({ sets: 3, reps_unit: 'sec', duration_sec: 30, side_mode: 'per_side' })).toBe('3 × 30 s por lado')
    })
    it('no compacta a minutos: 90 s queda en segundos', () => {
        expect(formatStrengthTimeObjectiveLong({ sets: 2, reps_unit: 'sec', duration_sec: 90 })).toBe('2 × 90 s')
    })
})
