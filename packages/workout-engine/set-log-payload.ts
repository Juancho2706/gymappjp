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
import type { HrMetadataV1 } from '@eva/cardio'
import type { OptimisticLogPayload } from './session-logs.optimistic'
import type { WorkoutLogMetadata, WorkoutLogSideMetadata } from './session-logs.reconcile'
import {
  distanceCaptureToMeters,
  typedKeypadContext,
  METERS_PER_KM,
  type TypedKeypadContext,
  type TypedKeypadMode,
} from './typed-keypad'
import { cardioHasDistanceAxis, repsUnitForModality } from './cardio-modality'

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
 * Rango del pace aceptado por `WorkoutLogSetSchema.actual_pace_sec_per_km` (packages/schemas).
 * Fuera de rango ⇒ el pace NO viaja (el resto de la serie se guarda igual).
 */
export const PACE_MIN_SEC_PER_KM = 1
export const PACE_MAX_SEC_PER_KM = 3600

/**
 * Pace real DERIVADO de la ronda (RF5): con tiempo y distancia registrados no hace falta pedirle
 * nada más al alumno. Misma fórmula que `timeToPaceSecPerKm` de `@eva/cardio`
 * (`Math.round(timeSec / distanceKm)`), reimplementada acá porque el motor no toma dependencias.
 * Devuelve null si falta un eje, si alguno es 0, o si el resultado cae fuera del rango del schema.
 */
export function derivedPaceSecPerKm(
  durationSec: number | null | undefined,
  distanceM: number | null | undefined,
): number | null {
  if (durationSec == null || distanceM == null) return null
  if (!(durationSec > 0) || !(distanceM > 0)) return null
  const pace = Math.round(durationSec / (distanceM / METERS_PER_KM))
  if (!Number.isFinite(pace) || pace < PACE_MIN_SEC_PER_KM || pace > PACE_MAX_SEC_PER_KM) return null
  return pace
}

/**
 * Mapea los valores tipados (por modo) a las columnas del log (`actual_*` / `reps_done`).
 *
 * 3er argumento: `side_mode` suelto (forma histórica) o el `TypedKeypadContext` completo.
 *
 * `sideMode` (E0.5): en movilidad `per_side` el hold se tipea por lado (`hold_left_sec` /
 * `hold_right_sec`) → arma `metadata {left_sec, right_sec}` y deja `actual_hold_sec` = SUMA L+R
 * (compatibilidad con todo consumidor que ya lee el hold total). SIN `sideMode` (o cualquier otro
 * valor) el resultado es byte-idéntico al previo: un solo `actual_hold_sec` y sin key `metadata`.
 *
 * `distanceUnit` (G3): con la prescripción en km la caja captura KM → acá se guarda ×1000 en
 * `actual_distance_m` (metros, unidad de la columna). Sin contexto la distancia se guarda tal cual.
 *
 * `cardioModality` (Fase C): los ejes de cardio dependen de la modalidad del ejercicio. Una modalidad
 * rep-based (cuerda/HIIT/escaladora) captura CONTEO en `reps_done` y NO tiene caja de distancia; la
 * elíptica tampoco. Acá se leen SOLO las keys que el teclado declaró para esa modalidad: lo que no se
 * pidió no se inventa (queda `null`). Sin modalidad ⇒ Min · Distancia · FC, byte-idéntico a lo previo.
 */
