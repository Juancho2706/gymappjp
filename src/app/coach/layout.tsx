import { redirect } from 'next/navigation'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachMainWrapper } from '@/components/coach/CoachMainWrapper'
import { CoachSuccessAnimationLazy } from '@/components/coach/CoachSuccessAnimationLazy'
import { getCoach } from '@/lib/coach/get-coach'
import type { Metadata } from 'next'
import { BRAND_PRIMARY_COLOR, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'

export const metadata: Metadata = {
    title: {
        default: 'Panel Coach',
        template: '%s | EVA',
    },
}

function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return '0, 122, 255'
    return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
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

    const primaryColor =
        coach.use_brand_colors_coach === false
            ? SYSTEM_PRIMARY_COLOR
            : (coach.primary_color || BRAND_PRIMARY_COLOR)
    const primaryRgb = hexToRgb(primaryColor)

    return (
        <>
        <style dangerouslySetInnerHTML={{ __html: `:root { --theme-primary: ${primaryColor}; --theme-primary-rgb: ${primaryRgb}; }` }} />
        <div
            className="coach-layout-container flex min-h-[100dvh] min-w-0 flex-col bg-white transition-colors selection:bg-primary/30 selection:text-primary dark:bg-black md:min-h-screen md:flex-row"
            style={{ '--theme-primary': primaryColor, '--theme-primary-rgb': primaryRgb } as React.CSSProperties}
        >
            <CoachSidebar
                coachName={coach.full_name}
                coachBrand={coach.brand_name}
                primaryColor={primaryColor}
                subscriptionStatus={coach.subscription_status}
            />
            <CoachMainWrapper>
                {/* Background ambient glow */}
                <div
                    className="fixed top-0 right-0 w-[500px] h-[500px] blur-[120px] rounded-full -z-10 pointer-events-none opacity-20 dark:opacity-10"
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                />
                <div
                    className="fixed bottom-0 left-0 w-[300px] h-[300px] blur-[100px] rounded-full -z-10 pointer-events-none opacity-10 dark:opacity-5"
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                />
                {children}
            </CoachMainWrapper>
            <CoachSuccessAnimationLazy />
        </div>
        </>
    )
}

