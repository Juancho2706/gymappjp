import { redirect } from 'next/navigation'
import { CompleteOnboardingForm } from './_components/CompleteOnboardingForm'
import { getCompleteOnboardingUser } from './_data/complete.queries'

export default async function CompleteOnboardingPage() {
    const user = await getCompleteOnboardingUser()

    if (!user) {
        console.error('[onboarding/complete] no user in server session → redirecting to /login')
        redirect('/login')
    }

    const defaultName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        ''

    return <CompleteOnboardingForm defaultName={defaultName} />
}
