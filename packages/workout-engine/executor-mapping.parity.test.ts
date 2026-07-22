/**
 * Contrato de paridad del mapeo tipo->campos->columnas del ejecutor (E0.3).
 *
 * Congela el comportamiento EXACTO de `typedTargetFor` / `keypadStepsForTarget` (routing del teclado)
 * y de `typedLogValues` / `buildStrengthPayload` / `buildTypedPayload` (valores->columnas del log) que
 * hoy vive en `apps/mobile/.../keypad-flow.ts` + `set-log-payload.ts`. Estos asserts se derivaron del
 * codigo mobile ANTES de subirlo a `@eva/workout-engine`: son el contrato y NO deben cambiar al mover
 * los modulos (solo cambia la fuente del import). Cubren cada tipo (strength/cardio/mobility/roller) y
 * los bordes: decimales con coma es-CL, campos vacios, RPE sembrado post-log en tipados, rir null en
 * tipados, y edicion con valores sembrados.
 */
import { describe, it, expect } from 'vitest'
import {
  typedTargetFor,
  keypadStepsForTarget,
  STRENGTH_KEYPAD_STEPS,
  type KeypadTarget,
} from '@eva/workout-engine'
import {
  num,
  int,
  typedLogValues,
  buildStrengthPayload,
  buildTypedPayload,
} from '@eva/workout-engine'

// ── Helper: arma un KeypadTarget tipado a partir del descriptor del routing ─────────────
function typedTargetFrom(
  block: Parameters<typeof typedTargetFor>[0],
  exercise: Parameters<typeof typedTargetFor>[1],
): KeypadTarget {
  const info = typedTargetFor(block, exercise)
  if (!info) throw new Error('esperaba un target tipado')
  return {
    blockId: 'b1',
    setNumber: 1,
    exerciseName: 'X',
    targetReps: '',
    suggestedWeight: null,
    effortKind: null,
    typed: { mode: info.mode, fields: info.fields, objective: info.objective },
  }
}

// ── typedTargetFor: routing tipo->descriptor tipado (o null en strength) ─────────────────
describe('typedTargetFor', () => {
  it('strength (ejercicio strength, sin override) => null', () => {
    expect(typedTargetFor({}, { exercise_type: 'strength' })).toBeNull()
  })

  it('strength legacy (sin override, ejercicio sin tipo) => null', () => {
    expect(typedTargetFor({ exercise_type_override: null }, null)).toBeNull()
  })

  it('cardio: modo + campos min/metros/FC + objetivo formateado', () => {
    const info = typedTargetFor({ exercise_type_override: 'cardio', duration_sec: 1200, hr_zone: 4 }, null)
    expect(info).toEqual({
      mode: 'cardio',
      fields: [
        { key: 'cardio_min', label: 'Min', unit: 'min', allowDecimal: true },
        { key: 'actual_distance_m', label: 'Metros', unit: 'm', allowDecimal: true },
        { key: 'actual_avg_hr', label: 'FC', unit: 'bpm', allowDecimal: false },
      ],
      objective: '20 min · Z4',
    })
  })

  it('mobility: hold unico + objetivo con series', () => {
    const info = typedTargetFor({ exercise_type_override: 'mobility', duration_sec: 30, sets: 3 }, null)
    expect(info).toEqual({
      mode: 'mobility',
      fields: [{ key: 'actual_hold_sec', label: 'Hold', unit: 'seg', allowDecimal: false }],
      objective: 'Hold 30s · 3 series',
    })
  })

  it('roller: segundos + pasadas + objetivo de pasadas', () => {
    const info = typedTargetFor({ exercise_type_override: 'roller', reps_value: 10, reps_unit: 'passes' }, null)
    expect(info).toEqual({
      mode: 'roller',
      fields: [
        { key: 'actual_duration_sec', label: 'Seg', unit: 'seg', allowDecimal: false },
        { key: 'reps_done', label: 'Pasadas', unit: 'pas.', allowDecimal: false },
      ],
      objective: '10 pasadas',
    })
  })

  it('el override del bloque gana sobre el tipo del ejercicio', () => {
    const info = typedTargetFor({ exercise_type_override: 'cardio' }, { exercise_type: 'strength' })
    expect(info?.mode).toBe('cardio')
  })

  it('sin override usa el tipo del ejercicio', () => {
    const info = typedTargetFor({}, { exercise_type: 'mobility' })
    expect(info?.mode).toBe('mobility')
  })
})

