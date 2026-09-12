/**
 * Routing PURO tipo->campos del teclado del ejecutor (E2-10 · fix QA Ronda 4 · hallazgo 5).
 *
 * Decide, para UNA serie, qué campos ofrece el teclado según el tipo EFECTIVO del bloque:
 *  - strength → peso(kg) → reps. El esfuerzo (RPE/RIR) ya no se pide acá: vive en la fila.
 *  - cardio/movilidad/roller → los `typedKeypadFields` del modo (min/metros/FC · hold · seg/pasadas).
 *
 * Fuente ÚNICA testeable (sin React/RN): antes esta decisión vivía duplicada inline en `openSet`
 * (ExecutorV2) y en el `steps` de `KeypadHost`, y un drift entre ambas hacía que un bloque de
 * MOVILIDAD/HOLD abriera el teclado de kg×reps (el bug del hallazgo 5). Ahora ambos consumen esto.
 * Espeja el `mode={effType}` de la web (`LogSetForm`) reusando la MISMA `typedKeypadFields` del
 * engine → cero drift web/mobile. El tipo efectivo = `block.exercise_type_override ?? exercise.exercise_type ?? 'strength'`.
 *
 * Subido a `@eva/workout-engine` en E0.3 (specs/executor-v3) para eliminar el espejo manual web/mobile:
 * antes vivía en `apps/mobile/.../keypad-flow.ts`. 100% puro → import relativo de los módulos hermanos.
 */
import { effectiveExerciseType } from './workout-exercise-type'
import { holdSidesFor } from './hold-autolog'
import type { HoldSource } from './session-logs.reconcile'
import {
  typedKeypadFields,
  formatTypedObjective,
  type TypedKeypadContext,
  type TypedKeypadFieldDef,
  type TypedKeypadMode,
  type TypedObjectiveInput,
} from './typed-keypad'

