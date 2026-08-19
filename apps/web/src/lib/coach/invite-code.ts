const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const INVITE_CODE_PATTERN = /^[A-Z2-9]{5}$/

export function generateInviteCode(): string {
    let code = ''
    for (let i = 0; i < 5; i++) {
        code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)]
    }
    return code
}

export function isValidInviteCode(value: string | null | undefined): value is string {
    return INVITE_CODE_PATTERN.test(value?.trim() ?? '')
}

/**
 * Canonical mapping of a public coach identifier to the column to match on.
 * Generated codes (e.g. "AB3KP") resolve via `invite_code` (primary), everything
 * else via the legacy `slug`. Use this everywhere a `/c/[identifier]` URL is
 * resolved so code-only coaches (no legacy slug) never 404.
 */
export function coachIdentifierColumn(identifier: string | null | undefined): 'invite_code' | 'slug' {
    return isValidInviteCode(identifier) ? 'invite_code' : 'slug'
}

/**
 * Origen público desde el que emitimos los links que el coach le pasa al alumno.
 *
 * Siempre `www`, nunca el apex: los correos transaccionales y el canónico de SEO ya viven en
 * `https://www.eva-app.cl` (ver `resolveMetadataBase()` en `apps/web/src/lib/site-url.ts`, que cae
 * exactamente a ese fallback). Emitir el apex desde el producto dejaba DOS links distintos para lo
 * mismo — el que compartía el coach y el que mandaba EVA — con redirects de por medio.
 *
 * Este helper se consume desde componentes CLIENTE, así que solo puede leer `NEXT_PUBLIC_*`:
 * `VERCEL_URL` no existe en el bundle del navegador y, aunque existiera, apuntaría al deployment
 * de preview. El link del alumno debe ser SIEMPRE el origen público.
 *
 * OJO — por qué se NORMALIZA el host y no basta con el fallback: `NEXT_PUBLIC_SITE_URL` vale hoy
 * `https://eva-app.cl` (el apex) tanto en `.env.local` de la raíz como en el de `apps/web`. Con un
 * helper que devolviera la variable tal cual, la regla del `www` solo se cumplía cuando la variable
 * NO existía — es decir, nunca. Por eso el apex se reescribe acá, y así ni una env var mal puesta
 * en Vercel puede volver a emitirlo.
 */
export const STUDENT_APP_ORIGIN_FALLBACK = 'https://www.eva-app.cl'

export function studentAppOrigin(): string {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    if (!fromEnv) return STUDENT_APP_ORIGIN_FALLBACK

    let parsed: URL
    try {
        parsed = new URL(fromEnv)
    } catch {
        // Valor corrupto: no arriesgamos un link roto en manos del alumno.
        return STUDENT_APP_ORIGIN_FALLBACK
    }

    // El apex es el único host que reescribimos. localhost y los hosts de preview pasan intactos
    // para que dev y QA sigan resolviendo contra su propio origen.
    if (parsed.hostname === 'eva-app.cl') parsed.hostname = 'www.eva-app.cl'

    return parsed.origin
}

/** Link directo al login del alumno bajo la marca del coach (`/c/{identifier}/login`). */
export function buildStudentLoginUrl(identifier: string): string {
    return `${studentAppOrigin()}/c/${identifier}/login`
}

/**
 * Raíz de la app del coach (`/c/{identifier}`, sin `/login`). Es la que va en el mensaje de
 * compartir y en el QR: entra más limpia y el alumno ya logueado no rebota por el login.
 */
export function buildStudentAppUrl(identifier: string): string {
    return `${studentAppOrigin()}/c/${identifier}`
}
