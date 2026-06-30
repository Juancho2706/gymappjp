import type { ReactNode } from 'react'

/**
 * Shell del dashboard del alumno — responsive al breakpoint del DS (md = 760px).
 * <760: columna ÚNICA app-like (estructura eva-app, `alumno-dashboard.jsx` verbatim).
 * >=760: ancho `--dt-read-wide` (1240px) con gutter `--dt-page-x` (32px) para el bento desktop
 * de `DesktopAlumnoDashboard`. El árbol móvil (md:hidden) y el desktop (hidden md:block) los
 * decide `page.tsx`; este shell solo provee el contenedor + el gutter por ancho.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-dvh bg-background">
            <div className="mx-auto w-full max-w-xl px-5 pt-2 pb-[calc(1.5rem+var(--mobile-content-bottom-offset))] md:max-w-[1240px] md:px-8 md:pb-11 md:pt-7">
                <div className="flex flex-col gap-3.5">{children}</div>
            </div>
        </div>
    )
}
