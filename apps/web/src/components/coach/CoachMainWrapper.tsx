'use client'

import { useEffect, useRef } from 'react'
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
    const mainRef = useRef<HTMLElement>(null)

    // Desktop: el scroll vive DENTRO de <main> (chrome fijo, espejo del kit
    // `.eva-desktop { overflow: hidden }`) → al navegar se resetea manualmente
    // (el router solo restaura el scroll de window).
    useEffect(() => {
        mainRef.current?.scrollTo(0, 0)
    }, [pathname])

    const isBuilder = pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')
    const isNutritionHub =
        pathname === '/coach/nutrition-plans' || pathname.startsWith('/coach/nutrition-plans/')
    // Alumnos (directorio): en DESKTOP el master-detail / tabla es FULL-BLEED (.dt-md / .dt-tbl-root
    // del diseño = position:absolute; inset:0). En MÓVIL conserva la columna con padding (war-room + cards).
    const isClients = pathname === '/coach/clients'

    if (isBuilder) {
        return (
            <main
                id="coach-main"
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
            id="coach-main"
            ref={mainRef}
            className={cn(
                'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto pb-[var(--mobile-content-bottom-offset)] md:pb-0',
                COACH_MOBILE_TOP_CHROME_PT,
                'md:pt-0'
            )}
        >
            <div
                className={cn(
                    'mx-auto w-full min-w-0 max-w-full animate-fade-in',
                    isClients
                        ? // Alumnos desktop = FULL-BLEED: sin cap de ancho ni padding → el master-detail/tabla
                          // llena toda la región (flush contra sidebar y bajo el topbar). Móvil conserva px-5 py-6.
                          'px-5 py-6 md:max-w-none md:p-0'
                        : // Shell reading column (eva-desktop): page-x = --dt-page-x (32px) en desktop, 20px en
                          // móvil (gutter del kit eva-app); ancho de lectura por defecto = --dt-read-wide (1240,
                          // dashboards/grids). Las anchuras más estrechas (ficha --dt-read-mid 980 · settings
                          // --dt-read-narrow 720) las aplican las pantallas en sus olas; aquí solo el default
                          // wide del shell. Nutrición = tablero master-detail (no columna de lectura): conserva
                          // su ancho amplio.
                          cn(
                              'px-5 py-6 md:px-[var(--dt-page-x)] md:py-10',
                              isNutritionHub ? 'md:max-w-[2000px]' : 'md:max-w-[var(--dt-read-wide)]'
                          )
                )}
            >
                {children}
            </div>
        </main>
    )
}
