'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
    LayoutDashboard,
    TrendingUp,
    Dumbbell,
    LayoutGrid,
    Apple,
    CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'progress', label: 'Progreso', icon: TrendingUp },
    { id: 'workout', label: 'Entrenamiento', icon: Dumbbell },
    { id: 'program', label: 'Programa', icon: LayoutGrid },
    { id: 'nutrition', label: 'Nutrición', icon: Apple },
    { id: 'billing', label: 'Facturación', icon: CreditCard },
] as const

export type ProfileMainTabId = (typeof TABS)[number]['id']

export type ProfileTabBadges = Partial<Record<ProfileMainTabId, ReactNode>>

interface ProfileTabNavProps {
    activeTab: string
    onChange: (id: ProfileMainTabId) => void
    badges?: ProfileTabBadges
}

export function ProfileTabNav({ activeTab, onChange, badges }: ProfileTabNavProps) {
    const reduceMotion = useReducedMotion()

    return (
        <div
            className={cn(
                'sticky z-20 mx-0 mb-2 w-full max-w-full min-w-0 border-b border-border/50 px-0 dark:border-white/10',
                'bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75',
                'top-[3.5rem] md:top-0 print:static print:border-0 print:bg-transparent'
            )}
        >
            <div className="relative z-10 flex min-w-0 gap-0 overflow-x-auto sm:gap-2">
                {TABS.map((tab) => {
                    const Icon = tab.icon
                    const active = activeTab === tab.id
                    const badge = badges?.[tab.id]
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChange(tab.id)}
                            className={cn(
                                'relative flex shrink-0 items-center gap-2 px-3 py-3.5 text-[10px] font-black uppercase tracking-widest transition-colors sm:px-4',
                                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                            style={active ? { color: 'var(--theme-primary)' } : undefined}
                        >
                            <Icon className="h-3.5 w-3.5 opacity-90 shrink-0" />
                            <span className="whitespace-nowrap">{tab.label}</span>
                            {badge != null && badge !== '' && (
                                <span
                                    className={cn(
                                        'min-w-[1.125rem] h-5 px-1.5 rounded-md flex items-center justify-center text-[9px] font-black tabular-nums',
                                        badge === '!'
                                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/35'
                                            : 'bg-primary/12 text-primary border border-primary/25'
                                    )}
                                >
                                    {badge}
                                </span>
                            )}
                            {active && (
                                <motion.div
                                    layoutId="coach-profile-tab-indicator"
                                    className="absolute right-2 bottom-0 left-2 h-0.5 rounded-full"
                                    style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                                    transition={
                                        reduceMotion
                                            ? { duration: 0 }
                                            : { type: 'spring', stiffness: 500, damping: 35 }
                                    }
                                />
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
