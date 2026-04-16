'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { redirect } from 'next/navigation'
import {
    BILLING_CYCLE_CONFIG,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

export type RegisterState = {
    error?: string
}

export async function registerAction(
    _prev: RegisterState,
    formData: FormData
): Promise<RegisterState> {
    const fullName = formData.get('full_name') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const brandName = formData.get('brand_name') as string
    const acceptLegal = formData.get('accept_legal')
    const selectedTier = (formData.get('subscription_tier') as SubscriptionTier | null) ?? 'starter'
    const selectedBillingCycle = (formData.get('billing_cycle') as BillingCycle | null) ?? 'monthly'

    const isTierValid = ['starter_lite', 'starter', 'pro', 'elite', 'scale'].includes(selectedTier)
    const isCycleValid = ['monthly', 'quarterly', 'annual'].includes(selectedBillingCycle)

    if (!fullName || !email || !password || !brandName) {
        return { error: 'Todos los campos son obligatorios' }
    }

    if (password.length < 8) {
        return { error: 'La contraseña debe tener al menos 8 caracteres' }
    }

    if (!acceptLegal) {
        return { error: 'Debes aceptar los términos para crear tu cuenta.' }
    }
    if (!isTierValid || !isCycleValid) {
        return { error: 'Debes seleccionar un plan y una frecuencia válidos.' }
    }
    if (!isBillingCycleAllowedForTier(selectedTier, selectedBillingCycle)) {
        return { error: 'La frecuencia elegida no está disponible para ese plan.' }
    }

    // Generate slug from brand name
    const baseSlug = brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    const adminDb = await createRawAdminClient()

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existingCoach } = await adminDb.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existingCoach) break
        if (attempt === 7) {
            return { error: 'No se pudo generar un identificador único para tu marca. Prueba con otro nombre.' }
        }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }



    // Create auth user
    const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    })

    if (authError || !authData.user) {
        return { error: authError?.message || 'Error al crear la cuenta' }
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
            subscription_status: 'pending_payment',
            subscription_tier: selectedTier,
            billing_cycle: selectedBillingCycle,
            payment_provider: process.env.PAYMENT_PROVIDER ?? 'mercadopago',
            max_clients: getTierMaxClients(selectedTier),
        })

    if (coachError) {
        // Rollback: delete the auth user
        await adminDb.auth.admin.deleteUser(authData.user.id)
        return { error: coachError.message || 'Error al configurar el perfil de coach' }
    }

    // Sign in the user
    const supabase = await createClient()
    await supabase.auth.signInWithPassword({ email, password })

    const selectedCycleLabel = BILLING_CYCLE_CONFIG[selectedBillingCycle].label.toLowerCase()
    redirect(
        `/coach/subscription/processing?from=register&tier=${encodeURIComponent(selectedTier)}&cycle=${encodeURIComponent(selectedBillingCycle)}&plan=${encodeURIComponent(selectedCycleLabel)}`
    )
}