export function typedLogValues(
  mode: TypedKeypadMode,
  values: Record<string, string>,
  ctx?: string | null | TypedKeypadContext,
): TypedLogValues {
  const { sideMode, distanceUnit, cardioModality } = typedKeypadContext(ctx)
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
    if (cardioHasDistanceAxis(cardioModality)) {
      const distance = num(values.actual_distance_m)
      actualDistanceM = distance == null ? null : distanceCaptureToMeters(distance, distanceUnit)
    }
    // Conteo de la modalidad rep-based (saltos/reps/pisos) → `reps_done`, entero ≥ 0. Es la MISMA
    // columna que usan fuerza y las pasadas de roller; la semántica la da la modalidad del ejercicio.
    if (repsUnitForModality(cardioModality) != null) {
      const reps = int(values.reps_done)
      repsDone = reps != null && reps >= 0 ? reps : null
    }
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

/**
 * Contexto del PAYLOAD tipado: el del teclado (`TypedKeypadContext`) + lo que solo existe al cerrar
 * la serie. Superset ⇒ todo caller histórico que pasa un `TypedKeypadContext` (o el `sideMode` suelto)
 * sigue compilando y produciendo lo mismo.
 */
export interface TypedPayloadContext extends TypedKeypadContext {
  /**
   * Resumen + curva de FC del bloque cardio (specs/cardio-conectado): lo arma `zoneSessionSummary`
   * de `@eva/cardio` con el stream BLE de la ventana, o el import del reloj. Solo se persiste en
   * modo `cardio`; SIN esta key el payload es byte-idéntico al previo.
   */
  hrMetadata?: HrMetadataV1 | null
}

/** `hrMetadata` del contexto (ausente con el 3er argumento histórico `sideMode` suelto). */
function contextHrMetadata(ctx?: string | null | TypedPayloadContext): HrMetadataV1 | null {
  if (ctx == null || typeof ctx === 'string') return null
  return ctx.hrMetadata ?? null
}

/**
 * `workout_logs.metadata` (jsonb) de la serie: hold por lado (movilidad `per_side`) y/o el resumen de
 * FC bajo la clave `hr`. Devuelve `undefined` cuando no hay ninguno de los dos ⇒ el payload NO gana
 * la key `metadata` (paridad byte-idéntica con lo previo).
 */
function buildLogMetadata(
  side: WorkoutLogSideMetadata | null | undefined,
  hr: HrMetadataV1 | null,
): WorkoutLogMetadata | null | undefined {
  if (hr == null) return side
  return { ...(side ?? {}), hr }
}

/** Payload de una serie TIPADA (cardio/movilidad/roller): peso/rir van null, ejes en `actual_*`. */
export function buildTypedPayload(
  mode: TypedKeypadMode,
  values: Record<string, string>,
  blockId: string,
  setNumber: number,
  ctx?: string | null | TypedPayloadContext,
): OptimisticLogPayload {
  const v = typedLogValues(mode, values, ctx)
  // Pace REAL derivado (RF5): solo cuando la ronda quedó con tiempo Y distancia y el resultado cae en
  // el rango del schema. Sin ambos ejes el payload NO gana la key (paridad byte-idéntica con lo previo).
  const pace = derivedPaceSecPerKm(v.actualDurationSec, v.actualDistanceM)
  // FC del bloque: SOLO cardio. Un `hrMetadata` que llegue en movilidad/roller se ignora — esos modos
  // no tienen stream ni import, y escribirlo ensuciaría su `metadata` (donde vive el hold por lado).
  const metadata = buildLogMetadata(v.metadata, mode === 'cardio' ? contextHrMetadata(ctx) : null)
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
    ...(pace != null ? { actualPaceSecPerKm: pace } : {}),
    // Solo el flujo per_side (o un cardio con `hrMetadata`) define `metadata` ⇒ solo entonces el
    // payload gana la key (los 30 asserts de paridad, sin sideMode ni FC, siguen viendo el objeto
    // SIN `metadata`).
    ...(metadata !== undefined ? { metadata } : {}),
  }
}

