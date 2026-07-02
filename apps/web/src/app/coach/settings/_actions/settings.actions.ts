'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { BrandSettingsSchema } from '@eva/schemas'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { isThemePresetKey } from '@/lib/brand-presets'
import { isLoginLayoutKey, parseLoaderConfig } from '@/lib/brand-composer'

/**
 * white-label W1b — validación de las 3 columnas nuevas (aditivas):
 * - theme_preset_key : '' (→ NULL, legacy) o una key del catálogo curado.
 * - login_layout_key : '' (→ NULL, 'clasico') o una de las 4 variantes.
 * - loader_config    : jsonb del compositor; se parsea aparte (shape estricto, fail-closed).
 */
const WhitelabelW1bSchema = z.object({
    theme_preset_key: z
        .string()
        .refine((v) => v === '' || isThemePresetKey(v), 'Tema inválido'),
    login_layout_key: z
        .string()
        .refine((v) => v === '' || isLoginLayoutKey(v), 'Diseño de login inválido'),
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
        primary_color: formData.get('primary_color') as string,
        use_brand_colors_coach: formData.get('use_brand_colors_coach') === 'on',
        welcome_message: (formData.get('welcome_message') as string | null)?.trim() ?? '',
        loader_text: (formData.get('loader_text') as string | null)?.trim() ?? '',
        use_custom_loader: formData.get('use_custom_loader') === 'on',
        loader_text_color: (formData.get('loader_text_color') as string | null)?.trim() ?? '',
        loader_icon_mode: (formData.get('loader_icon_mode') as string | null) ?? 'eva',
        // white-label v2 (gateados a Pro+ más abajo)
        brand_secondary_color: (formData.get('brand_secondary_color') as string | null)?.trim() ?? '',
        accent_light: (formData.get('accent_light') as string | null)?.trim() ?? '',
        accent_dark: (formData.get('accent_dark') as string | null)?.trim() ?? '',
        neutral_tint: formData.get('neutral_tint') === 'on',
        brand_font_key: (formData.get('brand_font_key') as string | null)?.trim() ?? '',
        loader_variant: (formData.get('loader_variant') as string | null) ?? 'eva',
        welcome_modal_enabled: formData.get('welcome_modal_enabled') === 'on',
        welcome_modal_content: (formData.get('welcome_modal_content') as string | null)?.trim() ?? '',
        welcome_modal_type: (formData.get('welcome_modal_type') as string | null) ?? 'text',
    }

    const parsed = BrandSettingsSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    // white-label W1b — tema / layout de login / loader compuesto (validados aparte del schema compartido).
    const wl3 = WhitelabelW1bSchema.safeParse({
        theme_preset_key: (formData.get('theme_preset_key') as string | null)?.trim() ?? '',
        login_layout_key: (formData.get('login_layout_key') as string | null)?.trim() ?? '',
    })
    if (!wl3.success) {
        return { fieldErrors: wl3.error.flatten().fieldErrors }
    }
    // loader_config: shape estricto vía parseLoaderConfig → objeto limpio o null (fail-closed, no bloquea).
    const loaderConfigParsed = parseLoaderConfig((formData.get('loader_config') as string | null) ?? '')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // slug + invite_code son INMUTABLES (set-once en el registro). No se editan acá.
    // Fetch current coach row: versionado del welcome-modal + tier (gate de branding).
    const { data: currentCoach } = await supabase
        .from('coaches')
        .select('welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version, subscription_tier')
        .eq('id', user.id)
        .single()

    // Increment welcome modal version if content or enabled state changed
    let welcomeModalVersion = currentCoach?.welcome_modal_version ?? 0
    const modalChanged =
        parsed.data.welcome_modal_enabled !== (currentCoach?.welcome_modal_enabled ?? false) ||
        parsed.data.welcome_modal_content !== (currentCoach?.welcome_modal_content ?? '') ||
        parsed.data.welcome_modal_type !== (currentCoach?.welcome_modal_type ?? 'text')
    if (modalChanged) {
        welcomeModalVersion += 1
    }

    // ── Gate de branding (decisión CEO 2026-06-21, white-label v2) ────────────────
    // Branding VISUAL (color + loader) = Pro+ ENTERO. El page redirige y el render del alumno
    // cae a EVA, pero el action es POSTeable directo → este es el enforcement server-side real.
    // Identidad (full_name/brand_name) y comunicación (welcome_*) NO se gatean: el alumno ve el
    // nombre del coach y su mensaje aunque el chrome sea EVA.
    const tier = (currentCoach?.subscription_tier ?? 'free') as SubscriptionTier
    const brandingAllowed = isBrandingAllowed(tier)

    // UPDATE self: coaches_update_own lo cubre → user-scoped (R3, auditoria 2026-06-11).
    const updatePayload: Record<string, unknown> = {
        full_name: parsed.data.full_name,
        brand_name: parsed.data.brand_name,
        welcome_message: parsed.data.welcome_message || null,
        welcome_modal_enabled: parsed.data.welcome_modal_enabled,
        welcome_modal_content: parsed.data.welcome_modal_content || null,
        welcome_modal_type: parsed.data.welcome_modal_type,
        welcome_modal_version: welcomeModalVersion,
        welcome_modal_updated_at: modalChanged ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
    }
    if (brandingAllowed) {
        updatePayload.primary_color = parsed.data.primary_color
        updatePayload.use_brand_colors_coach = parsed.data.use_brand_colors_coach
        updatePayload.loader_text = parsed.data.loader_text || null
        updatePayload.use_custom_loader = parsed.data.use_custom_loader
        updatePayload.loader_text_color = parsed.data.loader_text_color || null
        updatePayload.loader_icon_mode = parsed.data.loader_icon_mode
        // white-label v2 (mismo gate Pro+). logo_url_dark se sube aparte (updateLogoDarkAction, W2 UI).
        updatePayload.brand_secondary_color = parsed.data.brand_secondary_color || null
        updatePayload.accent_light = parsed.data.accent_light || null
        updatePayload.accent_dark = parsed.data.accent_dark || null
        updatePayload.neutral_tint = parsed.data.neutral_tint
        updatePayload.brand_font_key = parsed.data.brand_font_key || null
        updatePayload.loader_variant = parsed.data.loader_variant
        // white-label W1b — mismo gate Pro+. NULL = comportamiento legacy (grandfather intocable):
        // el tema NO materializa el color custom del coach (Opción A del informe §3, reversible).
        updatePayload.theme_preset_key = wl3.data.theme_preset_key || null
        updatePayload.login_layout_key = wl3.data.login_layout_key || null
        updatePayload.loader_config = loaderConfigParsed // objeto jsonb limpio o null
    }

    const { error } = await supabase
        .from('coaches')
        .update(updatePayload)
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

    // Gate de branding (Pro+ ENTERO, decisión CEO 2026-06-21): un coach < Pro no sube logo
    // (su app cae a EVA). Enforcement server-side — el botón se oculta en UI pero el action es POSTeable.
    const { data: logoCoach } = await supabase
        .from('coaches')
        .select('subscription_tier')
        .eq('id', user.id)
        .single()
    if (!isBrandingAllowed((logoCoach?.subscription_tier ?? 'free') as SubscriptionTier)) {
        return { error: 'El branding personalizado está disponible desde el plan Pro.' }
    }

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

    const { error: dbError } = await supabase
        .from('coaches')
        .update({ logo_url: cacheBusterUrl })
        .eq('id', user.id)

    if (dbError) return { error: dbError.message }

    revalidatePath('/coach/settings', 'page')
    revalidatePath('/coach/dashboard', 'layout')
    revalidatePath('/', 'layout')
    return { success: true }
}

