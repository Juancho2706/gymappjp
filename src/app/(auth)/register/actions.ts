'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
    BILLING_CYCLE_CONFIG,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    normalizePlatformEmail,
} from '@/lib/auth/platform-email'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildFreeCoachWelcomeEmail } from '@/lib/email/transactional-templates'
import { scheduleFreeCoachDripSequence } from '@/lib/email/send-drip-sequence'
import { clientIpFromRequest } from '@/lib/rate-limit'

export type RegisterState = {
    error?: string
}

const VALID_TIERS: SubscriptionTier[] = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']
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
    const selectedTier = (formData.get('subscription_tier') as SubscriptionTier | null) ?? 'starter'
    const selectedBillingCycle = (formData.get('billing_cycle') as BillingCycle | null) ?? 'monthly'

    // Honeypot check — bots fill hidden fields, humans don't
    const honeypot = formData.get('website') as string
    if (honeypot) {
        return { error: 'Algo salió mal. Intentá de nuevo en unos minutos.' }
    }

    // Cloudflare Turnstile verification (only if secret key is configured)
    if (process.env.TURNSTILE_SECRET_KEY) {
        const turnstileToken = formData.get('cf-turnstile-response') as string
        if (!turnstileToken) {
            return { error: 'Verificación de seguridad requerida. Recargá la página e intentá de nuevo.' }
        }
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken }),
        })
        const verifyData = await verifyRes.json() as { success: boolean }
        if (!verifyData.success) {
            return { error: 'Verificación de seguridad fallida. Intentá de nuevo.' }
        }
    }

    const isTierValid = VALID_TIERS.includes(selectedTier)
    const isCycleValid = VALID_CYCLES.includes(selectedBillingCycle)
    const isFreeTier = selectedTier === 'free'

    if (!fullName || !email || !password || !brandName) {
        return { error: 'Todos los campos son obligatorios' }
    }

    if (password.length < 8) {
        return { error: 'La contraseña debe tener al menos 8 caracteres' }
    }

    if (!acceptLegal) {
        return { error: 'Debes aceptar los términos de servicio y la política de privacidad.' }
    }

    if (!acceptHealthData) {
        return { error: 'Debes aceptar el tratamiento de datos de salud para usar EVA (Ley 21.719, Art. 16).' }
    }

    if (!isTierValid || !isCycleValid) {
        return { error: 'Debes seleccionar un plan y una frecuencia válidos.' }
    }

    if (!isFreeTier && !isBillingCycleAllowedForTier(selectedTier, selectedBillingCycle)) {
        return { error: 'La frecuencia elegida no está disponible para ese plan.' }
    }

    // Generate slug from brand name
    const baseSlug = brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    if (RESERVED_SLUGS.has(baseSlug)) {
        return { error: 'Este nombre de marca no está disponible. Intentá con otro nombre.' }
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
                return { error: 'No se pudo completar el registro. Si creés que es un error, contacta soporte.' }
            }
        }
    }

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existingCoach } = await adminDb.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existingCoach) break
        if (attempt === 7) {
            return { error: 'No se pudo generar un identificador único para tu marca. Prueba con otro nombre.' }
        }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    const emailNorm = normalizePlatformEmail(email)
    const availability = await assertPlatformEmailAvailable(adminDb, email)
    if (!availability.ok) {
        return { error: availability.error }
    }

    // Free tier requires email verification; paid tiers are auto-confirmed (payment = identity proof)
    const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
        email: emailNorm,
        password,
        email_confirm: !isFreeTier,
    })

    if (authError || !authData.user) {
        if (authError && isAuthDuplicateEmailMessage(authError.message)) {
            return { error: 'Este correo ya está registrado en la plataforma. Usa otro correo o inicia sesión si ya tienes cuenta.' }
        }
        return { error: authError?.message || 'Error al crear la cuenta' }
    }

    // Capture registration IP for free tier abuse detection
    let registrationIp: string | null = null
    if (isFreeTier) {
        const reqHeaders = await headers()
        const ip = clientIpFromRequest({ headers: reqHeaders } as any)
        registrationIp = ip !== 'unknown' ? ip : null
    }

    // Create coaches row
    const { error: coachError } = await adminDb
        .from('coaches')
        .insert({
            id: authData.user.id,
            full_name: fullName,
            brand_name: brandName,
            slug,
            primary_color: '#10B981',
            subscription_status: isFreeTier ? 'pending_email' : 'pending_payment',
            subscription_tier: selectedTier,
            billing_cycle: isFreeTier ? 'monthly' : selectedBillingCycle,
            payment_provider: isFreeTier ? 'admin' : (process.env.PAYMENT_PROVIDER ?? 'mercadopago'),
            max_clients: getTierMaxClients(selectedTier),
            health_data_consent_at: new Date().toISOString(),
            marketing_consent: acceptMarketing,
            ...(isFreeTier && { trial_used_email: emailNorm }),
            ...(registrationIp && { registration_ip: registrationIp }),
        })

    if (coachError) {
        // Rollback: delete the auth user
        await adminDb.auth.admin.deleteUser(authData.user.id)
        return { error: coachError.message || 'Error al configurar el perfil de coach' }
    }

    if (isFreeTier) {
        // Free tier: email unconfirmed — do NOT sign in yet; Supabase sends confirmation email.
        // Welcome/drip emails fire after email is confirmed (in /auth/confirm route).
        redirect(`/verify-email?email=${encodeURIComponent(emailNorm)}`)
    }

    // Paid tier: email auto-confirmed; sign in immediately and proceed to payment
    const supabase = await createClient()
    await supabase.auth.signInWithPassword({ email: emailNorm, password })

    const selectedCycleLabel = BILLING_CYCLE_CONFIG[selectedBillingCycle].label.toLowerCase()
    redirect(
        `/coach/subscription/processing?from=register&tier=${encodeURIComponent(selectedTier)}&cycle=${encodeURIComponent(selectedBillingCycle)}&plan=${encodeURIComponent(selectedCycleLabel)}`
    )
}
