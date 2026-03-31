'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    Users,
    Dumbbell,
    Settings,
    LogOut,
    Apple,
    ChevronRight,
    PanelLeftClose,
    PanelLeft,
    LayoutGrid
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'

const navItems = [
    {
        href: '/coach/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
    },
    {
        href: '/coach/clients',
        label: 'Alumnos',
        icon: Users,
    },
    {
        href: '/coach/exercises',
        label: 'Ejercicios',
        icon: Dumbbell,
    },
    {
        href: '/coach/nutrition-plans',
        label: 'Planes Nutricionales',
        shortLabel: 'Nutri',
        icon: Apple,
    },
    {
        href: '/coach/settings',
        label: 'Mi Marca',
        icon: Settings,
    },
]

interface CoachSidebarProps {
    coachName: string
    coachBrand: string
}

export function CoachSidebar({ coachName, coachBrand }: CoachSidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [isCollapsed, setIsCollapsed] = useState(false)

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <>
            {/* Mobile Top Header */}
            <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-sidebar-border bg-sidebar sticky top-0 z-40">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                        <Dumbbell className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-bold text-base truncate max-w-[150px]" style={{ fontFamily: 'var(--font-outfit)' }}>
                        {coachBrand || coachName}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <button onClick={handleSignOut} className="text-muted-foreground hover:text-destructive">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Navigation Sidebar (Desktop) / Bottom Nav (Mobile) */}
            <aside className={cn(
                "fixed bottom-0 left-0 right-0 z-50 md:sticky md:top-0 md:h-screen bg-sidebar border-t md:border-t-0 md:border-r border-sidebar-border flex flex-col transition-all duration-300",
                isCollapsed ? "md:w-20" : "md:w-64"
            )}>
                
                {/* Logo area (Desktop only) */}
                <div className={cn("hidden md:flex py-6 border-b border-sidebar-border items-center", isCollapsed ? "px-0 justify-center flex-col gap-4" : "px-6 justify-between")}>
                    <div className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
                        <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                            <Dumbbell className="w-5 h-5 text-primary" />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0">
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
                                    OmniCoach
                                </p>
                                <p className="text-sm font-bold text-foreground truncate" style={{ fontFamily: 'var(--font-outfit)' }}>
                                    {coachBrand || coachName}
                                </p>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted"
                        title={isCollapsed ? "Expandir" : "Contraer"}
                    >
                        {isCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
                    </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 flex flex-row justify-around md:flex-col md:justify-start px-2 py-2 md:px-3 md:py-4 gap-1 md:space-y-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={isCollapsed ? item.label : undefined}
                                className={cn(
                                    'flex md:flex-row flex-col items-center gap-1 md:gap-3 px-2 py-2 md:py-2.5 rounded-xl text-[10px] md:text-sm font-medium transition-all duration-200 group flex-1 md:flex-none',
                                    isCollapsed ? 'md:justify-center md:px-0' : 'md:justify-start md:px-3',
                                    isActive
                                        ? 'text-primary md:bg-primary/10 md:border md:border-primary/15'
                                        : 'text-sidebar-foreground hover:text-foreground md:hover:bg-muted'
                                )}
                            >
                                <Icon
                                    className={cn(
                                        'w-5 h-5 md:w-[18px] md:h-[18px] flex-shrink-0',
                                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                                    )}
                                />
                                <span className={cn("truncate", isCollapsed && "md:hidden")}>
                                    <span className="hidden md:inline">{item.label}</span>
                                    <span className="md:hidden inline">{(item as any).shortLabel || item.label}</span>
                                </span>
                                {isActive && !isCollapsed && (
                                    <ChevronRight className="hidden md:block w-3 h-3 ml-auto text-primary/60" />
                                )}
                            </Link>
                        )
                    })}
                </nav>

                {/* Bottom area (Desktop only) */}
                <div className={cn("hidden md:flex flex-col border-t border-sidebar-border", isCollapsed ? "p-3 space-y-4 items-center" : "px-3 py-4 space-y-2")}>
                    <div className={cn("flex items-center", isCollapsed ? "justify-center" : "justify-between px-3 py-2")}>
                        {!isCollapsed && <p className="text-xs text-muted-foreground truncate">{coachName}</p>}
                        <ThemeToggle />
                    </div>

                    <button
                        onClick={handleSignOut}
                        title={isCollapsed ? "Cerrar sesión" : undefined}
                        className={cn(
                            "flex items-center rounded-xl text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 group",
                            isCollapsed ? "justify-center w-10 h-10 p-0" : "w-full px-3 py-2.5 gap-3"
                        )}
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0 group-hover:text-destructive" />
                        {!isCollapsed && <span>Cerrar sesión</span>}
                    </button>
                </div>
            </aside>
        </>
    )
}
