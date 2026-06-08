import { Building2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import type { Metadata } from 'next'
import EnterpriseLoginForm from './EnterpriseLoginForm'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { getEnterpriseLoginOrg } from './_data/login.queries'

interface Props {
    params: Promise<{ org_slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { org_slug } = await params
    const org = await getEnterpriseLoginOrg(org_slug)
    const brandName = org?.name ?? 'Tu organización'

    return {
        title: `Ingresar | ${brandName}`,
        appleWebApp: {
            capable: true,
            statusBarStyle: 'black-translucent',
            title: brandName,
        },
        icons: org?.logo_url
            ? {
                icon: [{ url: org.logo_url }],
                shortcut: [{ url: org.logo_url }],
                apple: [{ url: org.logo_url }],
            }
            : {
                icon: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                shortcut: [{ url: BRAND_APP_ICON, type: 'image/png' }],
                apple: [{ url: BRAND_APP_ICON, type: 'image/png' }],
            },
    }
}

export default async function EnterpriseLoginPage({ params }: Props) {
    const { org_slug } = await params
    const org = await getEnterpriseLoginOrg(org_slug)

    if (!org) notFound()

    return (
        <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 pt-safe bg-background overflow-hidden">
            {/* Ambient glow using org color */}
            <div
                className="fixed inset-0 pointer-events-none"
                aria-hidden="true"
                style={{
                    background: `radial-gradient(ellipse 90% 55% at 50% -10%, ${org.primary_color}22, transparent 65%)`,
                }}
            />
            {/* Subtle grid */}
            <div
                className="fixed inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
                aria-hidden
                style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.1) 1px,transparent 1px)', backgroundSize: '40px 40px' }}
            />

            <div className="relative z-10 w-full max-w-sm">
                {/* Org brand header */}
                <div className="text-center mb-7">
                    <div className="flex justify-center mb-4">
                        {org.logo_url ? (
                            <div
                                className="relative flex items-center justify-center w-20 h-20 rounded-2xl overflow-hidden border shadow-lg"
                                style={{ borderColor: `${org.primary_color}30`, boxShadow: `0 8px 32px ${org.primary_color}20` }}
                            >
                                <Image
                                    src={org.logo_url}
                                    alt={org.name}
                                    fill
                                    className="object-contain p-2"
                                />
                            </div>
                        ) : (
                            <div
                                className="flex items-center justify-center w-20 h-20 rounded-2xl border shadow-lg"
                                style={{
                                    backgroundColor: `${org.primary_color}15`,
                                    borderColor: `${org.primary_color}30`,
                                    boxShadow: `0 8px 32px ${org.primary_color}15`,
                                }}
                            >
                                <Building2 className="w-9 h-9" style={{ color: org.primary_color }} />
                            </div>
                        )}
                    </div>
                    <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                        {org.name}
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
                        Tu plataforma de entrenamiento
                    </p>
                </div>

                {/* Login form */}
                <EnterpriseLoginForm
                    orgSlug={org_slug}
                    primaryColor={org.primary_color}
                    brandName={org.name}
                    logoUrl={org.logo_url}
                />

                {/* Powered by EVA */}
                <p className="mt-5 text-center text-xs text-muted-foreground/60">
                    Impulsado por{' '}
                    <span className="font-semibold text-muted-foreground">EVA</span>
                </p>
            </div>
        </div>
    )
}