/** Objetivo del teclado: qué serie de qué bloque se está registrando + el estado inicial. */
export interface KeypadTarget {
  blockId: string
  setNumber: number
  exerciseName: string
  targetReps: string
  /** Series objetivo del bloque (para el header "Objetivo {sets}×{reps}"). Solo strength. */
  targetSets?: number | null
  suggestedWeight: number | null
  /** Mejor marca previa (para el header "Última vez {kg} × {reps}"). Solo strength. */
  lastPrev?: { weightKg: number | null; reps: number | null } | null
  /**
   * Si el bloque pide esfuerzo: 'rpe' | 'rir'; null ⇒ no pide (o es tipado). Ya NO agrega pasos al
   * teclado — el esfuerzo se captura en la fila —; sobrevive porque el host lo usa para decidir qué
   * columna (`rpe`/`rir`) preservar al editar una serie ya logueada.
   */
  effortKind: 'rpe' | 'rir' | null
  /** Valores iniciales (draft restaurado o autollenado "última vez"). */
  initialValues?: Record<string, string>
  /** Paso inicial (draft restaurado). */
  initialFieldIndex?: number
  /**
   * Se está EDITANDO una serie ya logueada (tap en el chip recap) — no registrando una nueva. La web
   * reabre la MISMA fila con los valores sembrados y el botón pasa de 'Listo' a 'Guardar'
   * (`LogSetForm.tsx:696`). El host usa esto para el label del botón de confirmación.
   */
  isEdit?: boolean
  /**
   * Bloques TIPADOS (cardio/movilidad/roller): reemplaza el flujo peso→reps por los campos
   * tipados de `typedKeypadFields`. Ausente ⇒ flujo strength. El commit mapea las keys tipadas a las
   * columnas `actual_*` / `reps_done` (mismo pipeline que web `TypedLogSetRow`).
   */
  typed?: { mode: TypedKeypadMode; fields: TypedKeypadFieldDef[]; objective: string }
  /**
   * `side_mode` del bloque de FUERZA (tren «ciclo real y por lado», R3/R4): `per_side` y
   * `alternating` capturan igual ⇒ el flujo pasa a peso → reps izq → reps der. Ausente/`null` ⇒
   * flujo strength de siempre (peso → reps), byte-idéntico.
   *
   * Vive acá y NO en `typed` a propósito (R18): la fuerza nunca entra al carril tipado —
   * `buildTypedPayload` escribe `weightKg: null` y `rir: null`, así que una serie por lado
   * despachada por ahí se guardaría sin peso ni esfuerzo. El commit sigue siendo
   * `buildStrengthPayload(values, blockId, setNumber, { sideMode })`.
   */
  sideMode?: 'per_side' | 'alternating' | null
  /**
   * FUERZA POR TIEMPO (specs/cuenta-atras-en-pantalla, D3): el bloque sigue siendo strength pero se
   * prescribe con `reps_unit = 'sec'` + `duration_sec` ⇒ el flujo pasa de peso → reps a
   * peso → reps (opcionales, F1) → segundos. Hermano de `sideMode`, y por el MISMO motivo vive acá
   * y no en `typed` (R18):
   * la fuerza nunca cruza al carril tipado, que escribiría `weightKg: null` y `rir: null`.
   * El commit es `buildStrengthTimePayload(values, blockId, setNumber, { sideMode, holdSource })`.
   *
   * Los lados los decide `holdSidesFor` (R34): con `per_side` el flujo captura los DOS lados; con
   * `alternating` uno solo (H7, igual que movilidad).
   */
  strengthTimeMode?: boolean
  /**
   * FUERZA POR TIEMPO al EDITAR una serie ya cerrada por el reloj («Reps tras el reloj», R5/R6):
   * de dónde salió el hold que se está reabriendo (`'timer'` = lo cerró la cuenta atrás sola,
   * `'manual'` = «Listo» antes de 0). El host lo reenvía tal cual a `buildStrengthTimePayload` para
   * que el re-commit NO degrade `metadata.hold_source` a `'manual'` solo por pasar por el teclado.
   * `null`/ausente ⇒ sin marca que conservar (serie nueva o fuera de fuerza por tiempo).
   */
  holdSource?: HoldSource | null
  /**
   * El teclado se abrió porque el hold cerró con huecos (R2/R3: `captureGapsFor` del motor), no
   * porque el alumno tocó «Editar». Único valor por ahora: `'hold-gap'`, que dispara el copy de
   * SPEC §6 («Sin reps» como secundario). Ausente ⇒ apertura manual de siempre, copy de siempre.
   */
  prompt?: 'hold-gap'
}

/**
 * Paso del host: una pantalla de teclado numérico.
 *
 * Antes existía además una variante `{ kind: 'effort' }` (los dots de RPE/RIR al final del flujo de
 * fuerza). El esfuerzo salió del teclado por decisión CEO — su única superficie es el panel de la FILA
 * (`EffortTicksV3` en RN, el bloque de esfuerzo de `LogSetForm` en web) — y ni el host web ni el RN
 * consumían ya ese paso, así que la variante se eliminó para que el tipo no mienta sobre el flujo real.
 */
export type KeypadStep = {
  kind: 'keypad'
  key: string
  mode: 'weight' | 'reps' | 'decimal' | 'integer'
  unit: string
  label: string
}

export const STRENGTH_KEYPAD_STEPS: KeypadStep[] = [
  { kind: 'keypad', key: 'weight', mode: 'weight', unit: 'kg', label: 'Peso (kg)' },
  { kind: 'keypad', key: 'reps', mode: 'reps', unit: 'reps', label: 'Repeticiones' },
]

