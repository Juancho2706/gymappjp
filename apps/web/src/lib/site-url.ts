/**
 * Base URL for absolute metadata (Open Graph, Twitter Cards, canonical).
 * Must match the public HTTPS origin users share in WhatsApp / X.
 */
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
