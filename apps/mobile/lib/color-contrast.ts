/**
 * Contraste WCAG para tinta sobre un fondo de marca (T3.v Cabina — «Familia N»).
 *
 * Espejo EXACTO de `getContrastInfo` de `apps/web/src/lib/color-utils.ts`: misma linearización de
 * canal, misma luminancia relativa y el mismo desempate (gana la tinta cuyo ratio contra el fondo
 * es mayor). Es a propósito: `AddActionButton` existe en las dos plataformas y el mismo hex de
 * marca TIENE que dar la misma tinta en la web y en el móvil — si divergen, el botón se ve blanco
 * en una y negro en la otra para el mismo coach, que es justo el bug que este espejo previene.
 *
 * Por qué NO se usa `pickOnColor` de `@eva/brand-kit`: compara contra un near-white y un near-black
 * (no contra blanco y negro puros), así que su frontera de decisión cae en otro punto que la de la
 * web. Para colores medios los dos helpers pueden elegir tintas distintas. `brand-kit` sigue siendo
 * el dueño del tema (`applyCoachBranding` clampa `primary`/`primaryForeground`); esto resuelve solo
 * la tinta puntual de esta familia de botones.
 *
 * DEUDA declarada: la casa correcta de esta matemática es `packages/*` (regla «no duplicar lógica
 * compartible»). Mudarla implica tocar `color-utils.ts` de la web —que tiene tests y consumidores
 * de branding— y esta tanda es solo fundaciones; queda anotado para la unificación.
 */

/** Tinta oscura de la familia: gris-azulado de la rampa ink, NO negro puro (ver web). */
export const READABLE_DARK_INK = '#101418'

/** Tinta clara de la familia. */
export const READABLE_LIGHT_INK = '#ffffff'

/** Token primary de EVA — fallback cuando la marca no llega o llega inválida. */
export const DEFAULT_BRAND_HEX = '#2563EB'

const HEX6 = /^[0-9a-f]{6}$/i
const HEX3 = /^[0-9a-f]{3}$/i

/**
 * `branding.primaryColor` lo escribe un humano y viaja por la base: puede llegar sin `#`, en forma
 * corta (`#0af`) o directamente roto. Se normaliza antes de medir; ante cualquier duda cae al
 * primary de EVA, nunca a `NaN` (que daría luminancia inválida y tinta al azar).
 */
export function normalizeBrandHex(hex: string | null | undefined): string {
  const clean = (hex ?? '').trim().replace(/^#/, '')
  if (HEX6.test(clean)) return `#${clean.toLowerCase()}`
  if (HEX3.test(clean)) {
    const [r, g, b] = clean.toLowerCase().split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return DEFAULT_BRAND_HEX
}

function toLinearChannel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Luminancia relativa WCAG 2.x del hex (0 = negro, 1 = blanco). */
export function getRelativeLuminance(hex: string): number {
  const clean = normalizeBrandHex(hex).replace('#', '')
  const r = toLinearChannel(parseInt(clean.substring(0, 2), 16) / 255)
  const g = toLinearChannel(parseInt(clean.substring(2, 4), 16) / 255)
  const b = toLinearChannel(parseInt(clean.substring(4, 6), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Tinta legible sobre `hex`: la que gana en contraste WCAG. Devuelve el gris-azulado oscuro (no
 * negro puro) cuando gana la tinta oscura, y blanco cuando gana la clara.
 */
export function readableInkOn(hex: string | null | undefined): string {
  const lum = getRelativeLuminance(normalizeBrandHex(hex))
  const ratioVsWhite = 1.05 / (lum + 0.05)
  const ratioVsBlack = (lum + 0.05) / 0.05
  return ratioVsBlack >= ratioVsWhite ? READABLE_DARK_INK : READABLE_LIGHT_INK
}
