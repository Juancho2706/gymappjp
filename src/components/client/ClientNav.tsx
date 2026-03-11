'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    Home,
    Apple,
    Settings,
    ChevronRight,
    LogOut,
    CheckCircle,
    Dumbbell
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'

interface Props {
    coachSlug: string
    coachBrand: string
}

export function ClientNav({ coachSlug, coachBrand }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()

    const navItems = [
        {
            href: `/c/${coachSlug}/dashboard`,
            label: 'Inicio',
            icon: Home,
        },
        {
            href: `/c/${coachSlug}/nutrition`,
            label: 'Nutrición',
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

    // Don't show nav on login, register, onboarding, etc
    if (pathname.includes('/login') || pathname.includes('/register') || pathname.includes('/forgot') || pathname.includes('/onboarding')) {
        return null
    }

    return (
        <>
            {/* Mobile Top Header */}
            <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/10 bg-background/80 backdrop-blur-md sticky top-0 z-40">
                <div className="flex items-center gap-2.5">
                    <span className="font-bold text-lg truncate max-w-[200px]" style={{ fontFamily: 'var(--font-outfit)', color: 'var(--theme-primary)' }}>
                        {coachBrand}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <button onClick={handleSignOut} className="text-muted-foreground hover:text-red-500">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Navigation Sidebar (Desktop) / Bottom Nav (Mobile) */}
            <aside className="fixed bottom-0 left-0 right-0 z-50 md:sticky md:top-0 md:w-64 md:h-screen bg-background/80 backdrop-blur-xl md:bg-card border-t border-border/10 md:border-t-0 md:border-r flex flex-col transition-colors safe-area-bottom">
                
                {/* Logo area (Desktop only) */}
                <div className="hidden md:flex px-6 py-6 border-b border-border/10 items-center justify-between">
                    <div>
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
                            Mi Coach
                        </p>
                        <p className="text-sm font-bold text-foreground truncate" style={{ fontFamily: 'var(--font-outfit)', color: 'var(--theme-primary)' }}>
                            {coachBrand}
                        </p>
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 flex flex-row justify-around md:flex-col md:justify-start px-2 py-2 md:px-3 md:py-4 gap-1 md:space-y-1 overflow-x-auto pb-safe">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/workout')
                        const Icon = item.icon
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'relative flex md:flex-row flex-col items-center md:justify-start justify-center gap-1 md:gap-3 px-2 py-2 md:px-3 md:py-3 rounded-2xl text-[10px] md:text-sm font-medium transition-all duration-300 group flex-1 md:flex-none',
                                    isActive
                                        ? 'text-foreground md:bg-muted/50 md:border md:border-border/50'
                                        : 'text-muted-foreground hover:text-foreground md:hover:bg-muted/30'
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
                                    isActive ? "font-bold" : "font-medium"
                                )}
                                style={isActive ? { color: 'var(--theme-primary)' } : {}}
                                >
                                    {item.label}
                                </span>
                                {isActive && (
                                    <ChevronRight className="hidden md:block w-3 h-3 ml-auto opacity-60" style={{ color: 'var(--theme-primary)' }} />
                                )}
                            </Link>
                        )
                    })}
                </nav>

                {/* Bottom area (Desktop only) */}
                <div className="hidden md:block px-3 py-4 border-t border-border/10 space-y-2">
                    <div className="flex items-center justify-end px-3 py-2">
                        <ThemeToggle />
                    </div>

                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all duration-200 group"
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0 group-hover:text-red-500" />
                        Cerrar sesión
                    </button>
                </div>
            </aside>
        </>
    )
}
