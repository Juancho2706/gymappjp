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
        <div className="flex flex-col md:flex-row min-h-screen bg-black transition-colors pt-safe selection:bg-primary/30 selection:text-primary">
            <CoachSidebar
                coachName={coach.full_name}
                coachBrand={coach.brand_name}
            />
            <main className="flex-1 overflow-auto pb-[72px] md:pb-0 relative">
                {/* Background ambient glow */}
                <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full -z-10 pointer-events-none" />
                <div className="fixed bottom-0 left-0 w-[300px] h-[300px] bg-primary/3 blur-[100px] rounded-full -z-10 pointer-events-none" />
                
                <div className="max-w-[1600px] mx-auto px-4 py-6 md:px-8 md:py-10 animate-fade-in">
                    {children}
                </div>
            </main>
            <SuccessAnimationProvider />
        </div>
    )
}
