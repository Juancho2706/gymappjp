/**
 * Helpers PUROS específicos de la web para el héroe "AURA" del Hoy del alumno.
 *
 * La lógica compartida con RN (saludo por hora, ratio de progreso, alpha del
 * glow, cruce de meta) vive en `@eva/nutrition-v2` (`aura.ts`). Aquí solo lo que
 * es exclusivo del confeti web (paleta tintada al primario) — canvas-confetti no
 * existe en RN.
 */

/** Parsea "38, 128, 255" o "38 128 255" a canales [r,g,b]. Inválido => null. */
export function parseRgbChannels(raw: string | null | undefined): [number, number, number] | null {
  if (!raw) return null
  const nums = raw.match(/-?\d+(?:\.\d+)?/g)
  if (!nums || nums.length < 3) return null
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return [clamp(+nums[0]), clamp(+nums[1]), clamp(+nums[2])]
}

/** Mezcla lineal de un canal hacia un objetivo (0..255) por t (0..1). */
function mixChannel(channel: number, towards: number, t: number): number {
  return Math.round(channel + (towards - channel) * t)
}

/**
 * Paleta de confeti derivada de UN color primario: el base + variaciones de
 * luminosidad del MISMO hue (aclarado hacia blanco / oscurecido hacia negro),
 * nunca multicolor. Recibe los canales "r, g, b" del token `--theme-primary-rgb`.
 * Inválido => arreglo vacío (el caller cae al color por defecto de la librería).
 */
export function confettiHuePalette(channels: string | null | undefined): string[] {
  const rgb = parseRgbChannels(channels)
  if (!rgb) return []
  const [r, g, b] = rgb
  const toCss = (cr: number, cg: number, cb: number) => `rgb(${cr}, ${cg}, ${cb})`
  return [
    toCss(r, g, b),
    toCss(mixChannel(r, 255, 0.35), mixChannel(g, 255, 0.35), mixChannel(b, 255, 0.35)),
    toCss(mixChannel(r, 255, 0.6), mixChannel(g, 255, 0.6), mixChannel(b, 255, 0.6)),
    toCss(mixChannel(r, 0, 0.25), mixChannel(g, 0, 0.25), mixChannel(b, 0, 0.25)),
  ]
}
