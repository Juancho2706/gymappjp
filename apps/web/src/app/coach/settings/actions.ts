'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getPaymentsProvider } from '@/lib/payments/provider'

const brandSchema = z.object({
    full_name: z.string().min(2, 'Nombre requerido').max(100),
    brand_name: z.string().min(2, 'Nombre de marca requerido').max(100),
    slug: z
        .string()
        .min(3, 'El slug debe tener al menos 3 caracteres')
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido'),
    use_brand_colors_coach: z.boolean().default(false),
    welcome_message: z.string().max(240, 'El mensaje debe tener maximo 240 caracteres').optional(),
    loader_text: z.string().max(10, 'Máximo 10 caracteres').optional().or(z.literal('')),
    use_custom_loader: z.boolean().default(false),
    loader_text_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido').optional().or(z.literal('')),
    loader_icon_mode: z.enum(['eva', 'coach', 'none']).default('eva'),
    welcome_modal_enabled: z.boolean().default(false),
    welcome_modal_content: z.string().max(1000, 'Máximo 1000 caracteres').optional().or(z.literal('')),
    welcome_modal_type: z.enum(['text', 'video']).default('text'),
}).superRefine((data, ctx) => {
    if (data.welcome_modal_enabled && data.welcome_modal_type === 'video' && data.welcome_modal_content) {
        const videoUrlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\/.+$/i
        if (!videoUrlPattern.test(data.welcome_modal_content)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Debe ser una URL válida de YouTube o Vimeo',
                path: ['welcome_modal_content'],
            })
        }
    }
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
        use_brand_colors_coach: formData.get('use_brand_colors_coach') === 'on',
        welcome_message: (formData.get('welcome_message') as string | null)?.trim() ?? '',
        loader_text: (formData.get('loader_text') as string | null)?.trim() ?? '',
        use_custom_loader: formData.get('use_custom_loader') === 'on',
        loader_text_color: (formData.get('loader_text_color') as string | null)?.trim() ?? '',
        loader_icon_mode: (formData.get('loader_icon_mode') as string | null) ?? 'eva',
        welcome_modal_enabled: formData.get('welcome_modal_enabled') === 'on',
        welcome_modal_content: (formData.get('welcome_modal_content') as string | null)?.trim() ?? '',
        welcome_modal_type: (formData.get('welcome_modal_type') as string | null) ?? 'text',
    }

    const parsed = brandSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Fetch current coach row for slug change validation
    const { data: currentCoach } = await supabase
        .from('coaches')
        .select('slug, slug_changed_at, previous_slugs, welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version')
        .eq('id', user.id)
        .single()

    // Check slug uniqueness (exclude self)
    if (parsed.data.slug !== currentCoach?.slug) {
        const { data: existing } = await supabase
            .from('coaches')
            .select('id')
            .eq('slug', parsed.data.slug)
            .neq('id', user.id)
            .maybeSingle()

        if (existing) {
            return { fieldErrors: { slug: ['Este slug ya está en uso por otro coach.'] } }
        }

        // Check 30-day restriction (only if slug_changed_at is set)
        const lastChange = currentCoach?.slug_changed_at ? new Date(currentCoach.slug_changed_at) : null
        const now = new Date()
        const daysSinceChange = lastChange ? Math.floor((now.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24)) : null
        if (daysSinceChange !== null && daysSinceChange < 30) {
            const daysRemaining = 30 - daysSinceChange
            return {
                fieldErrors: {
                    slug: [`Solo puedes cambiar tu URL cada 30 días. Faltan ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''}.`]
                }
            }
        }
    }

    const isSlugChanging = parsed.data.slug !== currentCoach?.slug
    const previousSlugs = currentCoach?.previous_slugs ?? []
    if (isSlugChanging && currentCoach?.slug && !previousSlugs.includes(currentCoach.slug)) {
        previousSlugs.push(currentCoach.slug)
        if (previousSlugs.length > 10) previousSlugs.shift()
    }

    // Increment welcome modal version if content or enabled state changed
    let welcomeModalVersion = currentCoach?.welcome_modal_version ?? 0
    const modalChanged =
        parsed.data.welcome_modal_enabled !== (currentCoach?.welcome_modal_enabled ?? false) ||
        parsed.data.welcome_modal_content !== (currentCoach?.welcome_modal_content ?? '') ||
        parsed.data.welcome_modal_type !== (currentCoach?.welcome_modal_type ?? 'text')
    if (modalChanged) {
        welcomeModalVersion += 1
    }

    const admin = await createRawAdminClient()
    const { error } = await admin
        .from('coaches')
        .update({
            full_name: parsed.data.full_name,
            brand_name: parsed.data.brand_name,
            slug: parsed.data.slug,
            primary_color: parsed.data.primary_color,
            use_brand_colors_coach: parsed.data.use_brand_colors_coach,
            welcome_message: parsed.data.welcome_message || null,
            loader_text: parsed.data.loader_text || null,
            use_custom_loader: parsed.data.use_custom_loader,
            loader_text_color: parsed.data.loader_text_color || null,
            loader_icon_mode: parsed.data.loader_icon_mode,
            welcome_modal_enabled: parsed.data.welcome_modal_enabled,
            welcome_modal_content: parsed.data.welcome_modal_content || null,
            welcome_modal_type: parsed.data.welcome_modal_type,
            welcome_modal_version: welcomeModalVersion,
            welcome_modal_updated_at: modalChanged ? new Date().toISOString() : undefined,
            updated_at: new Date().toISOString(),
            ...(isSlugChanging ? { slug_changed_at: new Date().toISOString(), previous_slugs: previousSlugs } : {}),
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

    // Validate magic bytes (JPEG / PNG)
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer.slice(0, 4))
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
    if (!isJpeg && !isPng) {
        return { error: 'El archivo no es una imagen válida (JPEG o PNG).' }
    }

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
    
    // Añadir timestamp para evitar problemas de caché del navegador
    const cacheBusterUrl = `${publicUrl}?t=${Date.now()}`

    const adminDb = await createRawAdminClient()
    const { error: dbError } = await adminDb
        .from('coaches')
        .update({ logo_url: cacheBusterUrl })
        .eq('id', user.id)

    if (dbError) return { error: dbError.message }

    revalidatePath('/coach/settings', 'page')
    revalidatePath('/coach/dashboard', 'layout')
    revalidatePath('/', 'layout')
    return { success: true }
}

