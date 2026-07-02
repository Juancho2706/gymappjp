/**
 * Badging API helper (research P16) — numerito en el ícono de la PWA instalada
 * cuando "algo te espera" (hoy: check-in pendiente). Es un nudge neutro, sin
 * culpa, a diferencia de una notificación acusatoria.
 *
 * Progressive enhancement PURO: no-op donde el API no existe (iOS <16.4, Firefox,
 * PWA no instalada, SSR). Nunca lanza — cualquier rechazo del navegador (permiso
 * denegado, contexto no instalado) se traga en silencio.
 *
 * Docs: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Display_badge_on_app_icon
 */

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/**
 * Muestra el badge en el ícono. `count` opcional: con número muestra el conteo,
 * sin argumento muestra un punto. `count <= 0` limpia (delega en clearAppBadge).
 */
export function setAppBadge(count?: number): void {
  if (typeof navigator === 'undefined') return
  if (typeof count === 'number' && count <= 0) {
    clearAppBadge()
    return
  }
  const nav = navigator as BadgeNavigator
  if (typeof nav.setAppBadge !== 'function') return
  try {
    void nav.setAppBadge(count).catch(() => {})
  } catch {
    /* no-op: navegador sin soporte real o permiso denegado */
  }
}

/** Limpia el badge del ícono. No-op si el API no existe. */
export function clearAppBadge(): void {
  if (typeof navigator === 'undefined') return
  const nav = navigator as BadgeNavigator
  if (typeof nav.clearAppBadge !== 'function') return
  try {
    void nav.clearAppBadge().catch(() => {})
  } catch {
    /* no-op */
  }
}
