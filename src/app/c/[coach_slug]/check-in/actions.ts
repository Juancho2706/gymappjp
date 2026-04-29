'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

const fileField = z
    .any()
    .refine(
        (file) => !file || file.size === 0 || file.size <= MAX_FILE_SIZE,
        `El tamaño máximo de imagen es 5MB.`
    )
    .refine(
        (file) => !file || file.size === 0 || ACCEPTED_IMAGE_TYPES.includes(file.type),
        'Solo se aceptan formatos .jpg, .jpeg, .png y .webp.'
    )
    .optional()

const checkinSchema = z.object({
    weight: z.coerce.number().min(20).max(400),
    energy_level: z.coerce.number().min(1).max(10),
    notes: z.string().max(1000).optional(),
    photo: fileField,
    back_photo: fileField,
})

export type CheckinState = {
    error?: string
    success?: boolean
}

async function uploadToCheckinsBucket(
    adminDb: Awaited<ReturnType<typeof createRawAdminClient>>,
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
        console.error('[CheckinAction] Error uploading:', uploadError)
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

    const parsed = checkinSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()

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
