import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOrgBySlug } from '../_data/org.queries'

export const metadata: Metadata = { title: 'Configuración inicial' }

interface Props {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}

export default async function OnboardingLayout({ children, params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)

    if (!org) redirect('/coach/dashboard')

    // Already completed onboarding step 5 → send to dashboard
    if ((org.onboarding_step ?? 0) >= 5) redirect(`/org/${slug}`)

    return (
        <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg">
                {children}
            </div>
        </div>
    )
}
