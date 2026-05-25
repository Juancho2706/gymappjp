import { createClient } from '@/lib/supabase/server'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>
type ManifestBrand = Pick<Coach, 'brand_name' | 'primary_color' | 'logo_url'>

interface Params {
    params: Promise<{ coach_slug: string }>
}

export async function GET(request: NextRequest, { params }: Params) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data: coachData } = await supabase
        .from('coaches')
        .select('id, brand_name, primary_color, logo_url, slug')
        .eq('slug', coach_slug)
        .maybeSingle()

    const coach = coachData as Pick<Coach, 'id' | 'brand_name' | 'primary_color' | 'logo_url' | 'slug'> | null

    if (!coach) {
        return new NextResponse('Not found', { status: 404 })
    }

    const brand = await resolveManifestBrand(supabase, coach)
    const primaryColor = brand.primary_color ?? '#8B5CF6'
    const brandName = brand.brand_name

    const manifest = {
        name: brandName,
        short_name: brandName,
        description: `Entrenamiento personalizado con ${brandName}`,
        start_url: `/c/${coach_slug}/dashboard`,
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: primaryColor,
        orientation: 'portrait',
        icons: brand.logo_url
            ? [
                {
                    src: brand.logo_url,
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any maskable',
                },
                {
                    src: brand.logo_url,
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any maskable',
                },
            ]
            : [
                {
                    src: BRAND_APP_ICON,
                    sizes: '192x192',
                    type: 'image/png',
                },
                {
                    src: BRAND_APP_ICON,
                    sizes: '512x512',
                    type: 'image/png',
                },
            ],
    }

    return NextResponse.json(manifest, {
        headers: {
            'Content-Type': 'application/manifest+json',
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
    })
}

async function resolveManifestBrand(
    supabase: Awaited<ReturnType<typeof createClient>>,
    coach: ManifestBrand & { id: string }
): Promise<ManifestBrand> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return coach

    const { data: client } = await supabase
        .from('clients')
        .select('coach_id, org_id')
        .eq('id', user.id)
        .maybeSingle()

    if (!client?.org_id) return coach

    let isOrgCoach = client.coach_id === coach.id
    if (!isOrgCoach) {
        const { data: orgMember } = await supabase
            .from('organization_members')
            .select('id')
            .eq('org_id', client.org_id)
            .eq('coach_id', coach.id)
            .eq('status', 'active')
            .is('deleted_at', null)
            .maybeSingle()
        isOrgCoach = Boolean(orgMember)
    }

    if (!isOrgCoach) return coach

    const { data: org } = await supabase
        .from('organizations')
        .select('name, logo_url, primary_color')
        .eq('id', client.org_id)
        .maybeSingle()

    if (!org) return coach
    return {
        brand_name: org.name ?? coach.brand_name,
        logo_url: org.logo_url ?? coach.logo_url,
        primary_color: org.primary_color ?? coach.primary_color,
    }
}
