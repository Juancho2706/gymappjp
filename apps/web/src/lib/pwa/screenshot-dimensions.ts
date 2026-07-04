// Dimensiones ÚNICAS y compartidas de las screenshots del manifest (PWA Richer Install UI).
//
// CRÍTICO (SPEC whitelabel-r2 §7): Chrome Android sólo dispara el diálogo tipo app-store si
// TODAS las screenshots del mismo `form_factor` tienen aspect ratio IDÉNTICO. Si dos difieren,
// descarta en silencio TODO el richer UI. Por eso ambas variantes de `/api/pwa-screenshot` y el
// campo `screenshots` de los dos manifests (per-coach + default) leen estas constantes: una sola
// fuente de verdad → cero drift de proporción.
//
// Restricciones Chrome: 320–3840 px por lado; la dimensión mayor ≤ 2.3× la menor; sólo PNG/JPEG.
// 1080×1920 (9:16, ratio 1.777) cae dentro de ambos límites.

export const PWA_SCREENSHOT_WIDTH = 1080
export const PWA_SCREENSHOT_HEIGHT = 1920

/** Formato `"AnchoxAlto"` que exige el campo `sizes` del manifest. */
export const PWA_SCREENSHOT_SIZES = `${PWA_SCREENSHOT_WIDTH}x${PWA_SCREENSHOT_HEIGHT}`

/** Variantes disponibles de la screenshot (dashboard-look / entrenamiento-look). */
export const PWA_SCREENSHOT_VARIANTS = [1, 2] as const
export type PwaScreenshotVariant = (typeof PWA_SCREENSHOT_VARIANTS)[number]
