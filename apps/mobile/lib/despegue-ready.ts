/**
 * Criterio PURO de "listo" del Despegue (overlay de lanzamiento del workout, `session-morph.tsx`).
 *
 * El overlay habilita el tap por DOS caminos que NO son lo mismo, y la diferencia es VISIBLE para el
 * alumno (decisión del owner, 2026-08-31 · paridad con `WorkoutLaunchMorph.tsx` del web):
 *
 *  · `signalsReady` — camino feliz: la animación terminó Y el ejecutor avisó que su escena montó
 *    (`signalMorphSceneReady`). Acá el overlay dice «LISTO» y es verdad.
 *  · `degraded` — ganó el fallback de ~4,6 s (`READY_FALLBACK_MS`) con la escena todavía sin avisar.
 *    El tap se habilita IGUAL —la válvula existe para no ATRAPAR al alumno si la señal nunca llega—
 *    pero el copy cambia: detrás no hay nada montado y decir «LISTO» era mentirle.
 *
 * POR QUÉ ESTÁ SEPARADO: antes era `animDone && (sceneReady || forceReady)`, y con `forceReady` en
 * true la condición daba true sin mirar la señal real ⇒ el overlay anunciaba «LISTO / TOCA PARA
 * COMENZAR» sobre una pantalla vacía (cada aviso `exec-v3-despegue-force-ready-sin-escena` en Sentry
 * es exactamente uno de esos momentos; el gemelo web es EVA-NEXTJS-1C). Que no vuelva a colapsarse en
 * una sola condición: **el fallback puede dejar pasar, no puede mentir.**
 *
 * Si `sceneReady` llega DESPUÉS del fallback, `degraded` vuelve a false y el overlay se comporta como
 * el camino feliz (cruza a «LISTO»).
 *
 * Vive en `lib/` —sin `react-native` ni Reanimated— para poder testearse con vitest; el overlay sólo
 * lo cablea. Mismo criterio que `measure-guard.ts`.
 */

export interface DespegueSignals {
  /** La coreografía terminó (logo aterrizado + «PREPARANDO…» visible). */
  animDone: boolean
  /** El ExecutorV3 avisó que su escena de Inicio ya cargó (via-morph). */
  sceneReady: boolean
  /** Venció `READY_FALLBACK_MS`: hay que habilitar el tap pase lo que pase. */
  forceReady: boolean
}

export interface DespegueReadyState {
  /** El tap está habilitado (por cualquiera de los dos caminos). */
  ready: boolean
  /** Camino feliz: listo de verdad ⇒ crossfade a «LISTO». */
  signalsReady: boolean
  /** Válvula: se puede entrar, pero la escena aún no avisó ⇒ copy de aviso, sin «LISTO». */
  degraded: boolean
}

export function resolveDespegueReady({ animDone, sceneReady, forceReady }: DespegueSignals): DespegueReadyState {
  const signalsReady = animDone && sceneReady
  const degraded = animDone && forceReady && !sceneReady
  return { ready: signalsReady || degraded, signalsReady, degraded }
}
