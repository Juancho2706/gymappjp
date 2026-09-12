/**
 * Regla R3 de «Reps tras el reloj»: ¿se abre solo el teclado cuando el hold cierra la serie?
 *
 * Vive acá —puro, sin React ni RN, patrón `typed-screen-model.ts`— porque la MISMA decisión la toman
 * dos pantallas (`ExerciseScreenV3` sola y `SupersetScreenV3`) y una regla duplicada en dos handlers
 * de UI es exactamente cómo nacen las divergencias que después se descubren en producción.
 *
 * Lo que NO hace: abrir nada. Devuelve el foco o `null` y la pantalla decide (llama a `onOpenSet`).
 * Los huecos los calcula el MOTOR (`captureGapsFor`, R2) y llegan en el `HoldCommitInfo` del hook.
 */
import type { HoldCaptureGap, OptimisticLogPayload } from '@eva/workout-engine'
import type { HoldModuleKind } from './use-hold-module'

/** Campo con el que abre el teclado del prompt (`initialFieldIndex` del `KeypadTarget`). */
export type HoldCaptureFocus = 'reps' | 'weight'

/**
 * Tercer/cuarto argumento OPCIONAL de `onOpenSet` / `openSet` (R4 · PLAN §8.3): va SIEMPRE al final
 * de la firma, así los usos actuales del teclado de edición no cambian ni una letra.
 */
export interface OpenSetOpts {
  /**
   * Payload que se acaba de commitear. El teclado se siembra con ESTO y NUNCA con `sessionLogs`
   * (riesgo 3 del PLAN): el optimista de `logSet` todavía no propagó al re-render cuando la pantalla
   * abre, así que `existingLog` sería `undefined` y el teclado saldría vacío.
   */
  seed?: OptimisticLogPayload
  /** Campo con el que abre el teclado. Ausente ⇒ `reps` (el hueco por defecto de F1). */
  focus?: HoldCaptureFocus
  /** `'hold-gap'` ⇒ copy del prompt (SPEC §6). Ausente ⇒ el teclado de edición de siempre. */
  prompt?: 'hold-gap'
}

/**
 * Segundo argumento OPCIONAL de `onCommitSet` (= `ExecutorV3.handleCommit`). Ausente ⇒ el commit de
 * siempre; por eso `commitSetOptsFor` devuelve `undefined` cuando no hay nada que declarar y el
 * camino del alumno que ya tenía sus reps tipeadas queda byte-idéntico.
 */
export interface CommitSetOpts {
  /** R8 «Repetir»: la fila YA existe pero el alumno rehizo la serie ⇒ tratarla como serie nueva. */
  repeat?: boolean
  /**
   * R3b (enmienda E1 del owner, 12-09): este commit va a abrir el prompt de huecos, así que el
   * descanso automático arranca MINIMIZADO (la barra compacta) en vez del interstitial a pantalla
   * completa — el alumno tiene que ver el ejercicio mientras anota kg y reps. `ExecutorV3` lo expande
   * a la pantalla grande, con el MISMO reloj, cuando el prompt se resuelve.
   */
  minimizeRest?: boolean
}

/**
 * Traduce las dos decisiones de la pantalla al `opts` del commit. Existe para que `ExerciseScreenV3`
 * y `SupersetScreenV3` no puedan divergir justo en el detalle que más importa: cuando no hay nada que
 * declarar el commit viaja con `undefined`, exactamente como antes de este tren.
 */
export function commitSetOptsFor(input: { repeat?: boolean; minimizeRest?: boolean }): CommitSetOpts | undefined {
  const opts: CommitSetOpts = {}
  if (input.repeat) opts.repeat = true
  if (input.minimizeRest) opts.minimizeRest = true
  return Object.keys(opts).length > 0 ? opts : undefined
}

export interface HoldCapturePromptInput {
  /** Eje del reloj que acaba de cerrar: solo `strength_time` pide algo más (R3 b). */
  kind: HoldModuleKind
  /** `HoldCommitInfo.captureGaps` — lo que el motor vio faltando en los valores del payload (R2). */
  captureGaps: HoldCaptureGap[]
  /** `HoldCommitInfo.expiredWhileAway` — venció con la app fuera (R3 d / R6/R27 heredados). */
  expiredWhileAway: boolean
}

/**
 * Las cuatro condiciones de R3, en una sola función:
 *  (a) la serie se ENVIÓ — implícita: este helper solo se llama desde el `onCommit` del hook, que
 *      corre únicamente cuando `decideHoldAutolog` devolvió `submit` (lado `single` o `right`; el
 *      IZQUIERDO de `per_side` nunca llega acá, R3 y SPEC §5);
 *  (b) el eje es fuerza por tiempo (movilidad ⇒ `captureGapsFor` ya devuelve `[]`, pero el guard
 *      queda explícito para que la regla se lea entera en un lugar);
 *  (c) falta algo por anotar;
 *  (d) NO venció con la app fuera — ahí el canal fue el aviso del SO y el alumno vuelve cuando quiere;
 *      abrirle un teclado encima al reabrir la app sería una emboscada.
 *
 * FOCO (SPEC §5, matriz): falta solo reps ⇒ `reps`; falta el peso (con o sin reps) ⇒ `weight`. El
 * orden del array del motor (`reps` primero) es solo estabilidad de serialización para la analítica
 * (`missing`); el foco lo decide esta regla, que es la del SPEC: cuando faltan las DOS cosas el
 * alumno empieza por el peso y el teclado lo lleva a reps con «Siguiente»/pestañas.
 */
export function holdCapturePromptFor(input: HoldCapturePromptInput): { focus: HoldCaptureFocus } | null {
  if (input.kind !== 'strength_time') return null
  if (input.expiredWhileAway) return null
  if (input.captureGaps.length === 0) return null
  return { focus: input.captureGaps.includes('weight') ? 'weight' : 'reps' }
}
