import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import { isBrandingAllowed, showsEvaBadge, type SubscriptionTier } from '@eva/tiers'
import { BRAND_APP_ICON, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import { COACH_OG_IMAGE_HEIGHT, COACH_OG_IMAGE_WIDTH } from '@/lib/coach-og-image'

/**
 * Imagen Open Graph del portal del alumno (`/c/[coach_slug]/**`), generada al vuelo como el splash
 * (`api/splash/[coach_slug]`): logo + color + nombre de la marca del coach. Es lo que WhatsApp
 * muestra como preview cuando el coach manda el link de acceso; hasta el 22-08 era siempre el
 * logo de EVA (pedido del owner: «debería mostrar el logo del coach»).
 *
 * Reglas de marca = las del splash: Free no tiene white-label ⇒ figura y color de EVA; Pro+ con
 * logo ⇒ su logo y su color. Sin sesión ni usuario: la preview la pide el servidor de WhatsApp.
 * Si el logo remoto no se puede dibujar (formato que satori no soporta, URL caída) se renderiza
 * igual sin él: una preview sin logo es mejor que un 500 que deja a WhatsApp sin imagen.
 */
export const runtime = 'nodejs'

interface Params {
    params: Promise<{ coach_slug: string }>
}

function safeColor(c: string | null | undefined, fallback: string) {
    return c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : fallback
}

/** Texto claro u oscuro según la luminancia del fondo (misma regla que el tema del portal). */
function onColor(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.62 ? '#0F172A' : '#FFFFFF'
}

const CACHE = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' }

export async function GET(request: NextRequest, { params }: Params) {
    const { coach_slug } = await params

    const supabase = await createClient()
    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, primary_color, logo_url, subscription_tier')
        .eq(coachIdentifierColumn(coach_slug), coach_slug)
        .maybeSingle()

    const tier = (coach?.subscription_tier ?? 'free') as SubscriptionTier
    const brandingAllowed = isBrandingAllowed(tier)
    const brandName = (coach?.brand_name ?? '').trim() || 'EVA'
    const bg = safeColor(brandingAllowed ? coach?.primary_color : SYSTEM_PRIMARY_COLOR, SYSTEM_PRIMARY_COLOR)
    const fg = onColor(bg)
    const logoUrl =
        brandingAllowed && coach?.logo_url ? coach.logo_url : new URL(BRAND_APP_ICON, request.url).toString()
    const badge = showsEvaBadge(tier)

    const render = (withLogo: boolean) =>
        new ImageResponse(
            (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        background: bg,
                        color: fg,
                        padding: '72px 88px',
                        fontFamily: 'sans-serif',
                    }}
                >
                    {withLogo ? (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 300,
                                height: 300,
                                borderRadius: 64,
                                background: '#FFFFFF',
                                boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
                                flexShrink: 0,
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={logoUrl} alt="" width={236} height={236} style={{ borderRadius: 48, objectFit: 'contain' }} />
                        </div>
                    ) : null}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            marginLeft: withLogo ? 64 : 0,
                            flexGrow: 1,
                            minWidth: 0,
                        }}
                    >
                        <div style={{ fontSize: 30, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.78 }}>
                            Tu app para entrenar
                        </div>
                        <div
                            style={{
                                fontSize: brandName.length > 18 ? 60 : 78,
                                fontWeight: 700,
                                lineHeight: 1.05,
                                marginTop: 18,
                                display: 'flex',
                                overflow: 'hidden',
                            }}
                        >
                            {brandName}
                        </div>
                        <div style={{ fontSize: 30, marginTop: 26, opacity: 0.88, lineHeight: 1.3, display: 'flex' }}>
                            Rutinas, nutrición y seguimiento desde tu móvil.
                        </div>
                        {badge ? (
                            <div style={{ fontSize: 24, marginTop: 40, opacity: 0.7, display: 'flex' }}>Hecho con EVA</div>
                        ) : null}
                    </div>
                </div>
            ),
            { width: COACH_OG_IMAGE_WIDTH, height: COACH_OG_IMAGE_HEIGHT, headers: CACHE }
        )

    try {
        return render(true)
    } catch {
        // Logo remoto que satori no pudo decodificar: la preview sale sin él.
        return render(false)
    }
}
