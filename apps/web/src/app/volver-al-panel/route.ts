import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getCoachPublicIdentifier } from '@/lib/coach/public-identifier'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import {
    clearVtaCookies,
    parseVtaReturnCookie,
    VTA_RETURN_COOKIE,
} from '@/lib/auth/vive-tu-app-cookies'

/**
 * «Volver a mi panel» (docs/specs/vive-tu-app-directo §3, D1 = A).
 *
 * El coach entró a su app de alumno como su alumno de ejemplo y `verifyOtp` le pisó la sesión de
 * coach en ESTE navegador (las cookies de Supabase son una sola por host). Este handler es el
 * camino de vuelta de un toque: consume el magic link del propio coach que `/vive-tu-app` guardó en
 * `eva_vta_return` (httpOnly, `path` restringido, un solo uso) y lo devuelve a `/coach/guia`.
 *
 * **Solo POST.** Un `GET` consumiría el token con un prefetch, con un `<img>` o con la primera
 * navegación de un bot: el token es una credencial completa del coach durante ≤ 1 h. `GET` → 405.
 *
 * Ramas, en este orden (el orden ES el contrato):
 *  (a) La sesión ya es la del coach dueño (volvió por otra pestaña) → `/coach/guia` SIN consumir.
 *  (b) Hay sesión y no es el demo de ese coach (un alumno real usa el mismo navegador) → login del
 *      alumno, SIN consumir: nadie que no sea el dueño gasta el token.
 *  (c) Sin sesión (tocó «Cerrar sesión») o es el demo del coach → `verifyOtp` PRIMERO. Si sale bien,
 *      la sesión del coach queda escrita sobre la del demo y vuelve a la guía. Si el token venció o
 *      ya se usó (GoTrue comparte el slot con recovery: un reset pedido durante el demo lo mata), la
 *      sesión del demo NO se toca y el banner pasa a modo `remote` con `?volver=vencido`.
 *
 * En TODAS las ramas se borran las tres cookies del viaje repitiendo su `path` (`clearVtaCookies`):
 * un `set(name, '', { maxAge: 0 })` sin `path` borra otra cookie y deja la credencial viva.
 */

/** 303 = «mirá este otro recurso con un GET»: la respuesta correcta a un POST de formulario. */
function seeOther(url: string): NextResponse {
    return NextResponse.redirect(url, 303)
}

export async function GET() {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

export async function POST(request: NextRequest) {
    const { origin } = new URL(request.url)
    const payload = parseVtaReturnCookie(request.cookies.get(VTA_RETURN_COOKIE)?.value)

    // Sin cookie no hay viaje que cerrar: el login del coach con la explicación honesta.
    if (!payload) {
        return clearVtaCookies(seeOther(`${origin}/login?error=vive_tu_app_volver`))
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // (a) El coach ya está de vuelta (dos pestañas): no se gasta el token, se vence solo.
    if (user?.id === payload.c) {
        return clearVtaCookies(seeOther(`${origin}/coach/guia`))
    }

    const admin = createServiceRoleClient()

    // Identificador público del coach del viaje: es el que arma las rutas del árbol del alumno.
    // Se lee con `service_role` porque acá la sesión viva puede ser la del demo (o ninguna), y
    // ninguna de las dos tiene lectura garantizada de la ficha del coach.
    const { data: coachRow } = await admin
        .from('coaches')
        .select('id, slug, invite_code')
        .eq('id', payload.c)
        .maybeSingle()
    const identifier = getCoachPublicIdentifier(coachRow)
    const studentBase = identifier ? `${origin}/c/${encodeURIComponent(identifier)}` : null

    // (b) Hay sesión y no es el demo de este coach → es un alumno real (o un usuario ajeno) en el
    // mismo navegador. Su sesión no se toca y el token queda intacto para el dueño.
    if (user) {
        const { data: clientRow } = await admin
            .from('clients')
            .select('id, coach_id, is_demo')
            .eq('id', user.id)
            .maybeSingle()
        const isDemoOfCoach = clientRow?.is_demo === true && clientRow.coach_id === payload.c
        if (!isDemoOfCoach) {
            return clearVtaCookies(seeOther(studentBase ? `${studentBase}/login` : `${origin}/login`))
        }
    }

    // (c) Sin sesión o el demo del coach: verificar PRIMERO. Solo si el token sirve se pisa la
    // sesión del demo con la del coach.
    const { error } = await supabase.auth.verifyOtp({ token_hash: payload.t, type: 'magiclink' })

    if (error) {
        return clearVtaCookies(
            seeOther(studentBase ? `${studentBase}/dashboard?volver=vencido` : `${origin}/login?error=vive_tu_app_volver`),
        )
    }

    // `distinctId` = el coach; `mode` = cómo volvió. Sin token, sin correo, sin nada del demo:
    // la cookie de retorno es una credencial y no entra en analítica (SPEC §3, regla 5).
    await capturePostHogServerEvent({
        event: 'vive_tu_app_returned',
        distinctId: payload.c,
        properties: { mode: 'return', surface: 'web' },
    })

    return clearVtaCookies(seeOther(`${origin}/coach/guia?desde=vive-tu-app`))
}
