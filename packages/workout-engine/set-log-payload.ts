/**
 * Construcción PURA del `OptimisticLogPayload` de una serie desde los valores tipeados.
 *
 * Fuente ÚNICA del mapeo valores->payload, compartida por el `KeypadHost` (teclado multi-paso, edición
 * de series ya logueadas / próximas) y la `ActiveSetRow` (fila de registro expandida a paridad web).
 * Antes el mapeo tipado vivía inline en `KeypadHost.typedPayload`; extraerlo evita el drift entre las
 * dos superficies de captura (mismo criterio que `keypad-flow.ts` con el routing tipo->campos).
 *
 * Sin React/RN: `num`/`int` normalizan la coma es-CL (igual que el keypad web) y el commit tipado
 * mapea las keys visibles (`cardio_min`/`actual_*`/`reps_done`) a las columnas del log.
 *
 * Subido a `@eva/workout-engine` en E0.3 (specs/executor-v3): antes vivía en
 * `apps/mobile/.../set-log-payload.ts`. 100% puro → import relativo del tipo hermano.
 */
import type { OptimisticLogPayload } from './session-logs.optimistic'
import type { WorkoutLogSideMetadata } from './session-logs.reconcile'
import type { TypedKeypadMode } from './typed-keypad'

/** Parsea un string es-CL (coma decimal) a número, o null si vacío/NaN. */
export function num(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Igual que `num` pero redondea a entero (reps/FC/segundos/pasadas). */
export function int(v: string | undefined): number | null {
  const n = num(v)
  return n == null ? null : Math.round(n)
}

export interface TypedLogValues {
  actualDurationSec: number | null
  actualDistanceM: number | null
  actualHoldSec: number | null
  actualAvgHr: number | null
  repsDone: number | null
  // Solo presente en movilidad per_side (E0.5): {left_sec, right_sec} para `workout_logs.metadata`.
  // AUSENTE en los demás modos ⇒ el payload/objeto de salida no gana una key `metadata` (paridad
  // byte-idéntica con el comportamiento previo). `null` ⇒ per_side sin ningún lado tipeado.
  metadata?: WorkoutLogSideMetadata | null
}

/**
 * Mapea los valores tipados (por modo) a las columnas del log (`actual_*` / `reps_done`).
 *
 * `sideMode` (E0.5): en movilidad `per_side` el hold se tipea por lado (`hold_left_sec` /
 * `hold_right_sec`) → arma `metadata {left_sec, right_sec}` y deja `actual_hold_sec` = SUMA L+R
 * (compatibilidad con todo consumidor que ya lee el hold total). SIN `sideMode` (o cualquier otro
 * valor) el resultado es byte-idéntico al previo: un solo `actual_hold_sec` y sin key `metadata`.
 */
export function typedLogValues(
  mode: TypedKeypadMode,
  values: Record<string, string>,
  sideMode?: string | null,
): TypedLogValues {
  let actualDurationSec: number | null = null
  let actualDistanceM: number | null = null
  let actualHoldSec: number | null = null
  let actualAvgHr: number | null = null
  let repsDone: number | null = null
  // `undefined` ⇒ no se agrega la key al objeto de salida (paridad); solo per_side la define.
  let metadata: WorkoutLogSideMetadata | null | undefined
  if (mode === 'cardio') {
    const min = num(values.cardio_min)
    actualDurationSec = min != null && min > 0 ? Math.round(min * 60) : null
    actualDistanceM = num(values.actual_distance_m)
    actualAvgHr = int(values.actual_avg_hr)
  } else if (mode === 'mobility') {
    if (sideMode === 'per_side') {
      const left = int(values.hold_left_sec)
      const right = int(values.hold_right_sec)
      const hasAny = left != null || right != null
      metadata = hasAny ? { left_sec: left, right_sec: right } : null
      actualHoldSec = hasAny ? (left ?? 0) + (right ?? 0) : null
    } else {
      actualHoldSec = int(values.actual_hold_sec)
    }
  } else {
    // roller
    actualDurationSec = int(values.actual_duration_sec)
    repsDone = int(values.reps_done)
  }
  const base: TypedLogValues = { actualDurationSec, actualDistanceM, actualHoldSec, actualAvgHr, repsDone }
  return metadata === undefined ? base : { ...base, metadata }
}

/** Payload de una serie TIPADA (cardio/movilidad/roller): peso/rir van null, ejes en `actual_*`. */
export function buildTypedPayload(
  mode: TypedKeypadMode,
  values: Record<string, string>,
  blockId: string,
  setNumber: number,
  sideMode?: string | null,
): OptimisticLogPayload {
  const v = typedLogValues(mode, values, sideMode)
  return {
    blockId,
    setNumber,
    weightKg: null,
    repsDone: v.repsDone,
    // RPE: se lee de `values.rpe` (no se fuerza null). En el registro NUEVO de una serie tipada no hay
    // key `rpe` (el flujo tipado no tiene paso de esfuerzo) ⇒ int(undefined)=null, idéntico al comportamiento
    // previo. Pero al EDITAR una serie tipada ya logueada, `openSet` siembra `values.rpe` desde el log para
    // NO borrar el RPE que el alumno fijó post-registro con los dots — mirror de la web, que conserva el RPE
    // vía el hidden input `<input name="rpe" value={rpeLocal}>` en cada re-submit (`LogSetForm.tsx:1022`).
    rpe: int(values.rpe),
    rir: null,
    actualDurationSec: v.actualDurationSec,
    actualDistanceM: v.actualDistanceM,
    actualHoldSec: v.actualHoldSec,
    actualAvgHr: v.actualAvgHr,
    // Solo el flujo per_side define `v.metadata` ⇒ solo entonces el payload gana la key `metadata`
    // (los 30 asserts de paridad, sin sideMode, siguen viendo el objeto SIN `metadata`).
    ...(v.metadata !== undefined ? { metadata: v.metadata } : {}),
  }
}

/**
 * Payload de una serie de FUERZA: peso × reps + esfuerzo. A diferencia del teclado multi-paso
 * (una sola key `effort` enrutada por `effortKind`), la fila expandida captura RPE y RIR por separado
 * (dots inline), así que este builder lee ambas keys directo.
 */
export function buildStrengthPayload(
  values: Record<string, string>,
  blockId: string,
  setNumber: number,
): OptimisticLogPayload {
  // Nota rápida por serie (paridad web A.4.d / `handleSubmit` noteTrimmed, LogSetForm.tsx:365/443-458):
  // string crudo tipeado en la fila; vacío/espacios ⇒ null (misma normalización que `note.trim() || null`).
  const note = values.note?.trim()
  return {
    blockId,
    setNumber,
    weightKg: num(values.weight),
    repsDone: int(values.reps),
    rpe: int(values.rpe),
    rir: int(values.rir),
    note: note ? note : null,
  }
}
