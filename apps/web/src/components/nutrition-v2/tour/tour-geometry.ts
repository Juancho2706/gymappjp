/**
 * Geometría de la Guía Viva (SPEC `nutrition-onboarding-tour`, D3) — el posicionador del tour,
 * PURO: sin React, sin DOM, sin `window`. Entra un rect de target + el tamaño del viewport, sale
 * dónde va la tarjeta y cómo se recortan los 4 paños del velo.
 *
 * Por qué vive aparte de `tour-engine.tsx`: D3 («la tarjeta SIEMPRE completa en viewport») es un
 * invariante BLOQUEANTE con gate geométrico. Un invariante que se puede probar con aritmética no
 * debería depender de montar un árbol de React y simular layout en jsdom — jsdom devuelve 0×0 en
 * `getBoundingClientRect`, así que un test sobre el componente no probaría absolutamente nada.
 * Acá las esquinas, el flip y el dock se verifican con rects escritos a mano, y el gate Playwright
 * (G2.3) queda como la segunda red, midiendo el DOM real.
 *
 * Convención de coordenadas: TODO está en el espacio del viewport (lo mismo que devuelve
 * `getBoundingClientRect`), en px CSS. `top`/`left` son el borde superior/izquierdo.
 */

export type TourRect = {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

export type TourViewport = {
  readonly width: number
  readonly height: number
}

/** Ancho de la tarjeta en la variante lateral (SPEC D3: «280px desktop»). */
export const TOUR_CARD_WIDTH = 280

/** Margen mínimo contra los bordes del viewport. Es el colchón que hace verdadero a D3. */
export const TOUR_VIEWPORT_MARGIN = 8

/** Separación entre el target iluminado y la tarjeta (SPEC D3: «margen 8px»). */
export const TOUR_TARGET_GAP = 8

/**
 * Aire alrededor del target dentro del recorte del velo. 6 px alcanzan para que el halo no muerda
 * el borde del control iluminado (un botón con `focus ring` ya ocupa ~2 px fuera de su caja).
 */
export const TOUR_HOLE_PADDING = 6

/** Bajo este ancho la tarjeta va SIEMPRE anclada abajo a lo ancho (SPEC D3: thumb-zone). */
export const TOUR_DOCK_MAX_WIDTH = 767

export type TourCardSide = 'right' | 'left' | 'bottom' | 'top' | 'center'

export type TourCardPlacement = {
  /** `dock` = anclada abajo a lo ancho (<768 y RN); `anchored` = al lado del target. */
  readonly mode: 'dock' | 'anchored'
  readonly side: TourCardSide
  readonly top: number
  readonly left: number
  readonly width: number
  /**
   * Techo de alto. Si el contenido no cabe en el viewport la tarjeta scrollea ADENTRO en vez de
   * desbordar: D3 exige que el rect de la tarjeta sea ⊆ viewport con tolerancia 0, y una tarjeta
   * más alta que la pantalla no puede cumplirlo de ninguna otra forma.
   */
  readonly maxHeight: number
}

export type TourSpotlight = {
  /** El recorte vivo: el target inflado por `padding` y recortado al viewport. */
  readonly hole: TourRect
  /** Los 4 paños oscuros que rodean el recorte. Su unión cubre el viewport entero. */
  readonly panes: {
    readonly top: TourRect
    readonly bottom: TourRect
    readonly left: TourRect
    readonly right: TourRect
  }
}

/**
 * Clamp con un detalle que importa: cuando el rango es IMPOSIBLE (`max < min`, o sea, la pieza es
 * más grande que el hueco disponible) gana `min`. Preferir el borde de arriba/izquierda no es
 * capricho: ahí empieza la lectura, y el techo de alto (`maxHeight`) se encarga del resto.
 */
export function clampToRange(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** `true` si `inner` cabe COMPLETO dentro de `outer` (tolerancia 0 — el invariante D3 literal). */
export function rectContainsRect(outer: TourRect, inner: TourRect): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.left + inner.width <= outer.left + outer.width &&
    inner.top + inner.height <= outer.top + outer.height
  )
}

