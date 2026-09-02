import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchPublicCoachBranding } from '@/lib/branding/public-branding'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import {
    buildCoachOgPngResponse,
    coachOgBrandNameStyle,
    coachOgFallbackArtwork,
    coachOgMinimalPng,
    resolveCoachOgArtwork,
    type CoachOgArtwork,
    COACH_OG_BACKGROUND,
    COACH_OG_IMAGE_HEIGHT,
    COACH_OG_IMAGE_WIDTH,
    COACH_OG_PADDING,
} from '@/lib/coach-og-image'

/**
 * Imagen Open Graph del portal del alumno (`/c/[coach_slug]/**`), generada al vuelo. Es lo que
 * WhatsApp muestra como preview cuando el coach manda el link de acceso; hasta el 22-08 era siempre
 * el logo de EVA (pedido del owner: «debería mostrar el logo del coach»).
 *
 * Decisión del owner (02-09, reemplaza la del 22-08): SOLO el logo del coach, centrado y con
 * margen sobre el neutro oscuro de EVA (`COACH_OG_BACKGROUND`) — NUNCA sobre su color de marca.
 * La preview de `/c/josefit/login` salía con el logo sobre naranja (su `primary_color`) y el owner
 * la rechazó: «solo el logo, no el color del coach». Sin nombre, sin tagline y sin sello EVA
 * dentro de la imagen — la tarjeta de WhatsApp ya trae título y descripción, así que repetirlos
 * ahí adentro era ruido. Sin logo va el nombre de la marca en blanco sobre el mismo neutro; sin
 * nada, la figura EVA. La composición vive en `resolveCoachOgArtwork` (pura y testeada); acá solo
 * se dibuja.
 *
 * Sin sesión ni usuario: en Android la preview la baja el TELÉFONO del que comparte, no un servidor
 * de Meta.
 */
export const runtime = 'nodejs'

interface Params {
    params: Promise<{ coach_slug: string }>
}

export async function GET(request: NextRequest, { params }: Params) {
    const { coach_slug } = await params

    const supabase = await createClient()
    // SEC-01 fase 2: branding público por RPC (una fila, resuelve código o slug adentro) — la
    // preview se pide SIEMPRE sin sesión.
    const { data: coach } = await fetchPublicCoachBranding(supabase, coach_slug)

    const tier = (coach?.subscription_tier ?? 'free') as SubscriptionTier
    const artwork = resolveCoachOgArtwork({
        logoUrl: coach?.logo_url,
        logoUrlDark: coach?.logo_url_dark,
        brandName: coach?.brand_name,
        brandingAllowed: isBrandingAllowed(tier),
    })
    // La figura EVA es un asset local: necesita URL absoluta para que satori la baje (por eso el
    // runtime es nodejs y el route depende del request — no ponerle `dynamic`).
    const evaIconUrl = new URL(BRAND_APP_ICON, request.url).toString()

    const render = (art: CoachOgArtwork) =>
        new ImageResponse(
            (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        // Neutro FIJO del DS: el color del coach no entra a esta imagen.
                        background: COACH_OG_BACKGROUND,
                        padding: COACH_OG_PADDING,
                        fontFamily: 'sans-serif',
                    }}
                >
                    {art.kind === 'brandName' ? (
                        // El estilo vive en `coachOgBrandNameStyle` (wrap + maxWidth + tamaño que
                        // garantiza que la palabra más larga entre): así el no-desborde se testea.
                        <div style={coachOgBrandNameStyle(art.brandName)}>{art.brandName}</div>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={art.kind === 'logo' ? art.logoUrl : evaIconUrl}
                            alt=""
                            width={760}
                            height={420}
                            style={{ objectFit: 'contain' }}
                        />
                    )}
                </div>
            ),
            { width: COACH_OG_IMAGE_WIDTH, height: COACH_OG_IMAGE_HEIGHT }
        )

    // El `await` del buffer es lo que vuelve REAL este catch: `new ImageResponse(...)` no tira de
    // forma síncrona cuando el logo remoto no se puede decodificar — el error ocurría al consumir
    // el stream, fuera del try, y WhatsApp recibía un PNG truncado.
    try {
        return buildCoachOgPngResponse(await render(artwork).arrayBuffer())
    } catch {
        // El respaldo tiene su PROPIO try (hallazgo B-4): también puede fallar (el fetch del ícono
        // EVA contra el mismo deploy, un timeout, un glifo que satori no tiene en el nombre). Antes
        // eso salía por arriba como 500 y WhatsApp se quedaba sin miniatura — el síntoma exacto que
        // esta tanda arregla. Ninguna rama devuelve error: la preview degrada, nunca revienta.
        try {
            const fallback = coachOgFallbackArtwork(artwork, coach?.brand_name)
            return buildCoachOgPngResponse(await render(fallback).arrayBuffer())
        } catch {
            return staticOgFallbackResponse(request)
        }
    }
}

/**
 * Último recurso: el og ESTÁTICO de EVA (`/opengraph-image`, `force-static` — el mismo que usa el
 * resto del sitio y que sí se ve en WhatsApp) y, si ni eso responde, un PNG mínimo. Siempre 200 con
 * `Content-Length`: una miniatura fea es recuperable, un 500 se lleva la tarjeta entera.
 */
async function staticOgFallbackResponse(request: NextRequest): Promise<Response> {
    try {
        const res = await fetch(new URL('/opengraph-image', request.url))
        if (res.ok) return buildCoachOgPngResponse(await res.arrayBuffer())
    } catch {
        // sin red interna: cae al PNG mínimo.
    }
    return buildCoachOgPngResponse(coachOgMinimalPng())
}
