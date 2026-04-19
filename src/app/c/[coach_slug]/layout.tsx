import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>
import {
    BRAND_APP_ICON,
    BRAND_OG_IMAGE,
    BRAND_OG_IMAGE_HEIGHT,
    BRAND_OG_IMAGE_WIDTH,
    BRAND_PRIMARY_COLOR,
} from '@/lib/brand-assets'
import { resolveMetadataBase } from '@/lib/site-url'
import { ClientNav } from '@/components/client/ClientNav'
import { InstallPrompt } from '@/components/InstallPrompt'
import { NoiseOverlay } from '@/components/fx/NoiseOverlay'
import { AmbientMesh } from '@/components/fx/AmbientMesh'

interface Props {
    children: React.ReactNode
    params: Promise<{ coach_slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { coach_slug } = await params
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        .select('brand_name, logo_url, primary_color')
        .eq('slug', coach_slug)
        .maybeSingle()

    const coach = data as Pick<Coach, 'brand_name' | 'logo_url' | 'primary_color'> & { use_brand_colors?: boolean } | null
    const brandName = coach?.brand_name ?? 'Mi Coach'

    const metadataBase = resolveMetadataBase()
    const openGraphImageAbsoluteUrl = new URL(BRAND_OG_IMAGE, metadataBase).href
    const coachPath = `/c/${coach_slug}`
    const pageUrl = new URL(coachPath, metadataBase).href

    return {
        metadataBase,
        title: {
            default: brandName,
            template: `%s | ${brandName}`,
        },
        description: `Entrena con ${brandName}. Rutinas, nutrición y seguimiento desde tu móvil.`,
        manifest: `/api/manifest/${coach_slug}`,
        appleWebApp: {
            capable: true,
            statusBarStyle: 'black-translucent',
            title: brandName,
        },
        icons: coach?.logo_url
            ? {
                icon: [{ url: coach.logo_url }],
                shortcut: [{ url: coach.logo_url }],
                apple: [{ url: coach.logo_url }],
            }
            : {
                icon: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                shortcut: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                apple: [{ url: BRAND_APP_ICON, type: 'image/png' }],
            },
        openGraph: {
            title: brandName,
            description: `Entrena con ${brandName}. Rutinas, nutrición y seguimiento desde tu móvil.`,
            url: pageUrl,
            siteName: brandName,
            images: [
                {
                    url: openGraphImageAbsoluteUrl,
                    width: BRAND_OG_IMAGE_WIDTH,
                    height: BRAND_OG_IMAGE_HEIGHT,
                    alt: brandName,
                    type: 'image/png',
                },
            ],
            locale: 'es_ES',
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: brandName,
            description: `Entrena con ${brandName}. Rutinas, nutrición y seguimiento desde tu móvil.`,
            images: [openGraphImageAbsoluteUrl],
        },
    }
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
    const { coach_slug } = await params
    const headersList = await headers()
    
    // Use the same logic as the main layout to get the primary color
    const primaryColor = headersList.get('x-coach-primary-color') ?? BRAND_PRIMARY_COLOR
    
    return {
        themeColor: primaryColor,
    }
}

export default async function ClientBrandLayout({ children, params }: Props) {
    const { coach_slug } = await params
    const headersList = await headers()

    // Read branding from middleware headers (set in middleware.ts)
    const primaryColor = headersList.get('x-coach-primary-color') ?? BRAND_PRIMARY_COLOR
    const logoUrl = headersList.get('x-coach-logo-url') || BRAND_APP_ICON
    const brandName = headersList.get('x-coach-brand-name') ?? 'Mi Coach'
    const coachId = headersList.get('x-coach-id') ?? ''
    const useBrandColorsStr = headersList.get('x-client-use-brand-colors')
    const initialUseBrandColors = useBrandColorsStr ? useBrandColorsStr === 'true' : true

    // Compute RGB values for rgba() usage throughout the UI
    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(primaryColor)
    const primaryRgb = hexMatch
        ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}`
        : '16, 185, 129'

    if (!coachId) {
        redirect('/not-found')
    }

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: `:root { --theme-primary: ${primaryColor}; --theme-primary-rgb: ${primaryRgb}; }` }} />
            <div
                className="flex flex-col md:flex-row min-h-dvh antialiased bg-[var(--obs-base)] text-[var(--obs-text)]"
                style={{ '--theme-primary': primaryColor, '--theme-primary-rgb': primaryRgb } as React.CSSProperties}
                data-coach-slug={coach_slug}
                data-brand-name={brandName}
            >
                {/* Concept A — Kinetic Obsidian ambient FX */}
                <AmbientMesh />

                <ClientNav
                    coachSlug={coach_slug}
                    coachBrand={brandName}
                    coachLogoUrl={logoUrl}
                    initialUseBrandColors={initialUseBrandColors}
                />
                <InstallPrompt brandName={brandName} />

                <main className="relative z-0 flex-1 overflow-auto bg-transparent pb-[var(--mobile-content-bottom-offset)] md:pb-0 has-[.is-workout-page]:pb-0">
                    {children}
                </main>
                <NoiseOverlay />
            </div>
        </>
    )
}