/** `true` si los dos rects comparten aunque sea un píxel (el invariante D2 del «?» lo usa). */
export function rectsIntersect(a: TourRect, b: TourRect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  )
}

/** El viewport como rect, para comparar contra la tarjeta sin repetir el literal en cada test. */
export function viewportRect(viewport: TourViewport): TourRect {
  return { top: 0, left: 0, width: viewport.width, height: viewport.height }
}

/**
 * ¿Hay que traer el target a la vista antes de posicionar? Solo se mira el eje vertical: las
 * superficies del editor scrollean en Y (el lienzo, la paleta), y un `scrollIntoView` horizontal
 * sobre un rail que scrollea en X movería la cinta bajo los pies del coach sin necesidad.
 */
export function needsScrollIntoView(
  target: TourRect,
  viewport: TourViewport,
  margin: number = TOUR_VIEWPORT_MARGIN,
): boolean {
  return target.top < margin || target.top + target.height > viewport.height - margin
}

type CardPlacementInput = {
  /** `null` = el paso no encontró su target (breakpoint que lo esconde): tarjeta al centro. */
  readonly target: TourRect | null
  /** Tamaño NATURAL de la tarjeta (el alto sale de medir el DOM; el ancho, del modo). */
  readonly card: { readonly width: number; readonly height: number }
  readonly viewport: TourViewport
  /** `true` bajo 768 y en RN: la tarjeta se ancla abajo a lo ancho. */
  readonly dock: boolean
  readonly margin?: number
  readonly gap?: number
  /** Alto del área segura inferior (notch/gesture bar). Solo pesa en `dock`. */
  readonly safeBottom?: number
}

/**
 * El posicionador (SPEC D3). Orden de preferencia: derecha → izquierda → abajo → arriba; el primer
 * costado donde la tarjeta ENTERA entra sin pisar el borde del viewport gana, y el eje cruzado se
 * centra contra el target y se clampea.
 *
 * Si ningún costado entra (target enorme, o viewport minúsculo) se elige el que tenga más aire y se
 * clampea igual. Ese caso ACEPTA solapar el target: entre «la tarjeta tapa un pedazo de lo que
 * ilumina» y «la tarjeta se sale de la pantalla», D3 manda — la segunda es la que rompe el gate y
 * deja al coach sin poder leer ni cerrar.
 */
