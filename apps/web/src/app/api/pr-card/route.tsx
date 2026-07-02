import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { assertCoachClientReadAccess } from '@/services/client/client-scope.service'
import { getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import { safeColor, rasterLogo, fmtWeight, reducePrFromRows } from '@/lib/records/pr-card'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'

// Share-card de RECORD PERSONAL (1080×1350, formato feed/story) — imagen generada al vuelo
// con next/og (gratis, sin servicio pago). Auth OBLIGATORIO: la imagen la puede pedir SOLO el
// propio alumno (su record) o su coach; nada público. El artefacto que se comparte es el PNG
// (via navigator.share files), no la URL. Marca = white-label del coach/team del alumno (NUNCA
// EVA hardcodeado): nombre + color + logo del coach (Pro+) o del team (pool). Coach free =
// nombre del coach + color DS por defecto, sin logo custom (respeta el gate de branding pago).
export const runtime = 'nodejs'

// Tokens DS concretos (satori no lee CSS vars) — ver globals.css.
const INK_950 = '#0B0E13'
const INK_900 = '#12161D'
const SPORT_500 = '#2680FF'
const SUCCESS = '#34D399'

/** "12 de junio de 2026" — día calendario Santiago. */
function fmtLong(iso: string): string {
    const ymd = getSantiagoIsoYmdForUtcInstant(iso)
    return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    })
}

/**
 * Carga una fuente TTF desde Google Fonts (patrón estándar next/og): el endpoint css2 con `&text=`
 * y el UA por defecto de undici devuelve `format('truetype')` (subset). Best-effort: si algo falla,
 * devuelve null y next/og cae a su fuente embebida por defecto (la card sigue renderizando).
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

type PrData = {
    exerciseName: string
    weightKg: number
    achievedAt: string
    prevKg: number
    deltaKg: number
}

/**
 * PR (peso máximo) del ejercicio para el alumno, computado con service-role DESPUÉS de autorizar.
 * La reducción (agrupar por día Santiago + record + delta) es pura → `reducePrFromRows`.
 */
async function computePr(
    admin: ReturnType<typeof createServiceRoleClient>,
    clientId: string,
    exerciseId: string
): Promise<PrData | null> {
    const [{ data: logs }, { data: exRow }] = await Promise.all([
        admin
            .from('workout_logs')
            .select('weight_kg, logged_at')
            .eq('client_id', clientId)
            .eq('exercise_id', exerciseId)
            .not('weight_kg', 'is', null)
            .order('logged_at', { ascending: true })
            .limit(2000),
        admin.from('exercises').select('name').eq('id', exerciseId).maybeSingle(),
    ])

    const reduced = reducePrFromRows(logs ?? [], getSantiagoIsoYmdForUtcInstant)
    if (!reduced) return null

    return {
        exerciseName: exRow?.name ?? 'Ejercicio',
        ...reduced,
    }
}

type Brand = { brandName: string; logoUrl: string | null; accent: string }

/**
 * Marca white-label del alumno: TEAM si es alumno de pool (team_id set, org_id NULL), si no el
 * COACH. El color/logo del coach se aplican solo si su tier permite branding (Pro+); free/starter
 * conservan el NOMBRE del coach pero con color DS por defecto y sin logo custom (gate de marca pago).
 */
async function resolveBrand(
    admin: ReturnType<typeof createServiceRoleClient>,
    clientId: string
): Promise<Brand> {
    const { data: client } = await admin
        .from('clients')
        .select('coach_id, team_id, org_id')
        .eq('id', clientId)
        .maybeSingle()

    let brandName = 'EVA'
    let logoUrl: string | null = null
    let accent = SPORT_500

    if (client?.team_id && !client.org_id) {
        const { data: team } = await admin
            .from('teams')
            .select('name, logo_url, primary_color')
            .eq('id', client.team_id)
            .is('deleted_at', null)
            .maybeSingle()
        if (team) {
            brandName = team.name || brandName
            logoUrl = team.logo_url || null
            accent = safeColor(team.primary_color, accent)
        }
    } else if (client?.coach_id) {
        const { data: coach } = await admin
            .from('coaches')
            .select('brand_name, primary_color, logo_url, subscription_tier')
            .eq('id', client.coach_id)
            .maybeSingle()
        if (coach) {
            brandName = coach.brand_name || brandName
            const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
            if (isBrandingAllowed(tier)) {
                accent = safeColor(coach.primary_color, accent)
                logoUrl = coach.logo_url || null
            }
        }
    }

    return { brandName, logoUrl: rasterLogo(logoUrl), accent }
}

