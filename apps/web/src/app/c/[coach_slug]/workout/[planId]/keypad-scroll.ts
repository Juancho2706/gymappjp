/**
 * Compensación de scroll al CERRAR el teclado numérico custom de la exec (BUG-4 · "rebota como un
 * reload" que reportan las alumnas al guardar una serie en móvil).
 *
 * Causa raíz (auditoría): al abrir, `WorkoutKeypadProvider` marca `body[data-exec-keypad-open]` +
 * publica `--keypad-h`, y el CSS reserva `padding-bottom: var(--keypad-h)` (~320px). Al cerrar, el
 * provider quita el dataset y `--keypad-h` DE GOLPE → el documento pierde esos ~320px de alto. Si el
 * scroll había quedado más abajo del nuevo máximo (típico en las últimas series, donde ese padding
 * era load-bearing para subir la fila por encima del teclado), el navegador CLAMPA el scroll hacia
 * arriba y TODA la página salta — justo en el tick del submit.
 *
 * Este módulo es la lógica PURA de "a dónde llevar el scroll" dadas medidas ya tomadas del DOM. El
 * wiring (leer rects, quitar el padding, aplicar el scroll instantáneo) vive en el provider, sin test.
 *
 * Dos ramas, según si el input de anclaje sigue vivo tras el cierre:
 *  - Ancla VIVA (cierre por "tocar fuera": la fila sigue expandida) → re-ancla su `rect.top` para que
 *    el contenido no se mueva ni un pixel (scroll relativo por el delta).
 *  - Ancla MUERTA (cierre por "Listo": el optimismo del submit colapsó la fila a un chip y el input se
 *    desmontó) → fija el scroll donde estaba, recortado al nuevo máximo, para hacer NOSOTROS el clamp
 *    de forma instantánea y determinista en vez de dejárselo al navegador.
 */

/** Orden de scroll a aplicar tras quitar el padding del teclado. */
export type KeypadCloseScroll =
  | { kind: 'by'; top: number } // relativa (scrollBy) — re-ancla la fila viva
  | { kind: 'to'; top: number } // absoluta (scrollTo) — fija el scroll dentro del nuevo máximo
  | { kind: 'none' } // nada que mover (el contenido ya quedó donde estaba)

export interface KeypadCloseScrollInput {
  /** ¿El input de anclaje sigue montado y visible tras el cierre? (false ⇒ la fila colapsó a chip). */
  anchorAlive: boolean
  /** `rect.top` del ancla ANTES de quitar el padding (px). */
  anchorTopBefore: number
  /** `rect.top` del ancla DESPUÉS de quitar el padding (px, ya con el eventual clamp del navegador). */
  anchorTopAfter: number
  /** `window.scrollY` previo al cierre (px). */
  prevScrollY: number
  /** Máximo de scroll tras quitar el padding = `scrollHeight - innerHeight` (px). */
  maxScrollAfter: number
}

/** Recorta un scroll objetivo absoluto al rango válido `[0, maxScroll]`. */
export function clampScrollTop(target: number, maxScroll: number): number {
  const hi = Number.isFinite(maxScroll) && maxScroll > 0 ? maxScroll : 0
  if (!Number.isFinite(target) || target < 0) return 0
  return Math.min(target, hi)
}

/**
 * Resuelve el movimiento de scroll que deja el contenido visualmente quieto al cerrar el teclado.
 * Puro: no toca el DOM. `anchorTopAfter` DEBE medirse tras quitar el padding (para capturar el clamp).
 */
export function resolveKeypadCloseScroll(input: KeypadCloseScrollInput): KeypadCloseScroll {
  const { anchorAlive, anchorTopBefore, anchorTopAfter, prevScrollY, maxScrollAfter } = input

  if (anchorAlive) {
    // La fila sigue expandida: re-ancla su top. `scrollBy(top: delta)` deja el `rect.top` final igual
    // al de antes (rect.top_final = anchorTopAfter - delta = anchorTopBefore). El navegador recorta
    // solo si el delta pediría un scroll fuera de rango (imposible restaurar más allá del tope 0).
    const delta = anchorTopAfter - anchorTopBefore
    if (delta === 0) return { kind: 'none' }
    return { kind: 'by', top: delta }
  }

  // La fila colapsó a chip (optimismo del submit): el ancla ya no existe. Fija el scroll donde estaba,
  // recortado al nuevo máximo → hacemos el clamp instantáneo nosotros (sin el "rebote" del navegador).
  const target = clampScrollTop(prevScrollY, maxScrollAfter)
  if (target === prevScrollY) return { kind: 'none' }
  return { kind: 'to', top: target }
}
