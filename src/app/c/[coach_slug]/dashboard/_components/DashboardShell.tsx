import type { ReactNode } from 'react'

interface DashboardShellProps {
    /** Header, calendario, check-in, hero (orden §5 mobile). */
    beforeSidebar: ReactNode
    /** Columna lateral en &lt; md (debajo del hero). Misma UI que `sidebarDesktop`; datos deduplicados con cache(). */
    sidebarMobile: ReactNode
    sidebarDesktop: ReactNode
    /** Programa, historial, gráfico peso (main col). */
    afterSidebar: ReactNode
}

export function DashboardShell({ beforeSidebar, sidebarMobile, sidebarDesktop, afterSidebar }: DashboardShellProps) {
    return (
        <div className="min-h-dvh bg-background">
            <div className="mx-auto max-w-5xl px-4 pt-[var(--mobile-content-top-offset)] pb-[calc(1rem+var(--mobile-content-bottom-offset))] sm:px-6 md:pb-6 lg:pt-4">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="min-w-0 space-y-4">
                        {beforeSidebar}
                        <div className="space-y-4 md:hidden">{sidebarMobile}</div>
                        {afterSidebar}
                    </div>
                    <aside className="hidden flex-col gap-4 self-start md:sticky md:top-6 md:flex">{sidebarDesktop}</aside>
                </div>
            </div>
        </div>
    )
}
