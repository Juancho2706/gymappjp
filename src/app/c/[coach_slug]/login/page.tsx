import { createClient } from '@/lib/supabase/server'
import { Dumbbell } from 'lucide-react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import ClientLoginForm from './ClientLoginForm'
import type { Metadata } from 'next'
import type { Tables } from '@/lib/database.types'
import { InstallPrompt } from '@/components/InstallPrompt'
import { BRAND_APP_ICON } from '@/lib/brand-assets'

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
    }
}

export default async function ClientLoginPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data } = await supabase
        .from('coaches')
        .select('brand_name, primary_color, logo_url, welcome_message')
        .eq('slug', coach_slug)
        .maybeSingle()

    const coach = data as Pick<Coach, 'brand_name' | 'primary_color' | 'logo_url' | 'welcome_message'> | null

    if (!coach) notFound()

    return (
        <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 pt-safe bg-background overflow-hidden">
            {/* Ambient glow using coach color */}
            <div
                className="fixed inset-0 pointer-events-none"
                aria-hidden="true"
                style={{
                    background: `radial-gradient(ellipse 90% 55% at 50% -10%, ${coach.primary_color}22, transparent 65%)`,
                }}
            />
            {/* Subtle grid */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
                aria-hidden
                style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.1) 1px,transparent 1px)', backgroundSize: '40px 40px' }}
            />

            <div className="relative z-10 w-full max-w-sm">
                {/* Coach brand header */}
                <div className="text-center mb-7">
                    <div className="flex justify-center mb-4">
                        {coach.logo_url ? (
                            <div
                                className="relative flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden border shadow-lg"
                                style={{ borderColor: `${coach.primary_color}30`, boxShadow: `0 8px 32px ${coach.primary_color}20` }}
                            >
                                <Image
                                    src={coach.logo_url}
                                    alt={coach.brand_name}
                                    fill
                                    className="object-contain p-2"
                                />
                            </div>
                        ) : (
                            <div
                                className="flex items-center justify-center w-20 h-20 rounded-2xl border shadow-lg"
                                style={{
                                    backgroundColor: `${coach.primary_color}15`,
                                    borderColor: `${coach.primary_color}30`,
                                    boxShadow: `0 8px 32px ${coach.primary_color}15`,
                                }}
                            >
                                <Dumbbell className="w-9 h-9" style={{ color: coach.primary_color }} />
                            </div>
                        )}
                    </div>
                    <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                        {coach.brand_name}
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                        {coach.welcome_message?.trim() || 'Tu plataforma de entrenamiento personalizado'}
                    </p>
                </div>

                {/* Login form */}
                <ClientLoginForm
                    coachSlug={coach_slug}
                    primaryColor={coach.primary_color}
                    brandName={coach.brand_name}
                    logoUrl={coach.logo_url}
                />

                {/* Powered by EVA */}
                <p className="mt-5 text-center text-xs text-muted-foreground/60">
                    Impulsado por{' '}
                    <span className="font-semibold text-muted-foreground">EVA</span>
                </p>
            </div>

            <InstallPrompt brandName={coach.brand_name} />
        </div>
    )
}
