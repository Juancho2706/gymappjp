// Routing PURO tipo->campos del teclado del ejecutor del alumno (fix QA Ronda 4 · hallazgo 5).
// El módulo bajo test es puro (sin react-native/expo): compone `effectiveExerciseType` +
// `typedKeypadFields` del engine igual que `openSet` (ExecutorV2) y el `steps` de `KeypadHost`.
// Regresión que cuida: un bloque de MOVILIDAD/HOLD (u otro tipo) NUNCA debe abrir el teclado de
// kg×reps — debe pedir sus campos tipados (hold seg · cardio min/metros/FC · roller seg/pasadas).
import { describe, it, expect } from 'vitest'
import {
  typedTargetFor,
  keypadStepsForTarget,
  STRENGTH_KEYPAD_STEPS,
  type BlockForKeypad,
  type ExerciseForKeypad,
  type KeypadTarget,
} from '../../apps/mobile/components/alumno/workout/keypad-flow'

/** Construye un `KeypadTarget` igual que `openSet`: si el bloque es tipado, `effortKind` va null. */
function targetFor(
  block: BlockForKeypad,
  exercise: ExerciseForKeypad,
  effortKind: 'rpe' | 'rir' | null = 'rpe',
): KeypadTarget {
  const typed = typedTargetFor(block, exercise)
  return {
    blockId: 'b1',
    setNumber: 1,
    exerciseName: 'Ejercicio',
    targetReps: '8-10',
    suggestedWeight: 40,
    effortKind: typed ? null : effortKind,
    typed: typed ?? undefined,
  }
}

/** Keys de los pasos de teclado (los efforts no tienen key). */
const stepKeys = (t: KeypadTarget | null) =>
  keypadStepsForTarget(t)
    .filter((s): s is Extract<typeof s, { kind: 'keypad' }> => s.kind === 'keypad')
    .map((s) => s.key)

describe('keypad-flow · typedTargetFor: tipo efectivo -> descriptor tipado (o null en strength)', () => {
  it('bloque sin override y ejercicio sin tipo -> strength (null)', () => {
    expect(typedTargetFor({}, { exercise_type: null })).toBeNull()
    expect(typedTargetFor({}, null)).toBeNull()
    expect(typedTargetFor({ exercise_type_override: 'strength' }, { exercise_type: 'strength' })).toBeNull()
  })

  it('cardio (por el tipo del ejercicio) -> modo cardio con min/metros/FC', () => {
    const t = typedTargetFor({ duration_sec: 1200, hr_zone: 4 }, { exercise_type: 'cardio' })
    expect(t?.mode).toBe('cardio')
    expect(t?.fields.map((f) => f.key)).toEqual(['cardio_min', 'actual_distance_m', 'actual_avg_hr'])
    // min y metros admiten decimal; FC es entera.
    expect(t?.fields.map((f) => f.allowDecimal)).toEqual([true, true, false])
  })

  it('movilidad -> modo mobility con UN solo campo: hold en segundos (enteros)', () => {
    const t = typedTargetFor({ duration_sec: 30, sets: 3, side_mode: 'per_side' }, { exercise_type: 'mobility' })
    expect(t?.mode).toBe('mobility')
    expect(t?.fields.map((f) => f.key)).toEqual(['actual_hold_sec'])
    expect(t?.fields[0]).toMatchObject({ unit: 'seg', allowDecimal: false })
    // El objetivo prescrito viaja formateado al header del teclado.
    expect(t?.objective).toBe('Hold 30s · 3 series')
  })

  it('roller (por override del bloque) -> modo roller con segundos + pasadas', () => {
    const t = typedTargetFor(
      { exercise_type_override: 'roller', duration_sec: 2400 },
      { exercise_type: 'cardio' }, // el override del bloque GANA sobre el tipo del ejercicio
    )
    expect(t?.mode).toBe('roller')
    expect(t?.fields.map((f) => f.key)).toEqual(['actual_duration_sec', 'reps_done'])
    expect(t?.fields.every((f) => !f.allowDecimal)).toBe(true)
  })

  it('el override del bloque gana sobre el tipo del ejercicio', () => {
    expect(typedTargetFor({ exercise_type_override: 'mobility' }, { exercise_type: 'strength' })?.mode).toBe('mobility')
  })
})

