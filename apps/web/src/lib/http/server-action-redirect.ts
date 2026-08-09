/**
 * Redirect del proxy sobre un POST de Server Action → error genérico en el cliente.
 *
 * INCIDENTE (EVA-NEXTJS-19, prod 2026-08-07/09): el alumno tocaba una acción en el
 * dashboard (toggle de comida, workout) con la sesión ya caída. El proxy respondía
 * `307 → /c/<slug>/login`; `fetch` sigue el redirect y el cliente de Next recibe el
 * HTML del login. Como no es `content-type: text/x-component` ni trae
 * `x-action-redirect`, Next tira `Error: An unexpected response was received from the
 * server.` (E394). El call site que sí tiene catch muestra un error genérico
 * ("Error al registrar comida"), el que no lo tiene deja la promesa rechazada sin manejar;
 * en los dos casos la acción se pierde y NADIE manda al alumno al login: la app queda muerta
 * hasta que recarga a mano. Sentry sólo ve un stack minificado de un frame.
 *
 * Evidencia: `POST /c/[coach_slug]/dashboard 307` en Vercel a las 23:17:44Z y 00:02:19Z,
 * mismo segundo que los eventos de Sentry.
 *
 * FIX: para requests de Server Action, un redirect del proxy se traduce al protocolo que
 * el cliente de Next sí entiende (`x-action-redirect: <location>;replace` con cuerpo
 * `text/plain` vacío, igual que un redirect externo). Next entonces navega al login en vez
 * de tirar el error. Si el protocolo cambiara en un Next futuro, el peor caso es volver al
 * comportamiento actual (error genérico), no uno nuevo.
 *
 * Funciones PURAS (sólo `Headers`/`Response` del estándar web, sin `next/server`) → se
 * testean sin levantar el middleware.
 */

/** Header que Next pone en el POST de toda Server Action (`ACTION_HEADER` en Next 16). */
export const SERVER_ACTION_HEADER = 'next-action'

/** Header con el que el cliente de Next acepta un redirect en respuesta a una acción. */
export const ACTION_REDIRECT_HEADER = 'x-action-redirect'

export function isServerActionRequest(headers: Headers): boolean {
    return headers.has(SERVER_ACTION_HEADER)
}

/**
 * Traduce una respuesta 3xx con `location` al protocolo de redirect de Server Actions.
 * Devuelve `null` cuando la respuesta no es un redirect (el caller la deja pasar tal cual).
 */
export function toServerActionRedirect(response: Response): Response | null {
    if (response.status < 300 || response.status >= 400) return null

    const location = response.headers.get('location')
    if (!location) return null

    const headers = new Headers({
        'content-type': 'text/plain;charset=utf-8',
        [ACTION_REDIRECT_HEADER]: `${location};replace`,
    })

    // Las cookies del redirect original (sesión limpiada/rotada por el proxy) tienen que
    // viajar igual: sin ellas el navegador conserva el token muerto y vuelve a rebotar.
    for (const cookie of readSetCookies(response.headers)) {
        headers.append('set-cookie', cookie)
    }

    return new Response('', { status: 200, headers })
}

function readSetCookies(headers: Headers): string[] {
    const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
    if (typeof getSetCookie === 'function') return getSetCookie.call(headers)
    const raw = headers.get('set-cookie')
    return raw ? [raw] : []
}
