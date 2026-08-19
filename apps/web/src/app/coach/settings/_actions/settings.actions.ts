'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { BrandSettingsSchema } from '@eva/schemas'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { getPaymentsProviderForCoach } from '@/lib/payments/provider'
import { isThemePresetKey } from '@/lib/brand-presets'
import { isLoginLayoutKey, parseLoaderConfig } from '@/lib/brand-composer'
import { deleteClientHard } from '@/services/client/client-deletion.service'

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
        // Share Entreno — el input manda el handle SIN arroba (el `@` es prefijo visual); el schema
        // igual recorta la que venga pegada y deja '' → null.
        instagram_handle: (formData.get('instagram_handle') as string | null)?.trim() ?? '',
        primary_color: formData.get('primary_color') as string,
        use_brand_colors_coach: formData.get('use_brand_colors_coach') === 'on',
        welcome_message: (formData.get('welcome_message') as string | null)?.trim() ?? '',
        loader_text: (formData.get('loader_text') as string | null)?.trim() ?? '',
        use_custom_loader: formData.get('use_custom_loader') === 'on',
        // W-brand B2/B4 (dueño 2026-08-17): loader_text_color, brand_secondary_color, accent_light
        // y accent_dark salieron de la whitelist de escritura standalone. Cualquier valor posteado
        // (form viejo/cacheado, POST directo) se DESCARTA en silencio — ni error ni persistencia:
        // se fijan a '' ANTES del schema para que un hex basura tampoco bloquee el guardado.
        // Las columnas quedan en DB (grandfather pasivo, cero DDL) pero dejan de leerse: el par
        // sale de sealPair(primario)/preset y el texto del loader se pinta derivado del primario.
        loader_text_color: '',
        loader_icon_mode: (formData.get('loader_icon_mode') as string | null) ?? 'eva',
        // white-label v2 (gateados a Pro+ más abajo)
        brand_secondary_color: '',
        accent_light: '',
        accent_dark: '',
        neutral_tint: formData.get('neutral_tint') === 'on',
        brand_font_key: (formData.get('brand_font_key') as string | null)?.trim() ?? '',
        loader_variant: (formData.get('loader_variant') as string | null) ?? 'eva',
        welcome_modal_enabled: formData.get('welcome_modal_enabled') === 'on',
        welcome_modal_content: (formData.get('welcome_modal_content') as string | null)?.trim() ?? '',
        welcome_modal_type: (formData.get('welcome_modal_type') as string | null) ?? 'text',
        // Ejecutor V3 (E0.7) — tema del ejecutor del alumno (coach|eva). Preferencia, no branding gateado.
        executor_theme: (formData.get('executor_theme') as string | null) ?? 'coach',
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
        // Share Entreno — el handle de Instagram es IDENTIDAD (va en las tarjetas que comparten
        // los alumnos), no personalización visual: se persiste SIEMPRE, fuera del gate Pro+.
        instagram_handle: parsed.data.instagram_handle ?? null,
        welcome_message: parsed.data.welcome_message || null,
        welcome_modal_enabled: parsed.data.welcome_modal_enabled,
        welcome_modal_content: parsed.data.welcome_modal_content || null,
        welcome_modal_type: parsed.data.welcome_modal_type,
        welcome_modal_version: welcomeModalVersion,
        welcome_modal_updated_at: modalChanged ? new Date().toISOString() : undefined,
        // Ejecutor V3 (E0.7) — preferencia (no branding visual): se persiste SIEMPRE, igual que
        // identidad/comunicación (fuera del gate Pro+). La columna trae GRANT UPDATE authenticated.
        executor_theme: parsed.data.executor_theme,
        updated_at: new Date().toISOString(),
    }
    if (brandingAllowed) {
        updatePayload.primary_color = parsed.data.primary_color
        updatePayload.use_brand_colors_coach = parsed.data.use_brand_colors_coach
        updatePayload.loader_text = parsed.data.loader_text || null
        updatePayload.use_custom_loader = parsed.data.use_custom_loader
        // W-brand B2/B4: whitelist EXPLÍCITA — brand_secondary_color / accent_light / accent_dark /
        // loader_text_color NO se escriben desde standalone (los valores posteados se descartaron
        // arriba). Los valores almacenados quedan intactos en DB, inertes por contrato.
        updatePayload.loader_icon_mode = parsed.data.loader_icon_mode
        // white-label v2 (mismo gate Pro+). logo_url_dark se sube aparte (updateLogoDarkAction, W2 UI).
        updatePayload.neutral_tint = parsed.data.neutral_tint
        updatePayload.brand_font_key = parsed.data.brand_font_key || null
        updatePayload.loader_variant = parsed.data.loader_variant
        // white-label W1b — mismo gate Pro+. NULL = comportamiento legacy (grandfather intocable):
        // el tema NO materializa el color custom del coach (Opción A del informe §3, reversible).
        updatePayload.theme_preset_key = wl3.data.theme_preset_key || null
        updatePayload.login_layout_key = wl3.data.login_layout_key || null
        updatePayload.loader_config = loaderConfigParsed // objeto jsonb limpio o null

        // Logos subidos DIRECTO a Storage (bypass Cloudflare WAF, incidente 2026-07-05): el cliente
        // sube el archivo con createLogoUploadUrlAction y manda de vuelta el PATH resultante. Acá
        // materializamos la URL pública server-side (sin confiar en una URL del cliente) con el
        // cache-buster ?t= que esperan todos los consumers. Ownership: el path debe vivir en la
        // carpeta del propio coach.
        const lightPath = (formData.get('logo_light_path') as string | null)?.trim()
        const darkPath = (formData.get('logo_dark_path') as string | null)?.trim()
        const ownsLogoPath = (p: string) => p.startsWith(`${user.id}/`) && !p.includes('..')
        if (lightPath && ownsLogoPath(lightPath)) {
            const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(lightPath)
            updatePayload.logo_url = `${publicUrl}?t=${Date.now()}`
        }
        if (darkPath && ownsLogoPath(darkPath)) {
            const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(darkPath)
            updatePayload.logo_url_dark = `${publicUrl}?t=${Date.now()}`
        }
    }

    const { error } = await supabase
        .from('coaches')
        .update(updatePayload)
        .eq('id', user.id)

    if (error) return { error: error.message }

    revalidatePath('/coach/settings')
    return { success: true }
}

