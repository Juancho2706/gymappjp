import 'server-only'
import { EXERCISE_MEDIA_LIMITS } from './image-validation'

export type DimensionsResult =
    | { ok: true; width: number; height: number }
    | { ok: false; reason: string }

/**
 * Decodifica metadata con sharp y valida dimensiones razonables.
 * `limitInputPixels` previene image-bombs (PNG 1px×30000px que se expanden al decode).
 */
export async function validateImageDimensions(buffer: Buffer): Promise<DimensionsResult> {
    let sharpFn: ((input: Buffer, options?: { limitInputPixels?: number }) => { metadata(): Promise<{ width?: number; height?: number }> })
    try {
        const mod = await import('sharp')
        sharpFn = (mod as unknown as { default: typeof sharpFn }).default
    } catch (err) {
        // FAIL-CLOSED: sharp es dependency obligatoria. Si no carga, NO dejamos pasar
        // la imagen sin validar dimensiones (defensa image-bomb). Rechazar.
        console.error('[image-validation] sharp no disponible — rechazando upload por seguridad:', err)
        return { ok: false, reason: 'No se pudo validar la imagen en el servidor. Intentá de nuevo.' }
    }
    try {
        const meta = await sharpFn(buffer, { limitInputPixels: EXERCISE_MEDIA_LIMITS.maxPixels }).metadata()
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
