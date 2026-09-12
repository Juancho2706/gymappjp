import { captureGapsFor, type HoldCaptureGap } from '@eva/workout-engine'

/**
 * Regla ÚNICA de «cuándo se abre solo el teclado / la sheet» (specs/reps-tras-el-reloj, R3) — mitad
 * WEB del contrato compartido con RN.
 *
 * Vive fuera de los componentes por dos motivos: (1) es la única pieza del tren que se puede probar
 * sin montar el ejecutor entero, y (2) las DOS superficies web (`ExerciseStepV3` en pantalla sola y
 * `SupersetStepV3` en la ronda) tienen que decidir EXACTAMENTE lo mismo — escribir el `if` dos veces
 * era el drift asegurado. Los huecos los cuenta el motor (`captureGapsFor`, R2): acá sólo se combinan
 * con las otras tres condiciones.
 *
 * Cero React, cero DOM: sólo TypeScript.
 */

/** En qué caja hace foco la sheet al abrirse. */
export type HoldCaptureFocus = 'reps' | 'weight'

export type HoldCapturePromptDecision =
    | { open: false }
    | {
          open: true
          focus: HoldCaptureFocus
          /** Huecos tal cual los devuelve el motor — viaja a la analítica como `missing` (SPEC §7). */
          missing: HoldCaptureGap[]
      }

const CLOSED: HoldCapturePromptDecision = { open: false }

/**
 * Los valores que mira `captureGapsFor` son los de la fila **al momento del auto-envío**. La fuente
 * más honesta que hay en la web es el payload que el `LogSetForm` acaba de mandar
 * (`onLogged`/`handleLogged`): es literalmente lo que se guardó, ya normalizado por el motor
 * (`buildStrengthTimePayload` ⇒ `repsDone` es entero > 0 o `null`, nunca `0`). Leer los `<input>`
 * por ref sería adivinar: el `<form>` puede haberse re-montado por `formIdentityKey` entre el submit
 * y el momento en que decidimos.
 *
 * `null`/`undefined` ⇒ cadena vacía, que es exactamente lo que el motor cuenta como hueco.
 */
export function holdCaptureValuesFromCommit(commit: {
    weightKg?: number | null
    repsDone?: number | null
}): Record<string, string> {
    return {
        weight: commit.weightKg == null ? '' : String(commit.weightKg),
        reps: commit.repsDone == null ? '' : String(commit.repsDone),
    }
}

/**
 * Las CUATRO condiciones de R3, en una sola función: (a) la serie se ENVIÓ, (b) el bloque es fuerza
 * por tiempo, (c) falta algo por anotar, (d) el reloj NO venció con la pestaña afuera (R6/R27: ahí el
 * canal de aviso es el del sistema, y abrir un diálogo al volver sería una emboscada).
 *
 * Foco (SPEC R3 y la matriz de §5): `reps` cuando lo único que falta son las reps; **`weight` cuando
 * también falta el peso** («Sin KG ni reps ⇒ foco en KG», copy «¿Con cuánto peso?»). Ojo: el
 * comentario de `captureGapsFor` en el motor dice que el consumidor lee el PRIMER elemento del array
 * (que siempre es `'reps'`) para decidir el foco — eso contradice la matriz del SPEC, así que acá
 * manda el SPEC y el orden del array queda sólo como orden de reporte para la analítica.
 */
export function decideHoldCapturePrompt(input: {
    /** `HoldMeasured.submit`: la serie se envió sola (lado `single` o `right`). */
    submit: boolean
    kind: 'mobility' | 'strength_time'
    /** `HoldMeasured.expiredWhileAway` (R6/R27). */
    expiredWhileAway: boolean
    /** Valores de la fila al momento del envío (`holdCaptureValuesFromCommit`). */
    values: Record<string, string>
}): HoldCapturePromptDecision {
    if (!input.submit) return CLOSED
    if (input.kind !== 'strength_time') return CLOSED
    if (input.expiredWhileAway) return CLOSED
    const missing = captureGapsFor(input.values, input.kind)
    if (missing.length === 0) return CLOSED
    return { open: true, focus: missing.includes('weight') ? 'weight' : 'reps', missing }
}
