'use client'

import { usePathname } from 'next/navigation'

export function CoachMainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const isBuilder = pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')
    const isNutritionHub =
        pathname === '/coach/nutrition-plans' || pathname.startsWith('/coach/nutrition-plans/')

    if (isBuilder) {
        return (
            <main className="flex-1 overflow-hidden flex flex-col min-h-0">
                {children}
            </main>
        )
    }

    return (
        <main className="flex-1 overflow-auto pb-[72px] md:pb-0 relative">
            <div
                className={`mx-auto px-4 py-6 md:px-8 md:py-10 animate-fade-in ${
                    isNutritionHub ? 'max-w-[2000px] w-full' : 'max-w-[1600px]'
                }`}
            >
                {children}
            </div>
        </main>
    )
}
