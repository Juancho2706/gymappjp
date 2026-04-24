'use server'

import { timingSafeEqual } from 'crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { createClient } from '@/lib/supabase/server'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    normalizePlatformEmail,
} from '@/lib/auth/platform-email'

export type BetaRegisterState = {
    error?: string
}

const SPECIAL_EMAIL = 'robinson.berna@outlook.com'

function verifyBetaToken(candidate: string): boolean {
    const expected = process.env.BETA_INVITE_TOKEN ?? ''
    if (!expected || !candidate) return false
    const maxLen = Math.max(candidate.length, expected.length)
    const a = Buffer.alloc(maxLen)
    const b = Buffer.alloc(maxLen)
    a.write(candidate)
    b.write(expected)
    return timingSafeEqual(a, b) && candidate.length === expected.length
}

export async function betaRegisterAction(
    _prev: BetaRegisterState,
    formData: FormData
): Promise<BetaRegisterState> {
    // Defense in depth: re-validate token even though page already checked it
    const token = formData.get('invite_token') as string
    if (!verifyBetaToken(token)) {
        return { error: 'Invitación inválida.' }
    }

    const fullName = formData.get('full_name') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const brandName = formData.get('brand_name') as string
    const acceptLegal = formData.get('accept_legal')

    if (!fullName || !email || !password || !brandName) {
        return { error: 'Todos los campos son obligatorios' }
    }
    if (password.length < 8) {
        return { error: 'La contraseña debe tener al menos 8 caracteres' }
    }
    if (!acceptLegal) {
        return { error: 'Debes aceptar los términos para crear tu cuenta.' }
    }

    const headersList = await headers()
    const ip =
        headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        headersList.get('x-real-ip')?.trim() ??
        'unknown'

    const adminDb = await createRawAdminClient()

    // One registration per IP
    const { data: existingIp } = await adminDb
        .from('beta_invite_registrations')
        .select('id')
        .eq('ip_address', ip)
        .maybeSingle()
    if (existingIp) {
        return { error: 'Esta invitación ya fue usada desde tu red.' }
    }

    const emailNorm = normalizePlatformEmail(email)
    const availability = await assertPlatformEmailAvailable(adminDb, email)
    if (!availability.ok) {
        return { error: availability.error }
    }

    // Generate unique slug (identical logic to register/actions.ts)
    const baseSlug = brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existing } = await adminDb
            .from('coaches')
            .select('id')
            .eq('slug', slug)
            .maybeSingle()
        if (!existing) break
        if (attempt === 7) {
            return { error: 'No se pudo generar un identificador único. Prueba con otro nombre de marca.' }
        }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    // Special friend: 1 year + 5 students. Everyone else: 20 days + 30 students (pro default)
    const isFriend = emailNorm === SPECIAL_EMAIL
    const maxClients = isFriend ? 5 : 30
    const periodEnd = isFriend
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString()

    const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
        email: emailNorm,
        password,
        email_confirm: true,
    })

    if (authError || !authData.user) {
        if (authError && isAuthDuplicateEmailMessage(authError.message)) {
            return { error: 'Este correo ya está registrado en la plataforma.' }
        }
        return { error: authError?.message || 'Error al crear la cuenta' }
    }

    const { error: coachError } = await adminDb.from('coaches').insert({
        id: authData.user.id,
        full_name: fullName,
        brand_name: brandName,
        slug,
        primary_color: '#10B981',
        subscription_status: 'active',
        subscription_tier: 'pro',
        billing_cycle: 'monthly',
        payment_provider: 'beta',
        max_clients: maxClients,
        current_period_end: periodEnd,
    })

    if (coachError) {
        await adminDb.auth.admin.deleteUser(authData.user.id)
        return { error: coachError.message || 'Error al configurar el perfil de coach' }
    }

    // Record IP usage — unique index acts as race condition guard
    const { error: ipError } = await adminDb.from('beta_invite_registrations').insert({
        ip_address: ip,
        email: emailNorm,
        coach_id: authData.user.id,
    })

    if (ipError) {
        await adminDb.auth.admin.deleteUser(authData.user.id)
        return { error: 'Esta invitación ya fue usada desde tu red.' }
    }

    const supabase = await createClient()
    await supabase.auth.signInWithPassword({ email: emailNorm, password })

    redirect('/coach/dashboard')
}