// ── keypadStepsForTarget: secuencia de pasos del teclado ─────────────────────────────────
describe('keypadStepsForTarget', () => {
  it('target null => sin pasos', () => {
    expect(keypadStepsForTarget(null)).toEqual([])
  })

  it('strength con esfuerzo => peso, reps, effort', () => {
    const target: KeypadTarget = {
      blockId: 'b1',
      setNumber: 1,
      exerciseName: 'Press',
      targetReps: '8',
      suggestedWeight: null,
      effortKind: 'rpe',
    }
    expect(keypadStepsForTarget(target)).toEqual([...STRENGTH_KEYPAD_STEPS, { kind: 'effort' }])
  })

  it('strength sin esfuerzo => peso, reps', () => {
    const target: KeypadTarget = {
      blockId: 'b1',
      setNumber: 1,
      exerciseName: 'Press',
      targetReps: '8',
      suggestedWeight: null,
      effortKind: null,
    }
    expect(keypadStepsForTarget(target)).toEqual([...STRENGTH_KEYPAD_STEPS])
  })

  it('STRENGTH_KEYPAD_STEPS mantiene peso(kg)->reps', () => {
    expect(STRENGTH_KEYPAD_STEPS).toEqual([
      { kind: 'keypad', key: 'weight', mode: 'weight', unit: 'kg', label: 'Peso (kg)' },
      { kind: 'keypad', key: 'reps', mode: 'reps', unit: 'reps', label: 'Repeticiones' },
    ])
  })

  it('cardio tipado => tres pasos (min/metros decimal, FC entero)', () => {
    const target = typedTargetFrom({ exercise_type_override: 'cardio' }, null)
    expect(keypadStepsForTarget(target)).toEqual([
      { kind: 'keypad', key: 'cardio_min', mode: 'decimal', unit: 'min', label: 'Min' },
      { kind: 'keypad', key: 'actual_distance_m', mode: 'decimal', unit: 'm', label: 'Metros' },
      { kind: 'keypad', key: 'actual_avg_hr', mode: 'integer', unit: 'bpm', label: 'FC' },
    ])
  })

  it('mobility tipado => hold entero', () => {
    const target = typedTargetFrom({ exercise_type_override: 'mobility' }, null)
    expect(keypadStepsForTarget(target)).toEqual([
      { kind: 'keypad', key: 'actual_hold_sec', mode: 'integer', unit: 'seg', label: 'Hold' },
    ])
  })

  it('roller tipado => segundos + pasadas enteros', () => {
    const target = typedTargetFrom({ exercise_type_override: 'roller' }, null)
    expect(keypadStepsForTarget(target)).toEqual([
      { kind: 'keypad', key: 'actual_duration_sec', mode: 'integer', unit: 'seg', label: 'Seg' },
      { kind: 'keypad', key: 'reps_done', mode: 'integer', unit: 'pas.', label: 'Pasadas' },
    ])
  })
})

// ── num / int: normalizacion es-CL (coma decimal) ────────────────────────────────────────
describe('num / int (coma es-CL)', () => {
  it('num: vacio/undefined/no-numerico => null', () => {
    expect(num(undefined)).toBeNull()
    expect(num('')).toBeNull()
    expect(num('abc')).toBeNull()
    expect(num('   ')).toBeNull()
  })

  it('num: coma decimal y punto => mismo numero', () => {
    expect(num('12,5')).toBe(12.5)
    expect(num('12.5')).toBe(12.5)
    expect(num('0')).toBe(0)
  })

  it('int: redondea (half-up) tras normalizar la coma', () => {
    expect(int('12,4')).toBe(12)
    expect(int('12,5')).toBe(13)
    expect(int('12,6')).toBe(13)
    expect(int(undefined)).toBeNull()
    expect(int('')).toBeNull()
  })
})

