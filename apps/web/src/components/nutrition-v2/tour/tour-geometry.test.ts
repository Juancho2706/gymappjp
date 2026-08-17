import { describe, expect, it } from 'vitest'

import {
  TOUR_CARD_WIDTH,
  TOUR_VIEWPORT_MARGIN,
  clampToRange,
  computeCardPlacement,
  computeSpotlight,
  needsScrollIntoView,
  rectContainsRect,
  viewportRect,
  type TourCardPlacement,
  type TourRect,
  type TourViewport,
} from './tour-geometry'

/**
 * D3 de la SPEC `nutrition-onboarding-tour` es un invariante BLOQUEANTE: «la tarjeta del tour
 * SIEMPRE completa en viewport, tolerancia 0». Estos tests lo golpean con rects escritos a mano —
 * jsdom no hace layout, así que un test sobre el componente montado mediría 0×0 y mentiría en verde.
 * El gate Playwright (G2.3) mide el DOM real; esta suite es la que puede recorrer las esquinas.
 */

const CARD = { width: TOUR_CARD_WIDTH, height: 150 }

/** El rect REAL que ocupa la tarjeta: el alto efectivo nunca pasa el techo del posicionador. */
function cardRect(placement: TourCardPlacement, naturalHeight: number): TourRect {
  return {
    top: placement.top,
    left: placement.left,
    width: placement.width,
    height: Math.min(naturalHeight, placement.maxHeight),
  }
}

function place(target: TourRect | null, viewport: TourViewport, dock = false, card = CARD) {
  return computeCardPlacement({ target, viewport, dock, card })
}

describe('clampToRange', () => {
  it('mete el valor en el rango y, con rango imposible, gana el mínimo', () => {
    expect(clampToRange(50, 0, 100)).toBe(50)
    expect(clampToRange(-20, 0, 100)).toBe(0)
    expect(clampToRange(500, 0, 100)).toBe(100)
    // Rango imposible = la pieza no cabe. Se prefiere el borde donde empieza la lectura.
    expect(clampToRange(50, 8, 4)).toBe(8)
  })
})

describe('computeCardPlacement — costado preferido y flip', () => {
  const viewport: TourViewport = { width: 1280, height: 800 }

  it('con espacio de sobra la tarjeta va a la DERECHA del target, centrada vertical', () => {
    const target: TourRect = { top: 300, left: 400, width: 200, height: 60 }
    const placement = place(target, viewport)

    expect(placement.mode).toBe('anchored')
    expect(placement.side).toBe('right')
    expect(placement.left).toBe(400 + 200 + 8)
    // Centro del target (330) menos medio alto de tarjeta (75).
    expect(placement.top).toBe(255)
  })

  it('target pegado al borde derecho ⇒ FLIP a la izquierda', () => {
    const target: TourRect = { top: 300, left: 1180, width: 90, height: 60 }
    const placement = place(target, viewport)

    expect(placement.side).toBe('left')
    expect(placement.left).toBe(1180 - 8 - TOUR_CARD_WIDTH)
    expect(rectContainsRect(viewportRect(viewport), cardRect(placement, CARD.height))).toBe(true)
  })

  it('un target ancho (cinta) sin lugar a los costados ⇒ ABAJO', () => {
    // Ocupa casi todo el ancho: ni derecha ni izquierda tienen 280+8+8 px libres.
    const target: TourRect = { top: 12, left: 20, width: 1240, height: 64 }
    const placement = place(target, viewport)

    expect(placement.side).toBe('bottom')
    expect(placement.top).toBe(12 + 64 + 8)
  })

  it('un target ancho abajo del todo ⇒ ARRIBA (última preferencia antes del fallback)', () => {
    const target: TourRect = { top: 700, left: 20, width: 1240, height: 64 }
    const placement = place(target, viewport)

    expect(placement.side).toBe('top')
    expect(placement.top).toBe(700 - 8 - CARD.height)
  })

  it('sin target (paso cuyo elemento no existe en ese ancho) la tarjeta va al centro', () => {
    const placement = place(null, viewport)

    expect(placement.side).toBe('center')
    expect(placement.top).toBe((800 - CARD.height) / 2)
    expect(placement.left).toBe((1280 - TOUR_CARD_WIDTH) / 2)
  })
})

