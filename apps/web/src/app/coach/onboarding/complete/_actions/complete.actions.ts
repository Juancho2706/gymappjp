'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { redirect } from 'next/navigation'
import {
    BILLING_CYCLE_CONFIG,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    SALE_TIERS,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { normalizePlatformEmail, sanitizePlatformEmail, isDisposableEmail } from '@/lib/auth/platform-email'
import { generateUniqueInviteCode } from '@/lib/coach/invite-code.server'
import { normalizeCouponCode } from '@/services/billing/coupons.normalize'
import { newMetaEventId, queueMetaCapiEvent } from '@/lib/meta/capi'
import { sendFreeCoachOnboardingEmails } from '@/lib/email/free-coach-onboarding'
import { captureCoachRegisteredServer } from '@/lib/posthog/registration-events'
import { SERVER_EMITTED_QUERY } from '@/lib/posthog/registration'

export type CompleteOnboardingState = {
    error?: string
    /** Causa estable del rechazo (snake_case, prefijo `oauth_`). Alimenta `register_failed`. */
    code?: string
}

/**
 * Espejo de `reject()` del alta por email: mismo contrato, códigos prefijados `oauth_` para poder
 * comparar los dos caminos en el mismo embudo sin colisionar. El mensaje al usuario no cambia y el
 * log lleva SOLO el código — nunca email, nombre ni IP.
 */
function reject(code: string, error: string): CompleteOnboardingState {
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

export async function completeOAuthOnboarding(
    _prev: CompleteOnboardingState,
    formData: FormData
): Promise<CompleteOnboardingState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return reject('oauth_session_expired', 'Sesión expirada. Vuelve a iniciar sesión con Google.')
    }

    const brandName = (formData.get('brand_name') as string)?.trim()
    const fullName = (formData.get('full_name') as string)?.trim()
    const selectedTier = (formData.get('subscription_tier') as SubscriptionTier | null) ?? 'free'
    const selectedBillingCycle = (formData.get('billing_cycle') as BillingCycle | null) ?? 'monthly'
    const acceptLegal = formData.get('accept_legal')
    const acceptHealthData = formData.get('accept_health_data')
    const acceptMarketing = formData.get('accept_marketing') === 'on'

    if (!brandName || brandName.length < 2) return reject('oauth_brand_missing', 'El nombre de tu marca es obligatorio (mínimo 2 caracteres).')
    if (!fullName || fullName.length < 2) return reject('oauth_name_missing', 'Tu nombre completo es obligatorio.')
    if (!acceptLegal) return reject('oauth_terms_not_accepted', 'Debes aceptar los términos de servicio y la política de privacidad.')
    if (!acceptHealthData) return reject('oauth_health_consent_missing', 'Debes aceptar el tratamiento de datos de salud (Ley 21.719, Art. 16).')
    if (!(VALID_TIERS as readonly string[]).includes(selectedTier)) return reject('oauth_plan_invalid', 'Plan inválido.')
    if (!VALID_CYCLES.includes(selectedBillingCycle)) return reject('oauth_cycle_invalid', 'Frecuencia de pago inválida.')

    const isFreeTier = selectedTier === 'free'

    if (!isFreeTier && !isBillingCycleAllowedForTier(selectedTier, selectedBillingCycle)) {
        return reject('oauth_cycle_unavailable', 'La frecuencia elegida no está disponible para ese plan.')
    }

    const email = user.email ?? ''
    if (!email) return reject('oauth_email_missing', 'No se pudo obtener tu email de Google.')

    const emailNorm = normalizePlatformEmail(email)
    if (isDisposableEmail(emailNorm)) return reject('oauth_email_disposable', 'Los correos temporales no están permitidos.')

    const adminDb = createServiceRoleClient()

    // Cinturón «Vive tu app» (docs/specs/vive-tu-app-directo §3, callejón 6): con la sesión del
    // alumno de EJEMPLO puesta en el navegador, «atrás» aterrizaba en este formulario y el insert de
    // abajo creaba una fila `coaches` CON EL ID DEL DEMO — un usuario que es alumno y coach a la vez,
    // imposible de deshacer desde el producto. El proxy ya devuelve esas sesiones a su app; esto es
    // el cinturón del servidor, que es el que escribe.
    const { data: sessionIsClient } = await adminDb
        .from('clients')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (sessionIsClient) {
        return reject(
            'oauth_session_is_client',
            'Esta sesión es la de tu app de alumno, no la de tu panel. Vuelve a tu panel para seguir.',
        )
    }

    // Prevent free trial abuse via email normalization
    const { data: existingTrial } = await adminDb
        .from('coaches')
        .select('id')
        .eq('trial_used_email', emailNorm)
        .maybeSingle()

    if (existingTrial) {
        return reject('oauth_trial_used', 'Ya existe una cuenta gratuita con este correo. Inicia sesión o contacta soporte.')
    }

    // Generate slug
    const baseSlug = brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    if (RESERVED_SLUGS.has(baseSlug)) return reject('oauth_brand_unavailable', 'Este nombre de marca no está disponible. Prueba con otro.')

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existing } = await adminDb.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existing) break
        if (attempt === 7) return reject('oauth_slug_generation_failed', 'No se pudo generar un ID único. Prueba con otro nombre.')
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    const inviteCode = await generateUniqueInviteCode(adminDb)

    const now = new Date().toISOString()
    const { error: insertError } = await adminDb.from('coaches').insert({
        id: user.id,
        full_name: fullName,
        brand_name: brandName,
        slug,
        invite_code: inviteCode,
        primary_color: '#1462DC',
        // Google accounts are already email-confirmed — free tier is active immediately
        subscription_status: isFreeTier ? 'active' : 'pending_payment',
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
    })

    if (insertError) {
        return reject('oauth_coach_insert_failed', 'Error al crear tu perfil. Intenta de nuevo o contacta soporte.')
    }

    // QA pre-campaña 17-08: este camino no emitía NINGUNA conversión a Meta ni disparaba la
    // bienvenida — y es el de menor fricción, el que más elige el tráfico frío del anuncio.
    // Mismo contrato que el registro por email: `event_id` único generado UNA vez, CAPI ahora,
    // y el espejo del pixel en el destino con el MISMO id (`eid`) para que Meta deduplique.
    // `await`, no `void`: este action termina en `redirect()`, y un action que redirige no
    // garantiza trabajo pendiente — la lección del registro free con `after()` (531cf7b6): sin
    // esperar, el POST a Meta muere con la invocación. El `.catch` mantiene la garantía de que
    // analytics jamás rompe un alta.
    const metaEventId = newMetaEventId()
    await queueMetaCapiEvent({
        eventName: 'CompleteRegistration',
        eventId: metaEventId,
        eventSourceUrl: '/coach/onboarding/complete',
        actionSource: 'website',
        // `emailSan` (trim+lowercase), NUNCA `emailNorm`: el normalizado es SOLO para dedup interno
        // — a gmail le saca puntos y +alias, y Meta hashea el email REAL del usuario. Con la forma
        // dedup el hash no matchea nada, justo en el camino de alta más gmail-pesado que hay.
        // Mismo criterio que el registro por email (`register.actions.ts` manda `emailSan`).
        userData: { email: sanitizePlatformEmail(email), externalId: user.id },
        customData: { content_name: selectedTier },
    }).catch(() => { /* nunca romper el alta por analytics */ })

    if (isFreeTier) {
        // La cuenta de Google ya viene confirmada: el coach nace `active` y jamás pasa por
        // `/auth/confirm`, que era el único lugar que mandaba bienvenida + drip.
        // `await` por la misma razón que el CAPI de arriba: el `redirect()` de la línea siguiente
        // cierra la invocación y Vercel se lleva puesto todo lo pendiente. El helper no lanza; el
        // try/catch es el cinturón (mismo patrón que los otros dos call sites): la fila `coaches`
        // ya está escrita, así que un fallo de correo no puede devolver «Error al crear tu perfil»
        // y mandar al coach a registrarse de nuevo. Envuelve SOLO el correo: el `redirect()` de
        // abajo lanza por diseño y no puede quedar dentro del catch.
        try {
            await sendFreeCoachOnboardingEmails({
                admin: adminDb,
                coachId: user.id,
                email,
                coachName: fullName,
                brandName,
                inviteCode,
                appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.eva-app.cl',
            })
        } catch {
            // Sin PII en el log: vive en Vercel sin retención acotada.
            console.warn('[register] onboarding email failed')
        }

        // W7.1: hasta hoy este alta solo se contaba en PostHog desde el aterrizaje, o sea detrás
        // del banner de cookies — quien no acepta se daba de alta sin dejar rastro (hallazgo 21-08:
        // ~29 % de las altas nuevas sin `register_submitted`/`coach_registered`, concentrado en
        // Google). El servidor sabe el hecho y no depende del consentimiento del visitante para un
        // evento de negocio del propio coach (mismo criterio que `server-capture.ts`).
        //
        // `await` por la razón de siempre: el `redirect()` de abajo cierra la invocación.
        // `SERVER_EMITTED_QUERY` en el destino apaga a `CoachRegisteredTracker`: el alta se cuenta
        // UNA vez, y la que gana es la que trae `platform` y `method`.
        await captureCoachRegisteredServer({
            coachId: user.id,
            tier: selectedTier,
            method: 'google',
            platform: 'web',
        })
        redirect(`/coach/dashboard?welcome=free&eid=${encodeURIComponent(metaEventId)}&${SERVER_EMITTED_QUERY}`)
    }

    const selectedCycleLabel = BILLING_CYCLE_CONFIG[selectedBillingCycle].label.toLowerCase()
    // REGISTER-CODE (R2.10 OAuth): saneamos el código y lo threadeamos a /processing (canje + disclosure ahí).
    const couponCode = normalizeCouponCode((formData.get('coupon_code') as string | null) ?? '')
    const couponParam = couponCode ? `&coupon=${encodeURIComponent(couponCode)}` : ''
    redirect(
        `/coach/subscription/processing?from=register&tier=${encodeURIComponent(selectedTier)}&cycle=${encodeURIComponent(selectedBillingCycle)}&plan=${encodeURIComponent(selectedCycleLabel)}${couponParam}`
    )
}
