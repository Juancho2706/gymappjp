// Passthrough serialization del guardado del builder mobile.
//
// Riesgo mitigado (G07 §5 "Round-trip destructivo"): el editor mobile solo conoce los
// campos de fuerza. Guardar un programa creado en web BORRABA `section_template_id` y
// todos los campos polimorficos (cardio/movilidad/roller) porque el INSERT se
// reconstruia solo con columnas conocidas. Estrategia: al cargar se conserva la fila DB
// original (`_raw`); al guardar se mergean los campos editados SOBRE `_raw` (spread), de
// modo que toda columna desconocida sobrevive el ciclo cargar -> editar -> guardar.
//
// Modulo puro (sin react-native / expo) para poder testearlo con el runner del repo.
import type { BuilderBlock } from './types'

// Columnas/relaciones que NUNCA deben viajar a un INSERT nuevo: identidad de la fila
// vieja, plan viejo y orden viejo (los asigna el persistidor), timestamps que maneja la
// BD, y las relaciones embebidas (`exercises`/`exercise`, que no son columnas reales).
const NON_INSERTABLE_BLOCK_KEYS = new Set<string>([
  'id',
  'plan_id',
  'order_index',
  'created_at',
  'updated_at',
  'exercises',
  'exercise',
])

/**
 * Columnas de una fila DB de bloque que SI deben re-insertarse tal cual (passthrough),
 * descartando identidad/orden/timestamps/relaciones embebidas. Es la base del passthrough:
 * preserva `section_template_id` y todos los campos polimorficos (exercise_type, side_mode,
 * reps_value/reps_unit, load_*, distance_*, duration_sec, target_pace_sec_per_km, hr_zone,
 * interval_config, is_unilateral, extra_targets, warmup_rest_time, thumbnail_url, ...) que
 * el editor mobile no conoce.
 */
export function passthroughBlockColumns(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (NON_INSERTABLE_BLOCK_KEYS.has(key)) continue
    out[key] = value
  }
  return out
}

/** Columnas que el editor de bloque de fuerza mobile SI edita (mandan sobre el original). */
function editedStrengthColumns(b: BuilderBlock): Record<string, unknown> {
  return {
    exercise_id: b.exercise_id,
    sets: b.sets ?? 3,
    reps: b.reps || '8-10',
    rir: b.rir || null,
    rest_time: b.rest_time || null,
    notes: b.notes || null,
    target_weight_kg: b.target_weight_kg && b.target_weight_kg.trim() ? Number(b.target_weight_kg) : null,
    tempo: b.tempo || null,
    superset_group: b.superset_group || null,
    progression_type: b.progression_type || null,
    progression_value: b.progression_value ?? null,
    progression_mode: b.progression_mode ?? 'weekly_linear',
    section: b.section ?? 'main',
    is_override: b.is_override ?? false,
  }
}

/**
 * Serializa un bloque del editor a payload de INSERT (`workout_blocks`) con passthrough:
 * primero la fila original completa (`_raw`), luego los campos editados en mobile, y por
 * ultimo `plan_id`/`order_index` frescos. Un bloque nuevo (sin `_raw`, agregado desde el
 * catalogo) produce exactamente el payload legacy (solo campos de fuerza).
 */
export function serializeBlockInsert(
  b: BuilderBlock,
  index: number,
  planId: string
): Record<string, unknown> {
  return {
    ...passthroughBlockColumns(b._raw),
    ...editedStrengthColumns(b),
    plan_id: planId,
    order_index: index,
  }
}
