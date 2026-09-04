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
  if (target.sideMode === 'per_side' || target.sideMode === 'alternating') {
    return [...STRENGTH_PER_SIDE_KEYPAD_STEPS]
  }
  return [...STRENGTH_KEYPAD_STEPS]
}
