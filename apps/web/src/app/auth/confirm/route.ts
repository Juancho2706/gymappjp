import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { NextResponse, type NextRequest } from 'next/server'
import { activateConfirmedFreeCoach } from '@/lib/auth/activate-confirmed-coach'

/** Paquete Android de la app (`apps/mobile/app.json` → `android.package`). */
const ANDROID_PACKAGE = 'cl.evaapp.eva'

/**
 * URL `intent://` de Chrome Android: abre la app si está instalada (scheme `eva`, paquete fijo) y,
 * si no, navega a `fallback`. Es lo único que «detecta si tienes la app» desde una web sin binario
 * nuevo: los App Links verificados no cubren `/auth/confirm`.
 */
function androidAppIntent(appPath: string, fallback: string): string {
    return `intent://${appPath}#Intent;scheme=eva;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`
}

function isAndroid(request: NextRequest): boolean {
    return /\bandroid\b/i.test(request.headers.get('user-agent') ?? '')
}

/**
 * iPhone/iPad/iPod. El iPad con «Solicitar sitio de escritorio» se anuncia como Macintosh y cae al
 * panel web: es el default de siempre, no una regresión.
 */
function isIOS(request: NextRequest): boolean {
    return /\b(iphone|ipad|ipod)\b/i.test(request.headers.get('user-agent') ?? '')
}

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

    const admin = createServiceRoleClient()

    // ── W3.0(c) — la señal de correo verificado, escrita ACÁ y en ningún otro lado de este camino ──
    //
    // POR QUÉ EXISTE LA COLUMNA: con D1 = A (W3.1) el alta free nace con `email_confirm: true`, o
    // sea que `auth.users.email_confirmed_at` queda sellada EN LA CREACIÓN para todo el mundo y
    // deja de distinguir a nadie. La prueba real de que alguien abrió su casilla pasa a ser
    // `coaches.email_verified_at`, que es lo que leen la higiene del drip (W3.8), el banner de
    // verificación blanda (W3.11) y el guardarraíl «`active` sin verificar a 7 días ≤ 15 %».
    //
    // POR QUÉ ACÁ Y NO DENTRO DE `activate-confirmed-coach.ts`: ese helper corta con `not_pending`
    // cuando el coach no está en `pending_email` (`lib/auth/activate-confirmed-coach.ts:90`), y bajo
    // D1 = A el coach free ya nace `active` ⇒ metido ahí adentro NUNCA escribiría. Prohibido
    // moverlo.
    //
    // CUBRE `email`, `magiclink` Y `recovery`, decisión declarada del TASKS: va tras el `verifyOtp`
    // exitoso, y GoTrue marca `email_confirmed_at` en CUALQUIER verificación exitosa (lo dice el
    // comentario de abajo, escrito el 22-08 por el mismo motivo). Abrir un link de recuperación
    // también prueba que la casilla es suya. Que nadie lo «arregle» a solo dos tipos.
    //
    // `.is('email_verified_at', null)`: la columna dice CUÁNDO se probó la casilla la primera vez,
    // no cuándo se miró por última vez. Un alumno o un usuario sin fila `coaches` (los links de
    // recuperación también pasan por acá) simplemente actualiza cero filas.
    const { error: verifiedError } = await admin
        .from('coaches')
        .update({ email_verified_at: new Date().toISOString() })
        .eq('id', data.user.id)
        .is('email_verified_at', null)

    if (verifiedError) {
        // Sin PII (el mensaje de PostgREST puede repetir el filtro): solo la traza. No se aborta —
        // el coach acaba de confirmar y merece entrar aunque el sello falle.
        console.error('[auth/confirm] email_verified_at no se pudo sellar:', verifiedError.message)
    }

    // Activación del coach Free pendiente — para TODOS los tipos, la recuperación de contraseña
    // incluida: GoTrue confirma el email en cualquier `verifyOtp` exitoso (`recoverVerify` también
    // marca `email_confirmed_at`). Hasta el 22-08 la rama `recovery` redirigía al reset ANTES de
    // este paso y un coach que abría «olvidé mi contraseña» en vez del link de confirmación quedaba
    // con auth confirmado, `coaches` en `pending_email` y sin bienvenida ni drip. El helper es
    // idempotente y espera los correos (Vercel congela la función al devolver el redirect).
    const activation = await activateConfirmedFreeCoach({
        admin,
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

    const dashboardPath = activation.activated ? '/coach/dashboard?welcome=free' : '/coach/dashboard'
    const dashboard = `${origin}${dashboardPath}`

    // Alta hecha DESDE LA APP (`src=app`, lo pone el link del alta y del reenvío móvil): el coach
    // vuelve a la app, que con las credenciales del alta todavía en memoria entra sola al panel
    // (QA del owner 22-08: «debería llevarme a la app, no a la versión responsive»).
    const fromApp = searchParams.get('src') === 'app'

    // Android: `intent://` en el propio redirect. Sin la app instalada, Chrome sigue al
    // `browser_fallback_url` = el panel web de siempre.
    if (fromApp && isAndroid(request)) {
        const email = data.user.email ? `?email=${encodeURIComponent(data.user.email)}` : ''
        return NextResponse.redirect(androidAppIntent(`auth/confirmed${email}`, dashboard))
    }

    // iOS no tiene equivalente del `intent://`: Safari ignora los universal links cuando el salto
    // viene de un `Location:` (y más aún si la navegación no cambia de dominio), así que desde acá
    // NO se puede abrir la app. Se manda a una página intermedia, `/auth/abrir-app`, que hace el
    // salto a `eva://auth/confirmed` desde el documento ya cargado y deja el botón «Abrir EVA» para
    // que lo haga el gesto del coach —el camino que iOS respeta siempre— con el panel web como
    // segunda salida. `next` viaja validado del otro lado (`safeNext`).
    if (fromApp && isIOS(request)) {
        const params = new URLSearchParams()
        if (data.user.email) params.set('email', data.user.email)
        params.set('next', dashboardPath)
        return NextResponse.redirect(`${origin}/auth/abrir-app?${params.toString()}`)
    }

    // Default: panel web (coach ya activo / otros tipos de confirmación / escritorio)
    return NextResponse.redirect(dashboard)
}
