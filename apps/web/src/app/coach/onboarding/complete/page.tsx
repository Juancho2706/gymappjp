import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CompleteOnboardingForm } from './_components/CompleteOnboardingForm'

export default async function CompleteOnboardingPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.error('[onboarding/complete] no user in server session → redirecting to /login')
        redirect('/login')
    }
    console.log('[onboarding/complete] user ok:', user.id, user.email)

    const defaultName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        ''

    return <CompleteOnboardingForm defaultName={defaultName} />
}
