import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import { safeColor, rasterLogo } from '@/lib/records/pr-card'
import {
    PWA_SCREENSHOT_WIDTH,
    PWA_SCREENSHOT_HEIGHT,
} from '@/lib/pwa/screenshot-dimensions'

// Screenshots del manifest (PWA Richer Install UI de Android) generadas al vuelo con next/og
// (gratis, sin servicio pago — PROHIBIDO Supabase render/image, cuota agotada). NO son capturas
// reales del producto: son composiciones tipográficas brandeadas con la marca del coach + un claim
// de la app (variante 1 = dashboard-look, variante 2 = entrenamiento-look). Ambas variantes comparten
// dimensiones EXACTAS (constante `PWA_SCREENSHOT_*`) porque Chrome descarta todo el richer UI si dos
// screenshots del mismo form_factor difieren en aspect ratio (ver SPEC §7).
//
// Marca: espeja el patrón de /api/splash — coach por invite_code/slug; para el alumno de pool
// (clients.team_id NO NULL, org_id NULL) sobrescribe con la marca del TEAM. Best-effort: si el fetch
// del richer UI llega sin cookies, cae a la marca del coach (determinista por slug).
export const runtime = 'nodejs'

// Tokens DS concretos (satori no lee CSS vars) — ver globals.css / pr-card.
const INK_950 = '#0B0E13'
const INK_900 = '#12161D'
const EVA_GREEN = '#10B981'

interface Params {
    params: Promise<{ coach_slug: string }>
}

type Brand = { brandName: string; logoUrl: string | null; accent: string }

/**
 * Carga una fuente TTF desde Google Fonts (patrón estándar next/og, idéntico a /api/pr-card): el
 * endpoint css2 con `&text=` devuelve un subset `format('truetype')`. Best-effort: si algo falla,
 * devuelve null y next/og cae a su fuente embebida por defecto (la screenshot igual renderiza).
 */
