'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { revalidatePath } from 'next/cache'
import { CheckInSchema } from '@eva/schemas'

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
    const extension = file.name.split('.').pop()
    const rand = Math.random().toString(36).substring(7)
    const filePath =
        variant === 'back'
            ? `${userId}/${timestamp}-back-${rand}.${extension}`
            : `${userId}/${timestamp}-${rand}.${extension}`

    const { error: uploadError, data: uploadData } = await adminDb.storage
        .from('checkins')
        .upload(filePath, file, { cacheControl: '3600', upsert: false })

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

    const frontFile = parsed.data.photo as File | null | undefined
    if (frontFile && frontFile.size > 0) {
        const up = await uploadToCheckinsBucket(adminDb, user.id, frontFile, 'front')
        if (!up.ok) return { error: up.message }
        photoPath = up.path
    }

    const backFile = parsed.data.back_photo as File | null | undefined
    if (backFile && backFile.size > 0) {
        const up = await uploadToCheckinsBucket(adminDb, user.id, backFile, 'back')
        if (!up.ok) return { error: up.message }
        backPhotoPath = up.path
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
