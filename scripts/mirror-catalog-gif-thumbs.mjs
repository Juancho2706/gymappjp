/**
 * Espejo one-time — thumbnails estáticos (webp animado) de los GIFs del catálogo de ejercicios.
 *
 * POR QUÉ: el grid "Aprender" del alumno reescribía cada GIF de Storage al endpoint
 * `render/image` de Supabase (imgproxy on-the-fly). Supabase cobra ese servicio por IMÁGENES DE
 * ORIGEN DISTINTAS transformadas POR MES (Pro incluye 100) → 206/100 en jun-jul 2026, y se
 * re-excede cada ciclo. Este script genera el thumb UNA vez con sharp local (gif → webp animado,
 * width<=256 sin upscale — los gifs nativos son 180x180x12 frames) y lo sube como objeto ESTÁTICO
 * a `exercise-media/gifthumb/`, llenando `exercises.thumbnail_url`. `exerciseGridThumb` ya
 * prioriza `thumbnail_url` → 0 transformaciones recurrentes, mismo peso (~27KB) para el alumno.
 *
 * IDEMPOTENTE: cursor = thumbnail_url IS NULL; upload con upsert. NUNCA borra media original.
 * REVERSA: node scripts/mirror-catalog-gif-thumbs.mjs --down --allow-remote (+SEED_CONFIRM=yes)
 *          → null-ea thumbnail_url de los espejados y borra los objetos gifthumb/.
 *
 * Uso (doble gate para remoto/prod, igual que los seeds):
 *   PowerShell: $env:SEED_CONFIRM='yes'; node scripts/mirror-catalog-gif-thumbs.mjs --allow-remote [--limit 5] [--dry] [--down]
 *   bash:       SEED_CONFIRM=yes node scripts/mirror-catalog-gif-thumbs.mjs --allow-remote
 */

import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
// sharp vive en apps/web (pnpm no lo hoistea a la raíz) — resolver desde ahí.
const requireWeb = createRequire(resolve(__dirname, '../apps/web/package.json'))
const sharp = requireWeb('sharp')
const { createClient } = requireWeb('@supabase/supabase-js')
const { config } = requireWeb('dotenv')

config({ path: resolve(__dirname, '../apps/web/.env.local') })
config({ path: resolve(__dirname, '../.env.local'), override: false })

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el env.')
    process.exit(1)
}

const isLocal = URL_.includes('127.0.0.1') || URL_.includes('localhost')
const allowRemote = process.argv.includes('--allow-remote')
if (!isLocal && (!allowRemote || process.env.SEED_CONFIRM !== 'yes')) {
    console.error(`URL remota detectada (${URL_}). Para escribir en remoto: --allow-remote + SEED_CONFIRM=yes.`)
    process.exit(1)
}

const DRY = process.argv.includes('--dry')
const DOWN = process.argv.includes('--down')
const limitIdx = process.argv.indexOf('--limit')
const LIMIT = limitIdx !== -1 ? Number(process.argv[limitIdx + 1]) : Infinity

const BUCKET = 'exercise-media'
const PREFIX = 'gifthumb'
const OBJECT_MARKER = '/storage/v1/object/public/'
const WIDTH = 256          // tope; withoutEnlargement evita upscalear los 180x180 nativos
const QUALITY = 55         // mismo q que usaba el render/image en exerciseGridThumb
const CONCURRENCY = 6
const MAX_GIF_BYTES = 5 * 1024 * 1024

const admin = createClient(URL_, KEY, { auth: { persistSession: false } })

