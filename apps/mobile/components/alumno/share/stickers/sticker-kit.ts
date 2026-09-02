/**
 * Share Entreno (F2) — vocabulario compartido de los stickers.
 *
 * Los 9 stickers son componentes visuales PUROS: no se posicionan (eso lo hace el canvas), no leen
 * ThemeContext (el acento llega resuelto por props) y no tienen estado. Este módulo concentra lo
 * único que sí comparten: la paleta fija del canvas oscuro, el escalado proporcional y el contrato
 * de props — para que un cambio de tono no haya que cazarlo en nueve archivos.
 *
 * Paleta: mismos literales que `ShareCard.tsx` (canvas SIEMPRE oscuro en ambos temas de la app, la
 * marca entra solo por el acento) — ver su cabecera "ALWAYS-DARK CANVAS".
 */

import type { TextStyle } from 'react-native'
import type { SportTokens } from '@eva/brand-kit'
import type { WorkoutShareData } from '../share-types'

// ── Literales del canvas oscuro (espejo de ShareCard.tsx:91-100) ─────────────────────────────────
export const INK_950 = '#0B0E13'
export const INK_900 = '#12161D'
/**
 * Contorno de los datos. Desde el rediseño de F, NINGÚN dato del card tiene fondo propio: el texto
 * es blanco puro y lo único que lo separa de la foto es este contorno negro finito (ver
 * `StrokedText`). No es 100 % opaco a propósito — un negro absoluto sobre una foto oscura recorta
 * la letra como una calcomanía.
 */
export const OUTLINE_COLOR = 'rgba(0,0,0,0.85)'

/**
 * Grosor del contorno en px de DISEÑO-1080, por tamaño de texto.
 *
 * Calibrado contra el MOCKUP APROBADO, que resuelve el contorno con
 * `-webkit-text-stroke: k*2px` + `paint-order: stroke fill`: un stroke centrado de 2 px de diseño
 * deja **1 px hacia afuera** del glifo, y ése es el grosor que el owner aprobó. El anillo de copias
 * de `StrokedText` desplaza hacia afuera (no centra), así que 1 px de diseño = `sm`.
 *
 * Se emiten con `strokeSizer` y NO con `sizer`: el contorno es sub-píxel en pantalla y redondearlo
 * lo mandaría a 0 (contorno invisible) o a 1 (casi el triple de lo pedido, y ahí la letra se ve
 * embarrada).
 */
export const STROKE = {
    /** Texto chico y medio: 24–38 px de diseño (labels, chips, filas del set-list). */
    sm: 1,
    /**
     * Texto grande: 44–62 px (valores de la fila de stats, la unidad `kg`). Mismo grosor que `sm`
     * porque el mockup usa UNA sola regla de contorno para todos los tamaños; la clave existe igual
     * para poder separarlos si el QA de device lo pide.
     */
    md: 1,
    /**
     * La cifra héroe (200 px). Única excepción del mockup: con 1 px el contorno se pierde contra el
     * trazo de la display black.
     */
    lg: 2,
} as const

/**
 * Umbral de MINIATURA, medido sobre `k` (la escala del CANVAS) y no sobre `k × stickerScale`.
 *
 * Debajo de esto el anillo de copias deja de ser un contorno y pasa a ser un borrón: en las minis de
 * preset del paso «Editar» (68 px de ancho ⇒ `k ≈ 0,063`) el contorno vale ~0,06 px sobre un texto
 * de ~2 px, o sea que las 8 copias se apilan encima del glifo y lo ensucian — además de multiplicar
 * ×10 los nodos de cada mini (el set-list pasa de ~26 `Text` a ~170, y hay 6 minis + el grande
 * montados a la vez). A esa escala `StrokedText` pinta «plano»: texto blanco + sombra.
 *
 * ── POR QUÉ CONTRA `k` Y NO CONTRA EL FACTOR COMPLETO ──
 * Los `stickerScale` del catálogo van de 0,8 a 1,5, así que con el factor completo los rangos se
 * PISAN: una mini con la silueta (0,063 × 1,5 = 0,094) queda por encima del QR del canvas grande en
 * un teléfono corto (0,12 × 0,8 = 0,096). El resultado sería una card con la mitad de los datos
 * contorneados y la otra mitad no — y como `captureRef` rasteriza lo que hay EN PANTALLA, ese
 * desparejo viajaría al PNG exportado. Contra `k`, la decisión es del canvas entero.
 *
 * 0,09 separa la mini (0,063) del lienzo del editor en el teléfono más chico que soportamos
 * (~133 px ⇒ `k ≈ 0,12`). Si `THUMB_W` sube, este número sube con él.
 */
export const PLAIN_CANVAS_SCALE = 0.09

// Los neutros blancos del canvas oscuro (`W88`…`W08`) y los colores de sistema `EMBER_500` /
// `AMBER_200` se borraron: ningún sticker los usaba desde el rediseño de F (los datos son todos
// `#FFFFFF` + contorno). Volver atrás en cualquiera de las decisiones F.6 es un `git revert`, no
// ocho constantes muertas esperando.

