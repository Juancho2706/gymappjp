import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { amrAllowsGoogleLinkRotation, rotatePasswordOnGoogleLink } from '@/lib/auth/google-link-rotation'

/**
 * `amr` de la sesión de la cookie (cómo se abrió). Fail-silent a propósito: `getClaims` puede lanzar
 * ante red/JWKS y eso no puede convertir el aviso en un 401; sin claim legible devuelve `undefined`
 * y `amrAllowsGoogleLinkRotation` conserva el comportamiento de antes. No se loguea nada del error
 * (misma regla anti-fuga que el `catch` de abajo).
 */
async function readSessionAmr(supabase: Awaited<ReturnType<typeof createClient>>): Promise<unknown> {
    try {
        const { data } = await supabase.auth.getClaims()
        return data?.claims?.amr
    } catch {
        return undefined
    }
}

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
    // El corte REAL de la fuga del 04-09 vive en `lib/supabase/server.ts` (la cookie corrupta ni
    // siquiera llega a supabase-js). Esto es el cinturón: si alguna vez la librería RELANZARA en vez
    // de tragarse el error, su `message` trae la sesión entera (access_token, refresh_token, email).
    // Por eso acá NO se loguea el error, ni su `message`, ni el objeto: SOLO el nombre de la clase.
    let userId: string | null = null
    let amr: unknown
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        userId = user?.id ?? null
        if (userId) amr = await readSessionAmr(supabase)
    } catch (err) {
        console.error('[auth.google-link] sesion ilegible, se responde 401', {
            error: err instanceof Error ? err.name : 'Unknown',
        })
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Solo una sesión abierta POR GOOGLE dispara la rotación (02-10): `AuthExchangeClient` también
    // avisa al canjear el link de «olvidé mi contraseña», y rotar ahí cerraba la sesión de recuperación
    // antes de que el formulario guardara la clave nueva.
    if (!amrAllowsGoogleLinkRotation(amr)) {
        return NextResponse.json({ ok: true })
    }

    // `lookup`: acá la fila `coaches` (si existe) no la escribió este request, así que la columna
    // es la fuente de verdad. Sin fila `coaches` el helper NO rota (02-10, caso Carolina/Movens):
    // es el alumno que tocó Google en el login de coach, y su login se rechaza igual.
    await rotatePasswordOnGoogleLink({
        admin: createServiceRoleClient(),
        userId,
        verification: { source: 'lookup' },
        context: 'post_google_auth',
    })

    return NextResponse.json({ ok: true })
}
