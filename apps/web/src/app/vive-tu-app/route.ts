import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * «Vive tu app» (onboarding v2, SPEC coach-onboarding-v2 §5): entrada del coach a SU app de alumno
 * como su alumno de ejemplo.
 *
 * `GET /vive-tu-app?t=<token_hash>&c=<slug|código>` verifica el magic link del demo (emitido por
 * `openViveTuAppAction` con `generateLink`), deja la sesión del ALUMNO en las cookies y cae en
 * `/c/<c>/dashboard`, con la marca del coach.
 *
 * Por qué una ruta propia y no `/auth/confirm`: esa ruta es del alta del coach — tras verificar
 * manda a `/coach/dashboard`, y un usuario que no es coach termina en el alta OAuth. Acá el destino
 * es siempre el árbol del alumno y el identificador se valida, nunca se acepta un `next` libre.
 *
 * Cinturón: solo entra un usuario que sea alumno DEMO (`clients.is_demo`, columna que solo escribe
 * `service_role`). Cualquier otro token válido se cierra y vuelve al login del alumno.
 */
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/

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
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (error || !data.user) return NextResponse.redirect(loginUrl)

    const admin = createServiceRoleClient()
    const { data: client } = await admin
        .from('clients')
        .select('id, is_demo')
        .eq('id', data.user.id)
        .maybeSingle()

    if (!client?.is_demo) {
        await supabase.auth.signOut()
        return NextResponse.redirect(loginUrl)
    }

    return NextResponse.redirect(`${origin}/c/${identifier}/dashboard`)
}
