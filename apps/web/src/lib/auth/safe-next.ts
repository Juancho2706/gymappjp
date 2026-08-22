/**
 * `?next=` compartido: validar el destino post-login y armarlo desde el proxy.
 *
 * Hasta hoy el mismo chequeo vivía copiado en cinco lugares con criterios distintos
 * (`admin/login/page.tsx`, `admin/login/AdminLoginForm.tsx`, `admin/login/_actions/login.actions.ts`,
 * `lib/auth/post-google-auth.ts`, `app/auth/callback/route.ts`). Un `?next=` sin allowlist es un
 * open redirect: basta con que alguien mande `/login?next=https://evil.tld` para que el login
 * legítimo termine dejando al coach en un dominio ajeno con aspecto de EVA.
 *
 * Regla del SPEC (Embudo Free → Pro §Reglas 9): `?next=` solo con allowlist de rutas internas,
 * nunca URL absoluta ni `//`.
 */

/**
 * Tope defensivo: un `next` legítimo (path + `utm_*`) no pasa de unos cientos de bytes, y
 * `revalidatePath` (el paso previo al `redirect()` del login) rechaza rutas de más de 1024
 * caracteres. Cortar acá evita que un `next` gigante reviente el final del login.
 */
export const MAX_NEXT_LENGTH = 1024

/** Árbol de rutas al que puede apuntar el `next`. `/` = cualquier ruta interna. */
export type NextPrefix = '/coach' | '/admin' | '/reset-password' | '/'

/**
 * Allowlist del camino Google/recovery (`/auth/callback?next=` → `resolvePostGoogleAuthUrl`).
 *
 * Son los únicos destinos que hoy emite alguien:
 * - `/reset-password[?team_slug&coach_slug]` — `(auth)/forgot-password/_actions/forgot-password.actions.ts`
 * - `/coach/**` (por defecto `/coach/dashboard`) — `lib/auth/client-oauth.ts` y `GoogleSignInButton`
 *
 * Antes acá iba `'/'` (cualquier ruta interna, `/api/**` incluido). Con la lista exacta, un `next`
 * inventado no puede pasear una sesión recién abierta por rutas que nadie pensó como aterrizaje.
 */
export const AUTH_CALLBACK_NEXT_PREFIXES: readonly NextPrefix[] = ['/reset-password', '/coach']

// Separadores codificados: `%2F`, `%5C` y `%2E` se normalizan al resolver el path, así que
// `/coach/..%2Fadmin` escaparía del prefijo después de haber pasado el chequeo textual.
const ENCODED_SEPARATOR = /%2f|%5c|%2e|%00/i

/** Último ASCII imprimible (`~`). */
const PRINTABLE_ASCII_MAX = 126

/**
 * Solo ASCII imprimible: se rechaza todo lo que esté fuera de 0x21-0x7E.
 *
 * - Espacios y controles (≤ 0x20, y 0x7F que además cae del otro lado del tope): los navegadores
 *   los recortan o normalizan, así que una ruta con un salto de línea o un tab puede terminar
 *   resolviendo a otra URL distinta de la validada.
 * - Todo lo que pase de 0x7E: (1) el `redirect()` de un Server Action escribe el destino en la
 *   cabecera `x-action-redirect`, y una cabecera solo admite ByteString — un `/coach/x` con un
 *   U+2028 al medio dispara un TypeError y devuelve 500 justo al terminar el login; (2) los
 *   homoglifos (`admin` con la primera letra cirílica U+0430, el espacio ideográfico U+3000)
 *   hacen pasar por legítimo un destino que no lo es. Un valor no-ASCII legítimo viaja
 *   percent-encoded (`%E2%80%A8`) y ese sí pasa.
 *
 * Se recorre a mano para no meter escapes en el fuente.
 */
function hasUnsafeChar(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i)
        if (code <= 32 || code > PRINTABLE_ASCII_MAX) return true
    }
    return false
}

/**
 * Devuelve el `next` tal cual si es una ruta interna segura bajo alguno de los prefijos
 * permitidos; si no, `null`.
 *
 * No re-encodea nada: el query original (los `utm_*` del correo de cupo) tiene que llegar
 * intacto al destino para que PostHog lo vea en el `$pageview` del aterrizaje.
 *
 * @param allowedPrefix un prefijo o una lista de prefijos aceptados (basta con que cumpla uno)
 */
