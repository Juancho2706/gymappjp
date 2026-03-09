'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const brandSchema = z.object({
    full_name: z.string().min(2, 'Nombre requerido').max(100),
    brand_name: z.string().min(2, 'Nombre de marca requerido').max(100),
    slug: z
        .string()
        .min(3, 'El slug debe tener al menos 3 caracteres')
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido'),
})

export type BrandSettingsState = {
    error?: string
    success?: boolean
    fieldErrors?: Record<string, string[]>
}

export async function updateBrandSettingsAction(
    _prev: BrandSettingsState,
    formData: FormData
): Promise<BrandSettingsState> {
    const raw = {
        full_name: formData.get('full_name') as string,
        brand_name: formData.get('brand_name') as string,
        slug: formData.get('slug') as string,
        primary_color: formData.get('primary_color') as string,
    }

    const parsed = brandSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Check slug uniqueness (exclude self)
    const { data: existing } = await supabase
        .from('coaches')
        .select('id')
        .eq('slug', parsed.data.slug)
        .neq('id', user.id)
        .maybeSingle()

    if (existing) {
        return { fieldErrors: { slug: ['Este slug ya está en uso por otro coach.'] } }
    }

    const admin = await createRawAdminClient()
    const { error } = await admin
        .from('coaches')
        .update({
            full_name: parsed.data.full_name,
            brand_name: parsed.data.brand_name,
            slug: parsed.data.slug,
            primary_color: parsed.data.primary_color,
        })
        .eq('id', user.id)

    if (error) return { error: error.message }

    revalidatePath('/coach/settings')
    return { success: true }
}

export async function updateLogoAction(
    _prev: BrandSettingsState,
    formData: FormData
): Promise<BrandSettingsState> {
    const file = formData.get('logo') as File | null
    if (!file || file.size === 0) return { error: 'Selecciona un archivo.' }
    if (file.size > 2 * 1024 * 1024) return { error: 'El logo no puede superar 2 MB.' }
    if (!file.type.startsWith('image/')) return { error: 'Solo se permiten imágenes.' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${user.id}/logo.${ext}`

    const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
        console.error('Logo upload error:', uploadError)
        return { error: 'Error al subir el logo: ' + uploadError.message }
    }

    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)

    const adminDb = await createRawAdminClient()
    const { error: dbError } = await adminDb
        .from('coaches')
        .update({ logo_url: publicUrl })
        .eq('id', user.id)

    if (dbError) return { error: dbError.message }

    revalidatePath('/coach/settings')
    revalidatePath('/coach/dashboard')
    return { success: true }
}