/**
 * `metadata` de una serie de FUERZA unilateral: reps por lado (tren «ciclo real y por lado», R3).
 * Espejo de `{left_sec,right_sec}` para el eje de reps — la columna es la MISMA (`workout_logs.metadata`).
 *
 * Se declara como intersección con `WorkoutLogSideMetadata` (y no como shape suelto) para que siga
 * siendo asignable a `WorkoutLogMetadata`, la columna completa que transporta `OptimisticLogPayload`.
 * DEUDA declarada en la SDD (DATA-SECURITY §7.2): cuando `WorkoutLogSideMetadata`
 * (`session-logs.reconcile.ts:13-16`) sume `left_reps`/`right_reps`, este alias colapsa a ese tipo.
 */
export type WorkoutLogSideRepsMetadata = WorkoutLogSideMetadata & {
  left_reps?: number | null
  right_reps?: number | null
}

/** Rango válido de reps por lado: espejo exacto de la regex `^[0-9]{1,4}$` del SQL (R27). */
const SIDE_REPS_MAX = 9999

/** Reps de UN lado: entero 0..9999. Vacío, no numérico o fuera de rango ⇒ `null` (ese lado no viaja). */
function sideReps(v: string | undefined): number | null {
  const n = int(v)
  if (n == null || n < 0 || n > SIDE_REPS_MAX) return null
  return n
}

/**
 * Payload de una serie de FUERZA: peso × reps + esfuerzo. A diferencia del teclado multi-paso
 * (una sola key `effort` enrutada por `effortKind`), la fila expandida captura RPE y RIR por separado
 * (dots inline), así que este builder lee ambas keys directo.
 *
 * 4º argumento OPCIONAL (`sideMode` suelto o el contexto del bloque, misma convención que
 * `typedLogValues`): con `side_mode ∈ {per_side, alternating}` (R4: los dos capturan igual) la serie
 * se tipea POR LADO (`reps_left` / `reps_right`) y entonces:
 *  - `reps_done` = **mínimo** de los dos lados (R3) —o el único presente—, para que la doble
 *    progresión y el PR por e1RM sigan comparando una magnitud por lado y no una suma inflada;
 *  - el desglose viaja en `metadata {left_reps, right_reps}` (de ahí salen el «10 / 10» y el tonelaje).
 * SIN el argumento (o con cualquier otro `side_mode`) el payload es byte-idéntico al previo: se lee
 * `values.reps` y el objeto NO gana la key `metadata`.
 */
export function buildStrengthPayload(
  values: Record<string, string>,
  blockId: string,
  setNumber: number,
  ctx?: string | null | TypedKeypadContext,
): OptimisticLogPayload {
  // Nota rápida por serie (paridad web A.4.d / `handleSubmit` noteTrimmed, LogSetForm.tsx:365/443-458):
  // string crudo tipeado en la fila; vacío/espacios ⇒ null (misma normalización que `note.trim() || null`).
  const note = values.note?.trim()
  const { sideMode } = typedKeypadContext(ctx)
  const perSide = sideMode === 'per_side' || sideMode === 'alternating'
  const left = perSide ? sideReps(values.reps_left) : null
  const right = perSide ? sideReps(values.reps_right) : null
  // Un solo lado tipeado alcanza para que la serie sea "por lado": el otro queda `null` en el jsonb
  // (vaciado explícito) y `reps_done` toma el presente. Ningún lado ⇒ ni metadata ni desvío: se cae a
  // `values.reps`, que en el teclado por lado no existe (⇒ null) pero sí en superficies legacy.
  const hasSide = left != null || right != null
  // `undefined` ⇒ el payload NO gana la key `metadata` (paridad byte-idéntica sin `ctx`).
  const metadata: WorkoutLogSideRepsMetadata | undefined = hasSide
    ? { left_reps: left, right_reps: right }
    : undefined
  return {
    blockId,
    setNumber,
    weightKg: num(values.weight),
    repsDone: hasSide ? Math.min(...([left, right].filter((r): r is number => r != null))) : int(values.reps),
    rpe: int(values.rpe),
    rir: int(values.rir),
    note: note ? note : null,
    ...(metadata !== undefined ? { metadata } : {}),
  }
}
