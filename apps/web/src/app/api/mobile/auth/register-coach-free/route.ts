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
import { resendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import { sendFreeCoachOnboardingEmails } from '@/lib/email/free-coach-onboarding'
import { captureCoachRegisteredServer } from '@/lib/posthog/registration-events'
import { resolveRegistrationPlatform } from '@/lib/posthog/registration'
import { resolveRegistrationUtm } from '@/lib/auth/registration-utm'

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
    // W3.9 (atribución del alta). OPCIONALES a propósito: los binarios que ya están en la calle no
    // los mandan y el alta no puede fallar por eso. El valor se sanea server-side igual que el del
    // formulario web — llega del cliente, o sea de cualquiera.
    utmSource: z.string().max(200).optional(),
    utmCampaign: z.string().max(200).optional(),
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
    // W3.9: retención declarada en el `COMMENT ON COLUMN` de la migración (dato personal,
    // Ley 21.719: vive lo que vive la cuenta y se borra con la fila del coach).
    const { utmSource, utmCampaign } = resolveRegistrationUtm({
        utmSource: parsed.data.utmSource,
        utmCampaign: parsed.data.utmCampaign,
    })

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
    // W3.2 (espejo RN de W3.1, D1 = A): el alta free ya no tiene muro de correo. `email_confirm:
    // true` sella `auth.users.email_confirmed_at` EN LA CREACIÓN, así que a partir de este deploy
    // esa columna deja de distinguir a nadie: la prueba real de la casilla es
    // `coaches.email_verified_at` (W3.0), que este camino deja NULL a propósito — nadie probó nada
    // todavía — y llena `/auth/confirm` cuando el coach abre el link del recordatorio.
    const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
        email: emailSan,
        password,
        email_confirm: true,
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
    // W3.2: el estado con el que NACE la cuenta, en una sola constante. Se escribe en la fila y se
    // devuelve tal cual en la respuesta: un binario viejo contra un server nuevo no tiene que
    // adivinar en qué estado quedó el alta (`apps/mobile/lib/register-flow.ts` decide con esto si
    // salta la pantalla de verificación). El tipo conserva la unión porque la respuesta es un
    // contrato con clientes que todavía manejan `pending_email` para las filas viejas.
    const subscriptionStatus: 'active' | 'pending_email' = 'active'
    const { error: coachError } = await adminDb.from('coaches').insert({
        id: authData.user.id,
        full_name: fullName,
        brand_name: brandName,
        slug,
        invite_code: inviteCode,
        primary_color: '#1462DC',
        // W3.3: la marca nace PRENDIDA (mismo criterio que las otras dos altas: se escribe el
        // valor, no se toca el `DEFAULT false` de la columna). Con `false`, el splash RN BORRA la
        // caché de marca en el segundo arranque (`apps/mobile/lib/branding.ts:257-261`).
        use_brand_colors_coach: true,
        // W3.9: atribución, solo server-side (la columna no tiene grant a `authenticated`/`anon`).
        // Hoy el binario no la manda todavía y queda NULL — el dato real necesita el Install
        // Referrer / deep link del lado RN, que no es de esta tarea.
        utm_source: utmSource,
        utm_campaign: utmCampaign,
        subscription_status: subscriptionStatus,
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

    // W3.2 — el correo pasa a RECORDATORIO NO BLOQUEANTE, y el rollback de acá se va.
    //
    // Dos cosas cambian juntas y ninguna es opcional:
    //  (a) `linkType: 'magiclink'` (o sea `resendCoachSignupConfirmationEmail`, no
    //      `sendCoachSignupConfirmationEmail`): con `email_confirm: true` el usuario YA existe
    //      confirmado y GoTrue rechaza `signup` e `invite` para un usuario que existe
    //      (`lib/auth/send-coach-email-confirmation.ts:34-38`). El camino viejo fallaría SIEMPRE.
    //  (b) sin `delete` de `coaches` + `deleteUser`: combinado con (a), ese rollback borraría
    //      TODAS las altas free desde la app. Y aunque el correo falle de verdad, la cuenta ya
    //      nació `active`: el coach entra igual y no hay nada que revertir.
    // Verificar el magiclink confirma el correo igual y `/auth/confirm` llena
    // `coaches.email_verified_at`, que es la señal que miran la higiene del drip (W3.8) y el
    // banner de verificación blanda (W3.11).
    const reminderSent = await resendCoachSignupConfirmationEmail({
        email: emailSan,
        coachName: fullName,
        // El link vuelve a la app en Android tras confirmar (ver `/auth/confirm`).
        source: 'app',
    })
    if (!reminderSent.ok) {
        // Solo la traza: el error de Resend/GoTrue repite la dirección de destino y estos logs no
        // tienen la retención acotada de un sistema de datos personales.
        console.warn('[mobile-register-coach-free] recordatorio de confirmación no salió')
    }

    // Bienvenida + drip. Antes los disparaba `/auth/confirm` en la transición
    // `pending_email → active`; con el alta naciendo `active` esa transición NO EXISTE
    // (`activateConfirmedFreeCoach` corta con `not_pending`, `lib/auth/activate-confirmed-coach.ts:90`)
    // y sin esta llamada el coach que se da de alta desde la app se quedaría sin bienvenida, sin
    // drip y fuera de la audiencia de Resend. Mismo patrón que el alta por Google
    // (`complete.actions.ts`): `await` porque la respuesta congela la invocación en Vercel, y
    // `try/catch` como cinturón — la fila ya está escrita, un fallo de correo no puede devolver un
    // error a alguien que ya tiene cuenta. El drip deduplica por el ledger.
    try {
        await sendFreeCoachOnboardingEmails({
            admin: adminDb,
            coachId: authData.user.id,
            email: emailSan,
            coachName: fullName,
            brandName,
            inviteCode,
            appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin,
        })
    } catch {
        console.warn('[mobile-register-coach-free] onboarding email failed')
    }

    // W7.1: el alta desde la app no tiene navegador, así que `coach_registered` no puede salir del
    // cliente — sin esta línea las altas móviles no existen en el embudo de PostHog y `platform`
    // (el número que decide si algún día se justifica IAP) queda ciego. Va después del único punto
    // de rollback que queda (el `insert` fallido): solo se cuenta el alta que de verdad sobrevivió.
    // El correo caído ya NO revierte nada (W3.2), así que esa alta sí se cuenta: existe.
    await captureCoachRegisteredServer({
        coachId: authData.user.id,
        tier: selectedTier,
        method: 'email',
        platform: resolveRegistrationPlatform(request.headers),
        // W3.9: la atribución viaja también al evento, para poder leer el embudo por campaña sin
        // cruzar la tabla a mano.
        utmSource,
        utmCampaign,
    })

    // `uid` es la ÚNICA llave del reenvío del correo de confirmación desde la app
    // (`api/mobile/auth/resend-confirmation`): la app no tiene sesión hasta que el coach confirma,
    // así que sin este id la pantalla de "revisa tu email" no tenía forma de identificarse y un
    // correo perdido en spam mataba la cuenta. Espejo del `?uid=` que el registro web ya pone en la
    // URL de `/verify-email`. No es un secreto de sesión: no autoriza nada más que pedir que el
    // mismo correo salga de nuevo hacia la dirección que ya está en `auth.users`.
    return NextResponse.json({
        ok: true,
        uid: authData.user.id,
        // W3.2: EXPLÍCITO, no inferido. El cliente decide con esto si entra directo al panel o
        // pasa por la pantalla de verificación (`apps/mobile/lib/register-flow.ts`), y su
        // fail-safe es al revés: ausente ⇒ pantalla de verificación. Un binario viejo contra este
        // server ignora el campo y sigue mostrando la pantalla, donde «ya confirmé» ahora sí entra.
        status: subscriptionStatus,
        email: emailSan,
        slug,
        // `message` no lo pinta ninguna pantalla (el cliente usa `status`), pero es parte del
        // contrato de la respuesta: que no diga que hay que confirmar algo cuando la cuenta ya
        // nació activa.
        message:
            subscriptionStatus === 'active'
                ? 'Tu cuenta ya está lista.'
                : 'Revisa tu correo para confirmar tu cuenta.',
    })
}
