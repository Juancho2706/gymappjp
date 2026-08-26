import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rotatePasswordOnGoogleLink } from '@/lib/auth/google-link-rotation'

/**
 * W3.13b — la TERCERA puerta de la rotación anti-takeover (`lib/auth/google-link-rotation.ts`).
 *
 * POR QUÉ NO ALCANZABA `api/auth/google-link`. Ese gemelo autentica por COOKIE y lo llama el camino
 * post-Google del navegador (`lib/auth/post-google-auth.ts`). El binario RN entra con Google por su
 * cuenta: `apps/mobile/lib/auth/google-signin.ts` hace `supabase.auth.signInWithIdToken` con el
 * idToken del SDK nativo, así que no hay cookie, no pasa por la web y hasta hoy la víctima que
 * entraba con Google DESDE LA APP no disparaba ninguna rotación — el intruso conservaba su
 * contraseña sobre la cuenta de ella. Mismo helper, mismo efecto, otra puerta.
 *
 * AUTENTICACIÓN: el molde de `/api/mobile` que MUTA (clear-force-password,
 * complete-coach-onboarding): Bearer + `admin.auth.getUser(token)`, que es autoritativo y valida
 * revocación — nunca `jose`, que solo verifica la firma. El userId sale del token, jamás del cuerpo:
 * este endpoint no tiene parámetros y solo puede rotar la clave de SU PROPIO usuario.
 *
 * NO DEVUELVE DETALLE. Siempre `{ ok: true }` con token válido: si respondiera «roté» / «no roté»,
 * cualquiera con una sesión podría preguntarle al servidor si un correo ajeno tenía contraseña
 * previa. El resultado real vive en el log del servidor, en `coach_onboarding_events` y en PostHog.
 *
 * IDEMPOTENTE: la rotación se salta sola cuando `coaches.email_verified_at` ya está sellado (lo
 * sella la propia rotación), así que llamarlo dos veces —o llamarlo desde la app después de que la
 * web ya lo hizo— no rota dos veces.
 *
 * SIN rate-limit propio: no hay cuerpo que validar, no manda correos y el trabajo real está detrás
 * de un `getUser` autoritativo + la idempotencia de arriba; un intruso con la sesión de la víctima
 * ya perdió esta partida por otro lado.
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })

    // `lookup`: acá la fila `coaches` (si existe) no la escribió este request, así que la columna es
    // la fuente de verdad. Un usuario sin fila `coaches` lee `null` y, si además tiene las dos
    // identidades, se rota igual: la cuenta de auth es lo que hay que proteger.
    //
    // El guardián de «¿hay identidad de Google?» vive en el helper y lee las identidades con el
    // service-role, no lo que diga el cliente: una sesión creada con contraseña que hiciera POST acá
    // no puede autorrotarse la clave.
    await rotatePasswordOnGoogleLink({
        admin,
        userId: ud.user.id,
        verification: { source: 'lookup' },
        context: 'mobile_post_google_auth',
    })

    return NextResponse.json({ ok: true })
}
