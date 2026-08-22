import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { BRAND_APP_ICON, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import { COACH_OG_IMAGE_HEIGHT, COACH_OG_IMAGE_WIDTH } from '@/lib/coach-og-image'

/**
 * Imagen Open Graph del portal del alumno (`/c/[coach_slug]/**`), generada al vuelo como el splash
 * (`api/splash/[coach_slug]`): logo + color + nombre de la marca del coach. Es lo que WhatsApp
 * muestra como preview cuando el coach manda el link de acceso; hasta el 22-08 era siempre el
 * logo de EVA (pedido del owner: «debería mostrar el logo del coach»).
 *
 * Decisión del owner (22-08, tras ver el preview de Villegasfit): fondo NEGRO siempre, el logo del
 * coach si lo tiene (la figura EVA solo cuando no subió ninguno), el color de marca como acento y
 * SIN «Hecho con EVA» en la preview. Sin sesión ni usuario: la preview la pide el servidor de WhatsApp.
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
    // Fondo negro fijo (owner 22-08); el color de marca vive en el acento del eyebrow.
    const bg = '#0B0B0C'
    const fg = '#FFFFFF'
    const accent = safeColor(brandingAllowed ? coach?.primary_color : SYSTEM_PRIMARY_COLOR, SYSTEM_PRIMARY_COLOR)
    const customLogo = Boolean(brandingAllowed && coach?.logo_url)
    const logoUrl = customLogo ? (coach!.logo_url as string) : new URL(BRAND_APP_ICON, request.url).toString()
    // Con logo propio la baldosa es blanca (el logo trae sus colores). La figura EVA de fallback es
    // blanca sobre transparente: va sobre una baldosa gris oscura para que se lea sobre el negro.
    const tileBg = customLogo ? '#FFFFFF' : '#1C1D21'

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
                                background: tileBg,
                                boxShadow: customLogo ? '0 24px 60px rgba(0,0,0,0.45)' : 'none',
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
                        <div style={{ fontSize: 30, letterSpacing: 4, textTransform: 'uppercase', color: accent, display: 'flex' }}>
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
                        <div style={{ fontSize: 30, marginTop: 26, opacity: 0.82, lineHeight: 1.3, display: 'flex' }}>
                            Rutinas, nutrición y seguimiento desde tu móvil.
                        </div>
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
