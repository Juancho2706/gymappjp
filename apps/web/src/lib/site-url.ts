/**
 * Base URL for absolute metadata (Open Graph, Twitter Cards, canonical).
 * Must match the public HTTPS origin users share in WhatsApp / X.
 */
/**
 * Base pública (sin barra final) para armar links que salen de la app: el acceso del alumno por
 * WhatsApp/correo, el portal público del coach, los correos de asignación.
 *
 * Por qué existe (22-08): `NEXT_PUBLIC_APP_URL` en Vercel trae barra final y cada call site
 * hacía `${appUrl}${'/c/...'}` ⇒ el alumno recibía `https://www.eva-app.cl//c/<code>/login`.
 * Se recorta UNA vez acá; ningún builder vuelve a leer las variables crudas.
 */
export function publicAppUrl(): string {
    const raw = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim()
    const base = raw ? raw.replace(/\/+$/, '') : resolveMetadataBase().origin
    return base
}

export function resolveMetadataBase(): URL {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    if (fromEnv) {
        try {
            return new URL(fromEnv.endsWith('/') ? fromEnv.slice(0, -1) : fromEnv)
        } catch {
            /* ignore */
        }
    }
    const vercel = process.env.VERCEL_URL?.trim()
    if (vercel) {
        const origin = vercel.startsWith('http') ? vercel : `https://${vercel}`
        try {
            return new URL(origin)
        } catch {
            /* ignore */
        }
    }
    return new URL('https://www.eva-app.cl')
}
