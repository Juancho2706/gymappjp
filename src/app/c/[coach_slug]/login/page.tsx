import { createClient } from '@/lib/supabase/server'
import { Dumbbell } from 'lucide-react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import ClientLoginForm from './ClientLoginForm'
import type { Metadata } from 'next'
import type { Tables } from '@/lib/database.types'
import { InstallPrompt } from '@/components/InstallPrompt'

type Coach = Tables<'coaches'>

interface Props {
    params: Promise<{ coach_slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { coach_slug } = await params
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        .select('brand_name, logo_url')
        .eq('slug', coach_slug)
        .maybeSingle()
    const coach = data as Pick<Coach, 'brand_name' | 'logo_url'> | null
    const brandName = coach?.brand_name ?? 'Mi Coach'

    return {
        title: `Ingresar | ${brandName}`,
        manifest: `/api/manifest/${coach_slug}`,
        appleWebApp: {
            capable: true,
            statusBarStyle: 'black-translucent',
            title: brandName,
        },
        icons: coach?.logo_url ? {
            apple: coach.logo_url,
        } : undefined,
    }
}

export default async function ClientLoginPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data } = await supabase
        .from('coaches')
        .select('brand_name, primary_color, logo_url')
        .eq('slug', coach_slug)
        .maybeSingle()

    const coach = data as Pick<Coach, 'brand_name' | 'primary_color' | 'logo_url'> | null

    if (!coach) notFound()

    return (
        <div
            className="min-h-screen flex items-center justify-center p-4 bg-background"
        >
            {/* Ambient glow using coach color */}
            <div
                className="fixed inset-0 pointer-events-none"
                aria-hidden="true"
                style={{
                    background: `radial-gradient(ellipse 80% 60% at 50% -20%, ${coach.primary_color}25, transparent)`,
                }}
            />

            <div className="relative z-10 w-full max-w-md animate-slide-up">
                {/* Coach brand header */}
                <div className="text-center mb-8">
                    {coach.logo_url ? (
                        <div className="inline-block mb-4">
                            <Image
                                src={coach.logo_url}
                                alt={coach.brand_name}
                                width={72}
                                height={72}
                                className="rounded-2xl object-contain"
                            />
                        </div>
                    ) : (
                        <div
                            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 border"
                            style={{
                                backgroundColor: `${coach.primary_color}20`,
                                borderColor: `${coach.primary_color}35`,
                            }}
                        >
                            <Dumbbell className="w-8 h-8" style={{ color: coach.primary_color }} />
                        </div>
                    )}
                    <h1
                        className="text-3xl font-bold tracking-tight text-foreground"
                        style={{ fontFamily: 'var(--font-outfit)' }}
                    >
                        {coach.brand_name}
                    </h1>
                    <p className="mt-1 text-muted-foreground text-sm">Tu plataforma de entrenamiento</p>
                </div>

                {/* Login form — client component */}
                <ClientLoginForm
                    coachSlug={coach_slug}
                    primaryColor={coach.primary_color}
                    brandName={coach.brand_name}
                    logoUrl={coach.logo_url}
                />
            </div>

            <InstallPrompt brandName={coach.brand_name} />
        </div>
    )
}
