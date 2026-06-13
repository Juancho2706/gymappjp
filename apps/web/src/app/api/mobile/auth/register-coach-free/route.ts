import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    normalizePlatformEmail,
    sanitizePlatformEmail,
} from '@/lib/auth/platform-email'
import {
    clientIpFromRequest,
    jsonRateLimited,
    rateLimitSignup,
} from '@/lib/rate-limit'
import { generateUniqueInviteCode } from '@/lib/coach/invite-code.server'

const RESERVED_SLUGS = new Set([
    'admin', 'api', 'coach', 'coaches', 'register', 'login', 'logout', 'pricing',
    'about', 'contact', 'eva', 'antigravity', 'soporte', 'help', 'blog', 'app',
    'www', 'mail', 'support', 'dashboard', 'settings', 'subscription',
    'nike', 'adidas', 'crossfit', 'gym',
])

const payloadSchema = z.object({
    fullName: z.string().trim().min(2).max(120),
    brandName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    acceptLegal: z.literal(true),
    acceptHealthData: z.literal(true),
    acceptMarketing: z.boolean().optional().default(false),
})

function makeBaseSlug(brandName: string): string {
    return brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48)
}

export async function POST(request: NextRequest) {
    const ip = clientIpFromRequest(request)
    const rate = await rateLimitSignup(ip)
    if (!rate.ok) return jsonRateLimited(rate.retryAfter)

    const parsed = payloadSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Datos de registro invalidos.', code: 'VALIDATION_ERROR' },
            { status: 400 }
        )
    }

    const { fullName, brandName, email, password, acceptMarketing } = parsed.data
    const selectedTier: SubscriptionTier = 'free'
    const baseSlug = makeBaseSlug(brandName)

    if (!baseSlug || RESERVED_SLUGS.has(baseSlug)) {
        return NextResponse.json(
            { error: 'Este nombre de marca no esta disponible. Intenta con otro nombre.', code: 'SLUG_UNAVAILABLE' },
            { status: 400 }
        )
    }

    const adminDb = createServiceRoleClient()

    if (ip && ip !== 'unknown') {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
        const { count } = await adminDb
            .from('coaches')
            .select('id', { count: 'exact', head: true })
            .eq('registration_ip', ip)
            .eq('subscription_tier', 'free')
            .gte('created_at', sevenDaysAgo)
        if ((count ?? 0) >= 3) {
            return NextResponse.json(
                { error: 'No se pudo completar el registro. Si crees que es un error, contacta soporte.', code: 'SIGNUP_LIMIT' },
                { status: 429 }
            )
        }
    }

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existingCoach } = await adminDb
            .from('coaches')
            .select('id')
            .eq('slug', slug)
            .maybeSingle()
        if (!existingCoach) break
        if (attempt === 7) {
            return NextResponse.json(
                { error: 'No se pudo generar un identificador unico para tu marca. Prueba con otro nombre.', code: 'SLUG_GENERATION_FAILED' },
                { status: 409 }
            )
        }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    const availability = await assertPlatformEmailAvailable(adminDb, email)
    if (!availability.ok) {
        return NextResponse.json(
            { error: availability.error, code: 'EMAIL_UNAVAILABLE' },
            { status: 409 }
        )
    }

    const emailSan = sanitizePlatformEmail(email)
    const emailNorm = normalizePlatformEmail(email)
    const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
        email: emailSan,
        password,
        email_confirm: false,
    })

    if (authError || !authData.user) {
        return NextResponse.json(
            {
                error: authError && isAuthDuplicateEmailMessage(authError.message)
                    ? 'Este correo ya esta registrado en la plataforma. Usa otro correo o inicia sesion si ya tienes cuenta.'
                    : authError?.message || 'Error al crear la cuenta.',
                code: 'AUTH_CREATE_FAILED',
            },
            { status: 400 }
        )
    }

    const registrationIp = ip !== 'unknown' ? ip : null
    const inviteCode = await generateUniqueInviteCode(adminDb)
    const now = new Date().toISOString()
    const { error: coachError } = await adminDb.from('coaches').insert({
        id: authData.user.id,
        full_name: fullName,
        brand_name: brandName,
        slug,
        invite_code: inviteCode,
        primary_color: '#10B981',
        subscription_status: 'pending_email',
        subscription_tier: selectedTier,
        billing_cycle: 'monthly',
        payment_provider: 'admin',
        max_clients: getTierMaxClients(selectedTier),
        health_data_consent_at: now,
        marketing_consent: acceptMarketing,
        // New coaches already know their invite code — skip the one-shot migration modal
        // (PublicCodeRequiredModal) intended only for legacy coaches without a code.
        onboarding_guide: {
            invite_code_confirmed: true,
            invite_code_confirmed_at: now,
        },
        trial_used_email: emailNorm,
        ...(registrationIp && { registration_ip: registrationIp }),
    })

    if (coachError) {
        await adminDb.auth.admin.deleteUser(authData.user.id)
        return NextResponse.json(
            { error: coachError.message || 'Error al configurar el perfil de coach.', code: 'COACH_CREATE_FAILED' },
            { status: 500 }
        )
    }

    return NextResponse.json({
        ok: true,
        email: emailSan,
        slug,
        message: 'Revisa tu correo para confirmar tu cuenta.',
    })
}
