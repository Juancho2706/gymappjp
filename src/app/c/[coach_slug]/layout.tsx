import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import type { Coach } from '@/lib/database.types'
import InstallPrompt from '@/components/InstallPrompt'
import { ClientNav } from '@/components/client/ClientNav'

interface Props {
    children: React.ReactNode
    params: Promise<{ coach_slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { coach_slug } = await params
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        .select('brand_name')
        .eq('slug', coach_slug)
        .maybeSingle()

    const coach = data as Pick<Coach, 'brand_name'> | null

    return {
        title: {
            default: coach?.brand_name ?? 'Mi Coach',
            template: `%s | ${coach?.brand_name ?? 'Mi Coach'}`,
        },
    }
}

export default async function ClientBrandLayout({ children, params }: Props) {
    const { coach_slug } = await params
    const headersList = await headers()

    // Read branding from middleware headers (set in middleware.ts)
    const primaryColor = headersList.get('x-coach-primary-color') ?? '#8B5CF6'
    const brandName = headersList.get('x-coach-brand-name') ?? 'Mi Coach'
    const logoUrl = headersList.get('x-coach-logo-url') ?? ''
    const coachId = headersList.get('x-coach-id') ?? ''

    if (!coachId) {
        redirect('/not-found')
    }

    return (
        <div
            className="flex flex-col md:flex-row min-h-screen antialiased bg-background text-foreground"
            style={{ '--theme-primary': primaryColor } as React.CSSProperties}
            data-coach-slug={coach_slug}
            data-brand-name={brandName}
        >
            {/* Dynamic PWA manifest — unique per coach */}
            <link
                rel="manifest"
                href={`/c/${coach_slug}/manifest.webmanifest`}
            />
            <meta name="theme-color" content={primaryColor} />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
            <meta name="apple-mobile-web-app-title" content={brandName} />
            {logoUrl && <link rel="apple-touch-icon" href={logoUrl} />}

            <ClientNav coachSlug={coach_slug} coachBrand={brandName} />

            <main className="flex-1 overflow-auto pb-[72px] md:pb-0 relative z-0 bg-muted/20 dark:bg-background">
                {children}
            </main>

            <InstallPrompt />
        </div>
    )
}
