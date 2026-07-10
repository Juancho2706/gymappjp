/**
 * Routing PURO tipo->campos del teclado del ejecutor (E2-10 · fix QA Ronda 4 · hallazgo 5).
 *
 * Decide, para UNA serie, qué campos ofrece el teclado según el tipo EFECTIVO del bloque:
 *  - strength → peso(kg) → reps → (esfuerzo RPE/RIR opcional).
 *  - cardio/movilidad/roller → los `typedKeypadFields` del modo (min/metros/FC · hold · seg/pasadas).
 *
 * Fuente ÚNICA testeable (sin React/RN): antes esta decisión vivía duplicada inline en `openSet`
 * (ExecutorV2) y en el `steps` de `KeypadHost`, y un drift entre ambas hacía que un bloque de
 * MOVILIDAD/HOLD abriera el teclado de kg×reps (el bug del hallazgo 5). Ahora ambos consumen esto.
 * Espeja el `mode={effType}` de la web (`LogSetForm`) reusando la MISMA `typedKeypadFields` del
 * engine → cero drift web/mobile. El tipo efectivo = `block.exercise_type_override ?? exercise.exercise_type ?? 'strength'`.
 */
import {
  effectiveExerciseType,
  typedKeypadFields,
  formatTypedObjective,
  type TypedKeypadFieldDef,
  type TypedKeypadMode,
  type TypedObjectiveInput,
} from '@eva/workout-engine'

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
  /** Si el bloque pide esfuerzo: 'rpe' | 'rir'; null ⇒ el flujo termina en reps (o es tipado). */
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
   * Bloques TIPADOS (cardio/movilidad/roller): reemplaza el flujo peso→reps→esfuerzo por los campos
   * tipados de `typedKeypadFields`. Ausente ⇒ flujo strength. El commit mapea las keys tipadas a las
   * columnas `actual_*` / `reps_done` (mismo pipeline que web `TypedLogSetRow`).
   */
  typed?: { mode: TypedKeypadMode; fields: TypedKeypadFieldDef[]; objective: string }
}

/** Paso del host: una pantalla de teclado numérico, o el paso de esfuerzo (dots). */
export type KeypadStep =
  | { kind: 'keypad'; key: string; mode: 'weight' | 'reps' | 'decimal' | 'integer'; unit: string; label: string }
  | { kind: 'effort' }

export const STRENGTH_KEYPAD_STEPS: KeypadStep[] = [
  { kind: 'keypad', key: 'weight', mode: 'weight', unit: 'kg', label: 'Peso (kg)' },
  { kind: 'keypad', key: 'reps', mode: 'reps', unit: 'reps', label: 'Repeticiones' },
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
 */
export function typedTargetFor(block: BlockForKeypad, exercise: ExerciseForKeypad): TypedTargetInfo | null {
  const effType = effectiveExerciseType(block, exercise)
  if (effType === 'strength') return null
  const mode = effType as TypedKeypadMode
  return { mode, fields: typedKeypadFields(mode), objective: formatTypedObjective(block, mode) }
}

/**
 * Secuencia de pasos del teclado para un target ya resuelto: campos tipados (si `typed`) o el flujo
 * strength peso→reps→(esfuerzo). `null` ⇒ sin pasos (teclado cerrado). Las reglas decimales de cada
 * campo tipado (min/distancia = decimal; FC/segundos/hold/pasadas = enteros) las decide el engine y
 * acá se mapean a los modos 'decimal' | 'integer' del `TypedKeypad`.
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
  return [...STRENGTH_KEYPAD_STEPS, ...(target.effortKind ? [{ kind: 'effort' as const }] : [])]
}
