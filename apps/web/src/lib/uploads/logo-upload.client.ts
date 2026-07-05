/**
 * Subida de LOGOS de marca — helpers de cliente (Mi Marca del coach + Brand Studio del team).
 *
 * Motivo (incidente 2026-07-05): el logo se subía por un server action multipart (POST a
 * eva-app.cl) y el WAF managed de Cloudflare lo mataba con 403 → botón "Guardando…" infinito /
 * "No se pudo guardar". Mismo patrón que las fotos de check-in (2026-07-02).
 *
 * Fix: comprimir/redimensionar en el navegador y subir DIRECTO a Supabase Storage con una signed
 * upload URL (PUT a supabase.co) → esquiva el WAF de Cloudflare y el límite de 4.5MB de Vercel, y
 * baja el peso del archivo (menos Storage/egress). El PNG preserva el fondo transparente del logo.
 */

/** Comprime + redimensiona un logo a máx 512×512 PNG. Lanza si el navegador no puede decodificarla. */
export async function compressLogo(file: File): Promise<File> {
    const { default: imageCompression } = await import('browser-image-compression')
    const out = await imageCompression(file, {
        maxWidthOrHeight: 512,
        maxSizeMB: 1,
        useWebWorker: false,
        fileType: 'image/png', // re-encoda a PNG válido (preserva transparencia) — normaliza cualquier entrada
        initialQuality: 1,
    })
    return new File([out], 'logo.png', { type: 'image/png' })
}

/**
 * PUT directo del blob a una signed upload URL de Supabase Storage. Timeout de 45s para que nunca
 * quede colgado (el spinner infinito era parte del bug original). Devuelve true si el upload quedó.
 */
export async function putToSignedUrl(signedUrl: string, blob: Blob): Promise<boolean> {
    try {
        const res = await fetch(signedUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': blob.type || 'image/png' },
            ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(45_000) } : {}),
        })
        return res.ok
    } catch {
        return false
    }
}
