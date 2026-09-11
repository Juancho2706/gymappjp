/**
 * Criterio de "listo" del Despegue (overlay de lanzamiento del workout). El módulo bajo test
 * (`apps/mobile/lib/despegue-ready`) es PURO —no importa react-native— y es el que separa las dos
 * formas de habilitar el tap:
 *  · camino feliz (`signalsReady`): la escena del ejecutor avisó ⇒ el overlay cruza a «LISTO»;
 *  · válvula (`degraded`): ganó el fallback de ~4,6s y la escena NO avisó ⇒ se puede entrar igual,
 *    pero el copy avisa que sigue cargando (antes decía «LISTO» sobre una pantalla vacía — cada
 *    `exec-v3-despegue-force-ready-sin-escena` de Sentry es uno de esos momentos).
 * Lo que cuida esta suite: el fallback puede dejar pasar, pero NUNCA puede anunciar "listo", y una
 * escena que avisa TARDE devuelve el overlay al camino feliz.
 */
import { describe, expect, it } from 'vitest'
import { isMorphLaunchFresh, MORPH_LAUNCH_TTL_MS, resolveDespegueReady } from '../../apps/mobile/lib/despegue-ready'

describe('resolveDespegueReady · listo real vs. válvula del fallback', () => {
  it('nada listo (ceremonia en curso) → el tap NO se habilita', () => {
    expect(resolveDespegueReady({ animDone: false, sceneReady: false, forceReady: false })).toEqual({
      ready: false,
      signalsReady: false,
      degraded: false,
    })
  })

  it('animación + escena lista → camino feliz (LISTO), sin degradado', () => {
    expect(resolveDespegueReady({ animDone: true, sceneReady: true, forceReady: false })).toEqual({
      ready: true,
      signalsReady: true,
      degraded: false,
    })
  })

  it('fallback SIN escena → tap habilitado pero DEGRADADO (no se anuncia LISTO)', () => {
    expect(resolveDespegueReady({ animDone: true, sceneReady: false, forceReady: true })).toEqual({
      ready: true,
      signalsReady: false,
      degraded: true,
    })
  })

  it('la escena avisa DESPUÉS del fallback → vuelve al camino feliz (degradado se apaga)', () => {
    expect(resolveDespegueReady({ animDone: true, sceneReady: true, forceReady: true })).toEqual({
      ready: true,
      signalsReady: true,
      degraded: false,
    })
  })

  it('escena lista pero la ceremonia todavía corre → el tap sigue bloqueado (la animación no se skipea)', () => {
    expect(resolveDespegueReady({ animDone: false, sceneReady: true, forceReady: false })).toEqual({
      ready: false,
      signalsReady: false,
      degraded: false,
    })
  })
})

/**
 * TTL de la marca vía-morph (specs/despegue-rapido · R3 · B4). Si el ExecutorV3 monta DESPUÉS de la
 * ventana, la marca se descarta y el alumno ve el splash `SessionIntro` DESPUÉS del Despegue. Con la
 * válvula del overlay a 4,6 s hay ejecutores que entran a los 6 s y terminan de montar a los 11: a
 * 10 s cobraban el splash repetido, a 20 s no.
 */
describe('isMorphLaunchFresh · ventana de la marca vía-morph (20 s)', () => {
  const T0 = 1_757_500_000_000

  it('la ventana es de 20 s (10 s dejaba afuera a los ejecutores lentos de EVA-MOBILE-F)', () => {
    expect(MORPH_LAUNCH_TTL_MS).toBe(20_000)
  })

  it('marca de 15 s → SIGUE fresca ⇒ arranca en «start», sin repetir el splash', () => {
    expect(isMorphLaunchFresh(T0, T0 + 15_000)).toBe(true)
  })

  it('marca de 25 s → VENCIDA ⇒ se ignora (basura de un aborto), el ejecutor muestra el SessionIntro', () => {
    expect(isMorphLaunchFresh(T0, T0 + 25_000)).toBe(false)
  })

  it('justo en el borde: 19,999 s fresca, 20 s clavados vencida', () => {
    expect(isMorphLaunchFresh(T0, T0 + 19_999)).toBe(true)
    expect(isMorphLaunchFresh(T0, T0 + 20_000)).toBe(false)
  })

  it('sin marca (nadie lanzó el Despegue) → nunca es fresca', () => {
    expect(isMorphLaunchFresh(null, T0)).toBe(false)
  })
})
