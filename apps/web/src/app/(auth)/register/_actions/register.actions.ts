'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
    BILLING_CYCLE_CONFIG,
    getTierCapabilities,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    SALE_TIERS,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    isEmailTakenReason,
    normalizePlatformEmail,
    sanitizePlatformEmail,
} from '@/lib/auth/platform-email'
import { clientIpFromRequest } from '@/lib/rate-limit'
import { generateUniqueInviteCode } from '@/lib/coach/invite-code.server'
import { resendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import { sendFreeCoachOnboardingEmails } from '@/lib/email/free-coach-onboarding'
import { normalizeCouponCode } from '@/services/billing/coupons.normalize'
import { newMetaEventId, queueMetaCapiEvent } from '@/lib/meta/capi'
import { persistCheckoutIntent } from '@/lib/payments/checkout-intent'
import { resolveRegistrationUtm } from '@/lib/auth/registration-utm'

export type RegisterState = {
    error?: string
    /** Causa estable del rechazo (snake_case). Alimenta `register_failed` en PostHog. */
    code?: string
}

/**
 * Todo rechazo del alta sale por acá: log server-side + código estable para el cliente.
 *
 * Hueco que cierra: un alta rechazada no dejaba NINGÚN rastro. Caso medido el 20-08 01:43 UTC —
 * un visitante con `utm_source=meta` mandó `register_submitted` 3 veces en 28 s, el action devolvió
 * `{ error }` las 3 y no quedó nada: ni log, ni Sentry, ni evento. Pagamos ese clic y no sabemos
 * contra qué muro se estrelló.
 *
 * El mensaje al usuario NO cambia; el `code` es la causa real, la que se agrega en el funnel.
 * El log lleva SOLO el código: nunca email, nombre, contraseña ni IP (esto vive en los logs de
 * Vercel, que no tienen la retención acotada de un sistema de datos personales).
 */
function reject(code: string, error: string): RegisterState {
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
    const selectedTier = (formData.get('subscription_tier') as SubscriptionTier | null) ?? 'free'
    const selectedBillingCycle = (formData.get('billing_cycle') as BillingCycle | null) ?? 'monthly'
    // W3.9 (atribución del alta): los dos hidden inputs que planta `register/page.tsx` con lo que
    // venía en la URL del anuncio. Se SANEAN acá —vienen de un query param, o sea de cualquiera— y
    // los escribe el servidor en la fila del coach: la identidad anónima de PostHog se recrea por
    // sesión y por eso 24 de 25 personas quedaban con `$initial_utm_source = none`.
    // Retención declarada en el `COMMENT ON COLUMN` de la migración (dato personal, Ley 21.719:
    // vive lo que vive la cuenta y se borra con la fila).
    const { utmSource, utmCampaign } = resolveRegistrationUtm({
        utmSource: formData.get('utm_source'),
        utmCampaign: formData.get('utm_campaign'),
    })
    // Add-ons opcionales del signup (plan 05 F5.5): CSV de MODULE_KEYS. Se validan contra la
    // whitelist + coherencia D8 (nutrition_exchanges solo en tier con nutrición). El monto se
    // calcula SOLO server-side en create-preference; acá solo se decide qué módulos viajan.
    const rawAddons = (formData.get('addons') as string | null) ?? ''

    // Honeypot check — bots fill hidden fields, humans don't
    const honeypot = formData.get('website') as string
    if (honeypot) {
        return reject('honeypot', 'Algo salió mal. Intenta de nuevo en unos minutos.')
    }

    // Cloudflare Turnstile verification (only if secret key is configured)
    if (process.env.TURNSTILE_SECRET_KEY) {
        const turnstileToken = formData.get('cf-turnstile-response') as string
        if (!turnstileToken) {
            return reject('turnstile_missing', 'Verificación de seguridad requerida. Recarga la página e intenta de nuevo.')
        }
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: turnstileToken }),
        })
        const verifyData = await verifyRes.json() as { success: boolean }
        if (!verifyData.success) {
            return reject('turnstile_failed', 'Verificación de seguridad fallida. Intenta de nuevo.')
        }
    }

    const isTierValid = (VALID_TIERS as readonly string[]).includes(selectedTier)
    const isCycleValid = VALID_CYCLES.includes(selectedBillingCycle)
    const isFreeTier = selectedTier === 'free'

    if (!fullName || !email || !password || !brandName) {
        return reject('fields_missing', 'Todos los campos son obligatorios')
    }

    if (password.length < 8) {
        return reject('password_short', 'La contraseña debe tener al menos 8 caracteres')
    }

    if (!acceptLegal) {
        return reject('terms_not_accepted', 'Debes aceptar los términos de servicio y la política de privacidad.')
    }

    if (!acceptHealthData) {
        return reject('health_consent_missing', 'Debes aceptar el tratamiento de datos de salud para usar EVA (Ley 21.719, Art. 16).')
    }

    if (!isTierValid || !isCycleValid) {
        return reject('plan_invalid', 'Debes seleccionar un plan y una frecuencia válidos.')
    }

    if (!isFreeTier && !isBillingCycleAllowedForTier(selectedTier, selectedBillingCycle)) {
        return reject('cycle_unavailable', 'La frecuencia elegida no está disponible para ese plan.')
    }

    // Generate slug from brand name
    const baseSlug = brandName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

    if (RESERVED_SLUGS.has(baseSlug)) {
        return reject('brand_unavailable', 'Este nombre de marca no está disponible. Intenta con otro nombre.')
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
                return reject('free_ip_limit', 'No se pudo completar el registro. Si crees que es un error, contacta soporte.')
            }
        }
    }

    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: existingCoach } = await adminDb.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!existingCoach) break
        if (attempt === 7) {
            return reject('slug_generation_failed', 'No se pudo generar un identificador único para tu marca. Prueba con otro nombre.')
        }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }
    const inviteCode = await generateUniqueInviteCode(adminDb)

    const emailSan = sanitizePlatformEmail(email)
    const emailNorm = normalizePlatformEmail(email)
    const availability = await assertPlatformEmailAvailable(adminDb, email)
    if (!availability.ok) {
        // `reason` ya es una categoría (nunca el correo): `taken_*` colapsa a un solo código —
        // el copy no revela la categoría, y para el funnel «ya tiene cuenta» es una sola causa.
        // Las demás (invalid / blocked_domain / disposable / rpc_error) viajan separadas: un pico
        // de `email_rpc_error` es una caída nuestra, no un visitante que se equivocó.
        return reject(
            isEmailTakenReason(availability.reason) ? 'email_taken' : `email_${availability.reason}`,
            availability.error
        )
    }

    // ── W3.1 (D1 = A, autorizada por el owner el 26-08): el alta free ya no tiene muro de correo ──
    //
    // Antes era `email_confirm: !isFreeTier`: el tier pago auto-confirmaba (el pago prueba
    // identidad) y el free tenía que abrir el link para poder entrar. Ese muro es el que se retira:
    // el coach que llega del anuncio entra a su panel en el mismo minuto.
    //
    // CONSECUENCIA QUE NO SE PUEDE IGNORAR: este flag sella `auth.users.email_confirmed_at` EN LA
    // CREACIÓN, así que desde este deploy esa columna deja de distinguir a nadie. La señal de «esta
    // persona abrió su casilla» pasa a ser `coaches.email_verified_at` (W3.0), que este camino deja
    // NULL a propósito —nadie probó nada todavía— y llena `/auth/confirm` cuando el coach abre el
    // recordatorio. La higiene del drip (W3.8), el banner (W3.11) y el guardarraíl leen ESA columna.
    //
    // SEGUNDA CONSECUENCIA, cubierta por W3.13 en este mismo diff: con la identidad `email` naciendo
    // confirmada, Supabase ya no la borra al enlazar Google ⇒ quien registre primero el correo de
    // otra persona conservaría su contraseña sobre esa cuenta. La rotación anti-takeover
    // (`lib/auth/google-link-rotation.ts`) cierra eso y NO es opcional: viaja en el mismo tren.
    const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
        email: emailSan,
        password,
        email_confirm: true,
    })

    if (authError || !authData.user) {
        if (authError && isAuthDuplicateEmailMessage(authError.message)) {
            // Código propio (no `email_taken`): acá la RPC de disponibilidad dijo que SÍ y GoTrue
            // dijo que no. Es una carrera o un hueco del check — separado se ve, colapsado no.
            return reject('auth_email_taken', 'Este correo ya está registrado en la plataforma. Usa otro correo o inicia sesión si ya tienes cuenta.')
        }
        return reject('auth_create_failed', authError?.message || 'Error al crear la cuenta')
    }

    // Capture registration IP for free tier abuse detection
    let registrationIp: string | null = null
    if (isFreeTier) {
        const reqHeaders = await headers()
        const ip = clientIpFromRequest({ headers: reqHeaders } as any)
        registrationIp = ip !== 'unknown' ? ip : null
    }

    // Create coaches row
    const now = new Date().toISOString()
    const { error: coachError } = await adminDb
        .from('coaches')
        .insert({
            id: authData.user.id,
            full_name: fullName,
            brand_name: brandName,
            slug,
            invite_code: inviteCode,
            primary_color: '#1462DC',
            // W3.3: la marca nace PRENDIDA. Se escribe el VALOR en el alta en vez de mover el
            // `DEFAULT false` de la columna —una migración nueva sería legal, pero así queda
            // testeable y no depende del default—. Sin esto el coach nuevo entra a un panel con los
            // colores de EVA aunque acaba de escribir su marca, y el splash RN ni siquiera cruza en
            // el segundo arranque: `apps/mobile/lib/branding.ts:257-261` BORRA la caché de marca
            // cuando el valor es `false`.
            use_brand_colors_coach: true,
            // W3.9: atribución del alta, escrita solo por el servidor (la columna no tiene grant a
            // `authenticated`/`anon`). `null` explícito cuando el alta no trajo UTM.
            utm_source: utmSource,
            utm_campaign: utmCampaign,
            // ── A1 (ola checkout 25-08): NINGUNA alta nace bloqueada ni con un plan que no pagó ──────
            // Antes, un alta con tier pago se insertaba con `subscription_status='pending_payment'` +
            // el tier pago + su cupo, ANTES de cobrar un peso. `pending_payment` es bloqueo DURO sin
            // gracia (`lib/coach-subscription-gate.ts`): quien dudaba 30 s en MercadoPago y cerraba la
            // pestaña se quedaba SIN producto — ni panel, ni builder, nada. Medido en prod: ljfitness
            // (24-08) quedó lockeado y no volvió nunca; nexo-performance (25-08) volvió a los 55 s,
            // chocó con el gate y se AUTODEGRADÓ a Free para poder entrar. Elegir el plan pago era la
            // peor decisión que podía tomar un coach nuevo.
            //
            // Ahora TODA alta nace con la fila de un alta FREE (tier free, cupo free, provider
            // 'admin') y la INTENCIÓN de compra viaja aparte, en el intent durable de
            // `subscription_events` (ver `persistCheckoutIntent` más abajo) — el mismo mecanismo que
            // la Fase 1 de Flow ya usaba porque su rama free tampoco podía apoyarse en esta fila.
            // El tier pago lo escriben el webhook / confirm-subscription al CONFIRMAR el pago,
            // leyendo tier|ciclo del `external_reference` del preapproval. Nadie recibe un plan pago
            // sin pagarlo, y nadie pierde el producto por abandonar el checkout.
            //
            // W3.1 (b): TODA alta nace `active`. Hasta hoy el free nacía 'pending_email' y el click
            // en el correo era lo que lo activaba y disparaba bienvenida + drip
            // (`auth/confirm/route.ts`). Con D1 = A ese click deja de ser un requisito para entrar,
            // así que la transición `pending_email → active` YA NO EXISTE en las altas nuevas y los
            // correos se disparan más abajo, en este mismo action (W3.1 f).
            //
            // `proxy.ts:541` (el desvío a /verify-email de un `pending_email` free) NO se toca: las
            // filas que ya existen en LIVE con ese estado siguen su camino viejo. Nada retroactivo
            // — condición del owner del 26-08.
            subscription_status: 'active',
            subscription_tier: 'free',
            billing_cycle: 'monthly',
            // 'admin' (no el gateway): un alta sin cobro NO es una conversión. La RPC
            // `get_platform_trial_conversion_rate` cuenta como convertido a todo coach 'active' con
            // `payment_provider NOT IN ('beta','internal','admin')`; escribir 'mercadopago' acá haría
            // que cada registro pago ABANDONADO se leyera como venta. Lo pisa create-preference con
            // el gateway real cuando el coach efectivamente abre un checkout.
            payment_provider: 'admin',
            max_clients: getTierMaxClients('free'),
            health_data_consent_at: now,
            marketing_consent: acceptMarketing,
            // New coaches already know their invite code — skip the one-shot migration modal
            // (PublicCodeRequiredModal) intended only for legacy coaches without a code.
            onboarding_guide: {
                invite_code_confirmed: true,
                invite_code_confirmed_at: now,
            },
            // Anti-abuso del alta FREE (marca de trial usado + IP). Siguen atados a `isFreeTier`, es
            // decir al plan que el coach ELIGIÓ, no al tier con que nace la fila desde A1: el alta
            // paga es un lead de compra, no un trial gratuito, y meterla en el conteo de IP podría
            // rebotar a coaches legítimos de un mismo gimnasio comprando el mismo día. Consecuencia
            // conocida y aceptada: elegir un plan pago sigue esquivando el tope de 3 free por IP.
            ...(isFreeTier && { trial_used_email: emailNorm }),
            ...(registrationIp && { registration_ip: registrationIp }),
        })

    if (coachError) {
        // Rollback: delete the auth user
        await adminDb.auth.admin.deleteUser(authData.user.id)
        return reject('coach_insert_failed', coachError.message || 'Error al configurar el perfil de coach')
    }

    // Meta CompleteRegistration (CAPI). El `event_id` se genera UNA vez y viaja tambien al browser
    // por query param (`eid`) para que Meta deduplique el espejo del pixel — cruza SOLO
    // event_name + event_id. Fire-and-forget: si Meta falla o el token no existe, el registro sigue.
    const metaEventId = newMetaEventId()
    const queueMetaRegistration = () =>
        queueMetaCapiEvent({
            eventName: 'CompleteRegistration',
            eventId: metaEventId,
            eventSourceUrl: '/register',
            actionSource: 'website',
            userData: { email: emailSan, externalId: authData.user.id },
            customData: { content_name: selectedTier },
        }).catch(() => { /* nunca romper el registro por analytics */ })

    if (isFreeTier) {
        // ── W3.1 (c) + (d): el correo pasa a RECORDATORIO NO BLOQUEANTE y el rollback SE VA ──────
        //
        // Dos cosas cambian juntas y ninguna es opcional:
        //  (c) SIN `delete` de `coaches` + `deleteUser`. El bloque viejo borraba la cuenta entera
        //      cuando el correo no salía. Combinado con (d) —y con `email_confirm: true`— ese
        //      rollback borraría TODAS las altas free: GoTrue rechaza `signup` (e `invite`) para un
        //      usuario que YA existe (`lib/auth/send-coach-email-confirmation.ts:34-38`), y con el
        //      email auto-confirmado el usuario existe siempre. Este renglón es el que evita que
        //      D1 = A se coma el alta free entera.
        //  (d) `linkType: 'magiclink'` (o sea `resendCoachSignupConfirmationEmail`, no
        //      `sendCoachSignupConfirmationEmail`): es la única rama que GoTrue acepta para un
        //      usuario existente. Verificar ese magiclink confirma el correo igual y `/auth/confirm`
        //      llena `coaches.email_verified_at`, que es la señal de W3.8 / W3.11.
        // Su fallo NO revierte nada: la cuenta ya nació `active` y el coach entra igual. Espejo
        // exacto de lo que la ruta RN (`api/mobile/auth/register-coach-free`) ya hace en prod.
        const reminderSent = await resendCoachSignupConfirmationEmail({
            email: emailSan,
            coachName: fullName,
        })
        if (!reminderSent.ok) {
            // Solo la traza: el error de Resend/GoTrue repite la dirección de destino y estos logs
            // no tienen la retención acotada de un sistema de datos personales.
            console.warn('[register] recordatorio de confirmación no salió')
        }

        // ── W3.1 (f): bienvenida + drip se disparan ACÁ ──────────────────────────────────────────
        //
        // Antes los disparaba `/auth/confirm` en la transición `pending_email → active`; con el alta
        // naciendo `active` esa transición no existe (`activateConfirmedFreeCoach` corta con
        // `not_pending`, `lib/auth/activate-confirmed-coach.ts:90`) y sin esta llamada el coach free
        // de la web se quedaría sin bienvenida, sin drip y fuera de la audiencia de Resend.
        //
        // UNA SOLA BIENVENIDA aunque pase por los dos caminos: ese mismo corte en `not_pending` es
        // la idempotencia que se reusa — cuando el coach abra el recordatorio, `/auth/confirm`
        // sellará `email_verified_at` pero NO volverá a mandar nada. El drip además deduplica por el
        // ledger de correos.
        //
        // `await` porque el `redirect()` de abajo congela la invocación en Vercel y se lleva puesto
        // todo POST pendiente (medido el 19-08: 2 de 5 bienvenidas perdidas). `try/catch` como
        // cinturón: la fila ya está escrita, un fallo de correo no puede devolver «error» a alguien
        // que ya tiene cuenta y mandarlo a registrarse de nuevo.
        try {
            await sendFreeCoachOnboardingEmails({
                admin: adminDb,
                coachId: authData.user.id,
                email: emailSan,
                coachName: fullName,
                brandName,
                inviteCode,
                appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.eva-app.cl',
            })
        } catch {
            console.warn('[register] onboarding email failed')
        }

        await queueMetaRegistration()

        // ── W3.1 (e): sesión inmediata y al panel, sin pasar por /verify-email ───────────────────
        //
        // La atribución de Meta NO se toca: el `eid` viaja igual y el proxy arrastra `welcome`/`eid`
        // hasta la pantalla de persona y de ahí a `/coach/guia`, donde `RegistrationMirror` dispara
        // el espejo del pixel (`CompleteRegistration`, mismo id que el CAPI) y `coach_registered`.
        // Es el MISMO par de eventos que hasta hoy emitía `/verify-email`, en el nuevo aterrizaje.
        const supabase = await createClient()
        await supabase.auth.signInWithPassword({ email: emailSan, password })

        redirect(`/coach/dashboard?welcome=free&eid=${encodeURIComponent(metaEventId)}`)
    }

    // Paid tier: email auto-confirmed; sign in immediately and proceed to payment
    const supabase = await createClient()
    await supabase.auth.signInWithPassword({ email: emailSan, password })

    // Sanitiza los add-ons: solo MODULE_KEYS válidos; nutrition_exchanges solo si el tier tiene
    // nutrición (D8). El cálculo del monto y la validación dura se repiten en create-preference.
    const canUseNutrition = getTierCapabilities(selectedTier).canUseNutrition
    const sanitizedAddons = Array.from(
        new Set(
            rawAddons
                .split(',')
                .map((s) => s.trim())
                .filter((s): s is ModuleKey => (MODULE_KEYS as readonly string[]).includes(s))
                .filter((k) => (k === 'nutrition_exchanges' ? canUseNutrition : true))
        )
    )
    const addonsParam = sanitizedAddons.length > 0 ? `&addons=${encodeURIComponent(sanitizedAddons.join(','))}` : ''

    // Código de descuento (REGISTER-CODE): solo se SANEA y se threadea a /processing — NO se canjea acá
    // (el canje + disclosure SERNAC + consentimiento ocurren en /processing, antes del primer cobro).
    const couponCode = normalizeCouponCode((formData.get('coupon_code') as string | null) ?? '')
    const couponParam = couponCode ? `&coupon=${encodeURIComponent(couponCode)}` : ''

    // ── A1: la INTENCIÓN de compra, ahora que la fila del coach nace free ────────────────────────
    // La fila `coaches` ya no dice qué vino a comprar este coach (nace free+active, arriba). Sin
    // este intent, un alta paga abandonada queda indistinguible de un alta free: no sabríamos qué
    // ofrecerle en la recuperación ni contra qué plan medir el embudo. Mismo mecanismo/tabla que la
    // Fase 1 de Flow, en su propio canal (`signup_checkout_intent:<coachId>`), así que no pisa ni
    // es pisado por el intent del checkout.
    //
    // BEST-EFFORT a propósito: el cobro NO depende de esta fila. El tier/ciclo viajan en el query
    // hacia /processing y, sobre todo, el `external_reference` del preapproval (`coachId|tier|cycle`)
    // es la fuente de verdad que leen webhook y confirm-subscription. Un fallo acá sería un rastro
    // perdido, jamás una cuenta a medio crear: por eso NO se hace rollback del alta.
    const intentPersisted = await persistCheckoutIntent(adminDb, {
        coachId: authData.user.id,
        channel: 'signup',
        provider: process.env.PAYMENT_PROVIDER ?? 'mercadopago',
        intent: {
            tier: selectedTier,
            cycle: selectedBillingCycle,
            addons: sanitizedAddons,
            coupon: couponCode || null,
        },
    })
    if (!intentPersisted.ok) {
        // Solo el código, nunca datos del coach (misma regla que `reject`): estos logs no tienen la
        // retención acotada de un sistema de datos personales.
        console.error('[register] checkout_intent_persist_failed', intentPersisted.error)
    }

    // Tier pago: la cuenta ya existe → CompleteRegistration igual. No hay espejo en el browser
    // (el redirect va a /coach/subscription/processing), asi que este evento entra solo por CAPI.
    await queueMetaRegistration()

    const selectedCycleLabel = BILLING_CYCLE_CONFIG[selectedBillingCycle].label.toLowerCase()
    redirect(
        `/coach/subscription/processing?from=register&tier=${encodeURIComponent(selectedTier)}&cycle=${encodeURIComponent(selectedBillingCycle)}&plan=${encodeURIComponent(selectedCycleLabel)}${addonsParam}${couponParam}`
    )
}
