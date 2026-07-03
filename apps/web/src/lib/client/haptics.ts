'use client'

/**
 * Feedback háptico con progressive enhancement (bug E2-2).
 *
 * - **Android / Chromium:** Vibration API (`navigator.vibrate`) — respeta el `pattern`.
 * - **iOS 18+ Safari:** `navigator.vibrate` es un no-op silencioso. El truco del
 *   `<label><input type="checkbox" switch></label>` (patrón `use-haptic` / `ios-haptics`)
 *   dispara un tap háptico sutil al togglear el switch. WebKit emite el tap por el cambio
 *   de estado del switch — funciona incluso con el label `display:none` — pero SOLO dentro
 *   de un gesto del usuario (tap real), no en callbacks de timers.
 *
 * Cero errores en navegadores sin soporte: todo va envuelto en try/catch y guardas SSR.
 */

let switchLabel: HTMLLabelElement | null = null

/** Crea (una sola vez) el `<label>` + `<input type=checkbox switch>` oculto para el háptico iOS. */
function ensureSwitchLabel(): HTMLLabelElement | null {
    if (typeof document === 'undefined') return null
    if (switchLabel && switchLabel.isConnected) return switchLabel
    const label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    // display:none NO rompe el háptico en WebKit (el tap viene del toggle del switch, no del pintado).
    label.style.display = 'none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '') // atributo clave del háptico iOS 18+
    input.tabIndex = -1
    label.appendChild(input)
    document.body.appendChild(label)
    switchLabel = label
    return label
}

/**
 * Dispara feedback háptico. `pattern` (ms) aplica solo a Android (Vibration API);
 * en iOS el tap es de intensidad fija. Llamar dentro de un gesto del usuario para iOS.
 */
export function triggerHaptic(pattern: number | number[] = 12): void {
    // Android / Chromium — Vibration API.
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            navigator.vibrate(pattern)
        } catch {
            /* no-op */
        }
    }
    // iOS 18+ Safari — toggle del switch oculto.
    try {
        ensureSwitchLabel()?.click()
    } catch {
        /* no-op */
    }
}
