/**
 * Share Entreno — el layout ÚNICO del card, como DATOS.
 *
 * Reemplaza a `share-presets.ts` (6 presets × 9 stickers). Decisión del owner del 06-09-2026: el
 * card tiene un solo bloque y la única edición es moverlo y cambiarle el tamaño — el catálogo de
 * estilos, los toggles de contenido y la vista de músculos se retiraron enteros.
 *
 * Se conserva la FORMA de "layout = datos, no componente": el archivo no renderiza nada, declara
 * dónde arranca el bloque (centro normalizado + escala + visible) y qué fondo pide. El canvas y la
 * capa de gestos siguen leyendo un `Record<StickerId, StickerState>`, así que el motor no cambió:
 * lo que se achicó es el catálogo, no la arquitectura.
 */

import type { StickerId, StickerState } from './share-types'

/**
 * Fondo de fábrica del card. Solo `photo` | `brand` — el modo sticker (`transparent`) sigue vivo en
 * el motor (ver `ShareBackground`) pero ya no se ofrece, así que no puede ser el default de nada.
 */
export interface ShareLayout {
    background: 'photo' | 'brand'
    stickers: Record<StickerId, StickerState>
}

/**
 * ── DE DÓNDE SALE `y = 0.74` ──
 * El bloque mide, a escala 1 y en px de DISEÑO (canvas 1080×1920):
 *
 *   eyebrow           34  (lineHeight)
 *   cifra + unidad   206  (la fila se alinea al pie; la unidad ya entra en esos 206)
 *   gap               16
 *   fila de stats     80  (valor 50 + label 30)
 *   gap               20
 *   grupo muscular    62
 *   gap               28
 *   firma del coach   64  (el logo circular manda sobre el nombre, que mide 38)
 *   ────────────────────
 *   total            510  ⇒ media caja = 255
 *
 * El canvas ancla por el CENTRO, así que con `y = 0.74` el centro cae en 1420,8 y el pie del bloque
 * en ~1676: quedan ~244 px de diseño hasta el borde inferior. No es un margen estético sino la zona
 * que la UI de Instagram Stories tapa con su barra de respuesta (~12 % del alto) — con menos aire,
 * la firma del coach queda debajo del teclado de la story. El techo del bloque queda en ~1166, o
 * sea el tercio inferior limpio, que es donde se lee un card sobre una foto vertical.
 *
 * `x = 0.5` con el bloque alineado a la izquierda: a escala 1 el ancho manda la cifra (~630 px con
 * un volumen de 5 dígitos + `kg`), así que centrado entra con holgura por los dos lados.
 */
export const SHARE_LAYOUT: ShareLayout = {
    background: 'photo',
    stickers: {
        bloque: { x: 0.5, y: 0.74, scale: 1, visible: true },
    },
}

/**
 * Orden de pintado del canvas: lo de más abajo en la lista se dibuja ENCIMA.
 *
 * Con un solo elemento es una lista de uno, pero se queda porque es el contrato por el que itera
 * `ShareCanvas`: sin ella el canvas tendría que hardcodear el id y perdería el chequeo de
 * exhaustividad contra `StickerId`.
 */
export const STICKER_PAINT_ORDER = ['bloque'] as const satisfies readonly StickerId[]

/** Copia defensiva del layout de fábrica (el composer lo muta al arrastrar y al pellizcar). */
export function cloneStickerLayout(layout: ShareLayout): Record<StickerId, StickerState> {
    const out = {} as Record<StickerId, StickerState>
    for (const id of Object.keys(layout.stickers) as StickerId[]) out[id] = { ...layout.stickers[id] }
    return out
}
