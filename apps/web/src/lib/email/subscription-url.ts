/**
 * URL base del sitio y CTA de suscripción para los correos, en UN solo lugar.
 *
 * Por qué vive acá y no en `services/billing/sales-emails.service.ts` (donde nació): el drip
 * (`lib/email/drip-templates.ts`) lo necesita, y una plantilla PURA de correo importando un service
 * de billing arrastra `send-email`, el ledger de `admin_audit_logs` y medio módulo de pagos a
 * cualquier test de render. La capa correcta para un helper de texto es `lib/email`.
 *
 * El service sigue re-exportando `buildSubscriptionUrl` para no mover a sus consumidores
 * (`api/cron/paid-expiry/route.ts` y su propia suite).
 */

/**
 * Dominio del sitio. `NEXT_PUBLIC_SITE_URL` en Vercel; el fallback es PRODUCCIÓN, nunca localhost:
 * un correo con `http://localhost:3000` en el link es un correo perdido, y el drip corre en el
 * mismo runtime que puede quedarse sin la env.
 */
export function siteBaseUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.eva-app.cl'
}

/**
 * CTA de los correos de venta. En email SÍ es legal (la restricción anti-steering es in-app).
 *
 * SIN argumentos devuelve la URL desnuda de siempre (la usa el cron `paid-expiry`). Con `utmSource`
 * agrega el trío de atribución (`utm_source`/`utm_medium=email`/`utm_campaign`) para poder medir en
 * PostHog qué correo trajo el checkout.
 */
export function buildSubscriptionUrl(opts?: { utmSource?: string; utmCampaign?: string }): string {
    const url = `${siteBaseUrl()}/coach/subscription`
    if (!opts?.utmSource) return url
    const params = new URLSearchParams({ utm_source: opts.utmSource, utm_medium: 'email' })
    if (opts.utmCampaign) params.set('utm_campaign', opts.utmCampaign)
    return `${url}?${params.toString()}`
}
