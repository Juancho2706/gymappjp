import { NextResponse } from 'next/server'

/**
 * PUENTE de retorno de Flow/Webpay (fix incidente go-live 2026-07-09).
 *
 * Problema: Flow devuelve al coach con un POST cross-site a `url_return`. Las cookies de sesion
 * (SameSite=Lax) NO viajan en un POST cross-site → el proxy no ve sesion → rebote a /login y el
 * coach queda varado a mitad del alta (la Fase 2 nunca corre sola).
 *
 * Fix canonico: esta ruta es PUBLICA (fuera de /coach/*, el proxy no exige sesion) y responde
 * **303 See Other** → el browser RE-NAVEGA con GET al destino real; las cookies Lax SI viajan en
 * una navegacion GET top-level → el proxy ve la sesion → flow-processing corre la Fase 2 sola.
 *
 * Anti open-redirect: el destino se construye ACA desde una whitelist (`dest`) + params saneados
 * por charset — jamas se redirige a una URL que venga del request.
 */

/** Solo valores con charset inofensivo viajan al destino (tier/cycle/addons del checkout). */
function sanitizeParam(value: string | null): string | null {
    if (!value) return null
    return /^[a-z0-9_,-]{1,120}$/i.test(value) ? value : null
}

function bridgeRedirect(request: Request): NextResponse {
    const url = new URL(request.url)
    const dest = url.searchParams.get('dest')

    let target: string
    if (dest === 'card') {
        // Retorno del RE-ENROLAMIENTO de tarjeta (change-card Flow): banner de exito en suscripcion.
        target = '/coach/subscription?card=updated'
    } else {
        // Retorno del ALTA (Fase 1 → Fase 2): flow-processing con los params del checkout.
        const qs = new URLSearchParams()
        const tier = sanitizeParam(url.searchParams.get('tier'))
        const cycle = sanitizeParam(url.searchParams.get('cycle'))
        const addons = sanitizeParam(url.searchParams.get('addons'))
        if (tier) qs.set('tier', tier)
        if (cycle) qs.set('cycle', cycle)
        if (addons) qs.set('addons', addons)
        const suffix = qs.toString()
        target = `/coach/subscription/flow-processing${suffix ? `?${suffix}` : ''}`
    }

    return NextResponse.redirect(new URL(target, url.origin), 303)
}

/** Flow postea el retorno (con `token` en el body urlencoded — no lo necesitamos: la Fase 2 verifica por API). */
export async function POST(request: Request) {
    return bridgeRedirect(request)
}

/** GET defensivo (retorno manual / refresh del puente). */
export async function GET(request: Request) {
    return bridgeRedirect(request)
}
