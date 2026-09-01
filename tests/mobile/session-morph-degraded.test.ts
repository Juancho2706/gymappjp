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
import { resolveDespegueReady } from '../../apps/mobile/lib/despegue-ready'

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
