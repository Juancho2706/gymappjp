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
 * Fecha desde la que TODO coach nace con código público (migraciones `023a1c65` 2026-05-20 y
 * `7d5ef960` 2026-05-22). El modal «Tu link de alumnos cambió» existe para avisarle a quien YA
 * repartía `/c/<slug>` que ahora su link es `/c/<código>`: un coach creado después nunca tuvo el
 * link viejo y no hay nada que confirmar (bug visto en el QA del 22-08: le salía a todo coach nuevo).
 */
export const PUBLIC_CODE_CUTOVER = new Date('2026-05-23T00:00:00Z')

/**
 * ¿Hay que pedirle al coach que confirme su código público (modal de web y de la app)?
 *
 * - `generated`: el código se acaba de crear porque no tenía uno válido ⇒ sí, siempre.
 * - Coach anterior al corte sin `invite_code_confirmed` ⇒ sí (todavía puede tener el link viejo).
 * - Coach posterior al corte ⇒ no: nació con código, nunca conoció `/c/<slug>`.
 */
export function needsPublicCodeConfirmation(input: {
    inviteCode: string | null | undefined
    generated: boolean
    inviteCodeConfirmed: boolean
    createdAt: string | Date | null | undefined
}): boolean {
    if (!isValidInviteCode(input.inviteCode)) return false
    if (input.generated) return true
    if (input.inviteCodeConfirmed) return false
    if (input.createdAt == null) return true
    const created = input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt)
    if (Number.isNaN(created.getTime())) return true
    return created < PUBLIC_CODE_CUTOVER
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
