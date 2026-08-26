import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import { deviceFromUserAgent } from '@/lib/user-agent'
import { recordOnboardingEvent } from '@/services/coach/persona.service'
import { VIVE_TU_APP_STEP_KEY } from '@/services/onboarding/vive-tu-app.service'
import {
    parseVtaFrom,
    VTA_FROM_COOKIE,
    VTA_MODE_COOKIE,
    VTA_RETURN_COOKIE,
    vtaLabelCookieOptions,
    vtaReturnCookieOptions,
    type VtaMode,
} from '@/lib/auth/vive-tu-app-cookies'

/**
 * «Vive tu app» (onboarding v2, SPEC coach-onboarding-v2 §5): entrada del coach a SU app de alumno
 * como su alumno de ejemplo.
 *
 * `GET /vive-tu-app?t=<token_hash>&c=<slug|código>[&src=rn][&from=guia|builder]` verifica el magic
 * link del demo (emitido por `openViveTuAppAction` o por el endpoint móvil), deja la sesión del
 * ALUMNO en las cookies y cae en `/c/<c>/dashboard`, con la marca del coach.
 *
 * Por qué una ruta propia y no `/auth/confirm`: esa ruta es del alta del coach — tras verificar
 * manda a `/coach/dashboard`, y un usuario que no es coach termina en el alta OAuth. Acá el destino
 * es siempre el árbol del alumno y el identificador se valida, nunca se acepta un `next` libre.
 *
 * Cinturón: solo entra un usuario que sea alumno DEMO (`clients.is_demo`, columna que solo escribe
 * `service_role`) Y cuyo `coach_id` sea el dueño del `c=` de la URL. Cualquier otro token válido se
 * cierra (con alcance LOCAL) y vuelve al login del alumno.
 *
 * ESTE es el único lugar que sabe que el coach ENTRÓ de verdad (docs/specs/vive-tu-app-directo §2):
 * el evento `vive_tu_app_entered` se escribe acá, después del cinturón, con el `coach_id` que
 * viene de la fila del demo. `vive_tu_app_opened` («pidió el link») se conserva tal cual, con su
 * significado viejo, porque 65 usuarios ya lo emitieron. El paso 2 de la guía se tilda con este
 * evento, no con aquel: el 23-08 el funnel reportaba 100 % de un paso que convertía 33 %.
 *
 * ORDEN ÚNICO (SPEC §3, W2) y por qué no se puede reordenar: (1) `getUser()` con las cookies del
 * COACH, que `verifyOtp` está por pisar; (2) `verifyOtp` del demo; (3) cinturón, que recién acá
 * dice de quién es el demo; (4) magic link de vuelta del coach, best-effort; (5) cookies del viaje
 * sobre el redirect; (6) evento con el `mode` real.
 *
 * Nada del token (ni el del demo ni el del coach) ni del correo entra en el metadata ni en los logs.
 */
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/

/**
 * ¿El coach llegó por su código de invitación o por su slug? (`getCoachPublicIdentifier` prefiere
 * el código). Es una etiqueta del funnel, no un dato de nadie: los códigos son alfanuméricos en
 * MAYÚSCULAS y los slugs llevan minúsculas o guiones.
 */
