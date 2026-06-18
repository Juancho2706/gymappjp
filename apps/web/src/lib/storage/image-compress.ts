import 'server-only'

/**
 * Compresión BEST-EFFORT de una imagen subida por el usuario a WebP, redimensionada.
 * Patrón espejo de lib/exercises/thumbnail-mirror.ts (sharp ya corre en prod/Vercel).
 *
 * Filosofía (🛡️ regla del plan): NUNCA tira. Si sharp falla (HEIC sin libheif, archivo
 * corrupto, OOM en Micro, input no-imagen), devuelve null y el caller sube el ARCHIVO
 * ORIGINAL — jamás se aborta el check-in (la UX del alumno es one-shot, no reintenta).
 *
 * Sube el objeto fuente UNA vez ya pequeño -> menos egress en CADA vista (no depende de
 * transforms por-request ni degrada las vistas full-res que comparten el chokepoint de signing).
 */

type SharpInstance = {
    rotate(): SharpInstance
    resize(
        width: number,
        height: number,
        opts: { fit: 'inside'; withoutEnlargement: boolean }
    ): SharpInstance
    webp(opts: { quality?: number }): { toBuffer(): Promise<Buffer> }
}
type SharpFn = (
    input: Buffer,
    options?: { limitInputPixels?: number; failOn?: 'none' | 'warning' | 'error' | 'truncated' }
) => SharpInstance

export type CompressedImage = { buffer: Buffer; contentType: 'image/webp'; ext: 'webp' }

/**
 * @returns el WebP comprimido, o null si NO se pudo (el caller debe subir el original).
 */
export async function compressImageToWebp(
    file: File,
    maxDim = 1080,
    quality = 80
): Promise<CompressedImage | null> {
    try {
        if (!file || typeof file.arrayBuffer !== 'function') return null
        const input = Buffer.from(await file.arrayBuffer())
        if (input.byteLength === 0) return null

        const mod = await import('sharp')
        const sharp = (mod as unknown as { default: SharpFn }).default

        const buffer = await sharp(input, { limitInputPixels: 50_000_000, failOn: 'none' })
            .rotate() // auto-orienta desde EXIF (fotos de celular salen rotadas si no)
            .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality })
            .toBuffer()

        if (!buffer || buffer.byteLength === 0) return null
        return { buffer, contentType: 'image/webp', ext: 'webp' }
    } catch (err) {
        console.warn('[image-compress] best-effort fail:', err)
        return null
    }
}
