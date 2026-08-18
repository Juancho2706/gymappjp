import { describe, expect, it } from 'vitest'

import {
  TOUR_HOLE_PADDING,
  computeTourHole,
  panesFor,
  type TourFrame,
} from '../apps/mobile/components/nutrition-v2/tour/tour-geometry'

/**
 * Contrato geométrico del spotlight de la Guía Viva RN.
 *
 * VIVE EN `tests/` Y NO AL LADO DEL MÓDULO A PROPÓSITO: el `include` de `vitest.config.ts` cubre
 * `apps/web`, `tests`, `packages` y `scripts` — NO `apps/mobile`. Mientras el archivo estuvo junto
 * al código, `pnpm test` no lo corría y CI tampoco: un guard verde que nadie ejecutaba. (18-08.)
 *
 * Los dos bugs de campo que fijan estos casos, ambos del Xiaomi del dueño:
 *
 *  1. (18-08, mañana) El recorte caía sobre la BARRA DE ESTADO en vez del componente. La causa no
 *     era la barra: un target medido arriba del overlay no se descartaba, se APLASTABA contra
 *     `y = 0`, el paño superior quedaba en altura 0 y el halo «iluminaba» el reloj.
 *
 *  2. (18-08, tarde) El arreglo del primero se pasó de estricto: exigía que el clamp no se comiera
 *     más que el aire, así que un target MÁS ALTO que la pantalla —una franja del editor con tres
 *     alimentos, o sea el paso 3/6— nunca podía caber y el paso quedaba SIEMPRE en velo liso.
 *
 * El invariante que sobrevive a los dos: **el hueco es siempre un subconjunto del target más su
 * aire, y solo se dibuja si queda a la vista una porción suficiente del target real.** Nunca puede
 * apuntar a otro componente; y cuando no hay nada útil que iluminar, velo liso, que dice la verdad.
 */

/** Teléfono de referencia del QA (Xiaomi/Pixel a 390×844 dp), overlay a borde de ventana. */
const FRAME: TourFrame = { originX: 0, originY: 0, width: 390, height: 844 }

/** Alto típico de la barra de estado Android que el overlay se come cuando llega al borde. */
const STATUS_BAR = 24

describe('computeTourHole · lo que NO se puede iluminar', () => {
  it('descarta el target que quedó ENTERO arriba del overlay (la lista lo scrolleó fuera)', () => {
    expect(computeTourHole({ top: -300, left: 16, width: 358, height: 64 }, FRAME)).toBeNull()
  })

  it('descarta el target que se fue por abajo del overlay', () => {
    expect(computeTourHole({ top: 830, left: 16, width: 358, height: 64 }, FRAME)).toBeNull()
  })

  it('descarta el target que apenas asoma: iluminar una lonja no enseña nada', () => {
    // 10 de 64 dp visibles = 16% del área. Por debajo del umbral: velo liso.
    expect(computeTourHole({ top: -54, left: 16, width: 358, height: 64 }, FRAME)).toBeNull()
  })

  it('descarta la franja fina aunque el ratio la salve: un spotlight de 12 dp no se lee', () => {
    // Target enorme (600 dp) del que sobreviven 12 dp: 2% de área, pero el caso importa porque un
    // target gigante puede pasar un ratio laxo con una tira ilegible. Manda el lado mínimo.
    expect(computeTourHole({ top: -588, left: 16, width: 358, height: 600 }, FRAME)).toBeNull()
  })

  it('nunca muerde la barra de estado: el hueco arranca en el borde de la banda', () => {
    // Un target que empieza DEBAJO del reloj. El recorte se recuesta contra la banda y la deja
    // tapada — que es lo único que el bug de la mañana no podía permitir.
    const hole = computeTourHole({ top: 4, left: 16, width: 358, height: 64 }, FRAME, {
      safeTop: STATUS_BAR,
    })
    expect(hole?.top).toBe(STATUS_BAR)
    expect(hole!.top).toBeGreaterThanOrEqual(STATUS_BAR)
  })

  it('descarta el target que queda casi todo bajo la barra de estado', () => {
    // Sobreviven 20 dp de 64 por debajo de la banda: menos que el lado mínimo legible.
    expect(
      computeTourHole({ top: -20, left: 16, width: 358, height: 64 }, FRAME, { safeTop: STATUS_BAR }),
    ).toBeNull()
  })

  it('no recorta nada mientras el overlay todavía no se midió', () => {
    const sinMedir: TourFrame = { originX: 0, originY: 0, width: 0, height: 0 }
    expect(computeTourHole({ top: 100, left: 16, width: 358, height: 64 }, sinMedir)).toBeNull()
  })

  it('trata el target colapsado (0×0) como ausente', () => {
    expect(computeTourHole({ top: 100, left: 16, width: 0, height: 0 }, FRAME)).toBeNull()
  })
})