// ── Delete Account (Ley 21.719 — right to erasure) ───────────────────────────

export type DeleteAccountResult = { success: true } | { error: string }

export async function deleteCoachAccountAction(
    confirmText: string
): Promise<DeleteAccountResult> {
    if (confirmText !== 'ELIMINAR') {
        return { error: 'Confirmación incorrecta.' }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const coachId = user.id
    const adminDb = createServiceRoleClient()

    // 1. Get coach data needed for cleanup (subscription ID, storage)
    const { data: coach } = await adminDb
        .from('coaches')
        .select('subscription_mp_id, subscription_status, subscription_tier')
        .eq('id', coachId)
        .maybeSingle()

    // 2. Cancel MP subscription (best-effort — non-fatal)
    const mpId = coach?.subscription_mp_id?.trim()
    if (mpId && coach?.subscription_status === 'active' && coach?.subscription_tier !== 'free') {
        try {
            const provider = getPaymentsProvider()
            await provider.cancelCheckoutAtProvider(mpId)
        } catch {
            console.warn('[deleteAccount] could not cancel MP preapproval', { coachId, mpId })
        }
    }

    // 3. Anonymize client PII (preserve workout structure as coach IP, just erase identifiers)
    const { data: coachClients } = await adminDb
        .from('clients')
        .select('id')
        .eq('coach_id', coachId)
    const clientIds = (coachClients ?? []).map((c) => c.id)

    await adminDb
        .from('clients')
        .update({
            full_name: '[Eliminado]',
            email: `eliminado-${coachId}@anonymized.eva`,
            phone: null,
        })
        .eq('coach_id', coachId)

    // 4. Delete health data logs (sensitive data — must be erased)
    if (clientIds.length > 0) {
        await adminDb.from('workout_logs').delete().in('client_id', clientIds)
    }
    if (clientIds.length > 0) {
        const { data: dailyLogs } = await adminDb
            .from('daily_nutrition_logs')
            .select('id')
            .in('client_id', clientIds)
        const dailyLogIds = (dailyLogs ?? []).map((l) => l.id)
        if (dailyLogIds.length > 0) {
            await adminDb.from('nutrition_meal_logs').delete().in('daily_log_id', dailyLogIds)
        }
        await adminDb.from('check_ins').delete().in('client_id', clientIds)
    }

    // 5. Delete logo from storage (best-effort)
    try {
        await supabase.storage.from('logos').remove([`${coachId}/logo.jpg`, `${coachId}/logo.png`])
    } catch {
        // Non-fatal
    }

    // 6. Delete auth user — CASCADE will delete coaches row via FK
    const { error: authError } = await adminDb.auth.admin.deleteUser(coachId)
    if (authError) {
        console.error('[deleteAccount] failed to delete auth user:', authError)
        return { error: 'Error al eliminar la cuenta. Contacta soporte en privacidad@eva-app.cl' }
    }

    redirect('/login?deleted=true')
}