describe('keypad-flow · keypadStepsForTarget: pasos que ve el alumno', () => {
  it('sin target -> sin pasos', () => {
    expect(keypadStepsForTarget(null)).toEqual([])
  })

  it('strength SIN esfuerzo -> peso(kg) y reps, nada más', () => {
    const steps = keypadStepsForTarget(targetFor({}, { exercise_type: 'strength' }, null))
    expect(steps).toEqual(STRENGTH_KEYPAD_STEPS)
    expect(stepKeys(targetFor({}, { exercise_type: 'strength' }, null))).toEqual(['weight', 'reps'])
  })

  it('strength CON esfuerzo (rpe/rir) -> peso, reps y un paso de esfuerzo al final', () => {
    for (const kind of ['rpe', 'rir'] as const) {
      const steps = keypadStepsForTarget(targetFor({}, { exercise_type: 'strength' }, kind))
      expect(steps.map((s) => s.kind)).toEqual(['keypad', 'keypad', 'effort'])
    }
  })

  it('MOVILIDAD -> un paso Hold en segundos (integer); NUNCA kg/reps (el bug del hallazgo 5)', () => {
    const t = targetFor({ duration_sec: 30, sets: 3 }, { exercise_type: 'mobility' })
    const steps = keypadStepsForTarget(t)
    expect(steps).toEqual([{ kind: 'keypad', key: 'actual_hold_sec', mode: 'integer', unit: 'seg', label: 'Hold' }])
    // Guard explícito de la regresión: ningún paso de peso/reps ni unidad kg.
    expect(stepKeys(t)).not.toContain('weight')
    expect(stepKeys(t)).not.toContain('reps')
    expect(keypadStepsForTarget(t).some((s) => s.kind === 'keypad' && s.unit === 'kg')).toBe(false)
    // Y no hay paso de esfuerzo: el flujo tipado no pide RPE en el teclado.
    expect(keypadStepsForTarget(t).some((s) => s.kind === 'effort')).toBe(false)
  })

  it('CARDIO -> min(decimal) · metros(decimal) · FC(integer)', () => {
    const t = targetFor({ duration_sec: 1200 }, { exercise_type: 'cardio' })
    expect(keypadStepsForTarget(t)).toEqual([
      { kind: 'keypad', key: 'cardio_min', mode: 'decimal', unit: 'min', label: 'Min' },
      { kind: 'keypad', key: 'actual_distance_m', mode: 'decimal', unit: 'm', label: 'Metros' },
      { kind: 'keypad', key: 'actual_avg_hr', mode: 'integer', unit: 'bpm', label: 'FC' },
    ])
  })

  it('ROLLER -> segundos(integer) · pasadas(integer)', () => {
    const t = targetFor({ exercise_type_override: 'roller', duration_sec: 300 }, null)
    expect(keypadStepsForTarget(t)).toEqual([
      { kind: 'keypad', key: 'actual_duration_sec', mode: 'integer', unit: 'seg', label: 'Seg' },
      { kind: 'keypad', key: 'reps_done', mode: 'integer', unit: 'pas.', label: 'Pasadas' },
    ])
  })
})

describe('keypad-flow · end-to-end bloque -> pasos (TODOS los tipos rutean bien)', () => {
  const cases: Array<{ name: string; block: BlockForKeypad; exercise: ExerciseForKeypad; keys: string[] }> = [
    { name: 'strength', block: {}, exercise: { exercise_type: 'strength' }, keys: ['weight', 'reps'] },
    { name: 'cardio', block: {}, exercise: { exercise_type: 'cardio' }, keys: ['cardio_min', 'actual_distance_m', 'actual_avg_hr'] },
    { name: 'mobility', block: {}, exercise: { exercise_type: 'mobility' }, keys: ['actual_hold_sec'] },
    { name: 'roller', block: { exercise_type_override: 'roller' }, exercise: null, keys: ['actual_duration_sec', 'reps_done'] },
  ]
  for (const c of cases) {
    it(`${c.name} -> ${c.keys.join(', ')}`, () => {
      expect(stepKeys(targetFor(c.block, c.exercise, null))).toEqual(c.keys)
    })
  }
})