export async function GET(request: NextRequest) {
    const supabase = await createClient()
    // getClaims(): verificación LOCAL del JWT (ES256), sin round-trip a GoTrue /user. La imagen es
    // read-only y la autorización real la hacen la identidad (alumno propio) + assertCoachClientReadAccess.
    const { data: cl } = await supabase.auth.getClaims()
    const userId = cl?.claims?.sub as string | undefined
    if (!userId) {
        return new Response('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const exerciseId = searchParams.get('exerciseId')
    const clientIdParam = searchParams.get('clientId')
    if (!exerciseId) {
        return new Response('Missing exerciseId', { status: 400 })
    }

    // Alumno propio (sin clientId o clientId===self) o flujo coach (clientId de un alumno suyo).
    let targetClientId = userId
    if (clientIdParam && clientIdParam !== userId) {
        try {
            await assertCoachClientReadAccess(supabase, userId, clientIdParam)
        } catch {
            return new Response('Forbidden', { status: 403 })
        }
        targetClientId = clientIdParam
    }

    const admin = createServiceRoleClient()
    const [pr, brand] = await Promise.all([
        computePr(admin, targetClientId, exerciseId),
        resolveBrand(admin, targetClientId),
    ])
    if (!pr) {
        return new Response('No record found', { status: 404 })
    }

    const dateStr = fmtLong(pr.achievedAt)
    const weightStr = fmtWeight(pr.weightKg)
    const isFirst = pr.prevKg <= 0
    const deltaStr = isFirst ? 'Primer récord personal' : `+${fmtWeight(pr.deltaKg)} kg vs récord anterior`
    const eyebrow = 'RÉCORD PERSONAL'
    const brandUpper = brand.brandName.toUpperCase()

    // Subset de glifos para las fuentes (todo lo que se renderiza + base latina para nombres es-CL).
    const glyphText =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 áéíóúüñÁÉÍÓÚÜÑ.,·×+-−/()%°!¿?kgKG ' +
        eyebrow + pr.exerciseName + weightStr + dateStr + deltaStr + brandUpper

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
                    padding: '88px 80px 76px',
                    background: `linear-gradient(155deg, ${INK_950} 0%, ${INK_900} 100%)`,
                    color: '#ffffff',
                    fontFamily: bodyFF,
                    overflow: 'hidden',
                }}
            >
                {/* Glow de acento (marca) tras el número */}
                <div
                    style={{
                        position: 'absolute',
                        top: -260,
                        left: -120,
                        right: -120,
                        height: 900,
                        background: `radial-gradient(circle at 50% 30%, ${brand.accent}40 0%, transparent 62%)`,
                    }}
                />

                {/* Header — identidad de marca */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 22, zIndex: 1 }}>
                    {brand.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={brand.logoUrl}
                            alt=""
                            width={76}
                            height={76}
                            style={{ borderRadius: 18, objectFit: 'cover' }}
                        />
                    ) : (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 76,
                                height: 76,
                                borderRadius: 18,
                                background: brand.accent,
                                color: '#ffffff',
                                fontSize: 42,
                                fontWeight: 900,
                                fontFamily: displayFF,
                            }}
                        >
                            {brandUpper.charAt(0)}
                        </div>
                    )}
                    <div
                        style={{
                            fontSize: 34,
                            fontWeight: 900,
                            letterSpacing: 3,
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: displayFF,
                        }}
                    >
                        {brandUpper}
                    </div>
                </div>

                {/* Bloque central */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        justifyContent: 'center',
                        zIndex: 1,
                    }}
                >
                    <div
                        style={{
                            fontSize: 36,
                            fontWeight: 900,
                            letterSpacing: 8,
                            color: brand.accent,
                            fontFamily: displayFF,
                        }}
                    >
                        {eyebrow}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            marginTop: 16,
                            fontSize: 66,
                            fontWeight: 900,
                            lineHeight: 1.02,
                            letterSpacing: -1,
                            color: '#ffffff',
                            fontFamily: displayFF,
                            maxWidth: 900,
                        }}
                    >
                        {pr.exerciseName}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 8 }}>
                        <div
                            style={{
                                fontSize: 260,
                                fontWeight: 900,
                                lineHeight: 0.9,
                                letterSpacing: -6,
                                color: brand.accent,
                                fontFamily: displayFF,
                            }}
                        >
                            {weightStr}
                        </div>
                        <div
                            style={{
                                fontSize: 76,
                                fontWeight: 900,
                                marginLeft: 14,
                                paddingBottom: 40,
                                color: 'rgba(255,255,255,0.5)',
                                fontFamily: displayFF,
                            }}
                        >
                            KG
                        </div>
                    </div>

                    <div style={{ display: 'flex', marginTop: 18, fontSize: 32, color: 'rgba(255,255,255,0.62)' }}>
                        {dateStr}
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            marginTop: 30,
                            alignSelf: 'flex-start',
                            padding: '14px 28px',
                            borderRadius: 999,
                            fontSize: 30,
                            fontWeight: 600,
                            background: isFirst ? 'rgba(255,255,255,0.08)' : 'rgba(52,211,153,0.14)',
                            color: isFirst ? 'rgba(255,255,255,0.7)' : SUCCESS,
                        }}
                    >
                        {deltaStr}
                    </div>
                </div>

                {/* Footer white-label discreto */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 28,
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        zIndex: 1,
                    }}
                >
                    <div
                        style={{
                            fontSize: 24,
                            fontWeight: 600,
                            letterSpacing: 2,
                            color: 'rgba(255,255,255,0.45)',
                        }}
                    >
                        {brandUpper}
                    </div>
                    <div style={{ display: 'flex', width: 44, height: 8, borderRadius: 8, background: brand.accent }} />
                </div>
            </div>
        ),
        {
            width: 1080,
            height: 1350,
            ...(fonts.length ? { fonts } : {}),
            headers: {
                // Per-alumno + auth-gated: nunca cachear en CDN/compartido.
                'Cache-Control': 'private, no-store, max-age=0',
            },
        }
    )
}
