import type { TourRect } from './TourTargets'

/**
 * Geometría pura del spotlight de la Guía Viva RN (SPEC `nutrition-onboarding-tour`, D5).
 *
 * Vive fuera de `TourOverlay.tsx` por una razón concreta y no por prolijidad: el recorte es la única
 * parte del motor que puede apuntar a lo que NO es, y un bug de geometría en un teléfono ajeno se
 * diagnostica leyendo pantallazos. Acá no hay una sola importación de `react-native`, así que el
 * contrato se puede fijar con un test que corre en Node en milisegundos (`tour-geometry.test.ts`).
 *
 * Contrato en una línea: **o el hueco cae ENTERO sobre el target, o no hay hueco.** Un velo liso es
 * honesto («este paso no tiene nada que iluminar acá»); un hueco corrido es peor que nada, porque
 * afirma que el elemento correcto es otro.
 */

/** Origen y tamaño del overlay, en coordenadas de ventana de la app. */
export type TourFrame = {
  readonly originX: number
  readonly originY: number
  readonly width: number
  readonly height: number
}

/** Aire alrededor del target dentro del recorte (mismo valor que `TOUR_HOLE_PADDING` en web). */
export const TOUR_HOLE_PADDING = 6

export type TourHoleOptions = {
  /**
   * Banda de chrome del sistema que queda DENTRO del overlay (la barra de estado cuando el overlay
   * llega hasta el borde de la ventana). No es decoración: un hueco que muerde esa banda deja el
   * reloj y la batería sin velo y se lee como «el tour está iluminando la hora».
   */
  readonly safeTop?: number
}

/**
 * El target se mide en coordenadas de VENTANA y los paños se pintan dentro del overlay. Los dos
 * orígenes coinciden casi siempre, pero «casi siempre» no es una base para un invariante: se mide
 * también el propio overlay y se resta. Así el recorte cae sobre el elemento correcto aunque el
 * sistema meta un offset, sin un solo número mágico por plataforma.
 */
export function toOverlaySpace(target: TourRect, frame: TourFrame): TourRect {
  return {
    top: target.top - frame.originY,
    left: target.left - frame.originX,
    width: target.width,
    height: target.height,
  }
}

/**
 * Traduce el target a coordenadas del overlay, lo infla por `TOUR_HOLE_PADDING` y devuelve el
 * recorte **solo si el target entero cabe en el área útil**. `null` en cualquier otro caso, y el
 * paso degrada al velo liso.
 *
 * Por qué la regla es «el target entero» y no «un poco de target» (bug del dueño, Xiaomi 18-08):
 * la versión anterior hacía `Math.max(0, top - padding)` y aceptaba cualquier target con ≥40% de
 * área visible. Un target que la lista había dejado unos píxeles ARRIBA del borde no se descartaba:
 * se APLASTABA contra `y = 0`. El resultado era un recorte pegado al tope de la pantalla —con el
 * paño superior en altura 0, o sea la barra de estado sin velo— «iluminando» el reloj en vez de las
 * tarjetas. El ratio de área no lo atrapaba nunca porque medía sobre el rect crudo y jamás miraba
 * si el clamp había mordido. Acá se compara el rect INFLADO contra el CLAMPADO: el clamp puede
 * comerse el aire (un target legítimamente pegado a un borde, como la cinta de pestañas a lo ancho,
 * sigue teniendo su hueco), pero en cuanto se come UN píxel del target el hueco se descarta.
 *
 * Eso explica la asimetría que reportó el dueño: el paso 1 apunta al chrome sticky —que no scrollea
 * y por lo tanto nunca sale del área útil— y el paso 2, a un bloque de la lista, que sí.
 */
export function computeTourHole(
  targetInWindow: TourRect,
  frame: TourFrame,
  { safeTop = 0 }: TourHoleOptions = {},
): TourRect | null {
  // Sin overlay medido no hay espacio donde recortar; el paso arranca en velo liso y se recompone
  // solo cuando `onLayout` traiga el frame real.
  if (!(frame.width > 0) || !(frame.height > 0)) return null

  const target = toOverlaySpace(targetInWindow, frame)
  if (!(target.width > 0) || !(target.height > 0)) return null

  // Lo que el recorte QUIERE ser: el target más su aire.
  const inflatedTop = target.top - TOUR_HOLE_PADDING
  const inflatedLeft = target.left - TOUR_HOLE_PADDING
  const inflatedRight = target.left + target.width + TOUR_HOLE_PADDING
  const inflatedBottom = target.top + target.height + TOUR_HOLE_PADDING

  // Área útil del overlay: su caja, menos la banda del sistema que le queda adentro.
  const boundsTop = Math.max(0, safeTop)
  const boundsBottom = frame.height

  const top = Math.max(boundsTop, inflatedTop)
  const left = Math.max(0, inflatedLeft)
  const right = Math.min(frame.width, inflatedRight)
  const bottom = Math.min(boundsBottom, inflatedBottom)

  // Cuánto se comió el clamp en cada borde. Hasta `TOUR_HOLE_PADDING` es aire y no cambia a qué
  // apunta el hueco; más que eso es target recortado, y ahí el hueco ya está mintiendo.
  const clampedAway = Math.max(
    top - inflatedTop,
    left - inflatedLeft,
    inflatedRight - right,
    inflatedBottom - bottom,
  )
  // Epsilon por el redondeo de `measureInWindow` (devuelve dp fraccionarios en pantallas con
  // densidades raras); sin él un target pegado al borde se descartaría por medio píxel.
  if (clampedAway > TOUR_HOLE_PADDING + 0.5) return null

  const width = right - left
  const height = bottom - top
  return width > 0 && height > 0 ? { top, left, width, height } : null
}

/**
 * Los 4 paños. Su unión cubre el overlay entero menos el recorte.
 *
 * `hole === null` es el modo degradado y tiene que quedar TAPADO de punta a punta: el paño inferior
 * crece hasta cubrirlo todo (los otros tres quedan en 0). Se expresa con el rect vacío y no con un
 * caso aparte para que la transición entre un paso con hueco y uno sin hueco siga siendo la misma
 * interpolación de siempre y no un salto de qué paño carga el velo.
 */
export function panesFor(
  hole: TourRect | null,
  frame: TourFrame,
): Record<'top' | 'bottom' | 'left' | 'right', TourRect> {
  const rect = hole ?? EMPTY_HOLE
  const holeRight = rect.left + rect.width
  const holeBottom = rect.top + rect.height
  return {
    top: { top: 0, left: 0, width: frame.width, height: Math.max(0, rect.top) },
    bottom: {
      top: holeBottom,
      left: 0,
      width: frame.width,
      height: Math.max(0, frame.height - holeBottom),
    },
    left: { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
    right: {
      top: rect.top,
      left: holeRight,
      width: Math.max(0, frame.width - holeRight),
      height: rect.height,
    },
  }
}

const EMPTY_HOLE: TourRect = { top: 0, left: 0, width: 0, height: 0 }
