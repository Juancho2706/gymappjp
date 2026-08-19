/**
 * Links PÚBLICOS que el coach le pasa a sus alumnos (código de invitación, QR, compartir).
 *
 * Espejo de `apps/web/src/lib/coach/invite-code.ts`. Existe como módulo propio por dos razones que
 * costaron caro:
 *
 *  1. **No es la base de la API.** Antes esto salía de `getApiBaseUrl()` (`EXPO_PUBLIC_API_URL`), y
 *     el perfil `previewv2` de `eas.json` apunta esa variable al deployment de preview de Vercel.
 *     En una build interna de QA, "Copiar link" le entregaba al coach un host detrás de la
 *     protección de deployment: el alumno que lo abría veía el login de Vercel, no la app. La base
 *     de la API tiene que seguir el entorno; el link que se comparte con un tercero, jamás.
 *
 *  2. **Siempre `www`, nunca el apex.** Los correos y el canónico de SEO viven en
 *     `https://www.eva-app.cl`. El apex responde con un redirect cross-origin y además es el host
 *     que la app reclama en deep links, así que emitirlo dejaba dos links distintos para lo mismo.
 */

/** Origen público de la app del alumno. Constante a propósito: no depende del entorno de build. */
export const STUDENT_APP_ORIGIN = 'https://www.eva-app.cl'

/**
 * Misma regla que la web — fuente de verdad: `apps/web/src/lib/coach/invite-code.ts`
 * (`INVITE_CODE_PATTERN`). Se duplica el literal, NO la regla: cualquier cambio allá tiene que
 * bajar acá, o la app pintaría códigos que el resolver de `/c/[identifier]` mandaría a `slug`.
 */
export const INVITE_CODE_PATTERN = /^[A-Z2-9]{5}$/

/** ¿El coach ya tiene un código utilizable? Trim como en web (`isValidInviteCode`). */
export function normalizeInviteCode(value?: string | null): string | null {
  const code = (value ?? '').trim()
  return INVITE_CODE_PATTERN.test(code) ? code : null
}

/** Login directo bajo la marca del coach. Es el que va en el QR y en "Copiar link". */
export function studentLoginUrl(identifier: string): string {
  return `${STUDENT_APP_ORIGIN}/c/${identifier}/login`
}

/**
 * Raíz de la app del coach, sin `/login`. Es la que va en el mensaje de compartir: entra más limpia
 * y el alumno ya logueado no rebota por el login.
 */
export function studentAppUrl(identifier: string): string {
  return `${STUDENT_APP_ORIGIN}/c/${identifier}`
}
