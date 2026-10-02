import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import { isDisposableEmail, normalizePlatformEmail } from '@/lib/auth/platform-email'
import { generateUniqueInviteCode } from '@/lib/coach/invite-code.server'
import { clientIpFromRequest, jsonRateLimited, rateLimitSignup } from '@/lib/rate-limit'
import { sendFreeCoachOnboardingEmails } from '@/lib/email/free-coach-onboarding'
import { captureCoachRegisteredServer } from '@/lib/posthog/registration-events'
import { resolveRegistrationPlatform } from '@/lib/posthog/registration'
import { appSignupSurface } from '@/lib/auth/signup-surface'
import { rotatePasswordOnGoogleLink } from '@/lib/auth/google-link-rotation'

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

    // Cinturón ALUMNO (02-10), gemelo de `oauth_session_is_client` en `complete.actions.ts`: el alumno
    // que toca «Crear cuenta» → Google en la app llega acá con SU usuario. El insert de abajo crearía
    // una fila `coaches` con el id de un alumno (doble rol, imposible de deshacer desde el producto) y
    // la rotación le cerraría todas las sesiones. Hasta el 02-10 lo frenaba de casualidad la rotación
    // temprana de `api/mobile/auth/google-link` (mataba la sesión y esto respondía 401); desde que el
    // helper no rota sin fila `coaches`, el freno tiene que ser explícito. Error de lectura ⇒ no se
    // inserta (fail-closed): un alta de coach puede reintentarse, un doble rol no se deshace.
    // `client_memberships` además de `clients`: la cuenta de alumno multi-workspace cuelga de ahí.
    const [clientRow, membershipRows] = await Promise.all([
        adminDb.from('clients').select('id').eq('id', user.id).maybeSingle(),
        adminDb.from('client_memberships').select('id').eq('account_id', user.id).limit(1),
    ])
    const clientLookupError = clientRow.error ?? membershipRows.error
    const sessionIsClient = Boolean(clientRow.data) || (membershipRows.data?.length ?? 0) > 0
    if (clientLookupError) {
        return NextResponse.json(
            { error: 'No pudimos verificar tu cuenta. Intenta de nuevo en unos minutos.', code: 'CLIENT_CHECK_FAILED' },
            { status: 503 }
        )
    }
    if (sessionIsClient) {
        // Google para alumnos sigue DIFERIDO (decisión CEO 2026-06-21): la sesión de Google que la app
        // acaba de abrir se revoca acá (solo ESA sesión, scope local — las de contraseña del alumno en
        // otros dispositivos siguen). Sin esto, cerrar y reabrir la app la dejaba adentro con Google
        // sin pasar por ningún OTA. Fail-silent: el 409 sale igual.
        try {
            await adminDb.auth.admin.signOut(token, 'local')
        } catch {
            // Silencio deliberado: sin PII ni token en logs.
        }
        return NextResponse.json(
            {
                error: 'Este correo ya entrena con un coach en EVA, así que no puede crear una cuenta de coach. Entra con tu correo y tu contraseña desde el inicio; si no la recuerdas, recupérala ahí mismo.',
                code: 'SESSION_IS_CLIENT',
            },
            { status: 409 }
        )
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
        primary_color: '#1462DC',
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
        // B4: iOS o Android, para el embudo por superficie.
        signup_surface: appSignupSurface(resolveRegistrationPlatform(request.headers)),
    })

    if (coachError) {
        return NextResponse.json(
            { error: coachError.message || 'Error al configurar el perfil de coach.', code: 'COACH_CREATE_FAILED' },
            { status: 500 }
        )
    }

    // W3.13 — rotación anti-takeover en el ALTA desde la app, mismo contrato que el primer call site
    // (`coach/onboarding/complete/_actions/complete.actions.ts`). Hasta el 02-10 este caso lo cubría
    // `api/mobile/auth/google-link` al entrar con Google: sin fila `coaches` rotaba igual. Desde que
    // el helper no rota sin fila `coaches` (caso Carolina/Movens: al alumno se le rotaba la clave en
    // cada intento), el aviso de entrada ya no alcanza a quien todavía no es coach, así que la rotación
    // va acá, cuando la fila nace. Después del insert por la FK de `coach_onboarding_events`; estado
    // `known: null` porque antes de este request no había fila ni casilla probada. El helper solo
    // actúa si el auth user ya tenía identidad `email` además de Google, y nunca lanza.
    await rotatePasswordOnGoogleLink({
        admin: adminDb,
        userId: user.id,
        verification: { source: 'known', emailVerifiedAt: null },
        context: 'mobile_oauth_onboarding',
    })

    // Alta por Google DESDE LA APP: nace `active`, nunca pasa por `/auth/confirm` y hasta hoy era el
    // ÚNICO camino de alta sin bienvenida ni serie de correos (W2.8 del embudo Free→Pro: causa (4),
    // la que seguía abierta). Mismo helper y mismos argumentos que la rama free de
    // `coach/onboarding/complete/_actions/complete.actions.ts`.
    //
    // `await` por la razón de siempre: Vercel congela la invocación al devolver la respuesta y se
    // lleva puesto cualquier POST a Resend pendiente. El helper no lanza (allSettled adentro); el
    // try/catch es el cinturón: un fallo de correo JAMÁS puede convertir un alta exitosa en 500.
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
        console.warn('[complete-coach-onboarding] onboarding email failed')
    }

    // W7.1: alta por Google DESDE LA APP — el camino de menor fricción y el más invisible. No hay
    // navegador que emita `coach_registered`, y el hueco del 29 % de altas sin evento (21-08) vive
    // justo acá. `method: 'google'` para poder separarlo del alta con contraseña.
    await captureCoachRegisteredServer({
        coachId: user.id,
        tier: selectedTier,
        method: 'google',
        platform: resolveRegistrationPlatform(request.headers),
    })

    return NextResponse.json({ ok: true, slug })
}
