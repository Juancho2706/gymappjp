import { redirect } from 'next/navigation'
import { OnboardingForm } from './OnboardingForm'
import { getClientOnboardingState } from './_data/onboarding.queries'
import { getClientBasePath } from '@/lib/client/base-path'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function OnboardingPage({ params }: Props) {
    const { coach_slug } = await params
    const base = await getClientBasePath(coach_slug)
    const { user, onboardingCompleted } = await getClientOnboardingState()
    if (!user) redirect(`${base}/login`)

    if (onboardingCompleted) {
        redirect(`${base}/dashboard`)
    }

    return (
        <main className="flex min-h-dvh flex-col items-center md:justify-center py-12 px-4 pt-safe sm:px-6">
            <div className="w-full max-w-xl space-y-8 bg-surface-card/80 backdrop-blur-xl p-8 rounded-card border border-border-subtle shadow-[var(--shadow-lg)]">
                <div className="text-center">
                    <h1 className="font-display text-3xl font-black text-text-strong tracking-[-0.03em]">Completa tu perfil</h1>
                    <p className="mt-3 text-sm text-text-muted">
                        Tu coach necesita estos datos para personalizar tu entrenamiento y nutrición.
                    </p>
                    <p className="mt-3 rounded-control border border-[var(--warning-500)]/30 bg-[var(--warning-100)] px-3 py-2 text-xs text-[var(--warning-700)]">
                        EVA no es un dispositivo medico ni sustituye el consejo de profesionales de la salud.
                    </p>
                </div>
                <OnboardingForm coachSlug={coach_slug} />
            </div>
        </main>
    )
}
