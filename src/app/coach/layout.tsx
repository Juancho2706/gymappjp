import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
import type { Tables } from '@/lib/database.types'
import { SuccessAnimationProvider } from '@/components/SuccessAnimationProvider'

type Coach = Tables<'coaches'>
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: {
        default: 'Panel Coach',
        template: '%s | OmniCoach OS',
    },
}

export default async function CoachLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    // Fetch user and coach data in parallel to avoid layout blocking
    const [userResponse, coachResponse] = await Promise.all([
        supabase.auth.getUser(),
        supabase
            .from('coaches')
            .select('full_name, brand_name, subscription_status')
            .maybeSingle()
    ])

    const { user } = userResponse.data
    if (!user) {
        redirect('/login')
    }

    const coach = coachResponse.data as Pick<Coach, 'full_name' | 'brand_name' | 'subscription_status'> | null

    if (!coach) {
        redirect('/login')
    }

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-background transition-colors">
            <CoachSidebar
                coachName={coach.full_name}
                coachBrand={coach.brand_name}
            />
            <main className="flex-1 overflow-auto pb-[72px] md:pb-0 bg-muted/20 dark:bg-background">
                <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8">
                    {children}
                </div>
            </main>
            <SuccessAnimationProvider />
        </div>
    )
}
