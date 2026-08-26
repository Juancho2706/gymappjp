import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rotatePasswordOnGoogleLink } from '@/lib/auth/google-link-rotation'

/**
 * W3.13 — el SEGUNDO call site de la rotación anti-takeover (`lib/auth/google-link-rotation.ts`).
 *
 * POR QUÉ HACE FALTA ESTE ENDPOINT Y NO ALCANZA `complete.actions.ts`. En el escenario del ataque
 * la fila `coaches` **ya existe** (el intruso pasó por `/register`, que la inserta), así que
 * `completeOAuthOnboarding` NO corre — lo documenta el propio repo en
 * `lib/auth/activate-confirmed-coach.ts:16-18`. El camino post-Google real es de CLIENTE
 * (`auth/exchange/AuthExchangeClient.tsx` y `components/auth/GoogleSignInButton.tsx`, los dos vía
 * `lib/auth/post-google-auth.ts`, que es `'use client'`) y desde ahí no se puede rotar nada: el
 * `service_role` no existe en el navegador. De ahí este endpoint, llamado una vez desde el mismo
 * punto donde hoy se resuelve el destino post-Google.
 *
 * NO DEVUELVE DETALLE. Siempre `{ ok: true }` con sesión válida: si respondiera «roté» / «no roté»,
 * cualquiera con una sesión podría preguntarle al servidor si un correo ajeno tenía contraseña
 * previa. El resultado real vive en el log del servidor, en `coach_onboarding_events` y en PostHog.
 *
 * IDEMPOTENTE: la rotación se salta sola cuando `coaches.email_verified_at` ya está sellado (lo
 * sella la propia rotación), así que llamarlo dos veces no rota dos veces.
 *
 * La AUTORIZACIÓN es la sesión: solo puede disparar la rotación de SU PROPIO usuario. No hay
 * parámetros — el id sale de la cookie, nunca del cuerpo.
 */
export async function POST() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // `lookup`: acá la fila `coaches` (si existe) no la escribió este request, así que la columna
    // es la fuente de verdad. Un usuario sin fila `coaches` lee `null` y, si además tiene las dos
    // identidades, se rota igual: la cuenta de auth es lo que hay que proteger.
    await rotatePasswordOnGoogleLink({
        admin: createServiceRoleClient(),
        userId: user.id,
        verification: { source: 'lookup' },
        context: 'post_google_auth',
    })

    return NextResponse.json({ ok: true })
}
