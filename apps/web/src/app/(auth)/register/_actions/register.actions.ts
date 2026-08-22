'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
    BILLING_CYCLE_CONFIG,
    getTierCapabilities,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    SALE_TIERS,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    isEmailTakenReason,
    normalizePlatformEmail,
    sanitizePlatformEmail,
} from '@/lib/auth/platform-email'
import { clientIpFromRequest } from '@/lib/rate-limit'
import { generateUniqueInviteCode } from '@/lib/coach/invite-code.server'
import { sendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import { normalizeCouponCode } from '@/services/billing/coupons.normalize'
import { newMetaEventId, queueMetaCapiEvent } from '@/lib/meta/capi'

export type RegisterState = {
    error?: string
    /** Causa estable del rechazo (snake_case). Alimenta `register_failed` en PostHog. */
    code?: string
}

/**
 * Todo rechazo del alta sale por acá: log server-side + código estable para el cliente.
 *
 * Hueco que cierra: un alta rechazada no dejaba NINGÚN rastro. Caso medido el 20-08 01:43 UTC —
 * un visitante con `utm_source=meta` mandó `register_submitted` 3 veces en 28 s, el action devolvió
 * `{ error }` las 3 y no quedó nada: ni log, ni Sentry, ni evento. Pagamos ese clic y no sabemos
 * contra qué muro se estrelló.
 *
 * El mensaje al usuario NO cambia; el `code` es la causa real, la que se agrega en el funnel.
 * El log lleva SOLO el código: nunca email, nombre, contraseña ni IP (esto vive en los logs de
 * Vercel, que no tienen la retención acotada de un sistema de datos personales).
 */
function reject(code: string, error: string): RegisterState {
    console.warn('[register] rechazado', code)
    return { error, code }
}

// Solo se vende free/starter/pro/elite. growth/scale fuera de venta (grandfathered, plan 04).
const VALID_TIERS = SALE_TIERS
const VALID_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'annual']

const RESERVED_SLUGS = new Set([
    'admin', 'api', 'coach', 'coaches', 'register', 'login', 'logout', 'pricing',
    'about', 'contact', 'eva', 'antigravity', 'soporte', 'help', 'blog', 'app',
    'www', 'mail', 'support', 'dashboard', 'settings', 'subscription',
    'nike', 'adidas', 'crossfit', 'gym',
])

