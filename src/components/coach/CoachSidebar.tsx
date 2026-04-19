'use client'

/**
 * CoachSidebar — Concept A · Kinetic Obsidian
 * Dock flotante vertical (desktop) + bottom bar glass (mobile).
 * Item activo: barra vertical 2px + glow ring con --theme-primary.
 * API preservada: props, nav items, handleSignOut.
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard, Users, Dumbbell, Settings, LogOut, Apple,
    PanelLeftClose, PanelLeft, ClipboardList, CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/ThemeToggle'
import { GymAppLogo } from '@/components/ui/Logo'
import { SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'

const navItems = [
    { href: '/coach/dashboard', label: 'Dashboard', shortLabel: 'Inicio', icon: LayoutDashboard },
    { href: '/coach/clients', label: 'Alumnos', icon: Users },
    { href: '/coach/workout-programs', label: 'Programas', shortLabel: 'Planes', icon: ClipboardList },
    { href: '/coach/exercises', label: 'Ejercicios', shortLabel: 'Ejer.', icon: Dumbbell },
    { href: '/coach/nutrition-plans', label: 'Nutrición', shortLabel: 'Nutri', icon: Apple },
    { href: '/coach/settings', label: 'Mi Marca', shortLabel: 'Marca', icon: Settings },
    { href: '/coach/subscription', label: 'Suscripción', shortLabel: 'Plan', icon: CreditCard },
]

interface Props {
    coachName: string
    coachBrand: string
    primaryColor?: string
    subscriptionStatus?: string | null
}

export function CoachSidebar({ coachName, coachBrand, subscriptionStatus }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('sidebar-collapsed') === 'true'
        return false
    })

    const toggle = () => {
        const next = !collapsed
        setCollapsed(next)
        localStorage.setItem('sidebar-collapsed', String(next))
    }

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    const isBuilder = pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')
    const blocked = new Set<string>(SUBSCRIPTION_BLOCKED_STATUSES).has(subscriptionStatus ?? '')
    const items = blocked
        ? [{ href: '/coach/reactivate', label: 'Reactivar', shortLabel: 'Pago', icon: LayoutDashboard }]
        : navItems

    return (
        <>
            {/* Mobile top header — obsidian glass */}
            <div className={cn(
                'md:hidden fixed top-0 left-0 right-0 z-[55] flex items-center justify-between border-b border-[var(--obs-border)] bg-[rgba(5,7,10,0.85)] backdrop-blur-xl px-4 pt-safe pb-3',
                isBuilder && 'hidden',
            )}>
                <div className="flex min-w-0 items-center gap-2.5">
                    <GymAppLogo className="h-8 w-[4.25rem] flex-shrink-0" />
                    <span className="font-bold text-xs tracking-[0.2em] uppercase truncate max-w-[140px] text-[var(--obs-text)]">
                        {coachBrand || coachName}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <button type="button" onClick={handleSignOut} className="text-[var(--obs-text-dim)] hover:text-destructive transition-colors" aria-label="Cerrar sesión">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Sidebar (desktop dock) / bottom nav (mobile) */}
            <aside className={cn(
                'fixed bottom-0 left-0 right-0 z-50 flex flex-col',
                'border-t border-[var(--obs-border)] bg-[rgba(5,7,10,0.9)] backdrop-blur-2xl pb-safe pl-safe pr-safe',
                'md:sticky md:top-0 md:border-r md:border-t-0 md:pb-0 md:pl-0 md:pr-0 md:bg-[rgba(11,15,20,0.78)]',
                'transition-[width,transform] duration-300 [transform:translateZ(0)]',
                isBuilder ? 'md:h-full md:min-h-0 md:max-h-full' : 'md:h-dvh',
                collapsed ? 'md:w-[72px]' : 'md:w-[272px]',
                isBuilder && 'hidden md:flex',
            )}>
                {/* Desktop brand header */}
                <div className={cn(
                    'hidden md:flex items-center border-b border-[var(--obs-border)]',
                    collapsed ? 'px-3 py-6 flex-col gap-4 justify-center' : 'px-5 py-6 justify-between',
                )}>
                    <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
                        <GymAppLogo className={cn('h-9 flex-shrink-0', collapsed ? 'w-9' : 'w-[5.5rem]')} />
                        {!collapsed && (
                            <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[rgb(var(--theme-primary-rgb))]">EVA</p>
                                <p className="text-[13px] font-bold uppercase tracking-[0.08em] truncate text-[var(--obs-text)]">
                                    {coachBrand || coachName}
                                </p>
                            </div>
                        )}
                    </div>
                    {!collapsed && (
                        <button onClick={toggle} aria-label="Contraer menú"
                            className="p-1.5 rounded-md text-[var(--obs-text-dim)] hover:text-[var(--obs-text)] hover:bg-white/5 transition-colors">
                            <PanelLeftClose className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {collapsed && (
                    <div className="hidden md:flex justify-center py-3 border-b border-[var(--obs-border)]">
                        <button onClick={toggle} aria-label="Expandir menú"
                            className="p-1.5 rounded-md text-[var(--obs-text-dim)] hover:text-[var(--obs-text)] hover:bg-white/5 transition-colors">
                            <PanelLeft className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Nav */}
                <nav className={cn(
                    'flex flex-none flex-row flex-nowrap justify-around gap-0 overflow-x-auto overflow-y-hidden',
                    'px-1 py-2 md:flex-1 md:flex-col md:justify-start md:gap-1 md:space-y-0.5 md:overflow-x-hidden md:overflow-y-auto md:px-3 md:py-5',
                )}>
                    {items.map((item) => {
                        const active = pathname === item.href || pathname.startsWith(item.href + '/')
                        const Icon = item.icon
                        return (
                            <Link key={item.href} href={item.href} prefetch={false} title={item.label}
                                className={cn(
                                    'group relative flex shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[9px] font-bold uppercase tracking-[0.15em] transition-all duration-200',
                                    'min-w-[3.5rem] md:w-full md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-[11px]',
                                    collapsed ? 'md:justify-center md:px-0 md:w-12 md:mx-auto' : 'md:justify-start',
                                    active
                                        ? 'text-[var(--obs-text)] bg-white/[0.04]'
                                        : 'text-[var(--obs-text-dim)] hover:text-[var(--obs-text)] hover:bg-white/[0.03]',
                                )}
                            >
                                {/* Active bar — kinetic accent (firma del coach) */}
                                {active && (
                                    <span aria-hidden
                                        className="absolute left-0 top-1/2 -translate-y-1/2 hidden md:block h-6 w-[2px] rounded-r-full kinetic-bar" />
                                )}
                                <Icon className={cn(
                                    'w-4 h-4 flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
                                    active && 'text-[rgb(var(--theme-primary-rgb))] drop-shadow-[0_0_8px_rgba(var(--theme-primary-rgb),0.6)]',
                                )} />
                                <span className={cn(
                                    'max-w-full text-center leading-tight line-clamp-1 md:truncate md:text-left',
                                    collapsed && 'md:hidden',
                                )}>
                                    <span className="hidden md:inline">{item.label}</span>
                                    <span className="inline md:hidden">{item.shortLabel || item.label}</span>
                                </span>
                            </Link>
                        )
                    })}
                </nav>

                {/* Bottom area desktop */}
                <div className={cn(
                    'hidden md:flex flex-col border-t border-[var(--obs-border)] bg-black/40',
                    collapsed ? 'p-3 gap-4 items-center' : 'px-4 py-5 space-y-3',
                )}>
                    <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
                        {!collapsed && (
                            <div className="flex flex-col min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[var(--obs-text-faint)]">Terminal</p>
                                <p className="text-xs font-medium truncate text-[var(--obs-text)]">{coachName}</p>
                            </div>
                        )}
                        <ThemeToggle />
                    </div>
                    <button onClick={handleSignOut}
                        title={collapsed ? 'Cerrar sesión' : undefined}
                        className={cn(
                            'group flex items-center rounded-lg text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--obs-text-dim)] hover:text-destructive hover:bg-destructive/10 transition-colors',
                            collapsed ? 'justify-center w-10 h-10 p-0' : 'w-full px-3 py-2.5 gap-2',
                        )}
                    >
                        <LogOut className="w-3.5 h-3.5 flex-shrink-0 transition-transform group-hover:-translate-x-0.5" />
                        {!collapsed && <span>Desconectar</span>}
                    </button>
                </div>
            </aside>
        </>
    )
}
