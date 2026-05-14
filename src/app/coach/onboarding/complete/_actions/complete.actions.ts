'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { redirect } from 'next/navigation'
import {
    BILLING_CYCLE_CONFIG,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { normalizePlatformEmail, isDisposableEmail } from '@/lib/auth/platform-email'

export type CompleteOnboardingState = { error?: string }

const VALID_TIERS: SubscriptionTier[] = ['free', 'starter', 'pro', 'elite', 'growth', 'scale']
const VALID_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'annual']

const RESERVED_SLUGS = new Set([
    'admin', 'api', 'coach', 'coaches', 'register', 'login', 'logout', 'pricing',
    'about', 'contact', 'eva', 'antigravity', 'soporte', 'help', 'blog', 'app',
    'www', 'mail', 'support', 'dashboard', 'settings', 'subscription',
    'nike', 'adidas', 'crossfit', 'gym',
])

export async function completeOAuthOnboarding(
    _prev: CompleteOnboardingState,
    formData: FormData
): Promise<CompleteOnboardingState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { error: 'Sesión expirada. Volvé a iniciar sesión con Google.' }
    }

    const brandName = (formData.get('brand_name') as string)?.trim()
    const fullName = (formData.get('full_name') as string)?.trim()
    const selectedTier = (formData.get('subscription_tier') as SubscriptionTier | null) ?? 'free'
    const selectedBillingCycle = (formData.get('billing_cycle') as BillingCycle | null) ?? 'monthly'
    const acceptLegal = formData.get('accept_legal')
    const acceptHealthData = formData.get('accept_health_data')
    const acceptMarketing = formData.get('accept_marketing') === 'on'

    if (!brandName || brandName.length < 2) return { error: 'El nombre de tu marca es obligatorio (mínimo 2 caracteres).' }
    if (!fullName || fullName.length < 2) return { error: 'Tu nombre completo es obligatorio.' }
    if (!acceptLegal) return { error: 'Debés aceptar los términos de servicio y la política de privacidad.' }
    if (!acceptHealthData) return { error: 'Debés aceptar el tratamiento de datos de salud (Ley 21.719, Art. 16).' }
    if (!VALID_TIERS.includes(selectedTier)) return { error: 'Plan inválido.' }
    if (!VALID_CYCLES.includes(selectedBillingCycle)) return { error: 'Frecuencia de pago inválida.' }

    const isFreeTier = selectedTier === 'free'

    if (!isFreeTier && !isBillingCycleAllowedForTier(selectedTier, selectedBillingCycle)) {
        return { error: 'La frecuencia elegida no está disponible para ese plan.' }
    }

    const email = user.email ?? ''
    if (!email) return { error: 'No se pudo obtener tu email de Google.' }

    const emailNorm = normalizePlatformEmail(email)
    if (isDisposableEmail(emailNorm)) return { error: 'Los correos temporales no están permitidos.' }

    const adminDb = createServiceRoleClient()

    // Prevent free trial abuse via email normalization
    const { data: existingTrial } = await adminDb
        .from('coaches')
        .select('id')
        .eq('trial_used_email', emailNorm)
        .maybeSingle()

    if (existingTrial) {
        return { error: 'Ya existe una cuenta gratuita con este correo. Iniciá sesión o contacta soporte.' }
    }

    // Generate slug
    const baseSlug = brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    if (RESERVED_SLUGS.has(baseSlug)) return { error: 'Este nombre de marca no está disponible. Probá con otro.' }

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existing } = await adminDb.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existing) break
        if (attempt === 7) return { error: 'No se pudo generar un ID único. Probá con otro nombre.' }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    const { error: insertError } = await adminDb.from('coaches').insert({
        id: user.id,
        full_name: fullName,
        brand_name: brandName,
        slug,
        primary_color: '#10B981',
        // Google accounts are already email-confirmed — free tier is active immediately
        subscription_status: isFreeTier ? 'active' : 'pending_payment',
        subscription_tier: selectedTier,
        billing_cycle: isFreeTier ? 'monthly' : selectedBillingCycle,
        payment_provider: isFreeTier ? 'admin' : (process.env.PAYMENT_PROVIDER ?? 'mercadopago'),
        max_clients: getTierMaxClients(selectedTier),
        health_data_consent_at: new Date().toISOString(),
        marketing_consent: acceptMarketing,
        ...(isFreeTier && { trial_used_email: emailNorm }),
    })

    if (insertError) {
        return { error: 'Error al crear tu perfil. Intentá de nuevo o contactá soporte.' }
    }

    if (isFreeTier) {
        redirect('/coach/dashboard?welcome=free')
    }

    const selectedCycleLabel = BILLING_CYCLE_CONFIG[selectedBillingCycle].label.toLowerCase()
    redirect(
        `/coach/subscription/processing?from=register&tier=${encodeURIComponent(selectedTier)}&cycle=${encodeURIComponent(selectedBillingCycle)}&plan=${encodeURIComponent(selectedCycleLabel)}`
    )
}