// ── typedLogValues: valores tipados -> columnas actual_* / reps_done ──────────────────────
describe('typedLogValues', () => {
  it('cardio completo: min->duracion(seg), metros decimal, FC entero', () => {
    expect(typedLogValues('cardio', { cardio_min: '20,5', actual_distance_m: '1000,5', actual_avg_hr: '152' })).toEqual({
      actualDurationSec: 1230,
      actualDistanceM: 1000.5,
      actualHoldSec: null,
      actualAvgHr: 152,
      repsDone: null,
    })
  })

  it('cardio vacio: todo null', () => {
    expect(typedLogValues('cardio', {})).toEqual({
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: null,
      actualAvgHr: null,
      repsDone: null,
    })
  })

  it('cardio min=0 no arma duracion', () => {
    expect(typedLogValues('cardio', { cardio_min: '0' }).actualDurationSec).toBeNull()
  })

  it('cardio FC decimal se redondea a entero', () => {
    expect(typedLogValues('cardio', { actual_avg_hr: '152,6' }).actualAvgHr).toBe(153)
  })

  it('mobility: solo hold entero', () => {
    expect(typedLogValues('mobility', { actual_hold_sec: '30' })).toEqual({
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: 30,
      actualAvgHr: null,
      repsDone: null,
    })
    expect(typedLogValues('mobility', { actual_hold_sec: '30,4' }).actualHoldSec).toBe(30)
  })

  it('roller: duracion(seg) + pasadas enteras', () => {
    expect(typedLogValues('roller', { actual_duration_sec: '45', reps_done: '3' })).toEqual({
      actualDurationSec: 45,
      actualDistanceM: null,
      actualHoldSec: null,
      actualAvgHr: null,
      repsDone: 3,
    })
  })
})

// ── buildTypedPayload: serie tipada (peso/rir null, ejes en actual_*, rpe leido de values) ─
describe('buildTypedPayload', () => {
  it('cardio nuevo (sin rpe): rpe null, rir null, ejes en actual_*', () => {
    expect(buildTypedPayload('cardio', { cardio_min: '20' }, 'b1', 1)).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      actualDurationSec: 1200,
      actualDistanceM: null,
      actualHoldSec: null,
      actualAvgHr: null,
    })
  })

  it('mobility editando con rpe sembrado post-log: conserva el rpe, rir null', () => {
    expect(buildTypedPayload('mobility', { actual_hold_sec: '40', rpe: '8' }, 'b2', 3)).toEqual({
      blockId: 'b2',
      setNumber: 3,
      weightKg: null,
      repsDone: null,
      rpe: 8,
      rir: null,
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: 40,
      actualAvgHr: null,
    })
  })

  it('roller: pasadas + duracion, sin peso/rir', () => {
    expect(buildTypedPayload('roller', { actual_duration_sec: '50', reps_done: '4' }, 'b3', 2)).toEqual({
      blockId: 'b3',
      setNumber: 2,
      weightKg: null,
      repsDone: 4,
      rpe: null,
      rir: null,
      actualDurationSec: 50,
      actualDistanceM: null,
      actualHoldSec: null,
      actualAvgHr: null,
    })
  })
})

// ── buildStrengthPayload: peso x reps + esfuerzo (rpe y rir directos) + nota ──────────────
describe('buildStrengthPayload', () => {
  it('completo (valores sembrados en edicion): peso decimal, reps entero, rpe/rir, nota trim', () => {
    expect(buildStrengthPayload({ weight: '60,5', reps: '10', rpe: '8', rir: '2', note: '  buena  ' }, 'b1', 1)).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: 60.5,
      repsDone: 10,
      rpe: 8,
      rir: 2,
      note: 'buena',
    })
  })

  it('nota en blanco => null; rpe/rir ausentes => null', () => {
    expect(buildStrengthPayload({ weight: '60', reps: '8', note: '   ' }, 'b1', 1)).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: 60,
      repsDone: 8,
      rpe: null,
      rir: null,
      note: null,
    })
  })

  it('decimales con coma: peso 62,25 exacto; reps 12,6 redondea a 13', () => {
    const p = buildStrengthPayload({ weight: '62,25', reps: '12,6' }, 'b1', 1)
    expect(p.weightKg).toBe(62.25)
    expect(p.repsDone).toBe(13)
  })

  it('todo vacio => todos null (rir null en strength)', () => {
    expect(buildStrengthPayload({}, 'b1', 1)).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      note: null,
    })
  })
})
