import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { activateConfirmedFreeCoach } from '@/lib/auth/activate-confirmed-coach'
import { VerifyEmailContent } from './VerifyEmailContent'

/**
 * Sanación al aterrizar (22-08). El proxy manda acá a todo coach Free `pending_email` con sesión.
 * Si GoTrue YA confirmó su email —por el link de recuperación de contraseña, por «Continuar con
 * Google» con el mismo correo, por un magic-link abierto en otro navegador—, la fila de `coaches`
 * quedó atrás y esta pantalla era un callejón sin salida: «Revisa tu email» para un email ya
 * confirmado, y el reenvío contestando «ya confirmado». Acá se cierra la transición y el coach
 * entra al panel como si hubiera tocado el link correcto.
 *
 * Sin sesión (el aterrizaje normal desde el registro) no hay nada que sanar y se renderiza igual
 * que siempre. Nunca lanza: un fallo acá degrada a la pantalla de siempre, no a un 500.
 */
async function healConfirmedCoach(): Promise<boolean> {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user?.email_confirmed_at) return false

        const result = await activateConfirmedFreeCoach({
            admin: createServiceRoleClient(),
            userId: user.id,
            authUser: user,
            appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.eva-app.cl',
        })
        return result.activated
    } catch {
        // Sin PII en el log: vive en Vercel sin retención acotada.
        console.warn('[verify-email] heal failed')
        return false
    }
}

export default async function VerifyEmailPage() {
    const healed = await healConfirmedCoach()
    if (healed) redirect('/coach/dashboard?welcome=free')

    return (
        <Suspense>
            <VerifyEmailContent />
        </Suspense>
    )
}
