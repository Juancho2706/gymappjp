import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CompleteOnboardingForm } from './_components/CompleteOnboardingForm'

export default async function CompleteOnboardingPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const defaultName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        ''

    return <CompleteOnboardingForm defaultName={defaultName} />
}
