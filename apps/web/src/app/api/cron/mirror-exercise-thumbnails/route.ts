import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { mirrorAndSaveExerciseThumbnail } from '@/lib/exercises/thumbnail-mirror'

/**
 * Backfill / red de seguridad del mirror de thumbnails de YouTube a Storage.
 * El mirror principal corre sincrónico al crear/editar el ejercicio; este cron espeja los
 * existentes y reintenta los que fallaron (timeout). Idempotente: thumbnail_url IS NULL es el
 * cursor; thumbnail_checked_at evita martillar videos muertos (reintenta cada RETRY_AFTER_DAYS).
 */

function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`
}

const BATCH = 30
const RETRY_AFTER_DAYS = 7

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const cutoff = new Date(Date.now() - RETRY_AFTER_DAYS * 86_400_000).toISOString()

    const { data: rows, error } = await admin
        .from('exercises')
        .select('id, video_url')
        .is('thumbnail_url', null)
        .is('deleted_at', null)
        .not('video_url', 'is', null)
        .or(`thumbnail_checked_at.is.null,thumbnail_checked_at.lt.${cutoff}`)
        .limit(BATCH)

    if (error) {
        console.error('[cron/mirror-exercise-thumbnails] query error:', error)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    let mirrored = 0
    let skipped = 0
    for (const row of rows ?? []) {
        // video_url puede ser mp4/gif directo en data legacy — solo YouTube se espeja.
        if (!row.video_url || !/youtu/i.test(row.video_url)) {
            skipped++
            continue
        }
        const url = await mirrorAndSaveExerciseThumbnail(row.id, row.video_url)
        if (url) mirrored++
        else skipped++
    }

    console.info(`[cron/mirror-exercise-thumbnails] done — scanned=${rows?.length ?? 0} mirrored=${mirrored} skipped=${skipped}`)
    return NextResponse.json({ ok: true, scanned: rows?.length ?? 0, mirrored, skipped })
}
