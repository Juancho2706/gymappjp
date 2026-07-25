import { describe, it, expect } from 'vitest'
import { buildTypedPayload, typedLogValues, derivedPaceSecPerKm } from './set-log-payload'

/**
 * Cardio: unidad de captura = unidad PRESCRITA (G3/RF4) + pace real DERIVADO (RF5).
 *
 * Contrato compartido web/RN: la caja de distancia captura en la unidad que prescribió el coach y la
 * columna `actual_distance_m` SIEMPRE guarda metros; con tiempo y distancia registrados el motor
 * deriva `actual_pace_sec_per_km` (nada nuevo que tipear). Sin contexto, todo queda byte-idéntico.
 */
describe('typedLogValues — distancia en la unidad prescrita', () => {
  it('km: lo tipeado se guarda ×1000 en metros', () => {
    expect(typedLogValues('cardio', { actual_distance_m: '5' }, { distanceUnit: 'km' }).actualDistanceM).toBe(5000)
    // Coma decimal es-CL (misma normalización que el resto del teclado).
    expect(typedLogValues('cardio', { actual_distance_m: '5,25' }, { distanceUnit: 'km' }).actualDistanceM).toBe(5250)
  })

  it('sin unidad o con metros: la distancia pasa intacta (comportamiento previo)', () => {
    expect(typedLogValues('cardio', { actual_distance_m: '3200' }).actualDistanceM).toBe(3200)
    expect(typedLogValues('cardio', { actual_distance_m: '3200' }, { distanceUnit: 'm' }).actualDistanceM).toBe(3200)
    // 3er argumento histórico (sideMode suelto) sigue funcionando y no toca la distancia.
    expect(typedLogValues('cardio', { actual_distance_m: '3200' }, 'per_side').actualDistanceM).toBe(3200)
  })

  it('caja vacía → null (no se inventa un 0)', () => {
    expect(typedLogValues('cardio', {}, { distanceUnit: 'km' }).actualDistanceM).toBeNull()
  })
})

// ── Ejes por MODALIDAD (Fase C): lo que el teclado no pidió, el payload no lo escribe ──
describe('typedLogValues — cardio por modalidad', () => {
  it('elíptica: sin eje de distancia ⇒ nunca se guarda distancia (aunque llegue la key)', () => {
    const v = typedLogValues(
      'cardio',
      { cardio_min: '30', actual_distance_m: '4000', actual_avg_hr: '140' },
      { cardioModality: 'elliptical' },
    )
    expect(v).toEqual({
      actualDurationSec: 1800,
      actualDistanceM: null,
      actualHoldSec: null,
      actualAvgHr: 140,
      repsDone: null,
    })
  })

  it('cuerda / escaladora / HIIT: reps_done entero, distancia null', () => {
    expect(typedLogValues('cardio', { reps_done: '420' }, { cardioModality: 'jump_rope' }).repsDone).toBe(420)
    expect(typedLogValues('cardio', { reps_done: '45' }, { cardioModality: 'stairs' }).repsDone).toBe(45)
    expect(typedLogValues('cardio', { reps_done: '30' }, { cardioModality: 'hiit_reps' }).repsDone).toBe(30)
    // Decimal tipeado se redondea (la caja es entera) y el negativo imposible se descarta.
    expect(typedLogValues('cardio', { reps_done: '30,6' }, { cardioModality: 'hiit_reps' }).repsDone).toBe(31)
    expect(typedLogValues('cardio', { reps_done: '-5' }, { cardioModality: 'jump_rope' }).repsDone).toBeNull()
    expect(typedLogValues('cardio', { reps_done: '' }, { cardioModality: 'jump_rope' }).repsDone).toBeNull()
    expect(
      typedLogValues('cardio', { reps_done: '420', actual_distance_m: '900' }, { cardioModality: 'jump_rope' })
        .actualDistanceM,
    ).toBeNull()
  })

  it('modalidades con distancia y modalidad desconocida: comportamiento de siempre', () => {
    for (const cardioModality of ['run', 'bike', 'row', 'swim', null]) {
      const v = typedLogValues('cardio', { cardio_min: '25', actual_distance_m: '5', reps_done: '9' }, {
        cardioModality,
        distanceUnit: 'km',
      })
      expect(v.actualDistanceM).toBe(5000)
      // Sin eje de conteo la key `reps_done` se ignora (paridad byte-idéntica con lo previo).
      expect(v.repsDone).toBeNull()
    }
    expect(typedLogValues('cardio', { cardio_min: '20,5', actual_distance_m: '1000,5', actual_avg_hr: '152' })).toEqual(
      typedLogValues('cardio', { cardio_min: '20,5', actual_distance_m: '1000,5', actual_avg_hr: '152' }, {
        cardioModality: null,
      }),
    )
  })
})

