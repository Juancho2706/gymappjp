'use client'

import type { ReactNode } from 'react'
import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import {
    LayoutDashboard,
    TrendingUp,
    BarChart2,
    LayoutGrid,
    Apple,
    CreditCard,
    ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'progress', label: 'Progreso', icon: TrendingUp },
    { id: 'workout', label: 'Análisis', icon: BarChart2 },
    { id: 'program', label: 'Plan', icon: LayoutGrid },
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
    const scrollRef = useRef<HTMLDivElement>(null)
    const [canScrollRight, setCanScrollRight] = useState(false)
    const [hintDismissed, setHintDismissed] = useState(false)

    const checkScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        const hasOverflow = el.scrollWidth > el.clientWidth
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
        setCanScrollRight(hasOverflow && !atEnd)
        if (el.scrollLeft > 10) setHintDismissed(true)
    }, [])

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        checkScroll()
        el.addEventListener('scroll', checkScroll, { passive: true })
        const ro = new ResizeObserver(checkScroll)
        ro.observe(el)
        return () => {
            el.removeEventListener('scroll', checkScroll)
            ro.disconnect()
        }
    }, [checkScroll])

    const showHint = canScrollRight && !hintDismissed

    return (
        <div
            className={cn(
                'sticky z-20 mx-0 mb-2 w-full max-w-full min-w-0 border-b border-border/50 px-0 dark:border-white/10',
                'bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75',
                'top-[3.5rem] md:top-0 print:static print:border-0 print:bg-transparent'
            )}
        >
            <div className="relative min-w-0">
                <div
                    ref={scrollRef}
                    className="relative z-10 flex min-w-0 gap-0 overflow-x-auto sm:gap-2 scrollbar-none"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
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

                {/* Right fade + swipe hint — only on mobile when tabs overflow */}
                <AnimatePresence>
                    {canScrollRight && (
                        <motion.div
                            key="fade"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 z-20 flex items-center justify-end pr-1 md:hidden"
                            style={{
                                background: 'linear-gradient(to right, transparent, var(--background) 80%)',
                            }}
                        >
                            <AnimatePresence>
                                {showHint && (
                                    <motion.div
                                        key="chevron"
                                        initial={{ opacity: 0, x: -4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <motion.div
                                            animate={reduceMotion ? {} : { x: [0, 4, 0] }}
                                            transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
                                        >
                                            <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
