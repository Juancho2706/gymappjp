import 'server-only'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { extractYoutubeVideoId } from '@/lib/youtube'

/**
 * Mirror del thumbnail de YouTube a Supabase Storage (bucket exercise-media), para durabilidad:
 * si el canal borra/privatiza el video, img.youtube.com devuelve un JPEG gris 120x90 con HTTP 404
 * cuyo body es decodable (img.onerror NO dispara) — degradacion invisible en la biblioteca. Guardar
 * una copia propia lo evita. El render (exerciseThumbnailUrl) prioriza thumbnail_url sobre el hotlink.
 *
 * Escritura SOLO service-role: bypasa la RLS de storage (path-scoped por auth.uid()) y puede escribir
 * thumbnail_url de ejercicios team/org que no tienen dueño auth.uid(). Best-effort: NUNCA tira
 * (no debe bloquear el guardado del ejercicio). Investigacion jun-2026: 404 = video muerto;
 * mqdefault (320x180) = 16:9 nativo sin letterbox; sharp.webp valida bytes + comprime; Buffer EXIGE
 * contentType explicito (sin el se guarda como application/json y rompe el render).
 */

const BUCKET = 'exercise-media'
const YT_THUMB_TIMEOUT_MS = 5000
const YT_THUMB_MAX_BYTES = 2 * 1024 * 1024
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/

type SharpInstance = {
    metadata(): Promise<{ width?: number; height?: number }>
    webp(opts: { quality?: number; effort?: number }): { toBuffer(): Promise<Buffer> }
}
type SharpFn = (input: Buffer, options?: { limitInputPixels?: number }) => SharpInstance

/**
 * Espeja el thumbnail del video y lo guarda en exercises.thumbnail_url.
 * Devuelve la public URL si espejó, o null (video muerto / no-YouTube / fallo).
 */
export async function mirrorAndSaveExerciseThumbnail(
    exerciseId: string,
    videoUrl: string | null,
): Promise<string | null> {
    const admin = createServiceRoleClient()
    const markChecked = async () => {
        try {
            await admin.from('exercises').update({ thumbnail_checked_at: new Date().toISOString() }).eq('id', exerciseId)
        } catch { /* noop */ }
    }
    try {
        const videoId = videoUrl ? extractYoutubeVideoId(videoUrl) : null
        if (!videoId || !YT_ID_RE.test(videoId)) { await markChecked(); return null }

        const res = await fetch(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, {
            signal: AbortSignal.timeout(YT_THUMB_TIMEOUT_MS),
            redirect: 'error', // un thumbnail nunca redirige; cualquier 3xx es anómalo (defensa SSRF)
            cache: 'no-store',
            headers: { 'User-Agent': 'EVA-thumb-mirror/1.0 (+https://eva-app.cl)' },
        })
        if (!res.ok) { await markChecked(); return null } // 404 = video muerto/privado → render cae al hotlink
        if (Number(res.headers.get('content-length') ?? 0) > YT_THUMB_MAX_BYTES) { await markChecked(); return null }

        const input = Buffer.from(await res.arrayBuffer())
        if (input.byteLength === 0 || input.byteLength > YT_THUMB_MAX_BYTES) { await markChecked(); return null }

        const mod = await import('sharp')
        const sharp = (mod as unknown as { default: SharpFn }).default
        const meta = await sharp(input, { limitInputPixels: 5_000_000 }).metadata()
        // Belt-and-suspenders sobre el 404: el placeholder gris de YouTube es exactamente 120x90.
        if ((meta.width ?? 0) <= 120 && (meta.height ?? 0) <= 90) { await markChecked(); return null }

        const webp = await sharp(input, { limitInputPixels: 5_000_000 }).webp({ quality: 78, effort: 6 }).toBuffer()

        const path = `yt/${videoId}.webp` // dedup por video: N ejercicios con el mismo video → 1 objeto
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, webp, {
            contentType: 'image/webp', // OBLIGATORIO con Buffer (sin esto se guarda como application/json)
            cacheControl: '31536000',  // 1 año — thumbnail inmutable
            upsert: true,              // idempotente: re-correr sobreescribe el mismo path
        })
        if (upErr) { await markChecked(); return null }

        const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
        await admin.from('exercises').update({
            thumbnail_url: pub.publicUrl,
            thumbnail_checked_at: new Date().toISOString(),
        }).eq('id', exerciseId)
        return pub.publicUrl
    } catch (err) {
        console.warn('[thumbnail-mirror] best-effort fail:', err)
        await markChecked()
        return null
    }
}

/** Limpia el espejo (service-role) cuando el ejercicio deja de tener video de YouTube. */
export async function clearExerciseThumbnail(exerciseId: string): Promise<void> {
    try {
        const admin = createServiceRoleClient()
        await admin.from('exercises').update({ thumbnail_url: null, thumbnail_checked_at: null }).eq('id', exerciseId)
    } catch (err) {
        console.warn('[thumbnail-mirror] clear fail:', err)
    }
}