/** Reversa: null-ea thumbnail_url espejados y borra los objetos gifthumb/. */
async function down() {
    const { data: rows, error } = await admin
        .from('exercises')
        .select('id, thumbnail_url')
        .like('thumbnail_url', `%/${BUCKET}/${PREFIX}/%`)
        .limit(2000)
    if (error) throw error
    console.log(`--down: ${rows.length} filas con thumb espejado`)
    if (DRY) return
    for (const row of rows) {
        await admin.from('exercises').update({ thumbnail_url: null, thumbnail_checked_at: null }).eq('id', row.id)
    }
    // Borrar objetos por lotes de 100 (límite del API de remove).
    const paths = [...new Set(rows.map(r => r.thumbnail_url.split(`${OBJECT_MARKER}${BUCKET}/`)[1]).filter(Boolean))]
    for (let i = 0; i < paths.length; i += 100) {
        const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100))
        if (rmErr) console.warn('remove batch fail:', rmErr.message)
    }
    console.log(`--down listo: ${rows.length} filas limpiadas, ${paths.length} objetos borrados`)
}

async function mirrorOne(row) {
    const idx = row.video_url.indexOf(OBJECT_MARKER)
    if (idx === -1) return { skip: 'no-storage' }
    const bucketAndPath = row.video_url.slice(idx + OBJECT_MARKER.length).split('?')[0]
    if (!/\.gif$/i.test(bucketAndPath)) return { skip: 'no-gif' }

    const res = await fetch(row.video_url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { fail: `download ${res.status}` }
    const input = Buffer.from(await res.arrayBuffer())
    if (input.byteLength === 0 || input.byteLength > MAX_GIF_BYTES) return { fail: `size ${input.byteLength}` }

    const webp = await sharp(input, { animated: true, limitInputPixels: 50_000_000 })
        .resize({ width: WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 4 })
        .toBuffer()

    // Slug del path completo (no solo basename) para evitar colisiones entre carpetas.
    const slug = bucketAndPath.split('/').slice(1).join('_').replace(/\.gif$/i, '')
    const thumbPath = `${PREFIX}/${slug}.webp`

    const { error: upErr } = await admin.storage.from(BUCKET).upload(thumbPath, webp, {
        contentType: 'image/webp', // OBLIGATORIO con Buffer (sin esto se guarda application/json)
        cacheControl: '31536000',
        upsert: true,
    })
    if (upErr) return { fail: `upload: ${upErr.message}` }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(thumbPath)
    const { error: dbErr } = await admin.from('exercises').update({
        thumbnail_url: pub.publicUrl,
        thumbnail_checked_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (dbErr) return { fail: `db: ${dbErr.message}` }
    return { ok: pub.publicUrl, bytes: webp.length }
}

async function up() {
    const { data: rows, error } = await admin
        .from('exercises')
        .select('id, video_url')
        .is('deleted_at', null)
        .is('thumbnail_url', null)
        .like('video_url', `%${OBJECT_MARKER}%`)
        .limit(1000)
    if (error) throw error

    const work = rows.slice(0, LIMIT)
    console.log(`Candidatos: ${rows.length} — a procesar: ${work.length}${DRY ? ' (DRY)' : ''}`)
    if (DRY) { work.slice(0, 10).forEach(r => console.log(' ', r.video_url)); return }

    let ok = 0, failed = 0, skipped = 0, totalBytes = 0
    const failures = []
    let cursor = 0
    async function worker() {
        while (cursor < work.length) {
            const row = work[cursor++]
            try {
                const r = await mirrorOne(row)
                if (r.ok) { ok++; totalBytes += r.bytes }
                else if (r.skip) skipped++
                else { failed++; failures.push({ id: row.id, reason: r.fail }) }
            } catch (e) {
                failed++; failures.push({ id: row.id, reason: e.message })
            }
            const done = ok + failed + skipped
            if (done % 50 === 0) console.log(`  ${done}/${work.length} (ok=${ok} fail=${failed} skip=${skipped})`)
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    console.log(`Listo: ok=${ok} fail=${failed} skip=${skipped} — ${(totalBytes / 1024 / 1024).toFixed(1)}MB subidos`)
    if (failures.length) {
        console.log('Fallos:')
        failures.slice(0, 20).forEach(f => console.log(` `, f.id, f.reason))
    }
}

await (DOWN ? down() : up())
