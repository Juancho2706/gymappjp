import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
import type { Coach } from '@/lib/database.types'
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

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: coachData } = await supabase
        .from('coaches')
        .select('full_name, brand_name, subscription_status')
        .eq('id', user.id)
        .maybeSingle()

    const coach = coachData as Pick<Coach, 'full_name' | 'brand_name' | 'subscription_status'> | null

    if (!coach) {
        redirect('/login')
    }

    return (
        <div className="flex min-h-screen bg-background transition-colors">
            <CoachSidebar
                coachName={coach.full_name}
                coachBrand={coach.brand_name}
            />
            <main className="flex-1 overflow-auto">
                <div className="max-w-7xl mx-auto px-6 py-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