// ── Logo modo oscuro (H4, white-label v2) ────────────────────────────────────
// Espejo EXACTO de updateLogoAction: mismo bucket ('logos'), mismas validaciones (≤2 MB +
// magic bytes JPEG/PNG), mismo gate Pro+. Solo cambia el path (logo-dark) y la columna
// (logo_url_dark, que la app del alumno YA consume). El alumno usa este logo en modo oscuro.
export async function updateLogoDarkAction(
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

    // Gate de branding (Pro+ ENTERO): un coach < Pro no sube logo (su app cae a EVA).
    // Enforcement server-side — el control se oculta en UI pero el action es POSTeable.
    const { data: logoCoach } = await supabase
        .from('coaches')
        .select('subscription_tier')
        .eq('id', user.id)
        .single()
    if (!isBrandingAllowed((logoCoach?.subscription_tier ?? 'free') as SubscriptionTier)) {
        return { error: 'El branding personalizado está disponible desde el plan Pro.' }
    }

    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${user.id}/logo-dark.${ext}`

    const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
        console.error('Logo (dark) upload error:', uploadError)
        return { error: 'Error al subir el logo: ' + uploadError.message }
    }

    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)

    // Añadir timestamp para evitar problemas de caché del navegador
    const cacheBusterUrl = `${publicUrl}?t=${Date.now()}`

    const { error: dbError } = await supabase
        .from('coaches')
        .update({ logo_url_dark: cacheBusterUrl })
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
