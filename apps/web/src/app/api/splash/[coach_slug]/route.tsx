import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'

// iOS PWA splash screen, generated on the fly (free, native next/og — no paid service).
// Brand resolves from the coach row by invite_code (primary) or legacy slug; for
// org-managed coaches that row already carries the org's published brand
// (name/color/logo), so the splash is white-label. Para el alumno de pool
// (clients.team_id NO NULL, org_id NULL) la marca se resuelve desde el TEAM (centro),
// nunca desde la marca personal del coach.
export const runtime = 'nodejs'

interface Params {
    params: Promise<{ coach_slug: string }>
}

function safeColor(c: string | null | undefined, fallback: string) {
    return c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : fallback
}

export async function GET(request: NextRequest, { params }: Params) {
    const { coach_slug } = await params
    const { searchParams } = new URL(request.url)
    const width = Math.min(2048, Math.max(320, Number(searchParams.get('w')) || 1170))
    const height = Math.min(2732, Math.max(320, Number(searchParams.get('h')) || 2532))

    const supabase = await createClient()
    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, primary_color, logo_url')
        .eq(coachIdentifierColumn(coach_slug), coach_slug)
        .maybeSingle()

    // Marca base: coach (standalone) o coach con marca org embebida (managed). El alumno de pool
    // la sobrescribe con la del TEAM más abajo.
    let brandName = coach?.brand_name ?? 'EVA'
    let logoUrl = coach?.logo_url ?? null
    let bg = safeColor(coach?.primary_color, '#10B981')

    // Alumno de pool (team_id set, org_id NULL): marca del TEAM (name/logo_url/primary_color +
    // splash_bg_color para el fondo). teams no tiene SELECT anon → service-role.
    // getClaims(): verificación local del JWT (ES256), sin /user. Best-effort identity-only (.eq('id', user.id)); splash público y cacheado → no requiere revocación fresca.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (user) {
        const { data: client } = await supabase
            .from('clients')
            .select('org_id, team_id')
            .eq('id', user.id)
            .maybeSingle()

        if (client?.team_id && !client.org_id) {
            const admin = createServiceRoleClient()
            const { data: team } = await admin
                .from('teams')
                .select('name, logo_url, primary_color, splash_bg_color')
                .eq('id', client.team_id)
                .is('deleted_at', null)
                .maybeSingle()

            if (team) {
                brandName = team.name ?? brandName
                logoUrl = team.logo_url ?? logoUrl
                // Fondo: splash_bg_color del team si está, si no su primary_color.
                bg = safeColor(team.splash_bg_color ?? team.primary_color, bg)
            }
        }
    }

    const markSize = Math.round(Math.min(width, height) * 0.28)

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `linear-gradient(160deg, ${bg} 0%, ${bg}cc 100%)`,
                }}
            >
                {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" width={markSize} height={markSize} style={{ borderRadius: markSize * 0.22, objectFit: 'cover' }} />
                ) : (
                    <div
                        style={{
                            width: markSize,
                            height: markSize,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: markSize * 0.22,
                            background: 'rgba(255,255,255,0.16)',
                            color: '#ffffff',
                            fontSize: markSize * 0.5,
                            fontWeight: 900,
                        }}
                    >
                        {brandName.charAt(0).toUpperCase()}
                    </div>
                )}
            </div>
        ),
        {
            width,
            height,
            headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
        }
    )
}
