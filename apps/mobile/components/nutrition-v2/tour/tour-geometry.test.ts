import { describe, expect, it } from 'vitest'

import { TOUR_HOLE_PADDING, computeTourHole, panesFor, type TourFrame } from './tour-geometry'

/**
 * Contrato geométrico del spotlight de la Guía Viva RN.
 *
 * Estos casos existen por un bug de campo (Xiaomi del dueño, 18-08): en el paso 2/6 del tour del
 * hub el recorte caía sobre la BARRA DE ESTADO en vez de sobre las tres tarjetas de métricas. La
 * causa no era la barra de estado: era que un target medido unos píxeles ARRIBA del overlay no se
 * descartaba, se aplastaba contra `y = 0`. El paño superior quedaba en altura 0 (barra de estado sin
 * velo) y el halo, pegado al tope, «iluminaba» el reloj.
 *
 * El invariante que fijan estos tests, y que el motor no puede volver a perder: **o el hueco cae
 * entero sobre el target, o no hay hueco**. Un velo liso dice la verdad; un hueco corrido afirma que
 * el elemento correcto es otro.
 */

/** Teléfono de referencia del QA (Xiaomi/Pixel a 390×844 dp), overlay a borde de ventana. */
const FRAME: TourFrame = { originX: 0, originY: 0, width: 390, height: 844 }

/** Alto típico de la barra de estado Android que el overlay se come cuando llega al borde. */
const STATUS_BAR = 24

describe('computeTourHole', () => {
  it('descarta el target que quedó ENTERO arriba del overlay (la lista lo scrolleó fuera)', () => {
    const hole = computeTourHole({ top: -300, left: 16, width: 358, height: 64 }, FRAME)
    expect(hole).toBeNull()
  })

  it('descarta el target que asoma a MEDIAS por arriba — el caso exacto del Xiaomi', () => {
    // 44 de 64 dp visibles = 69% de área: la guarda vieja («≥40% visible») lo dejaba pasar y el
    // clamp lo aplastaba contra el tope devolviendo `{ top: 0, height: 46 }`, o sea el recorte
    // sobre el reloj. La guarda nueva compara el rect inflado contra el clampado y lo tira.
    const hole = computeTourHole({ top: -20, left: 16, width: 358, height: 64 }, FRAME)
    expect(hole).toBeNull()
  })

  it('descarta el target que se fue por abajo del overlay', () => {
    const hole = computeTourHole({ top: 830, left: 16, width: 358, height: 64 }, FRAME)
    expect(hole).toBeNull()
  })

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
    // La cinta de pestañas del hub (paso 1/6) va de borde a borde. Si «clampado ⇒ sin hueco» fuera
    // literal, el paso que HOY funciona perfecto se quedaría sin recorte.
    const hole = computeTourHole({ top: 200, left: 0, width: FRAME.width, height: 48 }, FRAME)
    expect(hole).toEqual({ top: 194, left: 0, width: 390, height: 60 })
  })

  it('descarta el hueco que mordería la barra de estado', () => {
    // Un target bajo la barra de estado no se VE; iluminarlo es señalar el reloj.
    const hole = computeTourHole({ top: 4, left: 16, width: 358, height: 64 }, FRAME, {
      safeTop: STATUS_BAR,
    })
    expect(hole).toBeNull()
  })

  it('acepta el target que arranca justo debajo de la barra de estado', () => {
    const hole = computeTourHole({ top: STATUS_BAR, left: 16, width: 358, height: 64 }, FRAME, {
      safeTop: STATUS_BAR,
    })
    // El aire de arriba se recorta contra la banda, pero el target entra completo.
    expect(hole).not.toBeNull()
    expect(hole?.top).toBe(STATUS_BAR)
  })

  it('mide en el espacio del overlay, no en el de la ventana', () => {
    // Overlay montado DEBAJO de una franja de safe area: su y=0 es contenido real, y el target que
    // la ventana ve en 60 vive en 12 para el overlay.
    const inset: TourFrame = { ...FRAME, originY: 48, height: 796 }
    const hole = computeTourHole({ top: 60, left: 16, width: 358, height: 64 }, inset)
    expect(hole?.top).toBe(12 - TOUR_HOLE_PADDING)
  })

  it('no recorta nada mientras el overlay todavía no se midió', () => {
    const unmeasured: TourFrame = { originX: 0, originY: 0, width: 0, height: 0 }
    expect(computeTourHole({ top: 300, left: 16, width: 358, height: 64 }, unmeasured)).toBeNull()
  })

  it('trata el target colapsado (0×0) como ausente', () => {
    expect(computeTourHole({ top: 300, left: 16, width: 0, height: 0 }, FRAME)).toBeNull()
  })
})

/** ¿El punto cae dentro de alguno de los 4 paños? (o sea: ¿está tapado por el velo?) */
function coveredBy(
  panes: ReturnType<typeof panesFor>,
  x: number,
  y: number,
): boolean {
  return Object.values(panes).some(
    (pane) =>
      x >= pane.left && x < pane.left + pane.width && y >= pane.top && y < pane.top + pane.height,
  )
}

describe('panesFor', () => {
  it('sin hueco tapa el overlay ENTERO, barra de estado incluida', () => {
    const panes = panesFor(null, FRAME)
    for (const [x, y] of [
      [1, 1],
      [195, 12],
      [389, 843],
      [0, 400],
    ] as const) {
      expect(coveredBy(panes, x, y)).toBe(true)
    }
  })

  it('con hueco deja el velo sobre todo lo demás, incluida la franja de arriba', () => {
    const hole = computeTourHole({ top: 300, left: 16, width: 358, height: 64 }, FRAME)
    expect(hole).not.toBeNull()
    const panes = panesFor(hole, FRAME)
    // La franja de arriba es la que se quedaba sin velo cuando el hueco se aplastaba contra y=0.
    expect(panes.top.height).toBe(hole?.top)
    expect(coveredBy(panes, 195, 4)).toBe(true)
    expect(coveredBy(panes, 195, 843)).toBe(true)
    expect(coveredBy(panes, 2, 320)).toBe(true)
    expect(coveredBy(panes, 388, 320)).toBe(true)
    // Y el recorte queda destapado, que es el único punto del ejercicio.
    expect(coveredBy(panes, 195, 320)).toBe(false)
  })
})
