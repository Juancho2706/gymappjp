'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/**
 * Coach móvil: SIN header fijo global (cada pantalla renderiza su propio header + la cápsula
 * flotante navega). Solo se respeta el notch (safe-area + 1rem) — ya no se reserva la altura
 * de una barra superior que no existe.
 */
const COACH_MOBILE_TOP_CHROME_PT = 'pt-[var(--mobile-content-top-offset)]'

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
                'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto pb-[var(--mobile-content-bottom-offset)] md:pb-0',
                COACH_MOBILE_TOP_CHROME_PT,
                'md:pt-0'
            )}
        >
            <div
                className={cn(
                    // Shell reading column (eva-desktop): page-x = --dt-page-x (32px) en desktop,
                    // 16px en móvil; ancho de lectura por defecto = --dt-read-wide (1240, dashboards/grids).
                    // Las anchuras más estrechas (ficha --dt-read-mid 980 · settings --dt-read-narrow 720)
                    // las aplican las pantallas en sus olas; aquí solo el default wide del shell.
                    'mx-auto w-full min-w-0 max-w-full px-4 py-6 animate-fade-in md:px-[var(--dt-page-x)] md:py-10',
                    // Nutrición = tablero master-detail (no columna de lectura): conserva su ancho amplio.
                    isNutritionHub ? 'md:max-w-[2000px]' : 'md:max-w-[var(--dt-read-wide)]'
                )}
            >
                {children}
            </div>
        </main>
    )
}
