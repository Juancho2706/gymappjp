// Round-trip anti-destructivo del guardado del builder mobile (G07 §5).
// El modulo bajo test es puro (sin react-native/expo), asi que corre con el runner
// del repo aunque viva en apps/mobile. Vitest lo colecta por el glob `tests/**`.
import { describe, it, expect } from 'vitest'
import {
  passthroughBlockColumns,
  serializeBlockInsert,
} from '../../apps/mobile/lib/plan-builder/serialize'
import type { BuilderBlock } from '../../apps/mobile/lib/plan-builder/types'

// Fila DB tal como la devuelve `workout_blocks ( * )`: columnas conocidas por el editor
// mobile + columnas que NO conoce (section_template_id + polimorficos) + identidad/orden/
// timestamps + relacion embebida. Simula un bloque de cardio creado en web.
function cardioRow(): Record<string, unknown> {
  return {
    id: 'blk-1',
    plan_id: 'plan-old',
    order_index: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    exercise_id: 'ex-42',
    sets: 4,
    reps: '10',
    rir: '2',
    rest_time: '90',
    notes: 'nota vieja',
    target_weight_kg: 20,
    tempo: '2011',
    superset_group: null,
    progression_type: 'weight',
    progression_value: 2.5,
    progression_mode: 'weekly_linear',
    section: 'main',
    is_override: false,
    // --- columnas que el editor mobile NO conoce ---
    section_template_id: 'sect-tmpl-abc',
    exercise_type: 'cardio',
    exercise_type_override: 'cardio',
    side_mode: 'per_side',
    reps_value: null,
    reps_unit: null,
    load_type: 'none',
    load_value: null,
    load_unit: null,
    distance_value: 5,
    distance_unit: 'km',
    duration_sec: 1800,
    target_pace_sec_per_km: 330,
    hr_zone: 'z2',
    interval_config: { work: 60, recovery: 30, unit: 'duration' },
    is_unilateral: false,
    extra_targets: ['calves'],
    warmup_rest_time: '45',
    thumbnail_url: 'https://x/y.webp',
    // relacion embebida (no es columna real)
    exercises: { name: 'Trote', muscle_group: 'Cardio', gif_url: null, video_url: null },
  }
}

// Reconstruye lo que mapDbBlock hace: BuilderBlock con `_raw` = fila completa.
function loadedBlock(raw: Record<string, unknown>): BuilderBlock {
  return {
    uid: 'block-blk-1',
    exercise_id: raw.exercise_id as string,
    exercise_name: 'Trote',
    muscle_group: 'Cardio',
    sets: raw.sets as number,
    reps: raw.reps as string,
    rir: raw.rir as string,
    rest_time: raw.rest_time as string,
    notes: raw.notes as string,
    target_weight_kg: String(raw.target_weight_kg),
    tempo: raw.tempo as string,
    superset_group: null,
    progression_type: 'weight',
    progression_value: 2.5,
    progression_mode: 'weekly_linear',
    section: 'main',
    is_override: false,
    _raw: raw,
  }
}

describe('passthroughBlockColumns', () => {
  it('descarta identidad/orden/timestamps y relaciones embebidas, conserva el resto', () => {
    const out = passthroughBlockColumns(cardioRow())
    for (const k of ['id', 'plan_id', 'order_index', 'created_at', 'updated_at', 'exercises', 'exercise']) {
      expect(out).not.toHaveProperty(k)
    }
    // columnas polimorficas y de area preservadas
    expect(out.section_template_id).toBe('sect-tmpl-abc')
    expect(out.exercise_type).toBe('cardio')
    expect(out.duration_sec).toBe(1800)
    expect(out.hr_zone).toBe('z2')
    expect(out.interval_config).toEqual({ work: 60, recovery: 30, unit: 'duration' })
  })

  it('devuelve {} para _raw ausente/invalido', () => {
    expect(passthroughBlockColumns(undefined)).toEqual({})
    expect(passthroughBlockColumns(null)).toEqual({})
  })
})

describe('serializeBlockInsert (round-trip cargar -> editar 1 campo -> guardar)', () => {
  it('preserva section_template_id + campos polimorficos tras editar solo un campo', () => {
    const raw = cardioRow()
    const block = loadedBlock(raw)
    // El coach edita UN campo de fuerza (notas) en mobile.
    block.notes = 'nota nueva'

    const payload = serializeBlockInsert(block, 0, 'plan-new')

    // Campos desconocidos por el editor: SOBREVIVEN.
    expect(payload.section_template_id).toBe('sect-tmpl-abc')
    expect(payload.exercise_type).toBe('cardio')
    expect(payload.exercise_type_override).toBe('cardio')
    expect(payload.side_mode).toBe('per_side')
    expect(payload.distance_value).toBe(5)
    expect(payload.distance_unit).toBe('km')
    expect(payload.duration_sec).toBe(1800)
    expect(payload.target_pace_sec_per_km).toBe(330)
    expect(payload.hr_zone).toBe('z2')
    expect(payload.interval_config).toEqual({ work: 60, recovery: 30, unit: 'duration' })
    expect(payload.is_unilateral).toBe(false)
    expect(payload.extra_targets).toEqual(['calves'])
    expect(payload.warmup_rest_time).toBe('45')
    expect(payload.thumbnail_url).toBe('https://x/y.webp')

    // Campo editado: mandan los valores de mobile.
    expect(payload.notes).toBe('nota nueva')

    // Plan/orden frescos; identidad/timestamps/embebida descartados.
    expect(payload.plan_id).toBe('plan-new')
    expect(payload.order_index).toBe(0)
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('created_at')
    expect(payload).not.toHaveProperty('updated_at')
    expect(payload).not.toHaveProperty('exercises')
  })

  it('bloque nuevo (sin _raw, agregado del catalogo) produce solo columnas de fuerza', () => {
    const fresh: BuilderBlock = {
      uid: 'block-new',
      exercise_id: 'ex-99',
      exercise_name: 'Sentadilla',
      muscle_group: 'Piernas',
      sets: 3,
      reps: '8-10',
    }
    const payload = serializeBlockInsert(fresh, 1, 'plan-new')

    expect(payload).not.toHaveProperty('section_template_id')
    expect(payload).not.toHaveProperty('exercise_type')
    expect(payload.exercise_id).toBe('ex-99')
    expect(payload.sets).toBe(3)
    expect(payload.reps).toBe('8-10')
    expect(payload.progression_mode).toBe('weekly_linear')
    expect(payload.section).toBe('main')
    expect(payload.plan_id).toBe('plan-new')
    expect(payload.order_index).toBe(1)
  })

  it('los campos editados sobrescriben la fila original (no al reves)', () => {
    const raw = cardioRow()
    const block = loadedBlock(raw)
    block.sets = 6
    block.rir = '1'
    const payload = serializeBlockInsert(block, 2, 'plan-new')
    expect(payload.sets).toBe(6)
    expect(payload.rir).toBe('1')
  })
})
