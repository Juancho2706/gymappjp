'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

const checkinSchema = z.object({
    weight: z.coerce.number().min(20).max(400),
    energy_level: z.coerce.number().min(1).max(10),
    notes: z.string().max(1000).optional(),
    photo: z
        .any()
        .refine(
            (file) => !file || file.size === 0 || file.size <= MAX_FILE_SIZE,
            `El tamaño máximo de imagen es 5MB.`
        )
        .refine(
            (file) => !file || file.size === 0 || ACCEPTED_IMAGE_TYPES.includes(file.type),
            'Solo se aceptan formatos .jpg, .jpeg, .png y .webp.'
        )
        .optional(),
})

export type CheckinState = {
    error?: string
    success?: boolean
}

export async function submitCheckinAction(
    _prev: CheckinState,
    formData: FormData
): Promise<CheckinState> {
    const raw = {
        weight: formData.get('weight'),
        energy_level: formData.get('energy_level'),
        notes: formData.get('notes'),
        photo: formData.get('photo'),
    }

    const parsed = checkinSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    let photoUrl = null

    // Hande optional image upload
    const file = parsed.data.photo as File | null | undefined
    if (file && file.size > 0) {
        // use rawAdminClient to bypass RLS strict inference if needed, but it's simpler to use it directly
        const adminDb = await createRawAdminClient()

        const timestamp = Date.now()
        const extension = file.name.split('.').pop()
        const filePath = `${user.id}/${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`

        const { error: uploadError, data: uploadData } = await adminDb.storage
            .from('checkins')
            .upload(filePath, file, { cacheControl: '3600', upsert: false })

        if (uploadError) {
            console.error('[CheckinAction] Error uploading photo:', uploadError)
            return { error: 'Error al subir la imagen de progreso.' }
        }

        const { data: { publicUrl } } = adminDb.storage
            .from('checkins')
            .getPublicUrl(uploadData.path)

        photoUrl = publicUrl
    }

    const adminDb = await createRawAdminClient()
    const { error: insertError } = await adminDb.from('check_ins').insert({
        client_id: user.id,
        weight: parsed.data.weight,
        energy_level: parsed.data.energy_level,
        notes: parsed.data.notes || null,
        front_photo_url: photoUrl,
    })

    if (insertError) {
        return { error: 'Error al guardar el reporte: ' + insertError.message }
    }

    revalidatePath('/c', 'layout')
    revalidatePath('/coach/clients/[clientId]', 'page')

    return { success: true }
}
