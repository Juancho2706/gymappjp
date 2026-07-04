/**
 * Helper PURO — deriva el path del thumbnail estatico (webp) espejado desde el GIF original
 * que vive en Supabase Storage (columna exercises.video_url). Extraido a su propio modulo SIN
 * `server-only` para poder testearlo directo; el gemelo `thumbnail-mirror.ts` lo importa.
 *
 * POR QUE es critico el slug exacto: el backfill one-time (scripts/mirror-catalog-gif-thumbs.mjs)
 * ya subio 818 objetos a `exercise-media/gifthumb/`. El path DEBE replicar EXACTAMENTE aquel slug
 * para que el cron reuse esos objetos idempotentemente (upsert sobre el mismo path) en vez de
 * re-generar/duplicar. Slug = path completo del objeto SIN el bucket (primer segmento), unido por
 * '_', sin la extension .gif. Ej: 'exercise-animations/catalog/27NNGFr.gif' -> 'gifthumb/catalog_27NNGFr.webp'.
 */

const OBJECT_MARKER = '/storage/v1/object/public/'
const THUMB_PREFIX = 'gifthumb'

/**
 * Parsea una URL publica de Storage a { bucketAndPath, thumbPath }.
 * Devuelve null si no es una URL de Storage o no termina en .gif (case-insensitive).
 * Total (nunca tira) para poder usarse como guard tanto en el cron como en tests.
 */
export function storageGifThumbPath(
    videoUrl: string,
): { bucketAndPath: string; thumbPath: string } | null {
    if (typeof videoUrl !== 'string') return null
    const idx = videoUrl.indexOf(OBJECT_MARKER)
    if (idx === -1) return null
    // Strip del query string (URLs firmadas / cache-busting) antes de derivar el path.
    const bucketAndPath = videoUrl.slice(idx + OBJECT_MARKER.length).split('?')[0]
    if (!/\.gif$/i.test(bucketAndPath)) return null

    // Slug del path COMPLETO (drop del bucket = primer segmento) para evitar colisiones entre carpetas.
    const slug = bucketAndPath.split('/').slice(1).join('_').replace(/\.gif$/i, '')
    const thumbPath = `${THUMB_PREFIX}/${slug}.webp`
    return { bucketAndPath, thumbPath }
}
