import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import { isDisposableEmail, normalizePlatformEmail } from '@/lib/auth/platform-email'
import { generateUniqueInviteCode } from '@/lib/coach/invite-code.server'
import { clientIpFromRequest, jsonRateLimited, rateLimitSignup } from '@/lib/rate-limit'

/**
 * Materializa la fila `coaches` del coach autenticado por OAuth (Google) que aún no tiene perfil.
 * Espejo mobile de la rama FREE de `coach/onboarding/complete` (`completeOAuthOnboarding`): el usuario
 * de auth YA existe (creado por `signInWithIdToken` en el SDK nativo — E5-22), acá solo falta crear su
 * perfil de coach. Distinto de `register-coach-free` (que crea auth + coach con email/password).
 *
 * Free-tier ONLY: los planes pagos + MercadoPago se activan en eva-app.cl (money-safety, mismo criterio
 * que el registro mobile). Escritura service-role (columnas `coaches` son compra-only / set-once).
 *
 * Mutación de cuenta => auth por `getUser(token)` (autoritativo, valida revocación), NO `jose` — mismo
 * criterio que el resto de endpoints /api/mobile que MUTAN (clear-force-password, bodycomp, clients).
 */

const RESERVED_SLUGS = new Set([
    'admin', 'api', 'coach', 'coaches', 'register', 'login', 'logout', 'pricing',
    'about', 'contact', 'eva', 'antigravity', 'soporte', 'help', 'blog', 'app',
    'www', 'mail', 'support', 'dashboard', 'settings', 'subscription',
    'nike', 'adidas', 'crossfit', 'gym',
])

const payloadSchema = z.object({
    fullName: z.string().trim().min(2).max(120),
    brandName: z.string().trim().min(2).max(120),
    acceptLegal: z.literal(true),
    acceptHealthData: z.literal(true),
    acceptMarketing: z.boolean().optional().default(false),
})

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

function makeBaseSlug(brandName: string): string {
    return brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48)
}

export async function POST(request: NextRequest) {
    const ip = clientIpFromRequest(request)
    const rate = await rateLimitSignup(ip)
    if (!rate.ok) return jsonRateLimited(rate.retryAfter)

    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const adminDb = createServiceRoleClient()
    const { data: ud, error: uerr } = await adminDb.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    const user = ud.user

    const parsed = payloadSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Datos de registro invalidos.', code: 'VALIDATION_ERROR' },
            { status: 400 }
        )
    }
    const { fullName, brandName, acceptMarketing } = parsed.data

    const email = user.email ?? ''
    if (!email) {
        return NextResponse.json(
            { error: 'No se pudo obtener tu email de la cuenta de Google.', code: 'NO_EMAIL' },
            { status: 400 }
        )
    }
    const emailNorm = normalizePlatformEmail(email)
    if (isDisposableEmail(emailNorm)) {
        return NextResponse.json(
            { error: 'Los correos temporales no estan permitidos.', code: 'DISPOSABLE_EMAIL' },
            { status: 400 }
        )
    }

    // Idempotencia: si el coach ya tiene perfil (re-entrada, doble tap), no re-insertamos (PK fallaría).
    const { data: existingCoach } = await adminDb
        .from('coaches')
        .select('id, slug')
        .eq('id', user.id)
        .maybeSingle()
    if (existingCoach) {
        return NextResponse.json({ ok: true, slug: existingCoach.slug, alreadyOnboarded: true })
    }

    // Anti-abuso de free trial vía email normalizado (espejo de completeOAuthOnboarding).
    const { data: existingTrial } = await adminDb
        .from('coaches')
        .select('id')
        .eq('trial_used_email', emailNorm)
        .maybeSingle()
    if (existingTrial) {
        return NextResponse.json(
            { error: 'Ya existe una cuenta gratuita con este correo. Inicia sesion o contacta soporte.', code: 'TRIAL_USED' },
            { status: 409 }
        )
    }

    const selectedTier: SubscriptionTier = 'free'
    const baseSlug = makeBaseSlug(brandName)
    if (!baseSlug || RESERVED_SLUGS.has(baseSlug)) {
        return NextResponse.json(
            { error: 'Este nombre de marca no esta disponible. Intenta con otro nombre.', code: 'SLUG_UNAVAILABLE' },
            { status: 400 }
        )
    }

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existingSlug } = await adminDb.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existingSlug) break
        if (attempt === 7) {
            return NextResponse.json(
                { error: 'No se pudo generar un identificador unico para tu marca. Prueba con otro nombre.', code: 'SLUG_GENERATION_FAILED' },
                { status: 409 }
            )
        }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    const inviteCode = await generateUniqueInviteCode(adminDb)
    const now = new Date().toISOString()
    const { error: coachError } = await adminDb.from('coaches').insert({
        id: user.id,
        full_name: fullName,
        brand_name: brandName,
        slug,
        invite_code: inviteCode,
        primary_color: '#10B981',
        // Cuenta Google ya viene con email confirmado — free-tier activo de inmediato.
        subscription_status: 'active',
        subscription_tier: selectedTier,
        billing_cycle: 'monthly',
        payment_provider: 'admin',
        max_clients: getTierMaxClients(selectedTier),
        health_data_consent_at: now,
        marketing_consent: acceptMarketing,
        // El coach nuevo ya conoce su invite_code — saltea el modal one-shot de migración legacy.
        onboarding_guide: {
            invite_code_confirmed: true,
            invite_code_confirmed_at: now,
        },
        trial_used_email: emailNorm,
    })

    if (coachError) {
        return NextResponse.json(
            { error: coachError.message || 'Error al configurar el perfil de coach.', code: 'COACH_CREATE_FAILED' },
            { status: 500 }
        )
    }

    return NextResponse.json({ ok: true, slug })
}
