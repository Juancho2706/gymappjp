import { Users } from 'lucide-react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import type { Metadata } from 'next'
import TeamLoginForm from './TeamLoginForm'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { getTeamLoginInfo } from './_data/login.queries'

interface Props {
    params: Promise<{ team_slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { team_slug } = await params
    const team = await getTeamLoginInfo(team_slug)
    const brandName = team?.name ?? 'Tu equipo'

    return {
        title: `Ingresar | ${brandName}`,
        appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: brandName },
        icons: team?.logo_url
            ? { icon: [{ url: team.logo_url }], shortcut: [{ url: team.logo_url }], apple: [{ url: team.logo_url }] }
            : {
                icon: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                shortcut: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                apple: [{ url: BRAND_APP_ICON, type: 'image/png' }],
            },
    }
}

export default async function TeamLoginPage({ params }: Props) {
    const { team_slug } = await params
    const team = await getTeamLoginInfo(team_slug)
    if (!team) notFound()

    return (
        <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 pt-safe bg-background overflow-hidden">
            <div
                className="fixed inset-0 pointer-events-none"
                aria-hidden="true"
                style={{ background: `radial-gradient(ellipse 90% 55% at 50% -10%, ${team.primary_color}22, transparent 65%)` }}
            />
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
                aria-hidden
                style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.1) 1px,transparent 1px)', backgroundSize: '40px 40px' }}
            />

            <div className="relative z-10 w-full max-w-sm">
                <div className="text-center mb-7">
                    <div className="flex justify-center mb-4">
                        {team.logo_url ? (
                            <div
                                className="relative flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden border shadow-lg"
                                style={{ borderColor: `${team.primary_color}30`, boxShadow: `0 8px 32px ${team.primary_color}20` }}
                            >
                                <Image src={team.logo_url} alt={team.name} fill className="object-contain p-2" />
                            </div>
                        ) : (
                            <div
                                className="flex items-center justify-center w-20 h-20 rounded-2xl border shadow-lg"
                                style={{ backgroundColor: `${team.primary_color}15`, borderColor: `${team.primary_color}30`, boxShadow: `0 8px 32px ${team.primary_color}15` }}
                            >
                                <Users className="w-9 h-9" style={{ color: team.primary_color }} />
                            </div>
                        )}
                    </div>
                    <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{team.name}</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                        Tu plataforma de entrenamiento
                    </p>
                </div>

                <TeamLoginForm
                    teamSlug={team_slug}
                    primaryColor={team.primary_color}
                    brandName={team.name}
                    logoUrl={team.logo_url}
                />

                <p className="mt-5 text-center text-xs text-muted-foreground/60">
                    Impulsado por <span className="font-semibold text-muted-foreground">EVA</span>
                </p>
            </div>
        </div>
    )
}