describe('computeCardPlacement — D3: la tarjeta SIEMPRE ⊆ viewport', () => {
  const viewports: TourViewport[] = [
    { width: 1536, height: 960 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]

  it('en las 4 esquinas de los 5 anchos del harness, con y sin dock', () => {
    for (const viewport of viewports) {
      const corners: TourRect[] = [
        { top: 0, left: 0, width: 40, height: 40 },
        { top: 0, left: viewport.width - 40, width: 40, height: 40 },
        { top: viewport.height - 40, left: 0, width: 40, height: 40 },
        { top: viewport.height - 40, left: viewport.width - 40, width: 40, height: 40 },
      ]
      for (const target of corners) {
        for (const dock of [false, true]) {
          const placement = place(target, viewport, dock)
          const rect = cardRect(placement, CARD.height)
          expect(
            rectContainsRect(viewportRect(viewport), rect),
            `viewport ${viewport.width}x${viewport.height} dock=${dock} target ${target.left},${target.top} ⇒ ${JSON.stringify(rect)}`,
          ).toBe(true)
        }
      }
    }
  })

  it('target fuera de pantalla (rect negativo o desbordado) tampoco saca la tarjeta', () => {
    const viewport: TourViewport = { width: 1024, height: 768 }
    const offscreen: TourRect[] = [
      { top: -400, left: -300, width: 200, height: 80 },
      { top: 900, left: 1200, width: 200, height: 80 },
    ]
    for (const target of offscreen) {
      const placement = place(target, viewport)
      expect(rectContainsRect(viewportRect(viewport), cardRect(placement, CARD.height))).toBe(true)
    }
  })

  it('target gigante (ningún costado entra) ⇒ se clampea igual, D3 antes que no solapar', () => {
    const viewport: TourViewport = { width: 1024, height: 768 }
    const target: TourRect = { top: 0, left: 0, width: 1024, height: 768 }
    const placement = place(target, viewport)

    expect(rectContainsRect(viewportRect(viewport), cardRect(placement, CARD.height))).toBe(true)
  })

  it('tarjeta más alta que el viewport ⇒ techo de alto y sigue ⊆ viewport (scrollea adentro)', () => {
    const viewport: TourViewport = { width: 390, height: 500 }
    const tall = { width: TOUR_CARD_WIDTH, height: 900 }
    const placement = place({ top: 100, left: 100, width: 60, height: 40 }, viewport, false, tall)

    expect(placement.maxHeight).toBe(500 - TOUR_VIEWPORT_MARGIN * 2)
    expect(rectContainsRect(viewportRect(viewport), cardRect(placement, tall.height))).toBe(true)
  })
})

describe('computeCardPlacement — dock (<768 y RN)', () => {
  const viewport: TourViewport = { width: 390, height: 844 }

  it('ocupa el ancho entre márgenes y se apoya abajo', () => {
    const placement = computeCardPlacement({
      target: { top: 40, left: 20, width: 100, height: 40 },
      viewport,
      dock: true,
      card: CARD,
    })

    expect(placement.mode).toBe('dock')
    expect(placement.side).toBe('bottom')
    expect(placement.left).toBe(TOUR_VIEWPORT_MARGIN)
    expect(placement.width).toBe(390 - TOUR_VIEWPORT_MARGIN * 2)
    expect(placement.top).toBe(844 - TOUR_VIEWPORT_MARGIN - CARD.height)
  })

  it('el área segura inferior sube la tarjeta y no la saca del viewport', () => {
    const safeBottom = 34
    const placement = computeCardPlacement({
      target: null,
      viewport,
      dock: true,
      card: CARD,
      safeBottom,
    })

    expect(placement.top).toBe(844 - safeBottom - TOUR_VIEWPORT_MARGIN - CARD.height)
    expect(rectContainsRect(viewportRect(viewport), cardRect(placement, CARD.height))).toBe(true)
  })

  it('el dock ignora la posición del target: siempre abajo (thumb-zone)', () => {
    const arriba = place({ top: 0, left: 0, width: 50, height: 30 }, viewport, true)
    const abajo = place({ top: 800, left: 300, width: 50, height: 30 }, viewport, true)

    expect(arriba.top).toBe(abajo.top)
    expect(arriba.left).toBe(abajo.left)
  })
})

describe('computeSpotlight — 4 paños + recorte', () => {
  const viewport: TourViewport = { width: 1000, height: 600 }

  it('el recorte infla el target y los paños cubren TODO lo demás', () => {
    const target: TourRect = { top: 200, left: 300, width: 200, height: 100 }
    const { hole, panes } = computeSpotlight(target, viewport, 6)

    expect(hole).toEqual({ top: 194, left: 294, width: 212, height: 112 })
    expect(panes.top).toEqual({ top: 0, left: 0, width: 1000, height: 194 })
    expect(panes.bottom).toEqual({ top: 306, left: 0, width: 1000, height: 294 })
    expect(panes.left).toEqual({ top: 194, left: 0, width: 294, height: 112 })
    expect(panes.right).toEqual({ top: 194, left: 506, width: 494, height: 112 })

    // Área de los 4 paños + el recorte = el viewport entero (nada queda sin pintar ni se pisa).
    const area = (rect: TourRect) => rect.width * rect.height
    const total =
      area(panes.top) + area(panes.bottom) + area(panes.left) + area(panes.right) + area(hole)
    expect(total).toBe(viewport.width * viewport.height)
  })

  it('un target a medias fuera de pantalla no saca el recorte del viewport', () => {
    const { hole } = computeSpotlight({ top: -50, left: -30, width: 200, height: 100 }, viewport, 6)

    expect(hole.top).toBe(0)
    expect(hole.left).toBe(0)
    expect(rectContainsRect(viewportRect(viewport), hole)).toBe(true)
  })

  it('sin target el velo queda liso: el paño inferior cubre el viewport entero', () => {
    const { hole, panes } = computeSpotlight(null, viewport)

    expect(hole).toEqual({ top: 0, left: 0, width: 0, height: 0 })
    expect(panes.bottom).toEqual({ top: 0, left: 0, width: 1000, height: 600 })
  })
})

describe('needsScrollIntoView', () => {
  const viewport: TourViewport = { width: 1000, height: 600 }

  it('solo cuando el target asoma por arriba o por abajo del viewport', () => {
    expect(needsScrollIntoView({ top: 100, left: 0, width: 50, height: 50 }, viewport)).toBe(false)
    expect(needsScrollIntoView({ top: -10, left: 0, width: 50, height: 50 }, viewport)).toBe(true)
    expect(needsScrollIntoView({ top: 580, left: 0, width: 50, height: 50 }, viewport)).toBe(true)
  })
})
