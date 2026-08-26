import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import {
    resendCoachEmailVerification,
    type ResendVerificationFailureCode,
} from '@/lib/auth/resend-verification'

/**
 * POST /api/mobile/auth/resend-verification — el botón «Reenviar correo» del banner de
 * verificación, desde la APP (FCN W3.11, puerta RN).
 *
 * El agujero que cierra: bajo D1 = A la cuenta free nace ACTIVA con `email_confirm: true`, así que
 * un dominio mal tipeado deja al coach adentro y sin forma de recuperar su clave. La web ya tenía
 * el banner con su botón; el binario RN no tenía a quién pedirle el reenvío — el otro endpoint
 * (`resend-confirmation`) exige `pending_email` y le contestaría «ya está confirmado» justo a esta
 * persona.
 *
 * AUTENTICACIÓN: el molde de `/api/mobile` que MUTA (google-link, clear-force-password,
 * complete-coach-onboarding): Bearer + `admin.auth.getUser(token)`, que es autoritativo y valida
 * revocación — nunca `jose`, que solo verifica la firma. El userId Y EL EMAIL DESTINO salen del
 * token/`auth.users`, jamás del cuerpo: este endpoint no tiene parámetros, así que no puede
 * convertirse en el emisor de magic-links contra cuentas ajenas que documenta
 * `lib/auth/resend-confirmation.ts`.
 *
 * TODO lo demás (limitador por usuario, puerta `email_verified_at IS NULL`, ledger de 60 s / 5 en
 * 24 h compartido con la web, envío) es el MISMO núcleo del server action del panel:
 * `lib/auth/resend-verification.ts`. El cupo es de la persona, no de la pantalla.
 *
 * POR QUÉ ACÁ SÍ SE DISTINGUEN LOS ERRORES (y en `resend-confirmation` no): ese endpoint es
 * ANÓNIMO y solo tiene un `uid`, así que cualquier respuesta distinta de 200 sería un oráculo de
 * «este uid existe y está sin confirmar». Acá el llamador ya probó ser el dueño de la cuenta con un
 * token válido: contarle el estado de SU PROPIO correo no le revela nada que no pueda ver en su
 * panel. Y el banner necesita saberlo — con `ALREADY_VERIFIED` se apaga solo.
 *
 * CERO CTA de pago (regla de tiendas): esto solo manda un correo.
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

/** Copy del móvil donde el de la web no aplica («Recarga la página» no existe en un teléfono). */
const MOBILE_ERROR: Partial<Record<ResendVerificationFailureCode, string>> = {
    already_verified: 'Tu correo ya está verificado.',
}

/** Status por motivo. El 429 es el único que trae `Retry-After`. */
const STATUS: Record<ResendVerificationFailureCode, number> = {
    rate_limited: 429,
    throttled: 429,
    already_verified: 409,
    lookup_failed: 500,
    send_failed: 502,
}

const CODE: Record<ResendVerificationFailureCode, string> = {
    rate_limited: 'RATE_LIMIT',
    throttled: 'RATE_LIMIT',
    already_verified: 'ALREADY_VERIFIED',
    lookup_failed: 'LOOKUP_FAILED',
    send_failed: 'SEND_FAILED',
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })

    const email = ud.user.email
    // Un usuario de GoTrue sin correo (identidad solo por teléfono/OAuth sin email) no tiene destino
    // posible: no es un fallo del servidor ni algo que reintentar.
    if (!email) {
        return NextResponse.json(
            { error: 'Tu cuenta no tiene un correo asociado.', code: 'MISSING_EMAIL' },
            { status: 409 }
        )
    }

    const result = await resendCoachEmailVerification({
        admin,
        userId: ud.user.id,
        email,
        surface: 'mobile',
    })
    if (result.ok) return NextResponse.json({ ok: true })

    const status = STATUS[result.code]
    const retryAfter = status === 429 ? Math.max(1, Math.ceil(result.retryAfterSeconds ?? 60)) : null

    return NextResponse.json(
        {
            error: MOBILE_ERROR[result.code] ?? result.error,
            code: CODE[result.code],
            ...(retryAfter == null ? {} : { retryAfter }),
        },
        {
            status,
            ...(retryAfter == null ? {} : { headers: { 'Retry-After': String(retryAfter) } }),
        }
    )
}
