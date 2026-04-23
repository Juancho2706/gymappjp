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
    PanelLeftClose,
    PanelLeft,
    ClipboardList,
    CreditCard
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { EvaBrandIcon } from '@/components/landing/LandingBrandMark'
import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'

const navItems = [
    {
        href: '/coach/dashboard',
        label: 'Dashboard',
        shortLabel: 'Inicio',
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
        shortLabel: 'Planes',
        icon: ClipboardList,
    },
    {
        href: '/coach/exercises',
        label: 'Ejercicios',
        shortLabel: 'Ejer.',
        icon: Dumbbell,
    },
    {
        href: '/coach/nutrition-plans',
        label: 'Nutrición',
        shortLabel: 'Nutri',
        icon: Apple,
    },
    {
        href: '/coach/settings',
        label: 'Mi Marca',
        shortLabel: 'Marca',
        icon: Settings,
    },
    {
        href: '/coach/subscription',
        label: 'Suscripción',
        shortLabel: 'Plan',
        icon: CreditCard,
    },
]

interface CoachSidebarProps {
    coachName: string
    coachBrand: string
    primaryColor?: string
    subscriptionStatus?: string | null
}

export function CoachSidebar({ coachName, coachBrand, primaryColor, subscriptionStatus }: CoachSidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('sidebar-collapsed')
            return saved === 'true'
        }
        return false
    })

    const activeColorStyle = primaryColor ? { color: primaryColor } : undefined
    const activeBgStyle = primaryColor ? { 
        backgroundColor: `color-mix(in srgb, ${primaryColor} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${primaryColor} 20%, transparent)`
    } : undefined

    const toggleSidebar = () => {
        const newState = !isCollapsed
        setIsCollapsed(newState)
        localStorage.setItem('sidebar-collapsed', String(newState))
    }

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    const isBuilder = pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')
    const isSubscriptionBlocked = new Set<string>(SUBSCRIPTION_BLOCKED_STATUSES).has(subscriptionStatus ?? '')
    const visibleNavItems = isSubscriptionBlocked
        ? [
            {
                href: '/coach/reactivate',
                label: 'Reactivar',
                shortLabel: 'Pago',
                icon: LayoutDashboard,
            },
        ]
        : navItems

    return (
        <>
            {/* Mobile Top Header — oculto en builder para evitar doble barra fija */}
            <div
                className={cn(
                    "md:hidden fixed top-0 left-0 right-0 z-[55] flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 pt-safe pb-3",
                    isBuilder && "hidden"
                )}
            >
                <div className="flex min-w-0 items-center gap-2.5">
                    <EvaBrandIcon className="h-8 w-8 shrink-0 sm:h-8 sm:w-8" />
                    <span className="font-bold text-base truncate max-w-[150px] text-sidebar-foreground font-display">
                        {coachBrand || coachName}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <button type="button" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive" aria-label="Cerrar sesión">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Navigation Sidebar (Desktop) / Bottom Nav (Mobile — hidden on builder) */}
            <aside className={cn(
                "fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-sidebar-border bg-sidebar pb-safe pl-safe pr-safe shadow-2xl transition-all duration-300 [transform:translateZ(0)] md:sticky md:top-0 md:border-r md:border-t-0 md:pb-0 md:pl-0 md:pr-0 md:shadow-none",
                isBuilder
                    ? "md:h-full md:min-h-0 md:max-h-full supports-[height:100dvh]:md:h-full"
                    : "md:h-dvh supports-[height:100dvh]:md:h-[100dvh]",
                isCollapsed ? "md:w-20" : "md:w-64",
                isBuilder && "hidden md:flex"
            )}>
                
                {/* Logo area (Desktop only) */}
                <div className={cn("hidden md:flex py-8 border-b border-sidebar-border items-center", isCollapsed ? "px-0 justify-center flex-col gap-4" : "px-6 justify-between")}>
                    <div className={cn("flex min-w-0 items-center gap-3", isCollapsed && "justify-center")}>
                        <EvaBrandIcon
                            className={cn('h-10 w-10 flex-shrink-0', isCollapsed && 'h-9 w-9')}
                        />
                        {!isCollapsed && (
                            <div className="min-w-0 animate-in fade-in duration-300">
                                <p className="text-sm font-bold text-sidebar-foreground truncate uppercase tracking-tight font-display">
                                    {coachBrand || coachName}
                                </p>
                            </div>
                        )}
                    </div>
                    {!isCollapsed && (
                        <button
                            onClick={toggleSidebar}
                            aria-label="Contraer menú"
                            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
                        >
                            <PanelLeftClose className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {isCollapsed && (
                    <div className="hidden md:flex justify-center py-4 border-b border-sidebar-border">
                        <button
                            onClick={toggleSidebar}
                            aria-label="Expandir menú"
                            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
                        >
                            <PanelLeft className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {/* Navigation Links */}
                <nav className="flex max-w-full flex-none flex-row flex-nowrap justify-start gap-0.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 py-2 [-webkit-overflow-scrolling:touch] md:max-w-none md:flex-1 md:flex-col md:justify-start md:gap-2 md:space-y-2 md:overflow-x-hidden md:overflow-y-auto md:px-4 md:py-6 custom-scrollbar">
                    {visibleNavItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                        const Icon = item.icon
                        const short = item.shortLabel
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={item.label}
                                className={cn(
                                    'flex shrink-0 flex-col items-center gap-1 rounded-xl border border-transparent px-2 py-2 text-[10px] font-semibold transition-all duration-300 group md:w-full md:flex-none md:flex-row md:gap-3 md:px-4 md:py-3 md:text-sm',
                                    'min-w-[3.5rem] max-w-[5.25rem] md:min-w-0 md:max-w-none',
                                    isCollapsed ? 'md:justify-center md:px-0' : 'md:justify-start',
                                    isActive
                                        ? 'text-sidebar-foreground bg-primary/10 border-primary/20 dark:shadow-[0_0_15px_-5px_rgba(var(--theme-primary-rgb,0,122,255),0.4)]'
                                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                                )}
                                style={isActive ? activeBgStyle : undefined}
                            >
                                <Icon
                                    className={cn(
                                        'w-5 h-5 md:w-5 md:h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
                                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-foreground'
                                    )}
                                    style={isActive ? activeColorStyle : undefined}
                                />
                                <span
                                    className={cn(
                                        'max-w-full text-center leading-tight tracking-wide line-clamp-2 md:truncate md:text-left',
                                        isCollapsed && 'md:hidden'
                                    )}
                                >
                                    <span className="hidden uppercase md:inline md:text-[11px]">{item.label}</span>
                                    <span className="inline md:hidden">{short || item.label}</span>
                                </span>
                            </Link>
                        )
                    })}
                </nav>

                {/* Bottom area (Desktop only) */}
                <div className={cn("hidden md:flex flex-col border-t border-sidebar-border bg-sidebar-accent/50 dark:bg-black/50 backdrop-blur-xl", isCollapsed ? "p-4 space-y-6 items-center" : "px-4 py-6 space-y-4")}>
                    <div className={cn("flex items-center", isCollapsed ? "justify-center" : "justify-between px-2")}>
                        {!isCollapsed && (
                            <div className="flex flex-col">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Terminal</p>
                                <p className="text-xs text-sidebar-foreground font-medium truncate max-w-[120px]">{coachName}</p>
                            </div>
                        )}
                        <ThemeToggle />
                    </div>

                    <button
                        onClick={handleSignOut}
                        title={isCollapsed ? "Cerrar sesión" : undefined}
                        className={cn(
                            "flex items-center rounded-xl text-[11px] uppercase tracking-widest font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300 group border border-transparent hover:border-destructive/20",
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

