import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'

type Db = SupabaseClient<Database>

/**
 * W3.13 (`docs/specs/flujo-coach-nuevo`) — el pre-account takeover que abre D1 = A, cerrado.
 *
 * QUÉ ABRE D1 = A. Hasta hoy el alta free nacía con `email_confirm: false`, y eso nos protegía por
 * accidente: Supabase borra las identidades **sin confirmar** al enlazar una nueva, así que si un
 * intruso registraba primero el correo de la víctima con contraseña y después ella entraba con
 * Google, la identidad `email` del intruso —y su contraseña— desaparecían solas. Con W3.1 el alta
 * free nace CONFIRMADA: la identidad `email` ya no se borra, Google se enlaza al MISMO usuario y el
 * intruso conserva acceso por contraseña sobre la cuenta de la víctima. El enlace automático por
 * correo NO es configurable en Supabase (resuelto G-AUTH el 23-08), así que la única cura es
 * código nuestro: esto.
 *
 * REGLA (la del TASKS, sin ampliar): cuando alguien entra con Google, su usuario **ya tenía**
 * identidad `email` y **`coaches.email_verified_at IS NULL`** —o sea: nadie probó nunca esa
 * casilla—, se rota la contraseña a un valor aleatorio que nadie conoce, se marca el correo como
 * verificado (Google SÍ probó la casilla) y se deja rastro.
 *
 * POR QUÉ `email_verified_at` NO NULO NO ROTA JAMÁS. Es la condición explícita del owner del 26-08
 * («la gente que ya está registrada no los fastidies»): el backfill de la migración
 * `20260826171119_coaches_email_verified_at.sql` dejó no-nula a toda cuenta que alguna vez abrió su
 * link, así que todos los coaches previos a D1 = A quedan fuera de esta rotación por construcción.
 * También es lo correcto en seguridad: si el correo está probado, la contraseña la puso el dueño.
 *
 * EFECTO. El intruso pierde el acceso por contraseña (y no puede recuperarlo: el reset va al correo
 * de la víctima). El coach legítimo que se registró con clave y después entra con Google sigue
 * entrando por Google, y ahora SÍ puede resetear su clave porque su correo quedó verificado.
 *
 * DOS CALL SITES, uno solo de código: el alta por Google (`complete.actions.ts`, cuando el auth
 * user existía y la fila `coaches` no) y el endpoint `api/auth/google-link` que llama el camino
 * post-Google de cliente (donde la fila `coaches` SÍ existe y `completeOAuthOnboarding` no corre).
 * Ver el comentario de `verification` para por qué el estado se puede pasar en vez de leerlo.
 */
export type GoogleLinkRotationResult =
    | { rotated: true }
    | {
          rotated: false
          reason:
              | 'no_user'
              | 'no_google_identity'
              | 'no_email_identity'
              | 'already_verified'
              | 'rotate_failed'
      }

/**
 * Estado de `coaches.email_verified_at` ANTES de esta operación.
 *
 * `lookup` lee la columna (el caso del endpoint: la fila ya existe y no la escribió este request).
 *
 * `known` existe por el alta por Google: ese camino INSERTA la fila con `email_verified_at = now`
 * (W3.0 c) en el mismo request, así que si acá se leyera la columna DESPUÉS del insert se vería
 * «ya verificado» y no se rotaría nunca — justo en el caso que motiva la tarea (auth user viejo con
 * contraseña + fila `coaches` nueva). Ese caller pasa `null` explícito porque sabe que, antes de su
 * propio insert, no había fila ni casilla probada.
 */
export type GoogleLinkVerificationState =
    | { source: 'lookup' }
    | { source: 'known'; emailVerifiedAt: string | null }

/** De dónde vino la rotación. Solo para telemetría; jamás vuelve al cliente. */
export type GoogleLinkRotationContext = 'oauth_onboarding' | 'post_google_auth' | 'mobile_post_google_auth'

/**
 * 32 bytes de aleatoriedad (256 bits) en hex = 64 caracteres.
 *
 * El contrato pide «32+ bytes»; se queda en 32 y no más porque GoTrue hashea con bcrypt y rechaza
 * contraseñas de más de 72 caracteres — 48 bytes en hex (96) rebotarían y la rotación fallaría en
 * silencio justo cuando importa. Web Crypto (no `node:crypto`) para no atarse al runtime.
 */
