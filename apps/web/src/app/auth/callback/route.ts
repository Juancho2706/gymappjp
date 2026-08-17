import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // Password-recovery links set next=/reset-password; forward it so the exchange lands
    // the user on the reset form instead of treating it as a plain login.
    const next = searchParams.get('next')

    if (code) {
        const exchangeUrl = new URL(`${origin}/auth/exchange`)
        // Use 'oauth_code' not 'code' — Supabase's detectSessionInUrl auto-fires on ?code=
        exchangeUrl.searchParams.set('oauth_code', code)
        exchangeUrl.searchParams.set('intent', 'login')
        if (next) exchangeUrl.searchParams.set('next', next)
        return NextResponse.redirect(exchangeUrl.toString())
    }

    // Sin `?code=` NO significa que el enlace sea invalido.
    //
    // Bug reportado el 2026-08-17: al tocar "Restablecer contraseña" en el correo, el usuario
    // terminaba logueado en el dashboard y nunca veia el formulario de contraseña nueva. La cadena
    // del repo (accion -> callback -> exchange -> resolvePostGoogleAuthUrl) esta bien y respeta
    // `next`; lo que falla es la forma en que vuelve el enlace. La plantilla de Supabase usa
    // `{{ .ConfirmationURL }}`, o sea el primer salto es `<proyecto>.supabase.co/auth/v1/verify`, y
    // para `type=recovery` GoTrue devuelve la sesion en el FRAGMENTO (`#access_token=...`), que el
    // servidor NO puede leer. Al no haber `code` caiamos en `/login`, y `/login` con la sesion ya
    // levantada del fragmento rebota al dashboard: exactamente el sintoma reportado.
    //
    // El fragmento SOBREVIVE a los redirects (el navegador lo reengancha cuando el `Location` no
    // trae uno propio), asi que alcanza con mandar al destino real: ahi `detectSessionInUrl` del
    // cliente lo levanta, persiste la sesion en cookies y el server action de reset la encuentra.
    // `next` ya viene acotado a rutas internas por quien lo emite; se revalida igual.
    const isSafeNext = Boolean(next && next.startsWith('/') && !next.startsWith('//'))
    if (isSafeNext) {
        const target = new URL(`${origin}${next}`)
        // Camino `token_hash` (plantillas migradas a `{{ .TokenHash }}`): se reenvia para que el
        // destino pueda canjearlo con `verifyOtp` sin depender del fragmento.
        const tokenHash = searchParams.get('token_hash')
        const type = searchParams.get('type')
        if (tokenHash) target.searchParams.set('token_hash', tokenHash)
        if (type) target.searchParams.set('type', type)
        return NextResponse.redirect(target.toString())
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
