/**
 * Lectura mínima del `user-agent` — SOLO para medición.
 *
 * Existe porque «Vive tu app» necesita saber si el coach entró desde el teléfono o desde el
 * escritorio (docs/specs/vive-tu-app-directo/SPEC.md §2: la métrica del paso 2 es
 * `entered / opened` con `device = mobile`, y sin esta señal el funnel no se puede leer).
 *
 * Mismo sniff que `app/auth/confirm/route.ts:18-27` (regex sobre el header, sin librería): acá se
 * unifica en un helper puro porque lo piden DOS superficies —el route handler `/vive-tu-app`, que
 * tiene el `NextRequest`, y la server action del panel, que lee `headers()`— y la spec prohíbe
 * duplicar lógica compartible.
 *
 * NUNCA autoriza nada: el user-agent lo escribe el cliente. Es una etiqueta de analítica.
 */
export type UserAgentDevice = 'mobile' | 'desktop'

/**
 * `mobile` para teléfonos y tablets (Android, iPhone/iPad/iPod y el token `Mobile` de Chrome/
 * Firefox móvil); `desktop` para todo lo demás, incluido el user-agent ausente.
 *
 * El iPad con «Solicitar sitio de escritorio» se anuncia como Macintosh y cae en `desktop`: es el
 * default de siempre (mismo criterio que `auth/confirm`), no una regresión.
 */
export function deviceFromUserAgent(userAgent: string | null | undefined): UserAgentDevice {
    const ua = userAgent ?? ''
    return /\b(android|iphone|ipad|ipod|mobile)\b/i.test(ua) ? 'mobile' : 'desktop'
}