async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
    try {
        const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`
        const cssRes = await fetch(url, { signal: AbortSignal.timeout(2500) })
        if (!cssRes.ok) return null
        const css = await cssRes.text()
        const m = css.match(/src:\s*url\((.+?)\)\s*format\(['"]?(?:truetype|opentype)['"]?\)/)
        if (!m) return null
        const fontRes = await fetch(m[1], { signal: AbortSignal.timeout(2500) })
        if (!fontRes.ok) return null
        return await fontRes.arrayBuffer()
    } catch {
        return null
    }
}

/**
 * Marca white-label del coach para la screenshot, espejando /api/splash: fila del coach por
 * invite_code/slug; alumno de pool (team_id set, org_id NULL) → marca del TEAM. Sin gate por tier
 * (igual que splash). Un coach inexistente (ej. slug "default") cae a la marca EVA genérica.
 */
async function resolveBrand(
    supabase: Awaited<ReturnType<typeof createClient>>,
    coachSlug: string
): Promise<Brand> {
    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, primary_color, logo_url')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    let brandName = coach?.brand_name ?? 'EVA'
    let logoUrl = coach?.logo_url ?? null
    let accent = safeColor(coach?.primary_color, EVA_GREEN)

    // getClaims(): verificación LOCAL del JWT (ES256), sin /user. Identity-only best-effort; la
    // screenshot es pública y cacheada → no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const userId = __cl?.claims?.sub as string | undefined
    if (userId) {
        const { data: client } = await supabase
            .from('clients')
            .select('org_id, team_id')
            .eq('id', userId)
            .maybeSingle()

        if (client?.team_id && !client.org_id) {
            const admin = createServiceRoleClient()
            const { data: team } = await admin
                .from('teams')
                .select('name, logo_url, primary_color')
                .eq('id', client.team_id)
                .is('deleted_at', null)
                .maybeSingle()
            if (team) {
                brandName = team.name ?? brandName
                logoUrl = team.logo_url ?? logoUrl
                accent = safeColor(team.primary_color, accent)
            }
        }
    }

    return { brandName, logoUrl: rasterLogo(logoUrl), accent }
}

/** Marca de identidad (logo raster o tile con inicial) reutilizada por ambas variantes. */
function BrandMark({ brand, brandUpper, displayFF }: { brand: Brand; brandUpper: string; displayFF?: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt="" width={84} height={84} style={{ borderRadius: 22, objectFit: 'cover' }} />
            ) : (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 84,
                        height: 84,
                        borderRadius: 22,
                        background: brand.accent,
                        color: '#ffffff',
                        fontSize: 46,
                        fontWeight: 900,
                        fontFamily: displayFF,
                    }}
                >
                    {brandUpper.charAt(0)}
                </div>
            )}
            <div
                style={{
                    fontSize: 40,
                    fontWeight: 900,
                    letterSpacing: 2,
                    color: 'rgba(255,255,255,0.9)',
                    fontFamily: displayFF,
                }}
            >
                {brandUpper}
            </div>
        </div>
    )
}

/** Variante 1 — dashboard-look: hero de racha + tiles de progreso (streak = argumento de conversión). */
function DashboardBody({ accent, displayFF }: { accent: string; displayFF?: string }) {
    const tiles: Array<{ value: string; unit: string; label: string }> = [
        { value: '18', unit: '', label: 'Sesiones este mes' },
        { value: '12,4', unit: 't', label: 'Volumen movido' },
    ]
    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 44 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, letterSpacing: 8, color: accent, fontFamily: displayFF }}>
                    TU PROGRESO
                </div>
                <div
                    style={{
                        display: 'flex',
                        fontSize: 76,
                        fontWeight: 900,
                        lineHeight: 1.02,
                        letterSpacing: -1.5,
                        color: '#ffffff',
                        fontFamily: displayFF,
                        maxWidth: 820,
                    }}
                >
                    Todo tu avance en un solo lugar
                </div>
            </div>

            {/* Hero streak */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '48px 52px',
                    borderRadius: 40,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                }}
            >
                <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, letterSpacing: 4, color: 'rgba(255,255,255,0.5)' }}>
                    RACHA ACTIVA
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, marginTop: 6 }}>
                    <div style={{ display: 'flex', fontSize: 240, fontWeight: 900, lineHeight: 0.9, letterSpacing: -6, color: accent, fontFamily: displayFF }}>
                        24
                    </div>
                    <div style={{ display: 'flex', fontSize: 44, fontWeight: 900, paddingBottom: 34, color: 'rgba(255,255,255,0.7)', fontFamily: displayFF }}>
                        días activos
                    </div>
                </div>
            </div>

            {/* Tiles de métricas */}
            <div style={{ display: 'flex', gap: 28 }}>
                {tiles.map((t) => (
                    <div
                        key={t.label}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            flex: 1,
                            padding: '34px 36px',
                            borderRadius: 32,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                            <div style={{ display: 'flex', fontSize: 76, fontWeight: 900, lineHeight: 1, color: '#ffffff', fontFamily: displayFF }}>
                                {t.value}
                            </div>
                            {t.unit ? (
                                <div style={{ display: 'flex', fontSize: 40, fontWeight: 900, paddingBottom: 8, color: accent, fontFamily: displayFF }}>
                                    {t.unit}
                                </div>
                            ) : null}
                        </div>
                        <div style={{ display: 'flex', marginTop: 12, fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
                            {t.label}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/** Variante 2 — entrenamiento-look: la sesión del día como lista guiada con chips de series×reps. */
function WorkoutBody({ accent, displayFF }: { accent: string; displayFF?: string }) {
    const rows: Array<{ name: string; scheme: string; done: boolean }> = [
        { name: 'Sentadilla', scheme: '4 × 8', done: true },
        { name: 'Press banca', scheme: '4 × 10', done: true },
        { name: 'Remo con barra', scheme: '3 × 12', done: false },
        { name: 'Peso muerto rumano', scheme: '3 × 10', done: false },
    ]
    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 44 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, letterSpacing: 8, color: accent, fontFamily: displayFF }}>
                    TU ENTRENAMIENTO
                </div>
                <div
                    style={{
                        display: 'flex',
                        fontSize: 76,
                        fontWeight: 900,
                        lineHeight: 1.02,
                        letterSpacing: -1.5,
                        color: '#ffffff',
                        fontFamily: displayFF,
                        maxWidth: 820,
                    }}
                >
                    Tu plan de hoy, guiado paso a paso
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '40px 44px',
                    borderRadius: 40,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    gap: 8,
                }}
            >
                {/* Progreso de la sesión */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, letterSpacing: 3, color: 'rgba(255,255,255,0.5)' }}>
                        SESIÓN DE HOY
                    </div>
                    <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, color: accent, fontFamily: displayFF }}>
                        2 de 4
                    </div>
                </div>

                {rows.map((r, i) => (
                    <div
                        key={r.name}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '26px 0',
                            ...(i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.08)' } : {}),
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
                            {r.done ? (
                                <div style={{ display: 'flex', width: 40, height: 40, borderRadius: 999, background: accent }} />
                            ) : (
                                <div style={{ display: 'flex', width: 40, height: 40, borderRadius: 999, border: '3px solid rgba(255,255,255,0.28)' }} />
                            )}
                            <div
                                style={{
                                    display: 'flex',
                                    fontSize: 44,
                                    fontWeight: 900,
                                    color: r.done ? 'rgba(255,255,255,0.55)' : '#ffffff',
                                    fontFamily: displayFF,
                                }}
                            >
                                {r.name}
                            </div>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                padding: '12px 26px',
                                borderRadius: 999,
                                fontSize: 34,
                                fontWeight: 900,
                                background: 'rgba(255,255,255,0.08)',
                                color: 'rgba(255,255,255,0.85)',
                                fontFamily: displayFF,
                            }}
                        >
                            {r.scheme}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export async function GET(request: NextRequest, { params }: Params) {
    const { coach_slug } = await params
    const { searchParams } = new URL(request.url)
    const variant = searchParams.get('v') === '2' ? 2 : 1

    const supabase = await createClient()
    const brand = await resolveBrand(supabase, coach_slug)
    const brandUpper = brand.brandName.toUpperCase()

    // Subset de glifos: base latina es-CL + strings fijos de AMBAS variantes + marca.
    const glyphText =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 áéíóúüñÁÉÍÓÚÜÑ.,·×+-−/()%°!¿? ' +
        'TU PROGRESO Todo tu avance en un solo lugar RACHA ACTIVA días activos Sesiones este mes Volumen movido ' +
        'TU ENTRENAMIENTO Tu plan de hoy, guiado paso a paso SESIÓN DE HOY Sentadilla Press banca Remo con barra ' +
        'Peso muerto rumano Disponible como app ' +
        brandUpper +
        brand.brandName

    const [archivo, hanken] = await Promise.all([
        loadGoogleFont('Archivo', 900, glyphText),
        loadGoogleFont('Hanken Grotesk', 600, glyphText),
    ])
    const fonts: { name: string; data: ArrayBuffer; weight: 600 | 900; style: 'normal' }[] = []
    if (archivo) fonts.push({ name: 'Archivo', data: archivo, weight: 900, style: 'normal' })
    if (hanken) fonts.push({ name: 'Hanken', data: hanken, weight: 600, style: 'normal' })
    const displayFF = archivo ? 'Archivo' : undefined
    const bodyFF = hanken ? 'Hanken' : displayFF

    return new ImageResponse(
        (
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '104px 88px 96px',
                    background: `linear-gradient(155deg, ${INK_950} 0%, ${INK_900} 100%)`,
                    color: '#ffffff',
                    fontFamily: bodyFF,
                    overflow: 'hidden',
                }}
            >
                {/* Glow diagonal del acento de marca (tendencia 2026: gradiente diagonal + un acento de alta energía) */}
                <div
                    style={{
                        position: 'absolute',
                        top: -320,
                        right: -220,
                        width: 1000,
                        height: 1000,
                        background: `radial-gradient(circle at 60% 40%, ${brand.accent}45 0%, transparent 60%)`,
                    }}
                />

                {/* Header — identidad de marca */}
                <div style={{ display: 'flex', zIndex: 1 }}>
                    <BrandMark brand={brand} brandUpper={brandUpper} displayFF={displayFF} />
                </div>

                {/* Cuerpo según variante (mismas dimensiones de lienzo — sólo cambia el contenido) */}
                <div style={{ display: 'flex', flex: 1, zIndex: 1 }}>
                    {variant === 2 ? (
                        <WorkoutBody accent={brand.accent} displayFF={displayFF} />
                    ) : (
                        <DashboardBody accent={brand.accent} displayFF={displayFF} />
                    )}
                </div>

                {/* Footer — CTA de instalación brandeado */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 18,
                        paddingTop: 30,
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        zIndex: 1,
                    }}
                >
                    <div style={{ display: 'flex', width: 44, height: 10, borderRadius: 8, background: brand.accent }} />
                    <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, letterSpacing: 1, color: 'rgba(255,255,255,0.55)' }}>
                        Instala {brand.brandName} en tu teléfono
                    </div>
                </div>
            </div>
        ),
        {
            width: PWA_SCREENSHOT_WIDTH,
            height: PWA_SCREENSHOT_HEIGHT,
            ...(fonts.length ? { fonts } : {}),
            headers: {
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
        }
    )
}
