/**
 * URL del webhook de Flow que se HORNEA en el `urlCallback` de cada plan (plans/create). Flow notifica
 * ahí los cobros recurrentes de TODAS las suscripciones del plan, y el plan no se puede editar mientras
 * tenga suscriptores (doc Flow `plans/edit`) ⇒ una URL mal armada al crear el plan queda para siempre.
 *
 * Incidente 2026-09-28: `NEXT_PUBLIC_SITE_URL` tenía slash final cuando se creó `eva_pro_monthly_29990`
 * (05-08) ⇒ `urlCallback = https://www.eva-app.cl//api/payments/flow/webhook?...` ⇒ el borde de Vercel
 * responde 308 a los paths con `//` y Flow NO sigue redirects ⇒ ninguna renovación de ese plan llegó.
 * Mitigado en Cloudflare con la URL Rewrite Rule «Flow webhook doble barra» (reescribe ese path exacto).
 * Este helper es el ÚNICO lugar que arma la URL: sin slash final en la base, nunca `//` en el path.
 */
export function siteBaseUrlNoTrailingSlash(): string {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '')
}

export function buildFlowWebhookUrl(): string {
    const appUrl = siteBaseUrlNoTrailingSlash()
    const token = process.env.FLOW_WEBHOOK_TOKEN
    return token
        ? `${appUrl}/api/payments/flow/webhook?token=${encodeURIComponent(token)}`
        : `${appUrl}/api/payments/flow/webhook`
}

/**
 * ¿El `urlCallback` guardado en un plan de Flow entrega en el mismo endpoint y con el mismo token que
 * la URL esperada? Compara host + path (colapsando `//`, que la regla de Cloudflare ya reescribe) +
 * el `?token=`. Nunca expone el token: devuelve solo el veredicto y qué parte difiere.
 */
export function compareFlowCallbackUrl(
    actual: string | null | undefined,
    expected: string
): { ok: true } | { ok: false; reason: 'missing' | 'unparseable' | 'host' | 'path' | 'token' } {
    if (!actual) return { ok: false, reason: 'missing' }
    let a: URL
    let e: URL
    try {
        a = new URL(actual)
        e = new URL(expected)
    } catch {
        return { ok: false, reason: 'unparseable' }
    }
    const collapse = (p: string) => p.replace(/\/{2,}/g, '/')
    if (a.host !== e.host) return { ok: false, reason: 'host' }
    if (collapse(a.pathname) !== collapse(e.pathname)) return { ok: false, reason: 'path' }
    if ((a.searchParams.get('token') ?? '') !== (e.searchParams.get('token') ?? '')) {
        return { ok: false, reason: 'token' }
    }
    return { ok: true }
}
