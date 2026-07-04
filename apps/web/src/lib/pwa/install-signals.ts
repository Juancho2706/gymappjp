/**
 * Señales de gating del prompt de instalación PWA — SOLO localStorage, sin DB.
 *
 * Las comparten el `InstallPrompt` (lee) y el flujo de ejecución de rutina (escribe la señal
 * "primer workout completado"). El prompt no aparece en el primer render: se arma recién tras
 * este momento de valor. El descarte usa back-off (no "nunca más").
 *
 * Todo es tolerante a modo privado / cuota (try/catch) y guardado por `typeof window`.
 */

const FIRST_WORKOUT_KEY = 'eva-first-workout-completed'
const DISMISS_UNTIL_KEY = 'eva-pwa-install-dismiss-until'
/** Clave heredada de descarte permanente (pre back-off). Se honra una vez y se migra a back-off. */
const LEGACY_DISMISS_KEY = 'eva-pwa-install-dismissed'
/** Tras descartar, no volver a molestar por 14 días. */
const DISMISS_BACKOFF_MS = 14 * 24 * 60 * 60 * 1000

/** Evento in-session que dispara la reevaluación del prompt cuando se completa el primer workout. */
export const FIRST_WORKOUT_EVENT = 'eva:first-workout-completed'

/**
 * Marca "primer workout completado" (idempotente) y avisa in-session para que el prompt global
 * reevalúe sin recargar. Se llama al finalizar la ejecución de una rutina.
 */
export function markFirstWorkoutCompleted(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(FIRST_WORKOUT_KEY) === '1') return
    localStorage.setItem(FIRST_WORKOUT_KEY, '1')
  } catch {
    /* modo privado / cuota */
  }
  try {
    window.dispatchEvent(new Event(FIRST_WORKOUT_EVENT))
  } catch {
    /* no-op */
  }
}

export function hasCompletedFirstWorkout(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(FIRST_WORKOUT_KEY) === '1'
  } catch {
    return false
  }
}

/** Descarta el prompt con back-off (ventana de silencio), en vez de silenciarlo para siempre. */
export function dismissInstallPrompt(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_BACKOFF_MS))
    localStorage.removeItem(LEGACY_DISMISS_KEY)
  } catch {
    /* ignore */
  }
}

/** True si estamos dentro de la ventana de back-off del descarte. */
export function isInstallPromptDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    // Descarte permanente heredado → migrar a una ventana de back-off (respetar su "no", pero no eterno).
    const legacy = localStorage.getItem(LEGACY_DISMISS_KEY)
    if (legacy === 'true') {
      localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_BACKOFF_MS))
      localStorage.removeItem(LEGACY_DISMISS_KEY)
    }
    const until = Number(localStorage.getItem(DISMISS_UNTIL_KEY) || '0')
    return Number.isFinite(until) && Date.now() < until
  } catch {
    return false
  }
}
