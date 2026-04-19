import { redirect } from 'next/navigation'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachMainWrapper } from '@/components/coach/CoachMainWrapper'
import { CoachSuccessAnimationLazy } from '@/components/coach/CoachSuccessAnimationLazy'
import { NoiseOverlay } from '@/components/fx/NoiseOverlay'
import { AmbientMesh } from '@/components/fx/AmbientMesh'
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
            className="coach-layout-container flex min-h-[100dvh] min-w-0 flex-col bg-[var(--obs-base)] text-[var(--obs-text)] transition-colors selection:bg-[rgb(var(--theme-primary-rgb))]/40 selection:text-white md:min-h-screen md:flex-row has-[.coach-builder-shell]:h-dvh has-[.coach-builder-shell]:max-h-dvh has-[.coach-builder-shell]:min-h-0 has-[.coach-builder-shell]:overflow-hidden"
            style={{ '--theme-primary': primaryColor, '--theme-primary-rgb': primaryRgb } as React.CSSProperties}
        >
            {/* Concept A — Kinetic Obsidian ambient FX */}
            <AmbientMesh />

            <CoachSidebar
                coachName={coach.full_name}
                coachBrand={coach.brand_name}
                primaryColor={primaryColor}
                subscriptionStatus={coach.subscription_status}
            />
            <CoachMainWrapper>
                {children}
            </CoachMainWrapper>
            <CoachSuccessAnimationLazy />
            <NoiseOverlay />
        </div>
        </>
    )
}

