/**
 * Gate del auto-scroll diferido tras guardar una serie (BUG 2 · sub-fix 3 — "se mueve solo").
 *
 * Causa raíz (auditoría): tras guardar, `handleLogged` programa un `scrollIntoView` a los 350 ms. El
 * gate `smoothScrollIntoViewIfNeeded` evita el scroll si el destino ya está a la vista, PERO usaba un
 * `FOOTER_H = 88` FIJO como obstrucción inferior. Cuando el `RestTimer` (sheet inferior que arranca
 * JUSTO al guardar) está montado, la obstrucción real es mucho mayor (el sheet vive por encima de la
 * barra "Finalizar") → el gate creía que la fila estaba visible cuando en realidad quedaba tapada, o
 * al revés disparaba un scroll innecesario = "la página se mueve sola".
 *
 * Este módulo es la lógica PURA: dada la obstrucción inferior REAL (medida en el DOM al momento de
 * disparar) decide si el target ya está cómodamente dentro del viewport. El wiring (medir rects de
 * `.exec-finish-bar` y del sheet del RestTimer `[data-exec-bottom-sheet]`) vive en el ejecutor.
 */

/**
 * Calcula la frontera inferior visible (coordenada `y` en px, desde el top del viewport). Todo lo que
 * quede POR DEBAJO de esta `y` está tapado por una barra/sheet fija inferior.
 *
 * `footerFallbackPx`: alto asumido de la barra "Finalizar" cuando no se pudo medir ningún elemento
 * (comportamiento histórico). `obstructionTops`: los `rect.top` de los elementos fijos inferiores
 * conocidos (barra Finalizar + sheet del RestTimer). La frontera es el MÍNIMO (el borde superior más
 * alto = la obstrucción más grande manda).
 */
export function bottomVisibilityBoundary(
    viewportH: number,
    footerFallbackPx: number,
    obstructionTops: readonly number[],
): number {
    let boundary = viewportH - footerFallbackPx
    for (const top of obstructionTops) {
        // Sólo tops plausibles (medidos, dentro del viewport). Un rect de un elemento oculto/desmontado
        // puede dar 0 o negativos → se ignora para no reportar una frontera falsa en el borde superior.
        if (Number.isFinite(top) && top > 0 && top < boundary) boundary = top
    }
    return boundary
}

/**
 * ¿El target ya está cómodamente dentro del viewport (bajo el header sticky y sobre la obstrucción
 * inferior real)? `true` ⇒ NO hace falta scrollear (el gate corta el auto-scroll).
 */
export function isTargetWithinViewport(input: {
    rectTop: number
    rectBottom: number
    headerH: number
    bottomBoundary: number
}): boolean {
    const { rectTop, rectBottom, headerH, bottomBoundary } = input
    return rectTop >= headerH && rectBottom <= bottomBoundary
}
