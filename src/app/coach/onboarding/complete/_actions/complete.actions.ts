'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { redirect } from 'next/navigation'
import { getTierMaxClients } from '@/lib/constants'
import { normalizePlatformEmail, isDisposableEmail } from '@/lib/auth/platform-email'

export type CompleteOnboardingState = { error?: string }

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
    if (!brandName || brandName.length < 2) {
        return { error: 'El nombre de tu marca es obligatorio (mínimo 2 caracteres).' }
    }

    const email = user.email ?? ''
    if (!email) return { error: 'No se pudo obtener tu email de Google.' }

    const emailNorm = normalizePlatformEmail(email)
    if (isDisposableEmail(emailNorm)) {
        return { error: 'Los correos temporales no están permitidos.' }
    }

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

    if (RESERVED_SLUGS.has(baseSlug)) {
        return { error: 'Este nombre de marca no está disponible. Probá con otro.' }
    }

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existing } = await adminDb.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existing) break
        if (attempt === 7) return { error: 'No se pudo generar un ID único para tu marca. Probá con otro nombre.' }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    const { error: insertError } = await adminDb.from('coaches').insert({
        id: user.id,
        full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
        brand_name: brandName,
        slug,
        primary_color: '#10B981',
        subscription_status: 'active',
        subscription_tier: 'free',
        billing_cycle: 'monthly',
        payment_provider: 'admin',
        max_clients: getTierMaxClients('free'),
        health_data_consent_at: new Date().toISOString(),
        marketing_consent: false,
        trial_used_email: emailNorm,
    })

    if (insertError) {
        return { error: 'Error al crear tu perfil. Intentá de nuevo o contacta soporte.' }
    }

    redirect('/coach/dashboard?welcome=free')
}
