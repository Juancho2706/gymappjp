import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>
import { ClientNav } from '@/components/client/ClientNav'
import { InstallPrompt } from '@/components/InstallPrompt'

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

    return {
        title: {
            default: brandName,
            template: `%s | ${brandName}`,
        },
        manifest: `/api/manifest/${coach_slug}`,
        appleWebApp: {
            capable: true,
            statusBarStyle: 'black-translucent',
            title: brandName,
        },
        icons: coach?.logo_url
            ? { apple: coach.logo_url }
            : { apple: '/eva-app-icon.png' },
    }
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
    const { coach_slug } = await params
    const headersList = await headers()
    
    // Use the same logic as the main layout to get the primary color
    const primaryColor = headersList.get('x-coach-primary-color') ?? '#8B5CF6'
    
    return {
        themeColor: primaryColor,
    }
}

export default async function ClientBrandLayout({ children, params }: Props) {
    const { coach_slug } = await params
    const headersList = await headers()

    // Read branding from middleware headers (set in middleware.ts)
    const primaryColor = headersList.get('x-coach-primary-color') ?? '#8B5CF6'
    const brandName = headersList.get('x-coach-brand-name') ?? 'Mi Coach'
    const coachId = headersList.get('x-coach-id') ?? ''
    const useBrandColorsStr = headersList.get('x-client-use-brand-colors')
    const initialUseBrandColors = useBrandColorsStr ? useBrandColorsStr === 'true' : true

    // Compute RGB values for rgba() usage throughout the UI
    const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(primaryColor)
    const primaryRgb = hexMatch
        ? `${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}`
        : '0, 122, 255'

    if (!coachId) {
        redirect('/not-found')
    }

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: `:root { --theme-primary: ${primaryColor}; --theme-primary-rgb: ${primaryRgb}; }` }} />
            <div
                className="flex flex-col md:flex-row min-h-screen antialiased bg-background text-foreground"
                style={{ '--theme-primary': primaryColor, '--theme-primary-rgb': primaryRgb } as React.CSSProperties}
                data-coach-slug={coach_slug}
                data-brand-name={brandName}
            >
                <ClientNav coachSlug={coach_slug} coachBrand={brandName} initialUseBrandColors={initialUseBrandColors} />
                <InstallPrompt brandName={brandName} />

                <main className="flex-1 overflow-auto relative z-0 bg-muted/20 dark:bg-background pb-[80px] md:pb-0 has-[.is-workout-page]:pb-0">
                    {children}
                </main>
            </div>
        </>
    )
}
