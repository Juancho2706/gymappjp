// Serializacion del guardado del builder mobile — passthrough _raw + campos editados
// (fuerza + tipados) con reps legacy por tipo. Espeja la serializacion de la web
// (WeeklyPlanBuilder.mapDays) SIN romper el round-trip anti-destructivo (G07 §5).
//
// Riesgo mitigado: el editor mobile ahora edita bloques polimorficos (cardio/movilidad/
// roller — E5-05), pero un bloque puede llegar con campos tipados NO hidratados (bloque
// legacy cargado, o el helper del test). Estrategia de dos capas:
//   1. passthrough: la fila DB original (`_raw`) preserva TODA columna desconocida.
//   2. overlay: los campos que el editor SI conoce mandan sobre `_raw`. Los campos tipados
//      solo se sobreponen cuando estan DEFINIDOS en el bloque (`!== undefined`) — asi un
//      campo no editado/no hidratado conserva el valor de `_raw` (round-trip intacto), y un
//      campo editado en mobile gana. Un bloque nuevo (sin `_raw`) produce solo columnas de
//      fuerza (byte-identico al payload legacy).
//
// Modulo puro (sin react-native / expo) para poder testearlo con el runner del repo.
import { effectiveExerciseType, legacyRepsSummaryFor, type ExerciseType, type TypedBlockFields } from '@eva/workout-engine'
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
 * el editor mobile no toque.
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

/** "20" / "2,5" → 20 / 2.5 · vacio/invalido → null (strings de input del editor). */
function parseOptionalNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const t = String(raw).trim().replace(',', '.')
  if (t === '') return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Columnas base (fuerza) que el editor mobile SIEMPRE posee — todas presentes en el bloque
 * cargado (`mapDbBlock`), asi que sobreescribir con ellas es seguro para el round-trip.
 * `reps` es tipo-consciente: strength ⇒ texto del coach; tipado ⇒ resumen legacy ≤20 chars
 * (decision #3 expand-contract, igual que web) para preview/print/target_reps_at_log.
 */
function editedBaseColumns(b: BuilderBlock, type: ExerciseType, distanceValue: number | null, loadValue: number | null): Record<string, unknown> {
  const summaryInput: TypedBlockFields = {
    exercise_type_override: b.exercise_type_override ?? null,
    side_mode: b.side_mode ?? null,
    reps_value: b.reps_value ?? null,
    reps_unit: b.reps_unit ?? null,
    load_value: loadValue,
    load_unit: b.load_unit ?? null,
    distance_value: distanceValue,
    distance_unit: b.distance_unit ?? null,
    duration_sec: b.duration_sec ?? null,
    target_pace_sec_per_km: b.target_pace_sec_per_km ?? null,
    hr_zone: b.hr_zone ?? null,
    interval_config: b.interval_config ?? null,
    sets: b.sets ?? null,
    reps: b.reps ?? null,
  }
  const reps = type === 'strength' ? (b.reps || '8-10') : legacyRepsSummaryFor(summaryInput, type)
  return {
    exercise_id: b.exercise_id,
    sets: Number.isFinite(b.sets as number) && (b.sets as number) >= 1
      ? Math.round(b.sets as number)
      : type === 'strength' ? 3 : 1,
    reps,
    rir: b.rir || null,
    rest_time: b.rest_time || null,
    notes: b.notes || null,
    target_weight_kg: parseOptionalNumber(b.target_weight_kg),
    tempo: b.tempo || null,
    superset_group: b.superset_group || null,
    progression_type: b.progression_type || null,
    progression_value: b.progression_value != null && Number.isFinite(b.progression_value) ? b.progression_value : null,
    progression_mode: b.progression_mode ?? 'weekly_linear',
    section: (b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main'),
    is_override: b.is_override ?? false,
  }
}

/**
 * Columnas tipadas (area + polimorficos) que solo se sobreponen cuando estan DEFINIDAS en
 * el bloque (`!== undefined`). Un campo no hidratado/no editado queda undefined ⇒ no entra ⇒
 * el valor de `_raw` (passthrough) sobrevive. Esto mantiene verde el round-trip anti-destructivo
 * y, cuando el editor tipado hidrata/edita el campo, hace que el valor del bloque gane.
 */
function editedTypedColumns(b: BuilderBlock, distanceValue: number | null, loadValue: number | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const set = (key: string, defined: boolean, value: unknown) => {
    if (defined) out[key] = value
  }
  set('section_template_id', b.section_template_id !== undefined, b.section_template_id ?? null)
  set('exercise_type_override', b.exercise_type_override !== undefined, b.exercise_type_override ?? null)
  set('side_mode', b.side_mode !== undefined, b.side_mode ?? null)
  set('reps_value', b.reps_value !== undefined, b.reps_value ?? null)
  set('reps_unit', b.reps_unit !== undefined, b.reps_unit ?? null)
  set('load_type', b.load_type !== undefined, b.load_type ?? null)
  set('load_value', b.load_value !== undefined, loadValue)
  set('load_unit', b.load_unit !== undefined, b.load_unit ?? null)
  set('distance_value', b.distance_value !== undefined, distanceValue)
  set('distance_unit', b.distance_value !== undefined, distanceValue != null ? (b.distance_unit ?? 'm') : null)
  set('duration_sec', b.duration_sec !== undefined, b.duration_sec ?? null)
  set('target_pace_sec_per_km', b.target_pace_sec_per_km !== undefined, b.target_pace_sec_per_km ?? null)
  set('hr_zone', b.hr_zone !== undefined, b.hr_zone ?? null)
  set('instructions', b.instructions !== undefined, b.instructions?.trim() ? b.instructions.trim() : null)
  set('interval_config', b.interval_config !== undefined, b.interval_config ?? null)
  set('is_unilateral', b.is_unilateral !== undefined, b.is_unilateral ?? null)
  set('extra_targets', b.extra_targets !== undefined, b.extra_targets ?? null)
  set('warmup_rest_time', b.warmup_rest_time !== undefined, b.warmup_rest_time || null)
  return out
}

/**
 * Serializa un bloque del editor a payload de INSERT (`workout_blocks`) con passthrough:
 * primero la fila original completa (`_raw`), luego los campos editados (fuerza + tipados
 * definidos), y por ultimo `plan_id`/`order_index` frescos. Un bloque nuevo (sin `_raw`,
 * agregado desde el catalogo, sin campos tipados definidos) produce exactamente el payload
 * legacy (solo campos de fuerza).
 */
export function serializeBlockInsert(
  b: BuilderBlock,
  index: number,
  planId: string
): Record<string, unknown> {
  const type = effectiveExerciseType(b, { exercise_type: b.exercise_type })
  const distanceValue = parseOptionalNumber(b.distance_value)
  const loadValue = parseOptionalNumber(b.load_value)
  return {
    ...passthroughBlockColumns(b._raw),
    ...editedBaseColumns(b, type, distanceValue, loadValue),
    ...editedTypedColumns(b, distanceValue, loadValue),
    plan_id: planId,
    order_index: index,
  }
}