describe('derivedPaceSecPerKm', () => {
  it('deriva seg/km desde tiempo + distancia', () => {
    expect(derivedPaceSecPerKm(1500, 5000)).toBe(300)
    expect(derivedPaceSecPerKm(1800, 6200)).toBe(290)
  })

  it('sin alguno de los dos ejes (o en 0) → null', () => {
    expect(derivedPaceSecPerKm(1500, null)).toBeNull()
    expect(derivedPaceSecPerKm(null, 5000)).toBeNull()
    expect(derivedPaceSecPerKm(1500, 0)).toBeNull()
    expect(derivedPaceSecPerKm(0, 5000)).toBeNull()
  })

  it('fuera del rango del schema (1..3600) → null', () => {
    // 5 metros en 20 min ⇒ 240.000 s/km: el clásico "escribí 5 pensando en km".
    expect(derivedPaceSecPerKm(1200, 5)).toBeNull()
    // Pace bajo el segundo por km ⇒ redondea a 0 y se omite.
    expect(derivedPaceSecPerKm(10, 100000)).toBeNull()
    // Límites exactos SÍ entran.
    expect(derivedPaceSecPerKm(3600, 1000)).toBe(3600)
  })
})

describe('buildTypedPayload — cardio con unidad prescrita y pace derivado', () => {
  it('5 km en 25 min ⇒ 5000 m + pace 300 s/km', () => {
    expect(
      buildTypedPayload('cardio', { cardio_min: '25', actual_distance_m: '5', actual_avg_hr: '148' }, 'b1', 1, {
        distanceUnit: 'km',
      }),
    ).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      actualDurationSec: 1500,
      actualDistanceM: 5000,
      actualHoldSec: null,
      actualAvgHr: 148,
      actualPaceSecPerKm: 300,
    })
  })

  it('sin distancia (o sin tiempo) el payload NO gana la key de pace', () => {
    const soloTiempo = buildTypedPayload('cardio', { cardio_min: '20' }, 'b1', 1)
    expect(soloTiempo).not.toHaveProperty('actualPaceSecPerKm')
    const soloDistancia = buildTypedPayload('cardio', { actual_distance_m: '3200' }, 'b1', 2)
    expect(soloDistancia).not.toHaveProperty('actualPaceSecPerKm')
  })

  it('prescripción en metros: byte-idéntico al comportamiento previo + pace', () => {
    expect(buildTypedPayload('cardio', { cardio_min: '30', actual_distance_m: '6000' }, 'b2', 1)).toMatchObject({
      actualDurationSec: 1800,
      actualDistanceM: 6000,
      actualPaceSecPerKm: 300,
    })
  })

  it('rep-based: el conteo viaja en repsDone y NO hay distancia ni pace', () => {
    const cuerda = buildTypedPayload(
      'cardio',
      { cardio_min: '8', reps_done: '420', actual_avg_hr: '152' },
      'b5',
      1,
      { cardioModality: 'jump_rope' },
    )
    expect(cuerda).toEqual({
      blockId: 'b5',
      setNumber: 1,
      weightKg: null,
      repsDone: 420,
      rpe: null,
      rir: null,
      actualDurationSec: 480,
      actualDistanceM: null,
      actualHoldSec: null,
      actualAvgHr: 152,
    })
    expect(cuerda).not.toHaveProperty('actualPaceSecPerKm')
    expect(
      buildTypedPayload('cardio', { cardio_min: '12', reps_done: '45' }, 'b6', 1, { cardioModality: 'stairs' }),
    ).toMatchObject({ repsDone: 45, actualDurationSec: 720, actualDistanceM: null })
    expect(
      buildTypedPayload('cardio', { cardio_min: '10', reps_done: '30' }, 'b7', 1, { cardioModality: 'hiit_reps' }),
    ).toMatchObject({ repsDone: 30, actualDistanceM: null })
  })

  it('movilidad/roller no ganan pace ni conversión de distancia', () => {
    expect(buildTypedPayload('mobility', { actual_hold_sec: '40' }, 'b3', 1, { distanceUnit: 'km' })).not.toHaveProperty(
      'actualPaceSecPerKm',
    )
    expect(
      buildTypedPayload('roller', { actual_duration_sec: '50', reps_done: '4' }, 'b4', 1, { distanceUnit: 'km' }),
    ).toMatchObject({ actualDurationSec: 50, repsDone: 4, actualDistanceM: null })
  })
})