describe('computeTourHole · lo que SÍ se ilumina', () => {
  it('recorta con su aire el target que está entero a la vista', () => {
    const hole = computeTourHole({ top: 300, left: 16, width: 358, height: 64 }, FRAME)
    expect(hole).toEqual({
      top: 300 - TOUR_HOLE_PADDING,
      left: 16 - TOUR_HOLE_PADDING,
      width: 358 + TOUR_HOLE_PADDING * 2,
      height: 64 + TOUR_HOLE_PADDING * 2,
    })
  })

  it('sigue recortando el target pegado a los bordes laterales: el clamp solo se comió el aire', () => {
    // La cinta de pestañas del hub (paso 1/6) va de borde a borde y HOY funciona perfecto.
    const hole = computeTourHole({ top: 200, left: 0, width: FRAME.width, height: 48 }, FRAME)
    expect(hole).toEqual({ top: 194, left: 0, width: 390, height: 60 })
  })

  it('ilumina la parte visible del target MÁS ALTO que la pantalla — el paso 3 del editor', () => {
    // Una franja con tres alimentos mide más que el viewport. La regla vieja la descartaba siempre
    // y el paso quedaba en velo liso con el target ahí, a la vista. Ahora se ilumina lo que entra.
    const franja = { top: 120, left: 16, width: 358, height: 1200 }
    const hole = computeTourHole(franja, FRAME)
    expect(hole).not.toBeNull()
    expect(hole!.top).toBe(120 - TOUR_HOLE_PADDING)
    expect(hole!.top + hole!.height).toBe(FRAME.height)
  })

  it('ilumina el target que asoma por arriba lo suficiente, sin banda de sistema que proteger', () => {
    // Mismo rect que el caso descartado con `safeTop`, pero con el overlay montado bajo la barra:
    // no hay reloj que tapar, así que iluminar el 69% visible es correcto y útil.
    const hole = computeTourHole({ top: -20, left: 16, width: 358, height: 64 }, FRAME)
    expect(hole).not.toBeNull()
    expect(hole!.top).toBe(0)
  })

  it('mide en el espacio del overlay, no en el de la ventana', () => {
    const conOffset: TourFrame = { originX: 0, originY: 48, width: 390, height: 796 }
    const hole = computeTourHole({ top: 60, left: 16, width: 358, height: 64 }, conOffset)
    expect(hole?.top).toBe(12 - TOUR_HOLE_PADDING)
  })
})

describe('panesFor', () => {
  it('sin hueco tapa el overlay ENTERO, barra de estado incluida', () => {
    const panes = panesFor(null, FRAME)
    expect(panes.bottom).toEqual({ top: 0, left: 0, width: FRAME.width, height: FRAME.height })
    // Los otros tres quedan con AREA cero (alguno conserva ancho, pero altura 0): no pintan nada.
    const area = (r: { width: number; height: number }) => r.width * r.height
    expect(area(panes.top)).toBe(0)
    expect(area(panes.left)).toBe(0)
    expect(area(panes.right)).toBe(0)
  })

  it('con hueco deja el velo sobre todo lo demás, incluida la franja de arriba', () => {
    const hole = { top: 200, left: 20, width: 300, height: 100 }
    const panes = panesFor(hole, FRAME)
    expect(panes.top).toEqual({ top: 0, left: 0, width: 390, height: 200 })
    expect(panes.bottom).toEqual({ top: 300, left: 0, width: 390, height: 544 })
    expect(panes.left).toEqual({ top: 200, left: 0, width: 20, height: 100 })
    expect(panes.right).toEqual({ top: 200, left: 320, width: 70, height: 100 })
  })
})
