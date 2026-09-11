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

/**
 * Ventana de validez de la marca «vengo del Despegue» (`markMorphLaunch` → `consumeMorphLaunch` en
 * `session-morph.tsx`). Si el ExecutorV3 monta DESPUÉS de este lapso, la marca se considera rancia
 * (basura de un aborto) y el ejecutor NO salta el `SessionIntro`: el alumno ve el splash otra vez,
 * DESPUÉS de la ceremonia.
 *
 * 10 s → **20 s** (specs/despegue-rapido · R3): con la válvula del overlay a 4,6 s
 * (`READY_FALLBACK_MS`), un ejecutor lento —Galaxy S24 en celular, `EVA-MOBILE-F`— entra a los 6 s y
 * puede tardar 11 s en montar del todo; a 10 s perdía la marca y cobraba el splash repetido. 20 s
 * sigue siendo MUY corto para confundirse con una entrada nueva (nadie relanza el mismo plan en ese
 * lapso sin pasar por `markMorphLaunch` de nuevo) y es el MISMO número que el web
 * (`apps/web/src/lib/workout/launch-ceremony.ts`).
 */
export const MORPH_LAUNCH_TTL_MS = 20_000

/**
 * ¿La marca vía-morph sigue fresca? `markedAt` es el epoch de `markMorphLaunch()` (o `null` si no hay
 * marca). Puro a propósito: el TTL es la regla que decide si el alumno ve o no un splash de más.
 */
export function isMorphLaunchFresh(markedAt: number | null, now: number): boolean {
  return markedAt != null && now - markedAt < MORPH_LAUNCH_TTL_MS
}
