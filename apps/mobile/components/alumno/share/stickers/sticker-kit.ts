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

import type { SportTokens } from '@eva/brand-kit'
import type { WorkoutShareData } from '../share-types'

// ── Literales del canvas oscuro (espejo de ShareCard.tsx:91-100) ─────────────────────────────────
export const INK_950 = '#0B0E13'
export const INK_900 = '#12161D'
/** Naranja de racha (ShareCard.tsx:93). El fuego NO usa la marca: es un tono propio del sistema. */
export const EMBER_500 = '#FF6A3D'
/** Ámbar de récord (amber-200 del DS) — el color del logro, tampoco white-label. */
export const AMBER_200 = '#FDE68A'
export const W88 = 'rgba(255,255,255,0.88)'
export const W72 = 'rgba(255,255,255,0.72)'
export const W62 = 'rgba(255,255,255,0.62)'
export const W50 = 'rgba(255,255,255,0.50)'
export const W40 = 'rgba(255,255,255,0.40)'
export const W10 = 'rgba(255,255,255,0.10)'
export const W08 = 'rgba(255,255,255,0.08)'

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

/** Números del card: display black + cifras de ancho fijo (no "bailan" entre valores). */
export const TABULAR = { fontVariant: ['tabular-nums' as const] }

/** Acento del card = `--sport-500` (la marca EXACTA del coach, verbatim en la rampa). */
export function accentOf(tokens: SportTokens): string {
    return tokens.ramp['500']
}

/** Tinte de superficie del acento (fondos de pill/panel) — 0.14, el mismo de las pills del ShareCard. */
export function accentTint(tokens: SportTokens, alpha = 0.14): string {
    return withAlpha(accentOf(tokens), alpha)
}

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
