import { describe, it, expect } from 'vitest'
import type { HrMetadataV1 } from '@eva/cardio'
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

// ── FC del bloque (specs/cardio-conectado): `metadata.hr` ────────────────────────────────────────
/**
 * El ctx opcional `hrMetadata` es el ÚNICO camino por el que el resumen/curva de FC llega al log.
 * Contrato: sin la key el payload queda byte-idéntico al previo (los asserts de arriba son la prueba);
 * con ella, y solo en cardio, el payload gana `metadata.hr` sin tocar ningún eje.
 */
const HR_BLE: HrMetadataV1 = {
  v: 1,
  source: 'ble',
  avg: 139,
  max: 165,
  duration_sec: 1500,
  target_zone: 2,
  zone_sec: { '1': 60, '2': 1200, '3': 180, '4': 60, '5': 0 },
  in_target_sec: 1200,
  sample_period_sec: 5,
  samples: [
    [0, 120],
    [5, 132],
    [10, 141],
  ],
}

describe('buildTypedPayload — metadata.hr del bloque cardio', () => {
  it('sin la key el payload NO gana `metadata` (byte-idéntico al previo)', () => {
    const sinCtx = buildTypedPayload('cardio', { cardio_min: '25' }, 'b1', 1)
    const ctxVacio = buildTypedPayload('cardio', { cardio_min: '25' }, 'b1', 1, { distanceUnit: 'km' })
    expect(sinCtx).not.toHaveProperty('metadata')
    expect(ctxVacio).not.toHaveProperty('metadata')
    // `hrMetadata: null` explícito (bloque cerrado SIN stream) tampoco escribe la key.
    expect(
      buildTypedPayload('cardio', { cardio_min: '25' }, 'b1', 1, { hrMetadata: null }),
    ).not.toHaveProperty('metadata')
    expect(buildTypedPayload('cardio', { cardio_min: '25' }, 'b1', 1, { hrMetadata: null })).toEqual(sinCtx)
  })

  it('cardio con hrMetadata: el resumen viaja bajo `metadata.hr`, los ejes quedan intactos', () => {
    const payload = buildTypedPayload(
      'cardio',
      { cardio_min: '25', actual_distance_m: '5', actual_avg_hr: '139' },
      'b1',
      1,
      { distanceUnit: 'km', hrMetadata: HR_BLE },
    )
    expect(payload).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      actualDurationSec: 1500,
      actualDistanceM: 5000,
      actualHoldSec: null,
      actualAvgHr: 139,
      actualPaceSecPerKm: 300,
      metadata: { hr: HR_BLE },
    })
  })

  it('el resumen viaja verbatim: no se recorta la serie ni se muta el objeto recibido', () => {
    const snapshot = JSON.parse(JSON.stringify(HR_BLE))
    const payload = buildTypedPayload('cardio', { cardio_min: '25' }, 'b1', 1, { hrMetadata: HR_BLE })
    expect(payload.metadata?.hr).toEqual(HR_BLE)
    expect(HR_BLE).toEqual(snapshot)
  })

  it('el import del reloj usa el mismo camino con source health_import', () => {
    const hrImport: HrMetadataV1 = {
      v: 1,
      source: 'health_import',
      avg: 142,
      max: 171,
      duration_sec: 1800,
      target_zone: null,
      zone_sec: null,
      in_target_sec: null,
      sample_period_sec: null,
      samples: null,
      hub_source: 'Apple Watch',
      distance_m: 5234,
      calories: 320,
    }
    const payload = buildTypedPayload('cardio', { cardio_min: '30' }, 'b9', 2, { hrMetadata: hrImport })
    expect(payload.metadata).toEqual({ hr: hrImport })
  })

  it('movilidad y roller ignoran `hrMetadata` (no tienen stream ni import)', () => {
    expect(
      buildTypedPayload('mobility', { actual_hold_sec: '40' }, 'b3', 1, { hrMetadata: HR_BLE }),
    ).not.toHaveProperty('metadata')
    expect(
      buildTypedPayload('roller', { actual_duration_sec: '50', reps_done: '4' }, 'b4', 1, { hrMetadata: HR_BLE }),
    ).not.toHaveProperty('metadata')
  })

  it('movilidad per_side conserva su metadata {left_sec, right_sec} sin contaminarse con FC', () => {
    const payload = buildTypedPayload(
      'mobility',
      { hold_left_sec: '30', hold_right_sec: '25' },
      'b3',
      1,
      { sideMode: 'per_side', hrMetadata: HR_BLE },
    )
    expect(payload.metadata).toEqual({ left_sec: 30, right_sec: 25 })
    expect(payload.actualHoldSec).toBe(55)
  })

  it('el 3er argumento histórico (`sideMode` suelto) sigue sin metadata de FC', () => {
    expect(buildTypedPayload('cardio', { cardio_min: '25' }, 'b1', 1, 'per_side')).not.toHaveProperty('metadata')
  })
})
