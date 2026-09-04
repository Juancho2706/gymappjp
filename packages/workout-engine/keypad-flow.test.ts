/**
 * Routing de pasos del teclado — flujo de FUERZA POR LADO (tren «ciclo real y por lado», R3/R4/R18).
 *
 * `keypad-flow.ts` no tenía test propio: `STRENGTH_KEYPAD_STEPS` y `keypadStepsForTarget` se
 * ejercitaban de rebote en `executor-mapping.parity.test.ts` y en `tests/mobile/keypad-flow.test.ts`.
 * Este archivo fija el carril nuevo y, sobre todo, los dos guards de R18:
 *  - los pasos por lado salen de la rama NO tipada (`sideMode` del `KeypadTarget`), y
 *  - la fuerza NUNCA entra al carril tipado: `typedTargetFor` sigue devolviendo `null` en strength,
 *    aunque el bloque sea unilateral. Si entrara, RN despacharía `buildTypedPayload`, que escribe
 *    `weightKg: null` y `rir: null` ⇒ la serie por lado se guardaría sin peso ni esfuerzo.
 */
import { describe, it, expect } from 'vitest'
import {
  STRENGTH_KEYPAD_STEPS,
  STRENGTH_PER_SIDE_KEYPAD_STEPS,
  keypadStepsForTarget,
  typedTargetFor,
  type KeypadTarget,
} from './keypad-flow'

const strengthTarget = (over: Partial<KeypadTarget> = {}): KeypadTarget => ({
  blockId: 'b1',
  setNumber: 1,
  exerciseName: 'Zancada búlgara',
  targetReps: '8-12',
  suggestedWeight: null,
  effortKind: 'rpe',
  ...over,
})

describe('STRENGTH_PER_SIDE_KEYPAD_STEPS', () => {
  it('tres pasos en orden: peso (kg) → reps izq → reps der', () => {
    expect(STRENGTH_PER_SIDE_KEYPAD_STEPS).toEqual([
      { kind: 'keypad', key: 'weight', mode: 'weight', unit: 'kg', label: 'Peso (kg)' },
      { kind: 'keypad', key: 'reps_left', mode: 'reps', unit: 'reps', label: 'Izq' },
      { kind: 'keypad', key: 'reps_right', mode: 'reps', unit: 'reps', label: 'Der' },
    ])
  })

  it('el header dice «Izq · Der», nunca «Izquierda»/«Derecha»', () => {
    const labels = STRENGTH_PER_SIDE_KEYPAD_STEPS.slice(1).map((s) => s.label)
    expect(labels.join(' · ')).toBe('Izq · Der')
    expect(labels.some((l) => /Izquierda|Derecha/.test(l))).toBe(false)
  })

  it('un solo peso para los dos lados (D2): la key `weight` aparece una vez', () => {
    expect(STRENGTH_PER_SIDE_KEYPAD_STEPS.filter((s) => s.key === 'weight')).toHaveLength(1)
  })

  it('las keys de reps son las que lee `buildStrengthPayload` con ctx.sideMode', () => {
    expect(STRENGTH_PER_SIDE_KEYPAD_STEPS.map((s) => s.key)).toEqual(['weight', 'reps_left', 'reps_right'])
  })
})

describe('keypadStepsForTarget — fuerza por lado (rama NO tipada)', () => {
  it('sideMode per_side ⇒ los 3 pasos por lado', () => {
    expect(keypadStepsForTarget(strengthTarget({ sideMode: 'per_side' }))).toEqual([
      ...STRENGTH_PER_SIDE_KEYPAD_STEPS,
    ])
  })

  it('sideMode alternating ⇒ los mismos 3 pasos (R4: misma captura)', () => {
    expect(keypadStepsForTarget(strengthTarget({ sideMode: 'alternating' }))).toEqual(
      keypadStepsForTarget(strengthTarget({ sideMode: 'per_side' })),
    )
  })

  it('devuelve una COPIA, no la constante (el host no puede mutar el catálogo)', () => {
    const steps = keypadStepsForTarget(strengthTarget({ sideMode: 'per_side' }))
    expect(steps).not.toBe(STRENGTH_PER_SIDE_KEYPAD_STEPS)
  })

  it('sin sideMode / null ⇒ peso → reps, byte-idéntico a hoy', () => {
    expect(keypadStepsForTarget(strengthTarget())).toEqual([...STRENGTH_KEYPAD_STEPS])
    expect(keypadStepsForTarget(strengthTarget({ sideMode: null }))).toEqual([...STRENGTH_KEYPAD_STEPS])
    expect(keypadStepsForTarget(strengthTarget({ effortKind: null }))).toEqual([...STRENGTH_KEYPAD_STEPS])
  })

  it('target null ⇒ sin pasos', () => {
    expect(keypadStepsForTarget(null)).toEqual([])
  })

  it('un bloque TIPADO con sideMode manda por su tipo (el lado no lo saca del carril tipado)', () => {
    const typed = typedTargetFor({ exercise_type_override: 'mobility' }, null, 'per_side')
    expect(typed).not.toBeNull()
    const steps = keypadStepsForTarget(strengthTarget({ typed: typed ?? undefined, sideMode: 'per_side' }))
    expect(steps).toEqual([
      { kind: 'keypad', key: 'hold_left_sec', mode: 'integer', unit: 'seg', label: 'Hold izq.' },
      { kind: 'keypad', key: 'hold_right_sec', mode: 'integer', unit: 'seg', label: 'Hold der.' },
    ])
  })
})

describe('typedTargetFor — guard R18: la fuerza nunca entra al carril tipado', () => {
  // El `side_mode` del bloque NO es un input de `typedTargetFor` (su contrato es tipo→campos): el
  // bloque unilateral llega igual que cualquier otro de fuerza y debe seguir resolviendo a `null`.
  const strengthPerSide = { exercise_type_override: null, side_mode: 'per_side', sets: 3, reps_value: null }

  it('bloque strength con side_mode per_side ⇒ null (sigue el flujo peso × reps)', () => {
    expect(typedTargetFor(strengthPerSide, { exercise_type: 'strength' })).toBeNull()
    expect(typedTargetFor(strengthPerSide, { exercise_type: 'strength' }, 'per_side')).toBeNull()
    expect(typedTargetFor(strengthPerSide, null, { sideMode: 'alternating' })).toBeNull()
  })

  it('override strength sobre un ejercicio de cardio ⇒ null aunque venga por lado', () => {
    expect(
      typedTargetFor({ exercise_type_override: 'strength' }, { exercise_type: 'cardio' }, 'per_side'),
    ).toBeNull()
  })
})
