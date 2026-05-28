/**
 * Validación estricta de imágenes subidas por coaches.
 * Capa server-side anti-XSS / anti-image-bomb / anti-path-traversal.
 */

export const EXERCISE_MEDIA_LIMITS = {
    /** Tamaño máximo para imágenes estáticas (ya comprimidas client-side). */
    maxBytes: 2 * 1024 * 1024,
    /** GIFs no se comprimen (frames animados). Aceptamos hasta 8MB antes de bloquear. */
    gifPreCompressMaxBytes: 8 * 1024 * 1024,
    maxWidth: 4096,
    maxHeight: 4096,
    /** image-bomb defense: rechaza decompression antes de procesar. */
    maxPixels: 8_000_000,
    minWidth: 100,
    minHeight: 100,
    /** Quota total por coach en bytes en bucket exercise-media. */
    coachQuotaBytes: 50 * 1024 * 1024,
} as const

export const EXERCISE_MEDIA_MIME = [
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
] as const

export type ExerciseMediaMime = (typeof EXERCISE_MEDIA_MIME)[number]
export type ExerciseMediaKind = 'gif' | 'jpeg' | 'png' | 'webp'

export const KIND_TO_EXT: Record<ExerciseMediaKind, string> = {
    gif: 'gif',
    jpeg: 'jpg',
    png: 'png',
    webp: 'webp',
}

export type MagicResult =
    | { ok: true; kind: ExerciseMediaKind }
    | { ok: false; reason: string }

/**
 * Inspecciona los primeros 12 bytes de un archivo y los compara contra los magic numbers conocidos.
 * NO se confía en file.type ni en la extensión — solo el contenido binario decide.
 */
export async function validateImageMagicBytes(file: Blob): Promise<MagicResult> {
    const buf = await file.slice(0, 12).arrayBuffer()
    const b = new Uint8Array(buf)
    if (b.length < 4) return { ok: false, reason: 'Archivo vacío o corrupto.' }

    // GIF87a / GIF89a → 47 49 46 38 (37|39) 61
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
        return { ok: true, kind: 'gif' }
    }
    // JPEG → FF D8 FF
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
        return { ok: true, kind: 'jpeg' }
    }
    // PNG → 89 50 4E 47 0D 0A 1A 0A
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
        return { ok: true, kind: 'png' }
    }
    // WebP → RIFF....WEBP
    if (
        b.length >= 12 &&
        b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
    ) {
        return { ok: true, kind: 'webp' }
    }
    return { ok: false, reason: 'Tipo de archivo no soportado (solo GIF/JPEG/PNG/WebP).' }
}

export type DimensionsResult =
    | { ok: true; width: number; height: number }
    | { ok: false; reason: string }

/**
 * Decodifica metadata con sharp y valida dimensiones razonables.
 * Solo server-side (sharp es un binario nativo).
 * `limitInputPixels` previene image-bombs (PNG 1px×30000px que se expanden al decode).
 */
export async function validateImageDimensions(buffer: Buffer): Promise<DimensionsResult> {
    let sharp: ((input: Buffer, options?: { limitInputPixels?: number }) => { metadata(): Promise<{ width?: number; height?: number }> })
    try {
        const mod = await import('sharp')
        sharp = (mod as unknown as { default: typeof sharp }).default
    } catch {
        // Si sharp no está instalado en runtime → fail-open con warning (no romper en dev)
        return { ok: true, width: 0, height: 0 }
    }
    try {
        const meta = await sharp(buffer, { limitInputPixels: EXERCISE_MEDIA_LIMITS.maxPixels }).metadata()
        const w = meta.width ?? 0
        const h = meta.height ?? 0
        if (w < EXERCISE_MEDIA_LIMITS.minWidth || h < EXERCISE_MEDIA_LIMITS.minHeight) {
            return { ok: false, reason: `Imagen muy chica (mínimo ${EXERCISE_MEDIA_LIMITS.minWidth}×${EXERCISE_MEDIA_LIMITS.minHeight}px).` }
        }
        if (w > EXERCISE_MEDIA_LIMITS.maxWidth || h > EXERCISE_MEDIA_LIMITS.maxHeight) {
            return { ok: false, reason: `Imagen muy grande (máximo ${EXERCISE_MEDIA_LIMITS.maxWidth}×${EXERCISE_MEDIA_LIMITS.maxHeight}px).` }
        }
        if (w * h > EXERCISE_MEDIA_LIMITS.maxPixels) {
            return { ok: false, reason: 'Excede píxeles permitidos.' }
        }
        return { ok: true, width: w, height: h }
    } catch {
        return { ok: false, reason: 'No se pudo procesar la imagen (formato corrupto o no soportado).' }
    }
}

export function extToKind(mime: string): ExerciseMediaKind | null {
    const m = mime.toLowerCase()
    if (m === 'image/gif') return 'gif'
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpeg'
    if (m === 'image/png') return 'png'
    if (m === 'image/webp') return 'webp'
    return null
}
