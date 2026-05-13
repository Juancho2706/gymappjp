'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/** Coach: safe-area + altura del header fijo móvil (CoachSidebar). No usar --mobile-content-top-offset (alumno). */
const COACH_MOBILE_TOP_CHROME_PT = 'pt-[var(--coach-mobile-content-top-offset)]'

export function CoachMainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const isBuilder = pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')
    const isNutritionHub =
        pathname === '/coach/nutrition-plans' || pathname.startsWith('/coach/nutrition-plans/')

    if (isBuilder) {
        return (
            <main
                className={cn(
                    'coach-builder-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
                    'md:pt-0'
                )}
            >
                {children}
            </main>
        )
    }

    return (
        <main
            className={cn(
                'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-contain md:overscroll-auto pb-[var(--mobile-content-bottom-offset)] md:pb-0',
                COACH_MOBILE_TOP_CHROME_PT,
                'md:pt-0'
            )}
        >
            <div
                className={cn(
                    'mx-auto w-full min-w-0 max-w-full px-4 py-6 animate-fade-in md:px-8 md:py-10',
                    isNutritionHub ? 'max-w-[2000px]' : 'max-w-[1600px]'
                )}
            >
                {children}
            </div>
        </main>
    )
}
