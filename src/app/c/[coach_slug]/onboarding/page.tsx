import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingForm } from './OnboardingForm'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function OnboardingPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    // Verify if onboarding is already completed
    const { data: client } = await supabase
        .from('clients')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()

    if (client?.onboarding_completed) {
        redirect(`/c/${coach_slug}/dashboard`)
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6">
            <div className="w-full max-w-xl space-y-8 bg-card/80 backdrop-blur-xl p-8 rounded-3xl border border-border shadow-2xl">
                <div className="text-center">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">Completa tu perfil</h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Tu coach necesita estos datos para personalizar tu entrenamiento y nutrición.
                    </p>
                </div>
                <OnboardingForm coachSlug={coach_slug} />
            </div>
        </main>
    )
}