/**
 * Flujo de FUERZA unilateral (`side_mode` `per_side` | `alternating`): UN peso y DOS reps —
 * peso → reps izq → reps der (D2: un solo peso, dos lados). Mismo primer paso que
 * `STRENGTH_KEYPAD_STEPS` (modo `weight` ⇒ decimal + chips de peso en el host) y los dos lados en
 * modo `reps` (entero), así que el teclado no cambia de comportamiento, solo de secuencia.
 *
 * Copys canónicos «Izq» / «Der» — los mismos rótulos que ya pinta la fila per_side de la web
 * (`LogSetForm.tsx:2097,2110`); nunca «Izquierda»/«Derecha», que no entran en el header.
 * Las keys son las que lee `buildStrengthPayload` con `ctx.sideMode` (`reps_left` / `reps_right`).
 */
export const STRENGTH_PER_SIDE_KEYPAD_STEPS: KeypadStep[] = [
  { kind: 'keypad', key: 'weight', mode: 'weight', unit: 'kg', label: 'Peso (kg)' },
  { kind: 'keypad', key: 'reps_left', mode: 'reps', unit: 'reps', label: 'Izq' },
  { kind: 'keypad', key: 'reps_right', mode: 'reps', unit: 'reps', label: 'Der' },
]

/**
 * Flujo de FUERZA POR TIEMPO (D3, con el paso REPS de vuelta en F1): peso → reps → segundos. Los dos
 * primeros pasos son los MISMOS de `STRENGTH_KEYPAD_STEPS` (modo `weight` ⇒ decimal + chips de peso;
 * modo `reps` ⇒ entero) y el hold va en modo entero, así que el teclado no cambia de comportamiento,
 * solo de secuencia.
 *
 * Por qué vuelve REPS (owner 11-09): «reps es algo esencial para los ejercicios de fuerza aunque le
 * pongamos tiempo». Es OPCIONAL — el alumno puede saltar el paso y guardar solo el hold
 * (`buildStrengthTimePayload` deja `reps_done` en `null` cuando viene vacío).
 *
 * La key del hold es la MISMA de movilidad (`typed-keypad.ts:102`) para que el motor lo lea con una
 * sola rama (`strengthHoldValues` / `typedLogValues`); el rótulo es «Segundos» porque acá el hold no
 * es un eje más de un bloque tipado, es la prescripción entera de la serie.
 */
export const STRENGTH_TIME_KEYPAD_STEPS: KeypadStep[] = [
  { kind: 'keypad', key: 'weight', mode: 'weight', unit: 'kg', label: 'Peso (kg)' },
  { kind: 'keypad', key: 'reps', mode: 'reps', unit: 'reps', label: 'Repeticiones' },
  { kind: 'keypad', key: 'actual_hold_sec', mode: 'integer', unit: 'seg', label: 'Segundos' },
]

/**
 * Flujo de FUERZA POR TIEMPO unilateral (`side_mode === 'per_side'`, R34): UN peso, las reps
 * OPCIONALES (F1) y DOS holds — peso → reps → hold izq → hold der, una sola fila por serie con
 * `actual_hold_sec = L + R`.
 *
 * Las reps son UNA sola caja también acá: el eje por lado de esta prescripción es el TIEMPO, no las
 * reps (por eso nunca aparecen `reps_left`/`reps_right` en modo tiempo).
 *
 * Keys y rótulos del hold idénticos a los de movilidad `per_side` (`typed-keypad.ts:102-103`): la
 * captura del eje TIEMPO es la misma en los dos tipos, y así `strengthHoldValues` no necesita una
 * rama propia. `alternating` NO usa estos pasos (H7): captura un solo lado, como movilidad hoy.
 */
export const STRENGTH_TIME_PER_SIDE_KEYPAD_STEPS: KeypadStep[] = [
  { kind: 'keypad', key: 'weight', mode: 'weight', unit: 'kg', label: 'Peso (kg)' },
  { kind: 'keypad', key: 'reps', mode: 'reps', unit: 'reps', label: 'Repeticiones' },
  { kind: 'keypad', key: 'hold_left_sec', mode: 'integer', unit: 'seg', label: 'Hold izq.' },
  { kind: 'keypad', key: 'hold_right_sec', mode: 'integer', unit: 'seg', label: 'Hold der.' },
]