function identifierKind(identifier: string): 'code' | 'slug' {
    return /^[A-Z0-9]+$/.test(identifier) ? 'code' : 'slug'
}

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const tokenHash = searchParams.get('t')
    const identifier = searchParams.get('c')

    if (!identifier || !IDENTIFIER_RE.test(identifier)) {
        return NextResponse.redirect(`${origin}/login`)
    }
    const loginUrl = `${origin}/c/${identifier}/login?error=vive_tu_app_expirado`
    if (!tokenHash) return NextResponse.redirect(loginUrl)

    const supabase = await createClient()

    // (1) Quién está logueado ANTES de verificar: `verifyOtp` escribe la sesión del demo sobre las
    // MISMAS cookies (`lib/supabase/server.ts` no bifurca el nombre), así que después de este punto
    // la sesión del coach ya no existe en este navegador. Es la única ventana para saber que el
    // coach dueño está acá y poder devolverlo con un toque.
    const { data: coachSession } = await supabase.auth.getUser()
    const coachUser = coachSession?.user ?? null

    // (2)
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (error || !data.user) return NextResponse.redirect(loginUrl)

    const admin = createServiceRoleClient()
    const { data: client } = await admin
        .from('clients')
        .select('id, is_demo, coach_id, full_name')
        .eq('id', data.user.id)
        .maybeSingle()

    // (3) Cinturón. `scope: 'local'` (V1.27): el global mata la sesión de ese usuario en TODOS sus
    // dispositivos, y acá el usuario recién verificado puede ser el propio coach o un alumno real
    // que tocó un link que no era para él — cerrarle la sesión del teléfono es un daño gratuito.
    if (!client?.is_demo || !client.coach_id) {
        await supabase.auth.signOut({ scope: 'local' })
        return NextResponse.redirect(loginUrl)
    }

    // (3b, V1.28) El `c=` de la URL tiene que ser la marca del MISMO coach dueño del demo. Sin esto
    // el cinturón solo validaba `is_demo`: un token de un demo ajeno se podía decorar con el `c=` de
    // otro coach y el visitante entraba a la app de ESE otro coach con una sesión que no le
    // pertenece. Redirect neutro (el mismo del link vencido): no confirma ni desmiente nada.
    const { data: urlCoach } = await admin
        .from('coaches')
        .select('id')
        .eq(coachIdentifierColumn(identifier), identifier)
        .maybeSingle()

    if (!urlCoach || urlCoach.id !== client.coach_id) {
        await supabase.auth.signOut({ scope: 'local' })
        return NextResponse.redirect(loginUrl)
    }

    // (4) Camino de vuelta. `src=rn` gana siempre: la app vuelve por deep link y emitir además un
    // magic link del coach que nadie va a consumir gastaría el slot de recovery de GoTrue (uno
    // solo, compartido) y dejaría una credencial viva 1 h sin dueño.
    const fromRn = searchParams.get('src') === 'rn'
    let returnToken: string | null = null
    if (!fromRn && coachUser?.id === client.coach_id && coachUser.email) {
        try {
            const { data: link } = await admin.auth.admin.generateLink({
                type: 'magiclink',
                email: coachUser.email,
            })
            returnToken = link?.properties?.hashed_token ?? null
        } catch {
            // Best-effort a propósito: si GoTrue falla, el coach cae en modo `remote` (sale por el
            // login) pero ENTRA igual. Nunca se rompe el viaje por el camino de vuelta.
            returnToken = null
        }
    }

    const mode: VtaMode = fromRn ? 'rn' : returnToken ? 'return' : 'remote'

    const response = NextResponse.redirect(`${origin}/c/${identifier}/dashboard`)

    // (5) Cookies del viaje. La de retorno solo existe cuando hay algo que consumir.
    if (returnToken) {
        response.cookies.set(
            VTA_RETURN_COOKIE,
            JSON.stringify({ t: returnToken, c: client.coach_id }),
            vtaReturnCookieOptions(),
        )
    }
    response.cookies.set(VTA_MODE_COOKIE, mode, vtaLabelCookieOptions())
    if (fromRn) {
        response.cookies.set(VTA_FROM_COOKIE, parseVtaFrom(searchParams.get('from')), vtaLabelCookieOptions())
    }

    // (6) Best-effort: `recordOnboardingEvent` traga su error con `console.warn`. Medir no puede
    // impedirle al coach ver su app —pero por eso mismo la falla del CHECK sería SILENCIOSA y
    // el paso 2 no se tildaría nunca: la migración del `event_type` va a LIVE antes del deploy
    // y se verifica con una consulta después (V1.11/V1.12).
    //
    // El espejo a PostHog (`vive_tu_app_entered` con `distinct_id` = coach) lo hace el propio
    // `recordOnboardingEvent` desde W8.5.2: capturarlo acá otra vez duplicaría cada ingreso y
    // rompería justo la métrica que esta spec define (`entered / opened` por `device`).
    await recordOnboardingEvent(admin, {
        coachId: client.coach_id,
        stepKey: VIVE_TU_APP_STEP_KEY,
        eventType: 'vive_tu_app_entered',
        metadata: {
            surface: fromRn ? 'rn' : 'web',
            device: deviceFromUserAgent(request.headers.get('user-agent')),
            mode,
            identifier_kind: identifierKind(identifier),
        },
    })

    return response
}
