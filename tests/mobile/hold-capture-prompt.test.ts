/**
 * R3 de «Reps tras el reloj» (W2.4) — la regla «cuándo se abre solo el teclado», aislada.
 *
 * Vive en un helper PURO (`v3/hold-capture-prompt.ts`) justamente para poder probarla sin montar el
 * ejecutor: la misma decisión la toman `ExerciseScreenV3` y `SupersetScreenV3`, y una regla escrita
 * dos veces en dos handlers de UI es como nacen las divergencias que se descubren en producción.
 *
 * El módulo sólo importa TIPOS (`import type`), así que se carga en un test de node sin arrastrar la
 * cadena de React Native — por eso acá no hay un solo `vi.doMock`.
 *
 * La tabla que se congela es la matriz de SPEC §5.
 */
import { describe, expect, it } from 'vitest'
import { holdCapturePromptFor } from '../../apps/mobile/components/alumno/workout/v3/hold-capture-prompt'

describe('holdCapturePromptFor · R3 — las cuatro condiciones', () => {
  it('(b) MOVILIDAD no pide nada más: el hold ES el dato', () => {
    expect(
      holdCapturePromptFor({ kind: 'mobility', captureGaps: ['reps', 'weight'], expiredWhileAway: false }),
    ).toBeNull()
  })

  it('(c) sin huecos no se abre nada (las reps ya estaban tipeadas antes de «Iniciar serie»)', () => {
    expect(holdCapturePromptFor({ kind: 'strength_time', captureGaps: [], expiredWhileAway: false })).toBeNull()
  })

  it('(d) vencido con la app FUERA no se abre: el canal fue el aviso del SO', () => {
    expect(
      holdCapturePromptFor({ kind: 'strength_time', captureGaps: ['reps'], expiredWhileAway: true }),
    ).toBeNull()
  })

  it('falta sólo REPS ⇒ se abre con el foco en reps', () => {
    expect(holdCapturePromptFor({ kind: 'strength_time', captureGaps: ['reps'], expiredWhileAway: false })).toEqual({
      focus: 'reps',
    })
  })

  it('faltan REPS y PESO ⇒ se abre con el foco en PESO (matriz de SPEC §5: «Sin KG ni reps»)', () => {
    expect(
      holdCapturePromptFor({ kind: 'strength_time', captureGaps: ['reps', 'weight'], expiredWhileAway: false }),
    ).toEqual({ focus: 'weight' })
  })

  it('falta sólo el PESO (reps ya tipeadas, bloque sin peso objetivo) ⇒ foco en peso', () => {
    expect(
      holdCapturePromptFor({ kind: 'strength_time', captureGaps: ['weight'], expiredWhileAway: false }),
    ).toEqual({ focus: 'weight' })
  })

  it('la condición (a) es estructural: sin envío no hay `HoldCommitInfo`, así que el lado IZQUIERDO de `per_side` nunca llega', () => {
    // El hook sólo llama `onCommit` cuando `decideHoldAutolog` devolvió `submit` (lado `single` o
    // `right`). El izquierdo siembra la caja y no commitea ⇒ la pantalla nunca invoca este helper.
    // El caso se cubre de verdad en `executor-v3-hold-module.test.ts` («el IZQUIERDO no commitea»);
    // acá queda anotado para que nadie agregue un guard redundante creyendo que falta.
    expect(holdCapturePromptFor({ kind: 'strength_time', captureGaps: ['reps'], expiredWhileAway: false })).not.toBeNull()
  })
})
