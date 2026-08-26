/**
 * Dispara `POST /volver-al-panel` desde un componente cliente (docs/specs/vive-tu-app-directo §3).
 *
 * Por qué un `<form>` sintético y no un `fetch`: la ruta responde 303 y el navegador tiene que
 * SEGUIR el redirect como navegación de documento — es un cambio de sesión, no una llamada de datos.
 * Un `fetch` seguiría el redirect en background y dejaría al coach mirando la app del alumno con la
 * sesión ya cambiada. Y POST, no GET, porque consume un magic link de un solo uso: un `GET` lo
 * quemaría con un prefetch.
 *
 * El banner de la vista de ejemplo usa un `<form>` real en el markup (funciona sin JS); esto es para
 * los dos lugares donde el gesto ya vive dentro de un botón con handler (nav del alumno y perfil).
 */
export const VOLVER_AL_PANEL_PATH = '/volver-al-panel'

export function submitVolverAlPanel(): void {
    if (typeof document === 'undefined') return
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = VOLVER_AL_PANEL_PATH
    form.style.display = 'none'
    document.body.appendChild(form)
    form.submit()
}
