import type { ReactNode } from 'react'

/**
 * Shell del dashboard del alumno — columna ÚNICA centrada (estructura eva-app).
 * El kit desktop monta el MISMO `StudentDashboard` (no hay bento de escritorio para el alumno),
 * así que la estructura mobile-first sirve a todos los anchos: una sola columna app-like.
 * El orden de las secciones lo decide `page.tsx` (1:1 con el jsx del diseño).
 */
export function DashboardShell({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-dvh bg-background">
            <div className="mx-auto max-w-xl px-5 pt-2 pb-[calc(1.5rem+var(--mobile-content-bottom-offset))] md:pb-8 lg:pt-4">
                <div className="flex flex-col gap-3.5">{children}</div>
            </div>
        </div>
    )
}
