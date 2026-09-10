// Round-trip anti-destructivo del guardado del builder mobile (G07 §5).
// El modulo bajo test es puro (sin react-native/expo), asi que corre con el runner
// del repo aunque viva en apps/mobile. Vitest lo colecta por el glob `tests/**`.
import { describe, it, expect } from 'vitest'
import { applyStrengthModeChange } from '@eva/plan-builder'
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

// ── Casos TIPADOS (E5-05/E5-07): el editor mobile ahora hidrata/edita campos polimorficos.
// Verifican que (a) los campos tipados DEFINIDOS en el bloque ganan sobre `_raw`, (b) `reps`
// se recomputa como resumen legacy por tipo, y (c) los campos tipados NO tocados siguen
// viniendo de `_raw` (passthrough intacto).

/** Bloque cardio hidratado (como mapDbBlock): campos tipados DEFINIDOS + `_raw`. */
function hydratedCardioBlock(): BuilderBlock {
  const raw = cardioRow()
  return {
    uid: 'block-blk-1',
    exercise_id: raw.exercise_id as string,
    exercise_name: 'Trote',
    muscle_group: 'Cardio',
    sets: 3,
    reps: '10',
    section: 'main',
    section_template_id: 'sect-tmpl-abc',
    is_override: false,
    exercise_type: 'cardio',
    exercise_type_override: 'cardio',
    side_mode: 'per_side',
    reps_value: null,
    reps_unit: null,
    load_type: 'none',
    load_unit: null,
    distance_value: '',
    distance_unit: 'km',
    duration_sec: 1800,
    target_pace_sec_per_km: 330,
    hr_zone: 2,
    interval_config: null,
    is_unilateral: false,
    extra_targets: ['calves'],
    warmup_rest_time: '45',
    _raw: raw,
  }
}

describe('serializeBlockInsert — bloques tipados (cardio/movilidad/roller)', () => {
  it('cardio editado: los campos tipados del bloque ganan y reps es el resumen legacy', () => {
    const block = hydratedCardioBlock()
    // El coach edita la duracion a 20 min (1200s).
    block.duration_sec = 1200

    const payload = serializeBlockInsert(block, 0, 'plan-new')

    // Tipo/area/tipados editados o hidratados ganan sobre `_raw`.
    expect(payload.exercise_type_override).toBe('cardio')
    expect(payload.section_template_id).toBe('sect-tmpl-abc')
    expect(payload.duration_sec).toBe(1200) // editado (no el 1800 de _raw)
    expect(payload.hr_zone).toBe(2) // hidratado como numero (no el 'z2' de _raw)
    expect(payload.side_mode).toBe('per_side')
    // reps = resumen legacy por tipo (cardio: duracion + zona), NO el texto de fuerza.
    expect(payload.reps).toBe('20min Z2')
    // distance_value vaciado en el editor ⇒ null (gana sobre el 5 de _raw).
    expect(payload.distance_value).toBeNull()
    expect(payload.distance_unit).toBeNull()
    expect(payload.order_index).toBe(0)
    expect(payload.plan_id).toBe('plan-new')
  })

  it('cardio nuevo (sin _raw) escribe columnas tipadas y resumen, sin passthrough', () => {
    const block: BuilderBlock = {
      uid: 'block-new-cardio',
      exercise_id: 'ex-77',
      exercise_name: 'Bici',
      muscle_group: 'Cardio',
      sets: 1,
      section: 'main',
      section_template_id: '0000a5ec-0000-0000-0000-000000000010',
      exercise_type_override: 'cardio',
      duration_sec: 1200,
      hr_zone: 3,
      distance_value: '',
    }
    const payload = serializeBlockInsert(block, 4, 'plan-new')

    expect(payload.exercise_type_override).toBe('cardio')
    expect(payload.section_template_id).toBe('0000a5ec-0000-0000-0000-000000000010')
    expect(payload.duration_sec).toBe(1200)
    expect(payload.hr_zone).toBe(3)
    expect(payload.reps).toBe('20min Z3')
    // sin _raw ⇒ sin columnas fantasma de identidad
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('created_at')
    expect(payload.order_index).toBe(4)
  })

  it('roller: pasadas → reps resumen "N pasadas"', () => {
    const block: BuilderBlock = {
      uid: 'block-roller',
      exercise_id: 'ex-88',
      exercise_name: 'Foam roll cuadriceps',
      muscle_group: 'Piernas',
      section: 'cooldown',
      exercise_type_override: 'roller',
      reps_value: 10,
      reps_unit: 'passes',
    }
    const payload = serializeBlockInsert(block, 0, 'plan-new')
    expect(payload.exercise_type_override).toBe('roller')
    expect(payload.reps_value).toBe(10)
    expect(payload.reps_unit).toBe('passes')
    expect(payload.reps).toBe('10 pasadas')
  })
})

