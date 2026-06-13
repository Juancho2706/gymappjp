import { NextResponse, type NextRequest } from 'next/server'
import { SALES_EMAIL, teamsContactMailto } from '@/lib/brand-assets'

/**
 * Embudo de contacto del CTA Teams (plan 02 / §F2bis, D11).
 *
 * Mide el click y redirige (302) al `mailto:` de ventas. Restriccion dura del
 * dueño (2026-06-11): CERO servicios pagos nuevos. PostHog server-side no esta
 * cableado en el repo todavia, asi que la medicion va por `console.info`
 * estructurado (visible en logs de Vercel, ya contratado). NADA de DB.
 *
 * Seguridad: el `mailto:` se construye desde la constante de marca SIN
 * parametros con contexto del usuario (regla D4). El `?src=` se valida contra
 * una allowlist cerrada; cualquier otro valor se normaliza a `unknown` para no
 * reflejar input arbitrario.
 */

const ALLOWED_SRC = ['teams-section', 'final-cta', 'pricing-callout'] as const
type ContactSrc = (typeof ALLOWED_SRC)[number] | 'unknown'

function normalizeSrc(raw: string | null): ContactSrc {
    return (ALLOWED_SRC as readonly string[]).includes(raw ?? '')
        ? (raw as ContactSrc)
        : 'unknown'
}

export function GET(request: NextRequest) {
    const src = normalizeSrc(request.nextUrl.searchParams.get('src'))

    // Medicion del click (sin DB, sin servicios nuevos).
    console.info(
        JSON.stringify({
            event: 'contact_teams_click',
            src,
            ts: new Date().toISOString(),
        })
    )

    // 302 al mailto de ventas (subject prefijado, sin body ni contexto del usuario).
    return NextResponse.redirect(teamsContactMailto(src), {
        status: 302,
        headers: {
            'Cache-Control': 'no-store',
            // SALES_EMAIL referenciado para mantener una sola fuente del correo.
            'X-Contact-Email': SALES_EMAIL,
        },
    })
}
