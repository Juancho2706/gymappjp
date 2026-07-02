import { exerciseThumbnailUrl } from '@/lib/youtube'
import type { Tables } from '@/lib/database.types'

/**
 * Fila de ejercicio para el CATÁLOGO / grids (columnas de LISTA — mismo set que
 * EXERCISE_LIST_COLUMNS). NO incluye los blobs pesados (`instructions`, `image_url`),
 * que viajan on-demand al abrir el detalle. Tipo compartido cliente + servidor.
 */
export type CatalogExercise = Pick<
    Tables<'exercises'>,
    | 'id'
    | 'coach_id'
    | 'org_id'
    | 'team_id'
    | 'exercise_type'
    | 'name'
    | 'muscle_group'
    | 'equipment'
    | 'difficulty'
    | 'gender_focus'
    | 'body_part'
    | 'gif_url'
    | 'video_url'
    | 'thumbnail_url'
    | 'video_start_time'
    | 'video_end_time'
    | 'secondary_muscles'
    | 'deleted_at'
    | 'source'
    | 'created_at'
>

const OBJECT_MARKER = '/storage/v1/object/public/'

/**
 * Convierte una URL pública de Supabase Storage (`…/object/public/<bucket>/<path>`) en su
 * URL de TRANSFORMACIÓN de imagen (`…/render/image/public/<bucket>/<path>?width=…`). El
 * endpoint de render (imgproxy) redimensiona y re-codifica on-the-fly: un `.gif` del catálogo
 * de ~93KB sale como WebP de ~26KB (el navegador negocia webp por su header Accept). Así el
 * grid deja de traer el gif crudo a resolución completa por cada tarjeta.
 *
 * Solo transforma URLs de Storage de Supabase; cualquier otra URL devuelve `null` para que el
 * caller caiga a la URL cruda (p. ej. un CDN externo).
 */
export function toStorageRenderThumb(
    publicUrl: string,
    width = 256,
    quality = 55,
): string | null {
    const idx = publicUrl.indexOf(OBJECT_MARKER)
    if (idx === -1) return null
    const origin = publicUrl.slice(0, idx)
    const bucketAndPath = publicUrl.slice(idx + OBJECT_MARKER.length).split('?')[0]
    if (!bucketAndPath) return null
    return `${origin}/storage/v1/render/image/public/${bucketAndPath}?width=${width}&quality=${quality}`
}

type ThumbSource = Pick<
    CatalogExercise,
    'thumbnail_url' | 'gif_url' | 'video_url'
> & { image_url?: string | null }

/**
 * Miniatura LIGERA para el grid del catálogo del alumno ("Aprender") — nunca el gif/video crudo
 * full-res, que es la queja del CEO ("me carga TODO su multimedia — carga grande para Supabase").
 *
 * Compone sobre el helper canónico `exerciseThumbnailUrl` (misma prioridad gif→image→mirror→YT→
 * directa que el resto de la app) y, cuando la URL resultante vive en Storage de Supabase, la
 * reescribe al endpoint `render/image` (WebP redimensionado) en vez de servir el gif crudo. El
 * `thumbnail_url` (espejo estático ya pequeño) y los pósters de YouTube se sirven directo.
 *
 * El gif/video a resolución completa vive SOLO en el modal de técnica (se abre on-demand).
 */
export function exerciseGridThumb(ex: ThumbSource, width = 256): string | null {
    // Espejo estático primero: ya es un webp chico, no vale la pena re-transformarlo.
    if (ex.thumbnail_url) return ex.thumbnail_url

    const base = exerciseThumbnailUrl(ex)
    if (!base) return null

    // Media en Storage de Supabase (gif del catálogo) → sírvelo redimensionado; el resto (póster
    // de YouTube, CDN externo) ya es liviano/estático y se sirve tal cual.
    return toStorageRenderThumb(base, width) ?? base
}