/**
 * W2.2 — el espejo legacy de `workout_blocks.reps` en fuerza POR TIEMPO.
 *
 * `reps` es NOT NULL y Zod le exige `min(1)`, así que el bloque SIEMPRE lo escribe. Lo que cambia
 * en modo Segundos es QUÉ escribe: el resumen del reloj («30s» / «30s/lado») en vez del texto del
 * coach o del fallback '8-10'. Ese espejo es lo que ven la app vieja del alumno, los chips, el
 * print, el historial y `target_reps_at_log`: dejarlo en «8-12» hace que un bloque que el coach
 * pasó a Segundos siga anunciando repeticiones en todas esas superficies.
 */
describe('serializeBlockInsert — fuerza por tiempo (W2.2)', () => {
  const plancha = (over: Partial<BuilderBlock> = {}): BuilderBlock => ({
    uid: 'block-hold',
    exercise_id: 'ex-99',
    exercise_name: 'Plancha frontal mantenida',
    muscle_group: 'Core',
    section: 'main',
    sets: 3,
    reps: '8-12',
    target_weight_kg: '10',
    rir: '2',
    rest_time: '90',
    duration_sec: 30,
    reps_unit: 'sec',
    ...over,
  })

  it('bilateral: reps espejo "30s" y las dos columnas del modo tiempo viajan', () => {
    const payload = serializeBlockInsert(plancha(), 0, 'plan-new')

    expect(payload.reps).toBe('30s')
    expect(payload.duration_sec).toBe(30)
    expect(payload.reps_unit).toBe('sec')
    // D3: la prescripción de fuerza NO se pierde por prescribir en segundos.
    expect(payload.sets).toBe(3)
    expect(payload.target_weight_kg).toBe(10)
    expect(payload.rir).toBe('2')
  })

  it('per_side: reps espejo "30s/lado"', () => {
    const payload = serializeBlockInsert(plancha({ side_mode: 'per_side' }), 0, 'plan-new')
    expect(payload.reps).toBe('30s/lado')
    expect(payload.side_mode).toBe('per_side')
  })

  it('fuerza clásica NO cambia: manda el texto del coach (y el fallback 8-10 sigue vivo)', () => {
    const clasico = plancha({ duration_sec: undefined, reps_unit: undefined })
    expect(serializeBlockInsert(clasico, 0, 'plan-new').reps).toBe('8-12')
    expect(serializeBlockInsert({ ...clasico, reps: '' }, 0, 'plan-new').reps).toBe('8-10')
  })

  it('un `duration_sec` suelto sin `reps_unit: sec` NO enciende el espejo (AND de R3)', () => {
    const residuo = plancha({ reps_unit: undefined })
    expect(serializeBlockInsert(residuo, 0, 'plan-new').reps).toBe('8-12')
  })

  it('volver a Reps: los `null` EXPLÍCITOS del strip llegan al payload y pisan a `_raw`', () => {
    // La fila vieja en DB ya estaba en modo tiempo: si el strip no viajara, `_raw` repondría el
    // reloj y el alumno seguiría viendo la cuenta atrás en un bloque que el coach volvió a Reps.
    const raw = {
      id: 'blk-hold',
      plan_id: 'plan-old',
      order_index: 2,
      exercise_id: 'ex-99',
      sets: 3,
      reps: '30s',
      duration_sec: 30,
      reps_unit: 'sec',
    }
    const vueltoAReps = applyStrengthModeChange({ ...plancha(), _raw: raw } as BuilderBlock, 'reps')

    // El strip deja `null` explícito (no `undefined`): es lo único que sobrevive al passthrough.
    expect(vueltoAReps.duration_sec).toBeNull()
    expect(vueltoAReps.reps_unit).toBeNull()

    const payload = serializeBlockInsert(vueltoAReps, 0, 'plan-new')
    expect(payload.duration_sec).toBeNull()
    expect(payload.reps_unit).toBeNull()
    expect(payload.reps).toBe('8-12')
  })
})
