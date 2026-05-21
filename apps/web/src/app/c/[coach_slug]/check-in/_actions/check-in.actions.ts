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
): Promise<{ ok: true; publicUrl: string } | { ok: false; message: string }> {
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

    const {
        data: { publicUrl },
    } = adminDb.storage.from('checkins').getPublicUrl(uploadData.path)
    return { ok: true, publicUrl }
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

    let photoUrl: string | null = null
    let backPhotoUrl: string | null = null

    const frontFile = parsed.data.photo as File | null | undefined
    if (frontFile && frontFile.size > 0) {
        const up = await uploadToCheckinsBucket(adminDb, user.id, frontFile, 'front')
        if (!up.ok) return { error: up.message }
        photoUrl = up.publicUrl
    }

    const backFile = parsed.data.back_photo as File | null | undefined
    if (backFile && backFile.size > 0) {
        const up = await uploadToCheckinsBucket(adminDb, user.id, backFile, 'back')
        if (!up.ok) return { error: up.message }
        backPhotoUrl = up.publicUrl
    }

    const { error: insertError } = await adminDb.from('check_ins').insert({
        client_id: user.id,
        weight: parsed.data.weight,
        energy_level: parsed.data.energy_level,
        notes: parsed.data.notes || null,
        front_photo_url: photoUrl,
        back_photo_url: backPhotoUrl,
    })

    if (insertError) {
        return { error: 'Error al guardar el reporte: ' + insertError.message }
    }

    revalidatePath('/c', 'layout')
    revalidatePath(`/coach/clients/${user.id}`)

    return { success: true }
}
