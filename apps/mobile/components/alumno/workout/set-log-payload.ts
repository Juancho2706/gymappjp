/**
 * Construcción PURA del `OptimisticLogPayload` de una serie desde los valores tipeados (mobile).
 *
 * Fuente ÚNICA del mapeo valores->payload, compartida por el `KeypadHost` (teclado multi-paso, edición
 * de series ya logueadas / próximas) y la `ActiveSetRow` (fila de registro expandida a paridad web).
 * Antes el mapeo tipado vivía inline en `KeypadHost.typedPayload`; extraerlo evita el drift entre las
 * dos superficies de captura (mismo criterio que `keypad-flow.ts` con el routing tipo->campos).
 *
 * Sin React/RN: `num`/`int` normalizan la coma es-CL (igual que el keypad web) y el commit tipado
 * mapea las keys visibles (`cardio_min`/`actual_*`/`reps_done`) a las columnas del log.
 */
import type { OptimisticLogPayload, TypedKeypadMode } from '@eva/workout-engine'

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
}

/** Mapea los valores tipados (por modo) a las columnas del log (`actual_*` / `reps_done`). */
export function typedLogValues(mode: TypedKeypadMode, values: Record<string, string>): TypedLogValues {
  let actualDurationSec: number | null = null
  let actualDistanceM: number | null = null
  let actualHoldSec: number | null = null
  let actualAvgHr: number | null = null
  let repsDone: number | null = null
  if (mode === 'cardio') {
    const min = num(values.cardio_min)
    actualDurationSec = min != null && min > 0 ? Math.round(min * 60) : null
    actualDistanceM = num(values.actual_distance_m)
    actualAvgHr = int(values.actual_avg_hr)
  } else if (mode === 'mobility') {
    actualHoldSec = int(values.actual_hold_sec)
  } else {
    // roller
    actualDurationSec = int(values.actual_duration_sec)
    repsDone = int(values.reps_done)
  }
  return { actualDurationSec, actualDistanceM, actualHoldSec, actualAvgHr, repsDone }
}

/** Payload de una serie TIPADA (cardio/movilidad/roller): peso/rir van null, ejes en `actual_*`. */
export function buildTypedPayload(
  mode: TypedKeypadMode,
  values: Record<string, string>,
  blockId: string,
  setNumber: number,
): OptimisticLogPayload {
  const v = typedLogValues(mode, values)
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