/** "#rrggbb" + alfa → "rgba(r,g,b,a)". Espejo de ShareCard.tsx:702. */
export function withAlpha(hex: string, alpha: number): string {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const r = parseInt(full.slice(0, 2), 16) || 0
    const g = parseInt(full.slice(2, 4), 16) || 0
    const b = parseInt(full.slice(4, 6), 16) || 0
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Contrato de TODO sticker.
 *
 * `k` = anchoPantalla / 1080 y `stickerScale` = escala del sticker en el layout. Todo tamaño se
 * diseña contra el canvas de 1080 y se emite como `diseño × k × stickerScale`: es la misma regla que
 * salvó al `ShareCard` del bug de desborde (QA-4) y la única forma de que el preview en pantalla y
 * el PNG rasterizado a 1080×1920 sean la MISMA imagen.
 */
export interface StickerProps {
    data: WorkoutShareData
    k: number
    stickerScale: number
    tokens: SportTokens
}

/** Escalador `diseño-1080 → px reales`. Redondea: medios píxeles producen bordes sucios al rasterizar. */
export function sizer(k: number, stickerScale: number): (designPx: number) => number {
    const f = k * stickerScale
    return (designPx: number) => Math.round(designPx * f)
}

/**
 * Escalador del contorno + la escala del canvas del que salió (`k`, sin el `stickerScale`).
 */
export type StrokeSizer = ((designPx: number) => number) & { canvasScale: number }

/**
 * Escalador del CONTORNO: mismo `diseño-1080 → px reales` que `sizer` pero SIN redondear.
 *
 * `sizer` redondea a propósito (medios píxeles ensucian bordes y cajas al rasterizar), pero el
 * contorno del texto no es una caja: es un desplazamiento de copias, y a la escala del preview vale
 * menos de 1 px. Redondearlo lo apaga o lo duplica.
 *
 * Tampoco lleva piso: medio píxel es ~8× el grosor proporcional en las miniaturas de preset, y ahí
 * lo que corresponde no es un contorno más gordo sino ninguno (ver `PLAIN_STROKE_SCALE`).
 */
export function strokeSizer(k: number, stickerScale: number): StrokeSizer {
    const f = k * stickerScale
    // `canvasScale` viaja pegado al escalador para que `StrokedText` sepa si está montado en una
    // miniatura sin que los 9 stickers tengan que reenviarle `k` por separado (ver
    // `PLAIN_CANVAS_SCALE`).
    return Object.assign((designPx: number) => designPx * f, { canvasScale: k })
}



/**
 * Sombra de apoyo del texto blanco — el `0 2px 6px rgba(0,0,0,.55)` del mockup aprobado.
 *
 * Va SOLO en la copia visible (ver `StrokedText`) y es refuerzo, no contorno: despega la letra de la
 * foto sin engordarla. Es además lo ÚNICO que separa del fondo a los dos emojis (🔥, 🏆), que no
 * pueden llevar contorno: `color` no pinta un glifo de color, así que las copias dibujarían ocho
 * fuegos corridos en vez de un borde — `textShadow` sí lo respeta.
 *
 * Toma el ESCALADOR y no el grosor del contorno: la sombra del mockup es la misma para todos los
 * tamaños (2 px de offset, 6 px de radio en diseño-1080) y atarla al grosor le daba a la cifra héroe
 * una sombra ~2,5× — justo la "sombra difusa" que el owner descartó.
 */
export function strokeShadow(sw: (designPx: number) => number): Pick<TextStyle, 'textShadowColor' | 'textShadowOffset' | 'textShadowRadius'> {
    return {
        textShadowColor: 'rgba(0,0,0,0.55)',
        textShadowOffset: { width: 0, height: sw(2) },
        textShadowRadius: sw(6),
    }
}

/** Números del card: display black + cifras de ancho fijo (no "bailan" entre valores). */
export const TABULAR = { fontVariant: ['tabular-nums' as const] }

/** Acento del card = `--sport-500` (la marca EXACTA del coach, verbatim en la rampa). */
export function accentOf(tokens: SportTokens): string {
    return tokens.ramp['500']
}

// `accentTint` (tinte de superficie del acento para pills/paneles) se borró con el rediseño de F: la
// regla del owner es que el color del coach vive SOLO en la silueta (`MuscleBodySvg`). Dejarlo
// exportado era una invitación a que el acento volviera a aparecer detrás de un dato.

/**
 * `YYYY-MM-DD` → `Date` LOCAL. `new Date('2026-08-19')` se interpreta como UTC y en Chile (UTC-4)
 * retrocede al día anterior: el card diría "18 ago" para un entreno del 19. Se arma a mano.
 */
export function localDateFromISO(iso: string): Date {
    const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10))
    if (!y || !m || !d) return new Date()
    return new Date(y, m - 1, d)
}

/**
 * kg legibles (60 → '60', 62.5 → '62,5'). Reexportado desde el adaptador: es la MISMA regla de
 * redondeo con la que se arma `topSetLabel`, y dos formatos de kg en un mismo card se notan.
 */
export { formatKg } from '../build-share-data'

/** Primera letra en mayúscula (los `muscle_group` del catálogo vienen en formatos mixtos). */
export function capitalize(raw: string): string {
    if (!raw) return raw
    return raw.charAt(0).toUpperCase() + raw.slice(1)
}
