'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
    Home,
    Apple,
    Settings,
    ChevronRight,
    LogOut,
    CheckCircle,
    Dumbbell,
    PanelLeftClose,
    PanelLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { PwaNavButton } from './PwaNavButton'
import { toggleClientBrandColors } from '@/app/c/[coach_slug]/actions'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { BRAND_APP_ICON } from '@/lib/brand-assets'

interface Props {
    coachSlug: string
    coachBrand: string
    coachLogoUrl: string
    initialUseBrandColors?: boolean
}

export function ClientNav({ coachSlug, coachBrand, coachLogoUrl, initialUseBrandColors = true }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isNavigating, setIsNavigating] = useState<string | null>(null)
    const [useBrandColors, setUseBrandColors] = useState(initialUseBrandColors)
    const [isTogglingColors, setIsTogglingColors] = useState(false)

    // Reset navigating state when pathname changes
    useEffect(() => {
        setIsNavigating(null)
    }, [pathname])

    const navItems = [
        {
            href: `/c/${coachSlug}/dashboard`,
            label: 'Inicio',
            icon: Home,
        },
        {
            href: `/c/${coachSlug}/nutrition`,
            label: 'Plan Alimenticio',
            icon: Apple,
        },
        {
            href: `/c/${coachSlug}/exercises`,
            label: 'Aprender',
            icon: Dumbbell,
        },
        {
            href: `/c/${coachSlug}/check-in`,
            label: 'Check-in',
            icon: CheckCircle,
        },
    ]

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push(`/c/${coachSlug}/login`)
        router.refresh()
    }

    const handleToggleBrandColors = async () => {
        setIsTogglingColors(true)
        const newValue = !useBrandColors
        setUseBrandColors(newValue)
        
        try {
            const res = await toggleClientBrandColors(newValue, coachSlug)
            if (res.error) {
                setUseBrandColors(!newValue) // revert
                toast.error('Error al guardar preferencia')
            } else {
                toast.success(newValue ? 'Colores del Coach activados' : 'Colores por defecto activados')
                router.refresh() // Re-runs middleware and Server Components to pick up new color header
            }
        } catch (error) {
            setUseBrandColors(!newValue) // revert
        } finally {
            setIsTogglingColors(false)
        }
    }

    // Don't show nav on login, register, onboarding, etc, or during workout execution
    if (pathname.includes('/login') || pathname.includes('/register') || pathname.includes('/forgot') || pathname.includes('/onboarding')) {
        return null
    }

    // Solo ejecución de plan (/workout/[planId]); no ocultar rutas tipo /workout-history
    const isWorkout = pathname.includes('/workout/')

    return (
        <>
            {/* Navigation Sidebar (Desktop) / Bottom Nav (Mobile) */}
            <aside className={cn(
                "client-nav-desktop fixed bottom-0 left-0 right-0 z-50 md:sticky md:top-0 md:h-dvh bg-background/80 backdrop-blur-xl md:bg-card border-t border-border/10 md:border-t-0 md:border-r flex flex-col transition-all duration-300 pl-safe pr-safe md:pl-0 md:pr-0",
                isCollapsed ? "md:w-20" : "md:w-64",
                isWorkout && "hidden md:flex"
            )}>
                
                {/* Logo area (Desktop only) */}
                <div className={cn("hidden md:flex py-6 border-b border-border/10 items-center", isCollapsed ? "px-0 justify-center flex-col gap-4" : "px-6 justify-between")}>
                    <div className={cn("flex min-w-0 items-center gap-3", isCollapsed && "justify-center")}>
                        <div
                            className={cn(
                                'relative h-10 flex-shrink-0',
                                isCollapsed ? 'w-10' : 'w-[6.75rem]'
                            )}
                        >
                            <Image
                                src={coachLogoUrl === BRAND_APP_ICON ? BRAND_APP_ICON : coachLogoUrl}
                                alt={`${coachBrand} logo`}
                                fill
                                sizes={isCollapsed ? '40px' : '108px'}
                                className={cn(
                                    'object-contain',
                                    isCollapsed && 'p-1'
                                )}
                                priority
                            />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0 overflow-hidden">
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
                                    Mi Coach
                                </p>
                                <p className="text-sm font-bold text-foreground truncate font-display" style={{ color: 'var(--theme-primary)' }}>
                                    {coachBrand}
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        aria-label={isCollapsed ? "Expandir menú" : "Contraer menú"}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted/50"
                    >
                        {isCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
                    </button>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 flex flex-row justify-around md:flex-col md:justify-start px-2 pt-2 md:px-3 md:py-4 gap-1 md:space-y-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => {
                        const isActive =
                            pathname === item.href ||
                            pathname.startsWith(item.href + '/workout') ||
                            (item.href === `/c/${coachSlug}/dashboard` && pathname === `/c/${coachSlug}/workout-history`) ||
                            isNavigating === item.href
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                prefetch={false}
                                onClick={() => {
                                    if (pathname !== item.href) setIsNavigating(item.href)
                                }}
                                title={isCollapsed ? item.label : undefined}
                                className={cn(
                                    'relative flex md:flex-row flex-col items-center gap-1 md:gap-3 px-2 py-2 md:py-3 rounded-2xl text-[10px] md:text-sm font-medium transition-all duration-300 group flex-1 md:flex-none',
                                    isCollapsed ? 'md:justify-center md:px-0' : 'md:justify-start md:px-3',
                                    isActive
                                        ? 'text-foreground md:bg-muted/50 md:border md:border-border/50'
                                        : 'text-muted-foreground hover:text-foreground md:hover:bg-muted/30',
                                    isNavigating === item.href && "animate-pulse"
                                )}
                            >
                                {isActive && (
                                    <span className="md:hidden absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full" style={{ backgroundColor: 'var(--theme-primary)' }} />
                                )}
                                <Icon
                                    className={cn(
                                        'w-6 h-6 md:w-[18px] md:h-[18px] flex-shrink-0 transition-transform duration-300',
                                        isActive ? 'scale-110' : 'group-hover:scale-110'
                                    )}
                                    style={isActive ? { color: 'var(--theme-primary)' } : {}}
                                />
                                <span className={cn(
                                    "truncate transition-colors duration-300",
                                    isActive ? "font-bold" : "font-medium",
                                    isCollapsed && "md:hidden"
                                )}
                                style={isActive ? { color: 'var(--theme-primary)' } : {}}
                                >
                                    {item.label}
                                </span>
                                {isActive && !isCollapsed && (
                                    <ChevronRight className="hidden md:block w-3 h-3 ml-auto opacity-60" style={{ color: 'var(--theme-primary)' }} />
                                )}
                            </Link>
                        )
                    })}
                    
                    {/* PWA Install Button */}
                    <PwaNavButton isCollapsed={isCollapsed} />

                    <button
                        onClick={handleSignOut}
                        className={cn(
                            'md:hidden relative flex flex-col items-center justify-center gap-1 px-2 py-3 rounded-2xl text-[10px] font-medium transition-all duration-300 flex-1 text-muted-foreground hover:text-red-500'
                        )}
                    >
                        <LogOut className="w-6 h-6 flex-shrink-0 transition-transform duration-300" />
                        <span className="truncate transition-colors duration-300 font-medium">
                            Salir
                        </span>
                    </button>
                </nav>

                {/* iOS safe-area spacer: extends nav background under home indicator, no content */}
                <div aria-hidden className="h-[var(--pwa-sab,env(safe-area-inset-bottom,0px))] flex-none md:hidden" />

                {/* Bottom area (Desktop only) */}
                    <div className={cn("hidden md:flex flex-col border-t border-border/10", isCollapsed ? "p-3 items-center" : "px-3 py-4 space-y-2")}>
                        <button
                        onClick={handleSignOut}
                        title={isCollapsed ? "Cerrar sesión" : undefined}
                        className={cn(
                            "flex items-center rounded-xl text-sm font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all duration-200 group",
                            isCollapsed ? "justify-center w-10 h-10 p-0" : "w-full px-3 py-2.5 gap-3"
                        )}
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0 group-hover:text-red-500" />
                        {!isCollapsed && <span>Cerrar sesión</span>}
                    </button>
                </div>
            </aside>
        </>
    )
}