/** Subconjunto del bloque que necesita el routing (evita atar a `SessionBlock`, que arrastra RN). */
export type BlockForKeypad = { exercise_type_override?: string | null } & TypedObjectiveInput
/** Subconjunto del ejercicio prescrito: sólo el tipo importa para el routing. */
export type ExerciseForKeypad = { exercise_type?: string | null } | null | undefined

/** Descriptor tipado para `KeypadTarget.typed`, o `null` si el bloque resuelve a strength. */
export interface TypedTargetInfo {
  mode: TypedKeypadMode
  fields: TypedKeypadFieldDef[]
  objective: string
}

/**
 * Núcleo del routing tipo->campos: dado (bloque, ejercicio) devuelve el descriptor tipado
 * (modo + campos del teclado + objetivo formateado) o `null` cuando el tipo efectivo es strength.
 * Un bloque de HOLD pide segundos de hold; cardio min/metros/FC; roller seg/pasadas. El override del
 * bloque gana sobre el tipo del ejercicio (decisión #2 del PLAN movida-entrenamiento).
 *
 * 3er argumento OPCIONAL (`TypedKeypadContext`): contexto del bloque que ajusta los campos —
 * `sideMode` (hold por lado), `distanceUnit` (caja en km) y `cardioModality` (ejes por modalidad).
 * Sin él el resultado es byte-idéntico al previo, así que los callers actuales no cambian.
 */
export function typedTargetFor(
  block: BlockForKeypad,
  exercise: ExerciseForKeypad,
  ctx?: string | null | TypedKeypadContext,
): TypedTargetInfo | null {
  const effType = effectiveExerciseType(block, exercise)
  if (effType === 'strength') return null
  const mode = effType as TypedKeypadMode
  return { mode, fields: typedKeypadFields(mode, ctx), objective: formatTypedObjective(block, mode) }
}

/**
 * Secuencia de pasos del teclado para un target ya resuelto: campos tipados (si `typed`) o el flujo
 * strength peso→reps. `null` ⇒ sin pasos (teclado cerrado). El esfuerzo (RPE/RIR) NO es un paso del
 * teclado: se captura en la fila, así que `effortKind` no altera esta secuencia. Las reglas decimales de cada
 * campo tipado (min/distancia = decimal; FC/segundos/hold/pasadas = enteros) las decide el engine y
 * acá se mapean a los modos 'decimal' | 'integer' del `TypedKeypad`.
 *
 * El `sideMode` solo pesa en la rama NO tipada (R18): manda el TIPO del bloque — un cardio/movilidad/
 * roller unilateral sigue con sus campos tipados, y la fuerza por lado nunca cruza a ese carril.
 */
export function keypadStepsForTarget(target: KeypadTarget | null): KeypadStep[] {
  if (!target) return []
  if (target.typed) {
    return target.typed.fields.map((f) => ({
      kind: 'keypad' as const,
      key: f.key,
      mode: f.allowDecimal ? ('decimal' as const) : ('integer' as const),
      unit: f.unit,
      label: f.label,
    }))
  }
  // Fuerza POR TIEMPO (D3 + F1): peso → reps → segundos, con los dos lados del HOLD solo si
  // `holdSidesFor` los pide (R34;
  // `alternating` captura una sola caja para el eje tiempo, H7). Va ANTES de la rama por lado del eje
  // reps, que sí trata `alternating` como bilateral y pediría «reps izq/der» sobre una plancha.
  if (target.strengthTimeMode) {
    return holdSidesFor(target.sideMode).length === 2
      ? [...STRENGTH_TIME_PER_SIDE_KEYPAD_STEPS]
      : [...STRENGTH_TIME_KEYPAD_STEPS]
  }
  if (target.sideMode === 'per_side' || target.sideMode === 'alternating') {
    return [...STRENGTH_PER_SIDE_KEYPAD_STEPS]
  }
  return [...STRENGTH_KEYPAD_STEPS]
}
