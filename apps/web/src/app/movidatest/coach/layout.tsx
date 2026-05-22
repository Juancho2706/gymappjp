'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Dumbbell, Apple, BookOpen, Settings, ChevronLeft } from 'lucide-react'
import { felipeCoach } from '../_mock'

const NAV_ITEMS = [
    { href: '/movidatest/coach/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/movidatest/coach/clients', label: 'Alumnos', icon: Users },
    { href: '/movidatest/coach/workout-programs', label: 'Programas', icon: Dumbbell },
    { href: '/movidatest/coach/nutrition-plans', label: 'Nutrición', icon: Apple },
    { href: '/movidatest/coach/exercises', label: 'Ejercicios', icon: BookOpen },
    { href: '/movidatest/coach/settings', label: 'Configuración', icon: Settings },
]

export default function CoachLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    return (
        <div className="flex min-h-dvh bg-background">
            {/* Sidebar */}
            <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card shrink-0">
                <div className="p-4 border-b border-border">
                    <Link
                        href="/movidatest/admin"
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Admin Movida
                    </Link>
                    <div className="flex items-center gap-2">
                        <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                            style={{ backgroundColor: '#0D9488' }}
                        >
                            F
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{felipeCoach.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">{felipeCoach.specialty}</p>
                        </div>
                    </div>
                </div>
                <nav className="flex-1 p-3 space-y-0.5">
                    {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                        const active = pathname === href || (href !== '/movidatest/coach/dashboard' && pathname.startsWith(href))
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                                    active
                                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                {label}
                            </Link>
                        )
                    })}
                </nav>
                <div className="p-4 border-t border-border">
                    <div className="text-[10px] text-muted-foreground">
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{felipeCoach.invite_code}</span>
                        <span className="ml-1.5">código de invitación</span>
                    </div>
                </div>
            </aside>

            {/* Mobile */}
            <div className="flex flex-col flex-1 min-w-0">
                <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: '#0D9488' }}>F</div>
                    <p className="font-semibold text-sm truncate flex-1">{felipeCoach.full_name}</p>
                </header>
                <nav className="md:hidden flex gap-1 px-2 pt-2 pb-1 border-b border-border overflow-x-auto">
                    {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                        const active = pathname === href || (href !== '/movidatest/coach/dashboard' && pathname.startsWith(href))
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                                    active ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400' : 'text-muted-foreground hover:bg-accent'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5 shrink-0" />
                                {label}
                            </Link>
                        )
                    })}
                </nav>
                <main className="flex-1 overflow-auto">{children}</main>
            </div>
        </div>
    )
}
