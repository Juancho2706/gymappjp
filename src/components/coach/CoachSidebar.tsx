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
    LayoutGrid,
    ClipboardList
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
        href: '/coach/workout-programs',
        label: 'Programas',
        icon: ClipboardList,
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
            <div className="md:hidden flex items-center justify-between px-4 pt-5 pb-3 border-b border-sidebar-border bg-sidebar sticky top-0 z-40 pt-safe">
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
                "fixed bottom-0 left-0 right-0 z-50 md:sticky md:top-0 md:h-screen bg-black border-t md:border-t-0 md:border-r border-white/5 flex flex-col transition-all duration-300 pb-safe shadow-2xl",
                isCollapsed ? "md:w-20" : "md:w-64"
            )}>
                
                {/* Logo area (Desktop only) */}
                <div className={cn("hidden md:flex py-8 border-b border-white/5 items-center", isCollapsed ? "px-0 justify-center flex-col gap-4" : "px-6 justify-between")}>
                    <div className={cn("flex items-center gap-3", isCollapsed && "justify-center")}>
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 glow-primary">
                            <Dumbbell className="w-5 h-5 text-primary" />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0">
                                <p className="text-[10px] text-primary font-bold uppercase tracking-[0.2em] mb-0.5">
                                    OMNICOACH OS
                                </p>
                                <p className="text-sm font-bold text-white truncate uppercase tracking-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                                    {coachBrand || coachName}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 flex flex-row justify-around md:flex-col md:justify-start px-2 py-2 md:px-4 md:py-6 gap-2 md:space-y-2 overflow-x-auto overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={isCollapsed ? item.label : undefined}
                                className={cn(
                                    'flex md:flex-row flex-col items-center gap-1 md:gap-3 px-2 py-2 md:py-3 rounded-xl text-[10px] md:text-sm font-semibold transition-all duration-300 group flex-1 md:flex-none border border-transparent',
                                    isCollapsed ? 'md:justify-center md:px-0' : 'md:justify-start md:px-4',
                                    isActive
                                        ? 'text-white bg-primary/10 border-primary/20 shadow-[0_0_15px_-5px_rgba(0,122,255,0.4)]'
                                        : 'text-zinc-500 hover:text-white hover:bg-white/5'
                                )}
                            >
                                <Icon
                                    className={cn(
                                        'w-5 h-5 md:w-5 md:h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
                                        isActive ? 'text-primary' : 'text-zinc-500 group-hover:text-white'
                                    )}
                                />
                                <span className={cn("truncate tracking-wide", isCollapsed && "md:hidden")}>
                                    <span className="hidden md:inline uppercase text-[11px]">{item.label}</span>
                                    <span className="md:hidden inline">{(item as any).shortLabel || item.label}</span>
                                </span>
                            </Link>
                        )
                    })}
                </nav>

                {/* Bottom area (Desktop only) */}
                <div className={cn("hidden md:flex flex-col border-t border-white/5 bg-black/50 backdrop-blur-xl", isCollapsed ? "p-4 space-y-6 items-center" : "px-4 py-6 space-y-4")}>
                    <div className={cn("flex items-center", isCollapsed ? "justify-center" : "justify-between px-2")}>
                        {!isCollapsed && (
                            <div className="flex flex-col">
                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Terminal</p>
                                <p className="text-xs text-white font-medium truncate max-w-[120px]">{coachName}</p>
                            </div>
                        )}
                        <ThemeToggle />
                    </div>

                    <button
                        onClick={handleSignOut}
                        title={isCollapsed ? "Cerrar sesión" : undefined}
                        className={cn(
                            "flex items-center rounded-xl text-[11px] uppercase tracking-widest font-bold text-zinc-500 hover:text-destructive hover:bg-destructive/10 transition-all duration-300 group border border-transparent hover:border-destructive/20",
                            isCollapsed ? "justify-center w-12 h-12 p-0" : "w-full px-4 py-3 gap-3"
                        )}
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-x-1" />
                        {!isCollapsed && <span>Desconectar</span>}
                    </button>
                </div>
            </aside>
        </>
    )
}
