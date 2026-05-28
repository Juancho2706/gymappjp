'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import {
    EXERCISE_MEDIA_LIMITS,
    EXERCISE_MEDIA_MIME,
    KIND_TO_EXT,
    validateImageDimensions,
    validateImageMagicBytes,
    type ExerciseMediaKind,
} from '@/lib/uploads/image-validation'
import {
    rateLimitExerciseMediaUpload,
    rateLimitExerciseMediaUploadByIp,
} from '@/lib/rate-limit'
import { headers } from 'next/headers'
import { randomUUID } from 'crypto'

const BUCKET = 'exercise-media'
const PUBLIC_URL_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/${BUCKET}/`

export type ExerciseMediaUploadResult =
    | {
        success: true
        url: string
        kind: ExerciseMediaKind
        width: number
        height: number
        bytes: number
    }
    | {
        success?: false
        error: string
        code?: 'UPGRADE_REQUIRED' | 'RATE_LIMIT' | 'QUOTA' | 'INVALID' | 'AUTH' | 'INTERNAL'
    }

/**
 * Sube un GIF/JPEG/PNG/WebP al bucket `exercise-media` bajo el folder del coach.
 * Capas de seguridad:
 *  1. Auth + tier gate.
 *  2. Rate-limit (por coach + por IP).
 *  3. MIME whitelist (sin SVG → bloqueado).
 *  4. Magic-bytes (no se confía en file.type).
 *  5. Size cap (8MB GIF / 2MB resto).
 *  6. Dimensiones via sharp (image-bomb defense).
 *  7. Quota total por coach (50MB).
 *  8. RLS storage (folder = auth.uid()).
 *  9. Filename randomUUID (no path traversal).
 * 10. Audit log.
 */
export async function uploadExerciseMediaAction(
    formData: FormData
): Promise<ExerciseMediaUploadResult> {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) return { error: 'No autenticado.', code: 'AUTH' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, subscription_tier')
        .eq('id', user.id)
        .maybeSingle()
    if (!coach) return { error: 'Coach no encontrado.', code: 'AUTH' }

    const caps = getTierCapabilities((coach.subscription_tier ?? 'free') as SubscriptionTier)
    if (!caps.canCreateCustomExercises) {
        return { error: 'Tu plan no permite subir medios.', code: 'UPGRADE_REQUIRED' }
    }

    // Rate limit dual
    const h = await headers()
    const ip =
        h.get('cf-connecting-ip') ??
        h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown'
    const [coachLimit, ipLimit] = await Promise.all([
        rateLimitExerciseMediaUpload(coach.id),
        rateLimitExerciseMediaUploadByIp(ip),
    ])
    if (!coachLimit.ok) {
        return { error: 'Demasiados uploads recientes. Esperá un momento.', code: 'RATE_LIMIT' }
    }
    if (!ipLimit.ok) {
        return { error: 'Demasiados uploads desde esta red.', code: 'RATE_LIMIT' }
    }

    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
        return { error: 'Seleccioná un archivo.', code: 'INVALID' }
    }
    if (!EXERCISE_MEDIA_MIME.includes(file.type as never)) {
        return { error: 'Tipo no permitido. Usá GIF, JPEG, PNG o WebP.', code: 'INVALID' }
    }

    const magic = await validateImageMagicBytes(file)
    if (!magic.ok) return { error: magic.reason, code: 'INVALID' }

    // GIFs aceptan hasta 8MB pre-compresión (no comprimimos animados)
    const maxBytes =
        magic.kind === 'gif'
            ? EXERCISE_MEDIA_LIMITS.gifPreCompressMaxBytes
            : EXERCISE_MEDIA_LIMITS.maxBytes
    if (file.size > maxBytes) {
        const mb = (maxBytes / 1024 / 1024).toFixed(0)
        return { error: `Máximo ${mb} MB.`, code: 'INVALID' }
    }

    // Validar dimensiones (server-side, defensa anti image-bomb)
    const buffer = Buffer.from(await file.arrayBuffer())
    const dims = await validateImageDimensions(buffer)
    if (!dims.ok) return { error: dims.reason, code: 'INVALID' }

    // Quota total por coach
    const admin = await createRawAdminClient()
    const { data: existingFiles } = await admin.storage
        .from(BUCKET)
        .list(coach.id, { limit: 1000 })
    const usedBytes = (existingFiles ?? []).reduce(
        (sum, f) => sum + (Number(f.metadata?.size) || 0),
        0
    )
    if (usedBytes + file.size > EXERCISE_MEDIA_LIMITS.coachQuotaBytes) {
        return {
            error: `Cuota de 50MB alcanzada. Eliminá medios viejos para liberar espacio.`,
            code: 'QUOTA',
        }
    }

    // Path: {coach_id}/{uuid}.{ext} — folder == auth.uid() (RLS storage)
    const filename = `${randomUUID()}.${KIND_TO_EXT[magic.kind]}`
    const path = `${coach.id}/${filename}`

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: '31536000, immutable',
        upsert: false,
    })
    if (uploadErr) {
        console.error('uploadExerciseMediaAction storage error:', uploadErr)
        return { error: 'Error al subir el archivo.', code: 'INTERNAL' }
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

    // Audit (best-effort, no bloquea el flujo principal)
    try {
        await admin.from('admin_audit_logs').insert({
            action: 'exercise.media.uploaded',
            admin_email: user.email ?? 'unknown',
            target_table: 'exercises',
            target_id: null,
            payload: {
                coach_id: coach.id,
                kind: magic.kind,
                size: file.size,
                width: dims.width,
                height: dims.height,
                path,
            },
        })
    } catch (e) {
        console.warn('audit log insert failed:', e)
    }

    return {
        success: true,
        url: pub.publicUrl,
        kind: magic.kind,
        width: dims.width,
        height: dims.height,
        bytes: file.size,
    }
}

/**
 * Elimina un archivo del bucket exercise-media a partir de su URL pública.
 * Best-effort: si falla, no bloquea al caller (cron de cleanup futuro lo barre).
 * RLS storage garantiza que solo el dueño del folder puede borrar.
 */
export async function deleteExerciseMediaByUrlAction(
    url: string | null | undefined
): Promise<{ success: boolean }> {
    if (!url || !url.startsWith(PUBLIC_URL_PREFIX)) return { success: false }
    const path = url.slice(PUBLIC_URL_PREFIX.length).split('?')[0]
    if (!path || path.includes('..')) return { success: false }
    const supabase = await createClient()
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    if (error) {
        console.warn('deleteExerciseMediaByUrl error:', error)
        return { success: false }
    }
    return { success: true }
}