export function safeNext(raw: unknown, allowedPrefix: NextPrefix | readonly NextPrefix[]): string | null {
    if (typeof raw !== 'string') return null
    if (raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null
    // Empezar por '/' descarta de una las absolutas y todo esquema (`javascript:`, `data:`, `https:`).
    if (!raw.startsWith('/')) return null
    if (raw.startsWith('//')) return null // protocol-relative: `//evil.tld` es absoluta
    if (raw.includes('\\')) return null // `/\evil.tld` lo leen varios navegadores como `//evil.tld`
    if (hasUnsafeChar(raw)) return null

    // El prefijo y los chequeos de esquema se validan contra el PATH; el query y el hash pueden
    // traer cualquier cosa imprimible (ahí viajan los `utm_*`, y un `?title=Big%20Data:%20intro`
    // no tiene por qué caer en silencio: el destino sigue siendo la ruta interna del path).
    const marker = raw.search(/[?#]/)
    const path = marker === -1 ? raw : raw.slice(0, marker)
    if (path.includes('..') || ENCODED_SEPARATOR.test(path)) return null
    if (path.includes('://')) return null

    const lowerPath = path.toLowerCase()
    if (lowerPath.includes('javascript:') || lowerPath.includes('data:')) return null

    const prefixes = typeof allowedPrefix === 'string' ? [allowedPrefix] : allowedPrefix
    const allowed = prefixes.some(
        prefix => prefix === '/' || path === prefix || path.startsWith(`${prefix}/`)
    )
    if (!allowed) return null

    return raw
}

/**
 * Rutas donde `?next=` no aporta nada: el login ya aterriza ahí por defecto
 * (`resolvePostLoginRedirect`). Mismo criterio que el bloque `/admin` del proxy.
 *
 * `/coach/onboarding/complete` va en la lista por otro motivo: el proxy la deja pasar sin gates
 * (es el alta OAuth de quien todavía no tiene fila `coaches`). Un `next` apuntando ahí dejaría a
 * un coach existente encerrado en el formulario de alta — callejón sin salida.
 */
const COACH_LOGIN_DEFAULT_PATHS = new Set(['/coach', '/coach/dashboard', '/coach/onboarding/complete'])

/**
 * Saca el `_rsc` que Next pega en las navegaciones RSC: no significa nada al volver del login y
 * ensucia la URL final del coach.
 *
 * Se opera sobre el texto crudo (no `URLSearchParams`) para no re-encodear los `utm_*`.
 */
function stripRscParam(search: string): string {
    if (!search.startsWith('?')) return ''
    const kept = search
        .slice(1)
        .split('&')
        .filter(pair => pair !== '' && pair !== '_rsc' && !pair.startsWith('_rsc='))
    return kept.length > 0 ? `?${kept.join('&')}` : ''
}

/**
 * `true` si el `next` no pide nada: es el aterrizaje por defecto del login (o no hay next).
 *
 * Los dos caminos de Google (`client-oauth.ts` y `GoogleSignInButton`) mandan `/coach/dashboard`
 * SIEMPRE, como forma de decir «sin destino explícito»; `resolvePostGoogleAuthUrl` necesita
 * distinguir eso de un destino de verdad (`/coach/subscription?utm_...`) para decidir qué hacer
 * cuando el usuario de Google no tiene fila `coaches`.
 */
export function isCoachDefaultLanding(next: string | null | undefined): boolean {
    if (!next) return true
    const marker = next.search(/[?#]/)
    const path = marker === -1 ? next : next.slice(0, marker)
    return COACH_LOGIN_DEFAULT_PATHS.has(path)
}

/**
 * Arma el valor de `?next=` con el que el proxy manda al login a un coach sin sesión.
 *
 * Se pasa por `safeNext` a propósito: lo que el proxy escribe es exactamente lo que el login
 * puede consumir (mismo criterio de ida y de vuelta), y si el path entrante fuera raro el
 * resultado es `null` — el coach cae en el dashboard, nunca en un destino no validado.
 *
 * @param pathname destino original (`/coach/subscription`)
 * @param search   query original incluyendo el `?` (`?utm_source=cap_email&...`) o `''`
 */
export function buildCoachLoginNext(pathname: string, search: string): string | null {
    if (COACH_LOGIN_DEFAULT_PATHS.has(pathname)) return null
    return safeNext(`${pathname}${stripRscParam(search)}`, '/coach')
}

/**
 * Devuelve los pares `utm_*` de un query string, tal cual vienen.
 *
 * El `next` ya se lleva el query COMPLETO para el aterrizaje; estos `utm_*` duplicados a nivel top
 * son para el `$pageview` de `/login`, que solo ve la URL del login. Sin ellos, el coach que abre
 * el correo de cupo, mira el login y se va queda sin atribución en PostHog (abandono medible).
 *
 * @param search query original incluyendo el `?` (`?utm_source=cap_email&...`) o `''`
 */
export function pickUtmParams(search: string): [string, string][] {
    if (search.length === 0) return []
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const utm: [string, string][] = []
    for (const [key, value] of params) {
        if (key.startsWith('utm_')) utm.push([key, value])
    }
    return utm
}
