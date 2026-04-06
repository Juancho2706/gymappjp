import { redirect } from 'next/navigation'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { SuccessAnimationProvider } from '@/components/SuccessAnimationProvider'
import { getCoach } from '@/lib/coach/get-coach'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: {
        default: 'Panel Coach',
        template: '%s | COACH OP',
    },
}

export default async function CoachLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const coach = await getCoach()

    if (!coach) {
        redirect('/login')
    }

    const primaryColor = coach.use_brand_colors_coach === false ? '#007AFF' : (coach.primary_color || '#007AFF')

    return (
        <div 
            className="coach-layout-container flex flex-col md:flex-row min-h-screen bg-white dark:bg-black transition-colors pt-safe selection:bg-primary/30 selection:text-primary"
            style={{ '--theme-primary': primaryColor } as React.CSSProperties}
        >
            <CoachSidebar
                coachName={coach.full_name}
                coachBrand={coach.brand_name}
                primaryColor={primaryColor}
            />
            <main className="flex-1 overflow-auto pb-[72px] md:pb-0 relative">
                {/* Background ambient glow */}
                <div 
                    className="fixed top-0 right-0 w-[500px] h-[500px] blur-[120px] rounded-full -z-10 pointer-events-none opacity-20 dark:opacity-10" 
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                />
                <div 
                    className="fixed bottom-0 left-0 w-[300px] h-[300px] blur-[100px] rounded-full -z-10 pointer-events-none opacity-10 dark:opacity-5" 
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                />
                
                <div className="max-w-[1600px] mx-auto px-4 py-6 md:px-8 md:py-10 animate-fade-in">
                    {children}
                </div>
            </main>
            <SuccessAnimationProvider />
        </div>
    )
}
