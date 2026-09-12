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
import {
  commitSetOptsFor,
  holdCapturePromptFor,
  type HoldCapturePromptInput,
} from '../../apps/mobile/components/alumno/workout/v3/hold-capture-prompt'

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

/**
 * R3b (W5.1 · enmienda E1 del owner, 12-09) — el `opts` con que la pantalla commitea. Es la otra
 * mitad de la regla de arriba: si `holdCapturePromptFor` decidió abrir, el commit tiene que avisarle
 * al orquestador para que el descanso automático arranque MINIMIZADO (barra sobre la pantalla del
 * ejercicio) en vez del interstitial a pantalla completa. Vive en el mismo helper puro para que
 * `ExerciseScreenV3` y `SupersetScreenV3` no puedan divergir.
 */
describe('commitSetOptsFor · R3b — `minimizeRest` sólo cuando el prompt se abre', () => {
  it('sin prompt y sin «Repetir» el commit viaja SIN `opts` (camino byte-idéntico)', () => {
    // Es el alumno que ya tenía sus reps tipeadas antes de «Iniciar serie»: nada cambia para él.
    expect(commitSetOptsFor({ repeat: false, minimizeRest: false })).toBeUndefined()
    expect(commitSetOptsFor({})).toBeUndefined()
  })

  it('la decisión de abrir ⇒ `minimizeRest: true`, y nada más', () => {
    const gap = holdCapturePromptFor({ kind: 'strength_time', captureGaps: ['reps'], expiredWhileAway: false })
    expect(commitSetOptsFor({ repeat: false, minimizeRest: gap != null })).toEqual({ minimizeRest: true })
  })

  it('sin huecos (o movilidad, o vencido con la app fuera) el descanso arranca expandido como siempre', () => {
    const noPrompt: HoldCapturePromptInput[] = [
      { kind: 'strength_time', captureGaps: [], expiredWhileAway: false },
      { kind: 'mobility', captureGaps: ['reps'], expiredWhileAway: false },
      { kind: 'strength_time', captureGaps: ['reps'], expiredWhileAway: true },
    ]
    for (const input of noPrompt) {
      const gap = holdCapturePromptFor(input)
      expect(commitSetOptsFor({ minimizeRest: gap != null })).toBeUndefined()
    }
  })

  it('«Repetir» sigue viajando solo, y puede convivir con el prompt', () => {
    expect(commitSetOptsFor({ repeat: true, minimizeRest: false })).toEqual({ repeat: true })
    expect(commitSetOptsFor({ repeat: true, minimizeRest: true })).toEqual({ repeat: true, minimizeRest: true })
  })
})