export function computeCardPlacement(input: CardPlacementInput): TourCardPlacement {
  const margin = input.margin ?? TOUR_VIEWPORT_MARGIN
  const gap = input.gap ?? TOUR_TARGET_GAP
  const safeBottom = input.safeBottom ?? 0
  const { viewport, target } = input

  // Alto EFECTIVO: nunca más que el hueco entre márgenes (y el área segura, en dock). El
  // componente aplica el mismo número como `max-height` y la tarjeta scrollea adentro.
  const maxHeight = Math.max(0, viewport.height - margin * 2 - (input.dock ? safeBottom : 0))
  const height = Math.min(input.card.height, maxHeight)

  if (input.dock) {
    const width = Math.max(0, viewport.width - margin * 2)
    const top = clampToRange(
      viewport.height - safeBottom - margin - height,
      margin,
      viewport.height - height - margin,
    )
    return { mode: 'dock', side: 'bottom', top, left: margin, width, maxHeight }
  }

  const width = Math.min(input.card.width, Math.max(0, viewport.width - margin * 2))
  const clampLeft = (value: number) =>
    clampToRange(value, margin, viewport.width - width - margin)
  const clampTop = (value: number) => clampToRange(value, margin, viewport.height - height - margin)

  if (!target) {
    return {
      mode: 'anchored',
      side: 'center',
      top: clampTop((viewport.height - height) / 2),
      left: clampLeft((viewport.width - width) / 2),
      width,
      maxHeight,
    }
  }

  const targetRight = target.left + target.width
  const targetBottom = target.top + target.height

  const fits: Record<Exclude<TourCardSide, 'center'>, boolean> = {
    right: targetRight + gap + width + margin <= viewport.width,
    left: target.left - gap - width - margin >= 0,
    bottom: targetBottom + gap + height + margin <= viewport.height,
    top: target.top - gap - height - margin >= 0,
  }

  // Aire disponible por costado — solo se usa para el desempate cuando NINGUNO entra.
  const room: Record<Exclude<TourCardSide, 'center'>, number> = {
    right: viewport.width - targetRight,
    left: target.left,
    bottom: viewport.height - targetBottom,
    top: target.top,
  }

  const order = ['right', 'left', 'bottom', 'top'] as const
  const side =
    order.find((candidate) => fits[candidate]) ??
    order.reduce((best, candidate) => (room[candidate] > room[best] ? candidate : best), 'right')

  const centeredTop = target.top + target.height / 2 - height / 2
  const centeredLeft = target.left + target.width / 2 - width / 2

  switch (side) {
    case 'right':
      return {
        mode: 'anchored',
        side,
        top: clampTop(centeredTop),
        left: clampLeft(targetRight + gap),
        width,
        maxHeight,
      }
    case 'left':
      return {
        mode: 'anchored',
        side,
        top: clampTop(centeredTop),
        left: clampLeft(target.left - gap - width),
        width,
        maxHeight,
      }
    case 'bottom':
      return {
        mode: 'anchored',
        side,
        top: clampTop(targetBottom + gap),
        left: clampLeft(centeredLeft),
        width,
        maxHeight,
      }
    default:
      return {
        mode: 'anchored',
        side: 'top',
        top: clampTop(target.top - gap - height),
        left: clampLeft(centeredLeft),
        width,
        maxHeight,
      }
  }
}

/**
 * Los 4 paños + el recorte (SPEC D5). Se devuelven rects y no un `clip-path` a propósito: cuatro
 * `<div>` con su propio `background` son la única forma de que el velo tenga TRANSICIÓN de
 * geometría entre pasos y de que el recorte bloquee el puntero (la UI de abajo queda inerte —
 * el halo se encarga del hueco, ver `tour-engine.tsx`).
 *
 * Sin target el recorte queda en 0×0 arriba a la izquierda: el paño inferior crece hasta cubrir el
 * viewport entero y el paso se ve como un velo liso con la tarjeta al centro. Es el degradado
 * correcto para un paso cuyo elemento no existe en ese breakpoint.
 */
export function computeSpotlight(
  target: TourRect | null,
  viewport: TourViewport,
  padding: number = TOUR_HOLE_PADDING,
): TourSpotlight {
  const hole = target
    ? inflateAndClamp(target, viewport, padding)
    : { top: 0, left: 0, width: 0, height: 0 }

  const holeRight = hole.left + hole.width
  const holeBottom = hole.top + hole.height

  return {
    hole,
    panes: {
      top: { top: 0, left: 0, width: viewport.width, height: hole.top },
      bottom: {
        top: holeBottom,
        left: 0,
        width: viewport.width,
        height: Math.max(0, viewport.height - holeBottom),
      },
      left: { top: hole.top, left: 0, width: hole.left, height: hole.height },
      right: {
        top: hole.top,
        left: holeRight,
        width: Math.max(0, viewport.width - holeRight),
        height: hole.height,
      },
    },
  }
}

/** Infla el target por `padding` y lo recorta al viewport (un target medio fuera no saca el velo). */
function inflateAndClamp(target: TourRect, viewport: TourViewport, padding: number): TourRect {
  const top = Math.max(0, target.top - padding)
  const left = Math.max(0, target.left - padding)
  const right = Math.min(viewport.width, target.left + target.width + padding)
  const bottom = Math.min(viewport.height, target.top + target.height + padding)
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}
