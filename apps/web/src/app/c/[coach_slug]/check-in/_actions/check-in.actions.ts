'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { revalidatePath } from 'next/cache'
import { CheckInSchema } from '@eva/schemas'
import { compressImageToWebp } from '@/lib/storage/image-compress'

export type CheckinState = {
    error?: string
    success?: boolean
}

async function uploadToCheckinsBucket(
    adminDb: ReturnType<typeof createServiceRoleClient>,
    userId: string,
    file: File,
    variant: 'front' | 'back'
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
    const timestamp = Date.now()
    const rand = Math.random().toString(36).substring(7)

    // Compresión best-effort a WebP 1080px. Si falla (HEIC/corrupto/OOM) -> sube el original,
    // NUNCA aborta el check-in (UX one-shot del alumno). Las filas viejas (.jpg/.png) no se tocan.
    const compressed = await compressImageToWebp(file)
    const extension = compressed ? compressed.ext : (file.name.split('.').pop() || 'jpg')
    const body: Buffer | File = compressed ? compressed.buffer : file
    const filePath =
        variant === 'back'
            ? `${userId}/${timestamp}-back-${rand}.${extension}`
            : `${userId}/${timestamp}-${rand}.${extension}`

    const { error: uploadError, data: uploadData } = await adminDb.storage
        .from('checkins')
        .upload(filePath, body, {
            cacheControl: '3600',
            upsert: false, // fotos únicas por alumno+timestamp; jamás pisar
            // contentType OBLIGATORIO con Buffer (sin él se guarda como application/json y rompe el render)
            ...(compressed ? { contentType: compressed.contentType } : {}),
        })

    if (uploadError) {
        return { ok: false, message: 'Error al subir la imagen de progreso.' }
    }

    // P2: store the PATH, not the public URL. Display layers resolve a signed URL via
    // resolveCheckinPhotoUrls() so the bucket can be flipped private without breaking images.
    return { ok: true, path: uploadData.path }
}

export async function submitCheckinAction(
    _prev: CheckinState,
    formData: FormData
): Promise<CheckinState> {
    const raw = {
        weight: String(formData.get('weight') ?? '').replace(',', '.'),
        energy_level: formData.get('energy_level'),
        notes: formData.get('notes'),
        photo: formData.get('photo'),
        back_photo: formData.get('back_photo'),
    }

    const parsed = CheckInSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = createServiceRoleClient()

    let photoPath: string | null = null
    let backPhotoPath: string | null = null

    // BEST-EFFORT (🛡️ misma filosofía que compressImageToWebp): si una foto NO se puede subir
    // (tipo no soportado tras fallback, red), el check-in se guarda IGUAL sin esa foto — perder
    // todo el reporte del alumno (one-shot) es peor que perder una foto. Se loguea para observar.
    const frontFile = parsed.data.photo as File | null | undefined
    if (frontFile && frontFile.size > 0) {
        const up = await uploadToCheckinsBucket(adminDb, user.id, frontFile, 'front')
        if (up.ok) photoPath = up.path
        else console.warn('[checkin] front photo upload fallo, guardando check-in sin ella:', up.message)
    }

    const backFile = parsed.data.back_photo as File | null | undefined
    if (backFile && backFile.size > 0) {
        const up = await uploadToCheckinsBucket(adminDb, user.id, backFile, 'back')
        if (up.ok) backPhotoPath = up.path
        else console.warn('[checkin] back photo upload fallo, guardando check-in sin ella:', up.message)
    }

    const { error: insertError } = await adminDb.from('check_ins').insert({
        client_id: user.id,
        weight: parsed.data.weight,
        energy_level: parsed.data.energy_level,
        notes: parsed.data.notes || null,
        front_photo_url: photoPath,
        back_photo_url: backPhotoPath,
    })

    if (insertError) {
        return { error: 'Error al guardar el reporte: ' + insertError.message }
    }

    revalidatePath('/c', 'layout')
    revalidatePath(`/coach/clients/${user.id}`)

    return { success: true }
}
