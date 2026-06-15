'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import {
    EXERCISE_MEDIA_LIMITS,
    EXERCISE_MEDIA_MIME,
    validateImageMagicBytes,
    type ExerciseMediaKind,
} from '@/lib/uploads/image-validation'
import { validateImageDimensions } from '@/lib/uploads/image-validation.server'
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

// ─── Signed-URL upload (bypasses Vercel 4.5MB payload limit) ─────────────────

export type GetSignedUploadUrlResult =
    | { success: true; signedUrl: string; path: string; publicUrl: string }
    | { success?: false; error: string; code?: 'UPGRADE_REQUIRED' | 'RATE_LIMIT' | 'QUOTA' | 'INVALID' | 'AUTH' | 'INTERNAL' }

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}

/**
 * Step 1: validate auth/tier/rate-limit/quota/size, generate signed upload URL.
 * Client uploads directly to Supabase (bypasses Vercel 4.5MB limit).
 */
export async function getSignedUploadUrlAction(params: {
    contentType: string
    size: number
}): Promise<GetSignedUploadUrlResult> {
    const { contentType, size } = params

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

    if (!EXERCISE_MEDIA_MIME.includes(contentType as never)) {
        return { error: 'Tipo no permitido. Usá GIF, JPEG, PNG o WebP.', code: 'INVALID' }
    }

    const isGif = contentType === 'image/gif'
    const maxBytes = isGif ? EXERCISE_MEDIA_LIMITS.gifPreCompressMaxBytes : EXERCISE_MEDIA_LIMITS.maxBytes
    if (size > maxBytes) {
        const mb = (maxBytes / 1024 / 1024).toFixed(0)
        return { error: `Máximo ${mb} MB.`, code: 'INVALID' }
    }

    const h = await headers()
    const ip =
        h.get('cf-connecting-ip') ??
        h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown'
    const [coachLimit, ipLimit] = await Promise.all([
        rateLimitExerciseMediaUpload(coach.id),
        rateLimitExerciseMediaUploadByIp(ip),
    ])
    if (!coachLimit.ok) return { error: 'Demasiados uploads. Esperá un momento.', code: 'RATE_LIMIT' }
    if (!ipLimit.ok) return { error: 'Demasiados uploads desde esta red.', code: 'RATE_LIMIT' }

    const { data: existingFiles } = await supabase.storage.from(BUCKET).list(coach.id, { limit: 1000 })
    const usedBytes = (existingFiles ?? []).reduce(
        (sum, f) => sum + (Number(f.metadata?.size) || 0),
        0
    )
    if (usedBytes + size > EXERCISE_MEDIA_LIMITS.coachQuotaBytes) {
        return { error: 'Cuota de 50MB alcanzada. Eliminá medios viejos.', code: 'QUOTA' }
    }

    const ext = CONTENT_TYPE_TO_EXT[contentType] ?? 'bin'
    const path = `${coach.id}/${randomUUID()}.${ext}`

    const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(path)
    if (signErr || !signed) {
        console.error('createSignedUploadUrl error:', signErr)
        return { error: 'No se pudo generar la URL de subida.', code: 'INTERNAL' }
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return { success: true, signedUrl: signed.signedUrl, path, publicUrl: pub.publicUrl }
}

export type ConfirmUploadResult =
    | { success: true; width: number; height: number }
    | { success?: false; error: string }

/**
 * Step 2: validate the uploaded file (magic-bytes + dimensions via sharp).
 * Deletes from bucket if validation fails.
 */
export async function confirmExerciseMediaUploadAction(
    path: string
): Promise<ConfirmUploadResult> {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) return { error: 'No autenticado.' }

    // Path ownership check (path traversal defense)
    if (!path.startsWith(`${user.id}/`) || path.includes('..')) {
        return { error: 'Ruta inválida.' }
    }

    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path)
    if (dlErr || !blob) return { error: 'Archivo no encontrado en storage.' }

    const magic = await validateImageMagicBytes(blob)
    if (!magic.ok) {
        await supabase.storage.from(BUCKET).remove([path])
        return { error: magic.reason }
    }

    const buffer = Buffer.from(await blob.arrayBuffer())
    const dims = await validateImageDimensions(buffer)
    if (!dims.ok) {
        await supabase.storage.from(BUCKET).remove([path])
        return { error: dims.reason }
    }

    // Audit (best-effort) — admin_audit_logs solo acepta INSERT de service_role
    try {
        const admin = createServiceRoleClient()
        await admin.from('admin_audit_logs').insert({
            action: 'exercise.media.uploaded',
            admin_email: user.email ?? 'unknown',
            target_table: 'exercises',
            target_id: null,
            payload: { coach_id: user.id, kind: magic.kind, size: blob.size, width: dims.width, height: dims.height, path },
        })
    } catch { /* best-effort */ }

    return { success: true, width: dims.width, height: dims.height }
}

/**
 * Deletes a file from exercise-media bucket by its public URL.
 * Best-effort: caller should not block on failure.
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