export async function registerAction(
    _prev: RegisterState,
    formData: FormData
): Promise<RegisterState> {
    const fullName = formData.get('full_name') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const brandName = formData.get('brand_name') as string
    const acceptLegal = formData.get('accept_legal')
    const acceptHealthData = formData.get('accept_health_data')
    const acceptMarketing = formData.get('accept_marketing') === 'on'
    const selectedTier = (formData.get('subscription_tier') as SubscriptionTier | null) ?? 'free'
    const selectedBillingCycle = (formData.get('billing_cycle') as BillingCycle | null) ?? 'monthly'
    // Add-ons opcionales del signup (plan 05 F5.5): CSV de MODULE_KEYS. Se validan contra la
    // whitelist + coherencia D8 (nutrition_exchanges solo en tier con nutrición). El monto se
    // calcula SOLO server-side en create-preference; acá solo se decide qué módulos viajan.
    const rawAddons = (formData.get('addons') as string | null) ?? ''

    // Honeypot check — bots fill hidden fields, humans don't
    const honeypot = formData.get('website') as string
    if (honeypot) {
        return reject('honeypot', 'Algo salió mal. Intenta de nuevo en unos minutos.')
    }

    // Cloudflare Turnstile verification (only if secret key is configured)
    if (process.env.TURNSTILE_SECRET_KEY) {
        const turnstileToken = formData.get('cf-turnstile-response') as string
        if (!turnstileToken) {
            return reject('turnstile_missing', 'Verificación de seguridad requerida. Recarga la página e intenta de nuevo.')
        }
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken }),
        })
        const verifyData = await verifyRes.json() as { success: boolean }
        if (!verifyData.success) {
            return reject('turnstile_failed', 'Verificación de seguridad fallida. Intenta de nuevo.')
        }
    }

    const isTierValid = (VALID_TIERS as readonly string[]).includes(selectedTier)
    const isCycleValid = VALID_CYCLES.includes(selectedBillingCycle)
    const isFreeTier = selectedTier === 'free'

    if (!fullName || !email || !password || !brandName) {
        return reject('fields_missing', 'Todos los campos son obligatorios')
    }

    if (password.length < 8) {
        return reject('password_short', 'La contraseña debe tener al menos 8 caracteres')
    }

    if (!acceptLegal) {
        return reject('terms_not_accepted', 'Debes aceptar los términos de servicio y la política de privacidad.')
    }

    if (!acceptHealthData) {
        return reject('health_consent_missing', 'Debes aceptar el tratamiento de datos de salud para usar EVA (Ley 21.719, Art. 16).')
    }

    if (!isTierValid || !isCycleValid) {
        return reject('plan_invalid', 'Debes seleccionar un plan y una frecuencia válidos.')
    }

    if (!isFreeTier && !isBillingCycleAllowedForTier(selectedTier, selectedBillingCycle)) {
        return reject('cycle_unavailable', 'La frecuencia elegida no está disponible para ese plan.')
    }

    // Generate slug from brand name
    const baseSlug = brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    if (RESERVED_SLUGS.has(baseSlug)) {
        return reject('brand_unavailable', 'Este nombre de marca no está disponible. Intenta con otro nombre.')
    }

    const adminDb = createServiceRoleClient()

    // IP-based abuse prevention: max 3 free accounts per IP per 7 days
    if (isFreeTier) {
        const reqHeaders = await headers()
        const ip = clientIpFromRequest({ headers: reqHeaders } as any)
        if (ip && ip !== 'unknown') {
            const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
            const { count } = await adminDb
                .from('coaches')
                .select('id', { count: 'exact', head: true })
                .eq('registration_ip', ip)
                .eq('subscription_tier', 'free')
                .gte('created_at', sevenDaysAgo)
            if ((count ?? 0) >= 3) {
                return reject('free_ip_limit', 'No se pudo completar el registro. Si crees que es un error, contacta soporte.')
            }
        }
    }

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existingCoach } = await adminDb.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existingCoach) break
        if (attempt === 7) {
            return reject('slug_generation_failed', 'No se pudo generar un identificador único para tu marca. Prueba con otro nombre.')
        }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }
    const inviteCode = await generateUniqueInviteCode(adminDb)

    const emailSan = sanitizePlatformEmail(email)
    const emailNorm = normalizePlatformEmail(email)
    const availability = await assertPlatformEmailAvailable(adminDb, email)
    if (!availability.ok) {
        // `reason` ya es una categoría (nunca el correo): `taken_*` colapsa a un solo código —
        // el copy no revela la categoría, y para el funnel «ya tiene cuenta» es una sola causa.
        // Las demás (invalid / blocked_domain / disposable / rpc_error) viajan separadas: un pico
        // de `email_rpc_error` es una caída nuestra, no un visitante que se equivocó.
        return reject(
            isEmailTakenReason(availability.reason) ? 'email_taken' : `email_${availability.reason}`,
            availability.error
        )
    }

    // Free tier requires email verification; paid tiers are auto-confirmed (payment = identity proof)
    const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
        email: emailSan,
        password,
        email_confirm: !isFreeTier,
    })

    if (authError || !authData.user) {
        if (authError && isAuthDuplicateEmailMessage(authError.message)) {
            // Código propio (no `email_taken`): acá la RPC de disponibilidad dijo que SÍ y GoTrue
            // dijo que no. Es una carrera o un hueco del check — separado se ve, colapsado no.
            return reject('auth_email_taken', 'Este correo ya está registrado en la plataforma. Usa otro correo o inicia sesión si ya tienes cuenta.')
        }
        return reject('auth_create_failed', authError?.message || 'Error al crear la cuenta')
    }

    // Capture registration IP for free tier abuse detection
    let registrationIp: string | null = null
    if (isFreeTier) {
        const reqHeaders = await headers()
        const ip = clientIpFromRequest({ headers: reqHeaders } as any)
        registrationIp = ip !== 'unknown' ? ip : null
    }

    // Create coaches row
    const now = new Date().toISOString()
    const { error: coachError } = await adminDb
        .from('coaches')
        .insert({
            id: authData.user.id,
            full_name: fullName,
            brand_name: brandName,
            slug,
            invite_code: inviteCode,
            primary_color: '#1462DC',
            // Free tier: 'pending_email' until the email-confirm link is clicked, which flips it
            // to 'active' AND fires the welcome + drip sequence (apps/web/src/app/auth/confirm/route.ts).
            // Mirrors the mobile free-signup path (api/mobile/auth/register-coach-free); inserting
            // 'active' here silently skipped welcome/drip for every web free coach.
            subscription_status: isFreeTier ? 'pending_email' : 'pending_payment',
            subscription_tier: selectedTier,
            billing_cycle: isFreeTier ? 'monthly' : selectedBillingCycle,
            payment_provider: isFreeTier ? 'admin' : (process.env.PAYMENT_PROVIDER ?? 'mercadopago'),
            max_clients: getTierMaxClients(selectedTier),
            health_data_consent_at: now,
            marketing_consent: acceptMarketing,
            // New coaches already know their invite code — skip the one-shot migration modal
            // (PublicCodeRequiredModal) intended only for legacy coaches without a code.
            onboarding_guide: {
                invite_code_confirmed: true,
                invite_code_confirmed_at: now,
            },
            ...(isFreeTier && { trial_used_email: emailNorm }),
            ...(registrationIp && { registration_ip: registrationIp }),
        })

    if (coachError) {
        // Rollback: delete the auth user
        await adminDb.auth.admin.deleteUser(authData.user.id)
        return reject('coach_insert_failed', coachError.message || 'Error al configurar el perfil de coach')
    }

    // Meta CompleteRegistration (CAPI). El `event_id` se genera UNA vez y viaja tambien al browser
    // por query param (`eid`) para que Meta deduplique el espejo del pixel — cruza SOLO
    // event_name + event_id. Fire-and-forget: si Meta falla o el token no existe, el registro sigue.
    const metaEventId = newMetaEventId()
    const queueMetaRegistration = () =>
        queueMetaCapiEvent({
            eventName: 'CompleteRegistration',
            eventId: metaEventId,
            eventSourceUrl: '/register',
            actionSource: 'website',
            userData: { email: emailSan, externalId: authData.user.id },
            customData: { content_name: selectedTier },
        }).catch(() => { /* nunca romper el registro por analytics */ })

    if (isFreeTier) {
        // admin.createUser does not trigger Supabase auth emails — send manually via Resend.
        const emailSent = await sendCoachSignupConfirmationEmail({
            email: emailSan,
            password,
            coachName: fullName,
        })
        if (!emailSent.ok) {
            await adminDb.from('coaches').delete().eq('id', authData.user.id)
            await adminDb.auth.admin.deleteUser(authData.user.id)
            return reject('confirmation_email_failed', 'No pudimos enviar el correo de confirmación. Revisa el email e intenta de nuevo.')
        }
        // Welcome/drip emails fire after email is confirmed (in /auth/confirm route).
        await queueMetaRegistration()
        // `uid` alimenta el botón «reenviar correo» de esa pantalla: sin sesión (el alta free no
        // loguea hasta confirmar) es el único modo de resolver la cuenta sin aceptar un email
        // suelto del formulario, que crearía `auth.users` huérfanos vía generateLink.
        redirect(
            `/verify-email?email=${encodeURIComponent(emailSan)}&eid=${encodeURIComponent(metaEventId)}&uid=${encodeURIComponent(authData.user.id)}`
        )
    }

    // Paid tier: email auto-confirmed; sign in immediately and proceed to payment
    const supabase = await createClient()
    await supabase.auth.signInWithPassword({ email: emailSan, password })

    // Sanitiza los add-ons: solo MODULE_KEYS válidos; nutrition_exchanges solo si el tier tiene
    // nutrición (D8). El cálculo del monto y la validación dura se repiten en create-preference.
    const canUseNutrition = getTierCapabilities(selectedTier).canUseNutrition
    const sanitizedAddons = Array.from(
        new Set(
            rawAddons
                .split(',')
                .map((s) => s.trim())
                .filter((s): s is ModuleKey => (MODULE_KEYS as readonly string[]).includes(s))
                .filter((k) => (k === 'nutrition_exchanges' ? canUseNutrition : true))
        )
    )
    const addonsParam = sanitizedAddons.length > 0 ? `&addons=${encodeURIComponent(sanitizedAddons.join(','))}` : ''

    // Código de descuento (REGISTER-CODE): solo se SANEA y se threadea a /processing — NO se canjea acá
    // (el canje + disclosure SERNAC + consentimiento ocurren en /processing, antes del primer cobro).
    const couponCode = normalizeCouponCode((formData.get('coupon_code') as string | null) ?? '')
    const couponParam = couponCode ? `&coupon=${encodeURIComponent(couponCode)}` : ''

    // Tier pago: la cuenta ya existe → CompleteRegistration igual. No hay espejo en el browser
    // (el redirect va a /coach/subscription/processing), asi que este evento entra solo por CAPI.
    await queueMetaRegistration()

    const selectedCycleLabel = BILLING_CYCLE_CONFIG[selectedBillingCycle].label.toLowerCase()
    redirect(
        `/coach/subscription/processing?from=register&tier=${encodeURIComponent(selectedTier)}&cycle=${encodeURIComponent(selectedBillingCycle)}&plan=${encodeURIComponent(selectedCycleLabel)}${addonsParam}${couponParam}`
    )
}