// ── Logo: signed upload URL (subida DIRECTA a Storage, bypass Cloudflare WAF) ────────────────
// Reemplaza el POST multipart de updateLogoAction, que el WAF managed de Cloudflare bloqueaba con
// 403 (incidente 2026-07-05: "Guardando…" infinito). El coach comprime el logo a 512×512 PNG en el
// navegador y hace PUT directo a supabase.co con esta URL firmada. Path FIJO por slot (upsert) → un
// solo objeto por coach, sin acumular archivos (cero crecimiento de Storage). La URL pública la
// materializa updateBrandSettingsAction con el path que devuelve esta acción.
const LOGO_BUCKET = 'logos'
const LOGO_CONTENT_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export type LogoUploadUrlResult =
    | { success: true; signedUrl: string; path: string }
    | { success?: false; error: string }

export async function createLogoUploadUrlAction(params: {
    variant: 'light' | 'dark'
    contentType: string
    size: number
}): Promise<LogoUploadUrlResult> {
    const ext = LOGO_CONTENT_TYPES[params.contentType]
    if (!ext) return { error: 'Formato no permitido. Usa PNG, JPG o WebP.' }
    if (params.size > 2 * 1024 * 1024) return { error: 'El logo no puede superar 2 MB.' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Gate Pro+ (mismo que updateLogoAction): un coach < Pro no sube logo (su app cae a EVA).
    const { data: coach } = await supabase
        .from('coaches')
        .select('subscription_tier')
        .eq('id', user.id)
        .single()
    if (!isBrandingAllowed((coach?.subscription_tier ?? 'free') as SubscriptionTier)) {
        return { error: 'El branding personalizado está disponible desde el plan Pro.' }
    }

    // Path fijo bajo la carpeta del coach → satisface la RLS logos_owner_insert/_update.
    const path = `${user.id}/${params.variant === 'dark' ? 'logo-dark' : 'logo'}.${ext}`
    const { data: signed, error } = await supabase.storage
        .from(LOGO_BUCKET)
        .createSignedUploadUrl(path, { upsert: true })
    if (error || !signed) {
        console.error('createSignedUploadUrl (logo) error:', error)
        return { error: 'No se pudo preparar la subida del logo. Intenta de nuevo.' }
    }
    return { success: true, signedUrl: signed.signedUrl, path }
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
// El borrado del coach arrastra el borrado DURO de todos sus alumnos (identidad de GoTrue incluida),
// no una anonimización: nada del titular ni de sus alumnos queda accesible ni reidentificable.

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
        .select(
            'subscription_mp_id, subscription_status, subscription_tier, subscription_provider, subscription_provider_external_id'
        )
        .eq('id', coachId)
        .maybeSingle()

    // 2. Cancel the LIVE subscription at its PERSISTED gateway (best-effort — non-fatal).
    // Ley 21.719: una cuenta borrada NO puede seguir siendo cobrada. Antes cancelaba SIEMPRE en MP →
    // para un coach Flow la sub Flow quedaba VIVA cobrando tras el borrado. Ahora se resuelve el
    // provider por `subscription_provider` y el id según el gateway (Flow → external_id; MP → mp_id).
    const subId = (coach?.subscription_provider === 'flow'
        ? coach?.subscription_provider_external_id
        : coach?.subscription_mp_id
    )?.trim()
    if (subId && coach?.subscription_status === 'active' && coach?.subscription_tier !== 'free') {
        try {
            const provider = getPaymentsProviderForCoach(coach ?? {})
            await provider.cancelCheckoutAtProvider(subId)
        } catch {
            console.warn('[deleteAccount] could not cancel subscription at provider', { coachId, subId })
        }
    }

    // 3. Borrar DURO a cada alumno ANTES que al coach.
    // Bug que esto corrige: `deleteUser(coachId)` cascadea por `clients_coach_id_fkey` y borra las
    // filas `clients`, pero los `auth.users` de esos alumnos SOBREVIVEN (la cascada no sube) →
    // logins zombie. Anonimizar PII + borrar logs sueltos era un parche incoherente con esa cascada:
    // el borrado total del alumno es estrictamente más fuerte y deja cero huérfanos.
    // Si CUALQUIERA falla se aborta antes de tocar al coach: mejor reintentable que a medias.
    const { data: coachClients, error: clientsListError } = await adminDb
        .from('clients')
        .select('id')
        .eq('coach_id', coachId)
    if (clientsListError) {
        console.error('[deleteAccount] failed to list coach clients:', clientsListError)
        return { error: 'Error al eliminar la cuenta. Contacta soporte en privacidad@eva-app.cl' }
    }
    const failedClientIds: string[] = []
    for (const client of coachClients ?? []) {
        const { error: clientDeleteError } = await deleteClientHard(adminDb, client.id)
        if (clientDeleteError) failedClientIds.push(client.id)
    }
    if (failedClientIds.length > 0) {
        console.error('[deleteAccount] failed to delete clients:', { coachId, failedClientIds })
        return { error: 'Error al eliminar la cuenta. Contacta soporte en privacidad@eva-app.cl' }
    }

    // 4. Delete logo from storage (best-effort)
    try {
        await supabase.storage.from('logos').remove([`${coachId}/logo.jpg`, `${coachId}/logo.png`])
    } catch {
        // Non-fatal
    }

    // 5. Delete auth user — CASCADE will delete coaches row via FK
    const { error: authError } = await adminDb.auth.admin.deleteUser(coachId)
    if (authError) {
        console.error('[deleteAccount] failed to delete auth user:', authError)
        return { error: 'Error al eliminar la cuenta. Contacta soporte en privacidad@eva-app.cl' }
    }

    redirect('/login?deleted=true')
}
