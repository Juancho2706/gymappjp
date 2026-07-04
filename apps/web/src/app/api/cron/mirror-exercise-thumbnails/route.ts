import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import {
    mirrorAndSaveExerciseThumbnail,
    mirrorAndSaveStorageGifThumbnail,
} from '@/lib/exercises/thumbnail-mirror'

/**
 * Backfill / red de seguridad del mirror de thumbnails de ejercicios a Storage.
 * Cubre DOS origenes de `video_url`:
 *  - YouTube: espeja el poster (mqdefault). Si el canal borra el video el hotlink degrada invisible.
 *  - GIF de Storage: espeja un webp animado ESTATICO a `exercise-media/gifthumb/`. Sin este espejo
 *    el grid cae al endpoint render/image de Supabase, que cobra por imagen de origen unica/mes
 *    (100 incluidas en Pro) — el backfill one-time cubrio los 818 del catalogo; este cron cubre los
 *    ejercicios FUTUROS con gif en Storage, reusando idempotentemente esos mismos objetos.
 * El mirror principal corre sincronico al crear/editar; este cron espeja los existentes y reintenta
 * los que fallaron. Idempotente: `thumbnail_url IS NULL` es el cursor; `thumbnail_checked_at` evita
 * martillar origenes muertos (reintenta cada RETRY_AFTER_DAYS).
 */

// sharp animado (gif -> webp multi-frame) x GIF_BATCH no cabe en el default (10s).
export const maxDuration = 60

function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

const YT_BATCH = 30
const GIF_BATCH = 20
const RETRY_AFTER_DAYS = 7

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const cutoff = new Date(Date.now() - RETRY_AFTER_DAYS * 86_400_000).toISOString()

    let skipped = 0

    // --- 1) YouTube: espejar el poster (mqdefault). ---
    // Filtrar a YouTube en el SELECT (no en el loop): el catálogo de ExerciseDB tiene ~800 filas
    // con un GIF en video_url + thumbnail_url NULL. Sin este filtro inundaban el batch, el loop
    // las descartaba (no-YouTube) y los ejercicios de YouTube nunca entraban al batch.
    const { data: ytRows, error: ytError } = await admin
        .from('exercises')
        .select('id, video_url')
        .is('thumbnail_url', null)
        .is('deleted_at', null)
        .ilike('video_url', '%youtu%')
        .or(`thumbnail_checked_at.is.null,thumbnail_checked_at.lt.${cutoff}`)
        .limit(YT_BATCH)

    if (ytError) {
        console.error('[cron/mirror-exercise-thumbnails] yt query error:', ytError)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    let mirroredYt = 0
    for (const row of ytRows ?? []) {
        // video_url puede ser mp4/gif directo en data legacy — solo YouTube se espeja aca.
        if (!row.video_url || !/youtu/i.test(row.video_url)) {
            skipped++
            continue
        }
        const url = await mirrorAndSaveExerciseThumbnail(row.id, row.video_url)
        if (url) mirroredYt++
        else skipped++
    }

    // --- 2) GIF de Storage: espejar un webp animado estatico a gifthumb/. ---
    // Mismo patron de cursor que YouTube, filtrado a URLs publicas de Storage. Los no-.gif que
    // caigan aca los descarta el helper (devuelve null -> marca checked -> cuenta como skipped).
    const { data: gifRows, error: gifError } = await admin
        .from('exercises')
        .select('id, video_url')
        .is('thumbnail_url', null)
        .is('deleted_at', null)
        .like('video_url', '%/storage/v1/object/public/%')
        .or(`thumbnail_checked_at.is.null,thumbnail_checked_at.lt.${cutoff}`)
        .limit(GIF_BATCH)

    if (gifError) {
        console.error('[cron/mirror-exercise-thumbnails] gif query error:', gifError)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    let mirroredGif = 0
    for (const row of gifRows ?? []) {
        if (!row.video_url) {
            skipped++
            continue
        }
        const url = await mirrorAndSaveStorageGifThumbnail(row.id, row.video_url)
        if (url) mirroredGif++
        else skipped++ // no-.gif / fallo — el helper ya marco checked
    }

    const scannedYt = ytRows?.length ?? 0
    const scannedGif = gifRows?.length ?? 0
    console.info(
        `[cron/mirror-exercise-thumbnails] done — yt(scanned=${scannedYt} mirrored=${mirroredYt}) ` +
        `gif(scanned=${scannedGif} mirrored=${mirroredGif}) skipped=${skipped}`,
    )
    return NextResponse.json({
        ok: true,
        scannedYt,
        scannedGif,
        mirroredYt,
        mirroredGif,
        skipped,
    })
}
