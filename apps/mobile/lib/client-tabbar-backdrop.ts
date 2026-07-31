/**
 * Backdrop de la tira de tabs de la ficha del alumno (QA2 A4).
 *
 * El QA de dispositivo mostró una banda casi negra bajo el header mientras la tira NO estaba
 * anclada: el backdrop (blur + tinte `surface-app` al 80%) se pintaba SIEMPRE y tapaba el
 * gradiente de la app. La opacidad ahora se deriva de la proximidad al anclaje sticky.
 *
 * Vive en `lib/` (no en el componente) para poder testearlo sin importar React Native desde
 * los tests de la raíz.
 */

/** Distancia (px) en la que el backdrop pasa de transparente a opaco al acercarse al anclaje. */
export const TAB_BAR_BACKDROP_RAMP_PX = 72

/**
 * Progreso 0→1 del backdrop según el scroll vertical.
 * 0 = lejos del anclaje (tira sin fondo: se ve el AppBackground) · 1 = anclada (glass del tema).
 * `stickyY` sin medir (MAX_SAFE_INTEGER / NaN) ⇒ 0: nunca se pinta backdrop a ciegas.
 */
export function tabBarBackdropProgress(scrollY: number, stickyY: number, ramp = TAB_BAR_BACKDROP_RAMP_PX): number {
  if (!Number.isFinite(stickyY) || stickyY >= Number.MAX_SAFE_INTEGER) return 0
  const safeRamp = Math.max(1, ramp)
  return Math.max(0, Math.min(1, (scrollY - (stickyY - safeRamp)) / safeRamp))
}
