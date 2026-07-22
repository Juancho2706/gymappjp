/**
 * Modelo puro de las pantallas tipadas del ejecutor V3 (E3.2/E3.3/E3.4). Cubre la lógica de
 * presentación que NO se puede ejercitar renderizando (los componentes cargan moti/svg/expo): formato
 * de reloj, elección de color de zona/fase, modo de timer cardio, secuencia de lados de movilidad y el
 * prefill de captura. El motor de guardado (`buildTypedPayload`/`computeCardioProgress`) tiene su propia
 * suite en el paquete — acá solo se valida la capa de presentación que consume esos ejes.
 */
import { describe, expect, it } from 'vitest'
import {
  PHASE_COLORS,
  cardioDetailLabel,
  cardioDistanceObjective,
  cardioObjective,
  cardioTimerMode,
  formatClock,
  holdSeedValues,
  mobilitySides,
  rollerGoalLabel,
  rollerPassesTarget,
  sideLabel,
  zoneBpmRange,
  zoneRingColor,
} from '../../apps/mobile/components/alumno/workout/v3/typed-screen-model'

describe('formatClock', () => {
  it('formatea M:SS con relleno de ceros', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(90)).toBe('1:30')
    expect(formatClock(744)).toBe('12:24')
  })
  it('agrega la hora cuando supera 3600s y clampa negativos a 0', () => {
    expect(formatClock(3661)).toBe('1:01:01')
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('zoneRingColor', () => {
  it('devuelve el hex FIJO de la zona 1-5', () => {
    expect(zoneRingColor(2, '#000')).toBe('#4ade80')
    expect(zoneRingColor(4, '#000')).toBe('#fb923c')
    expect(zoneRingColor(5, '#000')).toBe('#f87171')
  })
  it('cae al acento cuando no hay zona o es inválida', () => {
    expect(zoneRingColor(null, '#2680FF')).toBe('#2680FF')
    expect(zoneRingColor(0, '#2680FF')).toBe('#2680FF')
    expect(zoneRingColor(9, '#2680FF')).toBe('#2680FF')
  })
})

describe('PHASE_COLORS', () => {
  it('trabajo ámbar / recupera verde / warmup-cooldown neutro (fijos)', () => {
    expect(PHASE_COLORS.work).toBe('#fb923c')
    expect(PHASE_COLORS.recovery).toBe('#4ade80')
    expect(PHASE_COLORS.warmup).toBe('#8f8f9c')
    expect(PHASE_COLORS.cooldown).toBe('#8f8f9c')
  })
})

describe('cardioObjective', () => {
  it('pasa la duración y convierte km a metros', () => {
    expect(cardioObjective({ duration_sec: 1200, distance_value: null })).toEqual({ duration_sec: 1200, distance_m: null })
    expect(cardioObjective({ distance_value: 5, distance_unit: 'km' })).toEqual({ duration_sec: null, distance_m: 5000 })
    expect(cardioObjective({ distance_value: 400, distance_unit: 'm' })).toEqual({ duration_sec: null, distance_m: 400 })
  })
})

describe('cardioTimerMode', () => {
  it('interval cuando hay interval_config cronometrable', () => {
    expect(cardioTimerMode({ interval_config: { repeats: 4, work: { duration_sec: 30 } } })).toBe('interval')
  })
  it('countdown cuando hay duración pero no intervalos', () => {
    expect(cardioTimerMode({ duration_sec: 1200 })).toBe('countdown')
  })
  it('stopwatch cuando no hay ni intervalos ni duración (distancia)', () => {
    expect(cardioTimerMode({ distance_value: 5000 } as { duration_sec?: null })).toBe('stopwatch')
    // interval por distancia (sin duración en work) NO es cronometrable → cronómetro
    expect(cardioTimerMode({ interval_config: { repeats: 4, work: { distance_m: 400 } } })).toBe('stopwatch')
  })
})

describe('cardioDetailLabel', () => {
  it('etiqueta el chip por prescripción', () => {
    expect(cardioDetailLabel({ interval_config: { repeats: 4, work: { duration_sec: 30 } } })).toBe('Intervalos')
    expect(cardioDetailLabel({ distance_value: 5000 })).toBe('Distancia')
    expect(cardioDetailLabel({ duration_sec: 1200 })).toBe('Continuo')
  })
})

describe('mobilitySides / sideLabel', () => {
  it('per_side → dos lados; el resto → uno', () => {
    expect(mobilitySides('per_side')).toEqual(['left', 'right'])
    expect(mobilitySides('bilateral')).toEqual(['single'])
    expect(mobilitySides(null)).toEqual(['single'])
  })
  it('etiquetas es-neutro', () => {
    expect(sideLabel('left')).toBe('Lado izquierdo')
    expect(sideLabel('right')).toBe('Lado derecho')
    expect(sideLabel('single')).toBe('Sostén la posición')
  })
})

describe('holdSeedValues', () => {
  it('per_side arma los DOS campos que declara el engine', () => {
    expect(holdSeedValues('per_side', { left: 30, right: 28 })).toEqual({ hold_left_sec: '30', hold_right_sec: '28' })
  })
  it('per_side omite el lado sin cronometrar', () => {
    expect(holdSeedValues('per_side', { left: 30 })).toEqual({ hold_left_sec: '30' })
  })
  it('un solo lado arma actual_hold_sec', () => {
    expect(holdSeedValues('bilateral', { single: 45 })).toEqual({ actual_hold_sec: '45' })
  })
  it('sin nada cronometrado devuelve objeto vacío', () => {
    expect(holdSeedValues('per_side', {})).toEqual({})
  })
})

describe('rollerPassesTarget / rollerGoalLabel', () => {
  it('objetivo de pasadas solo si reps_unit=passes', () => {
    expect(rollerPassesTarget({ reps_unit: 'passes', reps_value: 12 })).toBe(12)
    expect(rollerPassesTarget({ reps_unit: 'breaths', reps_value: 12 })).toBeNull()
  })
  it('label de objetivo con lado y rango', () => {
    expect(rollerGoalLabel({ reps: '10-12', reps_unit: 'passes', reps_value: 12, side_mode: 'per_side' })).toBe('10-12 pasadas por lado')
    expect(rollerGoalLabel({ duration_sec: 60 })).toBe('1min')
  })
})

describe('cardioDistanceObjective', () => {
  it('formatea la distancia objetivo o null', () => {
    expect(cardioDistanceObjective({ distance_value: 5, distance_unit: 'km' })).toBe('5km')
    expect(cardioDistanceObjective({ distance_value: null })).toBeNull()
  })
})

describe('zoneBpmRange', () => {
  const zones = [
    { zone: 2 as const, minBpm: 120, maxBpm: 140 },
    { zone: 4 as const, minBpm: 160, maxBpm: 180 },
  ]
  it('devuelve el rango de la zona objetivo si el perfil viajó', () => {
    expect(zoneBpmRange(2, zones)).toEqual({ zone: 2, minBpm: 120, maxBpm: 140 })
  })
  it('null si no hay zona, no hay perfil, o la zona no está', () => {
    expect(zoneBpmRange(null, zones)).toBeNull()
    expect(zoneBpmRange(2, null)).toBeNull()
    expect(zoneBpmRange(3, zones)).toBeNull()
  })
})
