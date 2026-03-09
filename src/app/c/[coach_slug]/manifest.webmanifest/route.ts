import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Coach } from '@/lib/database.types'

interface Params {
    params: Promise<{ coach_slug: string }>
}

export async function GET(request: NextRequest, { params }: Params) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data: coachData } = await supabase
        .from('coaches')
        .select('brand_name, primary_color, logo_url, slug')
        .eq('slug', coach_slug)
        .maybeSingle()

    const coach = coachData as Pick<Coach, 'brand_name' | 'primary_color' | 'logo_url' | 'slug'> | null

    if (!coach) {
        return new NextResponse('Not found', { status: 404 })
    }

    const primaryColor = coach.primary_color ?? '#8B5CF6'
    const brandName = coach.brand_name

    const manifest = {
        name: brandName,
        short_name: brandName,
        description: `Entrenamiento personalizado con ${brandName}`,
        start_url: `/c/${coach_slug}/dashboard`,
        display: 'standalone',
        background_color: '#0A0A0A',
        theme_color: primaryColor,
        orientation: 'portrait',
        icons: coach.logo_url
            ? [
                {
                    src: coach.logo_url,
                    sizes: '192x192',
                    type: 'image/png',
                    purpose: 'any maskable',
                },
                {
                    src: coach.logo_url,
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any maskable',
                },
            ]
            : [
                {
                    src: '/icons/icon-192.png',
                    sizes: '192x192',
                    type: 'image/png',
                },
                {
                    src: '/icons/icon-512.png',
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