function randomPassword(): string {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** `step_key` es `text` sin CHECK; se usa uno propio para no ensuciar los pasos de la guía. */
const AUDIT_STEP_KEY = 'security'
const AUDIT_EVENT_TYPE = 'google_link_rotated_password'

export async function rotatePasswordOnGoogleLink(params: {
    /** Service-role: rotar una contraseña y escribir `email_verified_at` no lo puede hacer nadie más. */
    admin: Db
    userId: string
    verification: GoogleLinkVerificationState
    context: GoogleLinkRotationContext
}): Promise<GoogleLinkRotationResult> {
    const { admin, userId } = params

    // Las identidades se leen con el service-role y no del objeto de sesión del cliente: es la
    // fuente de verdad de GoTrue y no depende de qué haya cacheado el navegador.
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
    const user = userData?.user
    if (userError || !user) return { rotated: false, reason: 'no_user' }

    const providers = new Set((user.identities ?? []).map((identity) => identity.provider))

    // Sin identidad de Google no hay enlace que auditar: este helper es el guardián del enlace, no
    // un rotador de contraseñas de propósito general. Con esto, un caller equivocado (o un POST al
    // endpoint desde una sesión creada con contraseña) no puede rotarle la clave a nadie.
    if (!providers.has('google')) return { rotated: false, reason: 'no_google_identity' }

    // Sin identidad `email` no hay contraseña previa: el alta por Google normal cae acá y no toca
    // nada. Es el 99 % de los casos.
    if (!providers.has('email')) return { rotated: false, reason: 'no_email_identity' }

    let emailVerifiedAt: string | null = null
    if (params.verification.source === 'known') {
        emailVerifiedAt = params.verification.emailVerifiedAt
    } else {
        const { data: coach } = await admin
            .from('coaches')
            .select('email_verified_at')
            .eq('id', userId)
            .maybeSingle()
        emailVerifiedAt = coach?.email_verified_at ?? null
    }

    // Idempotencia: la propia rotación deja `email_verified_at` no nulo, así que un segundo intento
    // (doble click, reintento del cliente, dos pestañas) sale por acá sin tocar nada.
    if (emailVerifiedAt) return { rotated: false, reason: 'already_verified' }

    const { error: rotateError } = await admin.auth.admin.updateUserById(userId, {
        password: randomPassword(),
    })
    if (rotateError) {
        // Sin PII: estos logs viven en Vercel, sin la retención acotada de un sistema de datos
        // personales. El mensaje de GoTrue puede repetir la dirección del usuario.
        console.error('[google-link-rotation] no se pudo rotar la contraseña')
        return { rotated: false, reason: 'rotate_failed' }
    }

    // Google probó la casilla ⇒ el correo queda verificado. `.is(null)` mantiene el primer sello:
    // la columna dice CUÁNDO se probó, no cuándo se miró por última vez.
    const { error: stampError } = await admin
        .from('coaches')
        .update({ email_verified_at: new Date().toISOString() })
        .eq('id', userId)
        .is('email_verified_at', null)
    if (stampError) {
        console.error('[google-link-rotation] email_verified_at no se pudo sellar')
    }

    // Rastro en la tabla + PostHog. NO se revierte nada si falla: la contraseña ya está rotada y
    // esa es la parte que protege a la víctima; el rastro es auditoría.
    //
    // ⚠ `coach_onboarding_events.event_type` es un CHECK CERRADO (13 valores hoy, migración
    // `20260826044211`). `google_link_rotated_password` NO está en la lista: hasta que se aplique
    // la migración aditiva que lo agrega, este insert rebota con 23514 y solo queda el evento de
    // PostHog. Se tolera a propósito —una auditoría caída no puede dejar viva la contraseña de un
    // intruso— y el warn de abajo es la señal de que la migración todavía falta.
    const { error: eventError } = await admin.from('coach_onboarding_events').insert({
        coach_id: userId,
        step_key: AUDIT_STEP_KEY,
        event_type: AUDIT_EVENT_TYPE,
        metadata: { context: params.context },
    })
    if (eventError) {
        console.warn('[google-link-rotation] evento de auditoría rechazado:', eventError.code ?? 'unknown')
    }

    // `distinctId` = el coach, como pide el contrato. Sin PII en las propiedades.
    await capturePostHogServerEvent({
        event: AUDIT_EVENT_TYPE,
        distinctId: userId,
        properties: { context: params.context },
    })

    return { rotated: true }
}
