'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    Users,
    Dumbbell,
    Settings,
    LogOut,
    ChevronRight,
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

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <aside className="w-64 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-colors">
            {/* Logo area */}
            <div className="px-6 py-6 border-b border-sidebar-border">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                        <Dumbbell className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
                            OmniCoach
                        </p>
                        <p
                            className="text-sm font-bold text-foreground truncate"
                            style={{ fontFamily: 'var(--font-outfit)' }}
                        >
                            {coachBrand || coachName}
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map((item) => {
                    const isActive =
                        pathname === item.href || pathname.startsWith(item.href + '/')
                    const Icon = item.icon
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                                isActive
                                    ? 'bg-primary/10 text-primary border border-primary/15'
                                    : 'text-sidebar-foreground hover:text-foreground hover:bg-muted'
                            )}
                        >
                            <Icon
                                className={cn(
                                    'w-[18px] h-[18px] flex-shrink-0',
                                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                                )}
                            />
                            {item.label}
                            {isActive && (
                                <ChevronRight className="w-3 h-3 ml-auto text-primary/60" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Bottom area */}
            <div className="px-3 py-4 border-t border-sidebar-border space-y-2">
                {/* Theme toggle */}
                <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-xs text-muted-foreground truncate">{coachName}</p>
                    <ThemeToggle />
                </div>

                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 group"
                >
                    <LogOut className="w-4 h-4 flex-shrink-0 group-hover:text-destructive" />
                    Cerrar sesión
                </button>
            </div>
        </aside>
    )
}
