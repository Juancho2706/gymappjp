import 'server-only'

/**
 * SERVER-side: logo del tenant → dataURL (base64) para jsPDF.
 *
 * Reemplaza el fetch client-side (`loadBrandLogoDataUrl`) que dependía del CORS del
 * bucket público y fallaba silenciosamente → PDF sin logo. En el servidor NO hay CORS:
 * se descarga la imagen (bucket `logos` público) y se codifica base64. El generador
 * recibe el dataURL ya resuelto; `null` ⇒ dibuja el nombre de marca como texto (mismo
 * contrato de fallback de hoy, ver `nutrition-exchange-pdf.ts`). Nunca lanza.
 *
 * jsPDF `addImage` sólo soporta raster (PNG/JPEG/WEBP): SVG y content-types no-imagen
 * se descartan (→ `null` → fallback texto). Límite defensivo de tamaño para no inflar el
 * PDF con un logo enorme.
 */
export async function resolveBrandLogoDataUrlServer(
    logoUrl: string | null | undefined,
): Promise<string | null> {
    if (!logoUrl || typeof logoUrl !== 'string') return null
    try {
        const res = await fetch(logoUrl, { cache: 'no-store' })
        if (!res.ok) return null
        const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') return null
        const bytes = Buffer.from(await res.arrayBuffer())
        if (bytes.byteLength === 0 || bytes.byteLength > 3_000_000) return null
        return `data:${contentType};base64,${bytes.toString('base64')}`
    } catch {
        return null
    }
}
