import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { NextResponse, type NextRequest } from 'next/server'
import { activateConfirmedFreeCoach } from '@/lib/auth/activate-confirmed-coach'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    // `magiclink`: lo emite el REENVÍO de confirmación (QA pre-campaña 17-08 — para un usuario ya
    // creado GoTrue rechaza `invite` y `signup`, así que el reenvío firma magiclink; verificarlo
    // confirma el email igual, y la activación de abajo hace el resto).
    const type = searchParams.get('type') as 'email' | 'recovery' | 'magiclink' | null

    if (!token_hash || !type) {
        return NextResponse.redirect(`${origin}/login?error=invalid_confirmation_link`)
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })

    if (error || !data.user) {
        return NextResponse.redirect(`${origin}/login?error=confirmation_expired`)
    }

    // Activación del coach Free pendiente — para TODOS los tipos, la recuperación de contraseña
    // incluida: GoTrue confirma el email en cualquier `verifyOtp` exitoso (`recoverVerify` también
    // marca `email_confirmed_at`). Hasta el 22-08 la rama `recovery` redirigía al reset ANTES de
    // este paso y un coach que abría «olvidé mi contraseña» en vez del link de confirmación quedaba
    // con auth confirmado, `coaches` en `pending_email` y sin bienvenida ni drip. El helper es
    // idempotente y espera los correos (Vercel congela la función al devolver el redirect).
    const activation = await activateConfirmedFreeCoach({
        admin: createServiceRoleClient(),
        userId: data.user.id,
        authUser: data.user,
        confirmedNow: true,
        appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? origin,
    })

    // Password recovery: land on the reset form with the recovery session active,
    // not on the dashboard. (Covers token_hash-style recovery links.)
    if (type === 'recovery') {
        const next = searchParams.get('next')
        const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/reset-password'
        return NextResponse.redirect(`${origin}${dest}`)
    }

    if (activation.activated) {
        return NextResponse.redirect(`${origin}/coach/dashboard?welcome=free`)
    }

    // Default: just redirect to dashboard (coach ya activo / otros tipos de confirmación)
    return NextResponse.redirect(`${origin}/coach/dashboard`)
}
