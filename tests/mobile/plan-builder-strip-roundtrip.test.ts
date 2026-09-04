// Round-trip del cambio de tipo (R6 + R32): un bloque stripeado con `stripFieldsForType` tiene que
// llegar a la DB SIN los campos del tipo anterior.
//
// Por que este test existe: el serializador mobile es passthrough-first — primero vuelca la fila DB
// original (`_raw`) y solo despues sobreescribe con los campos que el editor tiene DEFINIDOS
// (`serialize.ts:111-135`). Si el strip usara `delete` o `undefined`, cada columna del tipo viejo
// volveria intacta desde `_raw` y la limpieza seria un no-op invisible: se ve bien en memoria y el
// residuo sigue vivo. El `null` EXPLICITO es lo unico que viaja al INSERT.
//
// El modulo bajo test es puro (sin react-native/expo), asi que corre con el runner del repo.
import { describe, it, expect } from 'vitest'
import { stripFieldsForType, POLYMORPHIC_BLOCK_FIELDS } from '@eva/plan-builder'
import { serializeBlockInsert } from '../../apps/mobile/lib/plan-builder/serialize'
import type { BuilderBlock } from '../../apps/mobile/lib/plan-builder/types'

// Fila DB de un bloque de cardio creado en web, con TODOS los ejes del tipo viejo poblados.
function cardioRow(): Record<string, unknown> {
  return {
    id: 'blk-1',
    plan_id: 'plan-old',
    order_index: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    exercise_id: 'ex-42',
    sets: 4,
    reps: '10min',
    rir: null,
    rest_time: '90s',
    notes: 'nota del coach',
    target_weight_kg: null,
    tempo: null,
    superset_group: 'A',
    progression_type: null,
    progression_value: null,
    progression_mode: 'weekly_linear',
    section: 'main',
    is_override: false,
    section_template_id: 'sect-tmpl-abc',
    exercise_type: 'cardio',
    exercise_type_override: 'cardio',
    side_mode: 'per_side',
    instructions: 'Mantene el torso firme',
    // --- los 10 campos polimorficos de R32, todos con residuo ---
    duration_sec: 1800,
    distance_value: 5,
    distance_unit: 'km',
    hr_zone: 2,
    interval_config: { repeats: 4, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } },
    reps_value: 10,
    reps_unit: 'passes',
    target_pace_sec_per_km: 330,
    load_value: 20,
    load_unit: 'kg',
    exercises: { name: 'Trote', muscle_group: 'Cardio', gif_url: null, video_url: null },
  }
}

// Lo que hace `mapDbBlock`: BuilderBlock hidratado (campos tipados DEFINIDOS) + `_raw` completo.
function loadedCardioBlock(raw: Record<string, unknown>): BuilderBlock {
  return {
    uid: 'block-blk-1',
    exercise_id: raw.exercise_id as string,
    exercise_name: 'Trote',
    muscle_group: 'Cardio',
    sets: raw.sets as number,
    reps: raw.reps as string,
    rest_time: raw.rest_time as string,
    notes: raw.notes as string,
    superset_group: raw.superset_group as string,
    section: 'main',
    section_template_id: raw.section_template_id as string,
    is_override: false,
    exercise_type: 'cardio',
    exercise_type_override: 'cardio',
    side_mode: 'per_side',
    instructions: raw.instructions as string,
    duration_sec: raw.duration_sec as number,
    distance_value: String(raw.distance_value),
    distance_unit: 'km',
    hr_zone: raw.hr_zone as number,
    interval_config: raw.interval_config as BuilderBlock['interval_config'],
    reps_value: raw.reps_value as number,
    reps_unit: 'passes',
    target_pace_sec_per_km: raw.target_pace_sec_per_km as number,
    load_value: String(raw.load_value),
    load_unit: 'kg',
    _raw: raw,
  }
}

describe('round-trip: stripFieldsForType → serializeBlockInsert (R32)', () => {
  it('cardio → strength: los 10 campos llegan al INSERT en null, no con el valor de _raw', () => {
    const raw = cardioRow()
    const stripped = stripFieldsForType(loadedCardioBlock(raw), 'strength')
    const payload = serializeBlockInsert(stripped, 0, 'plan-new')

    for (const field of POLYMORPHIC_BLOCK_FIELDS) {
      expect(Object.keys(payload)).toContain(field)
      expect(payload[field]).toBeNull()
      // el residuo de `_raw` no sobrevivio
      expect(payload[field]).not.toBe(raw[field])
    }
    // `distance_unit` es el caso traicionero: `serialize.ts:125` lo decide por `distance_value`.
    // Con el strip en `null` explicito queda `null`; con `undefined` habria vuelto 'km' de `_raw`.
    expect(payload.distance_unit).toBeNull()
  })

  it('el mismo INSERT conserva los campos compartidos y el passthrough de columnas ajenas', () => {
    const stripped = stripFieldsForType(loadedCardioBlock(cardioRow()), 'strength')
    const payload = serializeBlockInsert(stripped, 0, 'plan-new')

    expect(payload.sets).toBe(4)
    expect(payload.rest_time).toBe('90s')
    expect(payload.notes).toBe('nota del coach')
    expect(payload.superset_group).toBe('A')
    expect(payload.side_mode).toBe('per_side')
    expect(payload.instructions).toBe('Mantene el torso firme')
    // columnas que el editor no toca siguen viniendo de `_raw`
    expect(payload.section_template_id).toBe('sect-tmpl-abc')
    expect(payload.progression_mode).toBe('weekly_linear')
    // identidad/orden viejos NO viajan
    for (const k of ['id', 'plan_id', 'order_index', 'created_at', 'updated_at', 'exercises']) {
      if (k === 'plan_id' || k === 'order_index') continue
      expect(payload).not.toHaveProperty(k)
    }
    expect(payload.plan_id).toBe('plan-new')
    expect(payload.order_index).toBe(0)
  })

  it('sin strip el residuo SI sobrevive (prueba de que el null explicito es lo que limpia)', () => {
    const payload = serializeBlockInsert(loadedCardioBlock(cardioRow()), 0, 'plan-new')
    expect(payload.duration_sec).toBe(1800)
    expect(payload.distance_unit).toBe('km')
    expect(payload.hr_zone).toBe(2)
  })

  it('mobility → roller: el hold se limpia y el default del roller llega al INSERT', () => {
    const raw = { ...cardioRow(), exercise_type: 'mobility', exercise_type_override: null, duration_sec: 30 }
    const block: BuilderBlock = {
      ...loadedCardioBlock(raw),
      exercise_type: 'mobility',
      exercise_type_override: null,
      duration_sec: 30,
    }
    const payload = serializeBlockInsert(stripFieldsForType(block, 'roller'), 0, 'plan-new')
    expect(payload.duration_sec).toBeNull()
    expect(payload.reps_value).toBe(10)
    expect(payload.reps_unit).toBe('passes')
  })
})
