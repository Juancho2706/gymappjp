'use client'

import type { ReactNode } from 'react'
import { useRef, useState, useEffect, useCallback } from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// 5 pestañas (sin Facturación). Etiquetas 1:1 con el diseño nuevo: Resumen ·
// Progreso · Entreno · Programa · Nutrición. Pills label-only (sin íconos),
// como en coach-ficha.jsx.
const TABS = [
    { id: 'overview', label: 'Resumen' },
    { id: 'progress', label: 'Progreso' },
    { id: 'workout', label: 'Entreno' },
    { id: 'program', label: 'Programa' },
    { id: 'nutrition', label: 'Nutrición' },
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
    const barRef = useRef<HTMLDivElement>(null)
    const [canScrollRight, setCanScrollRight] = useState(false)
    const [hintDismissed, setHintDismissed] = useState(false)
    const [stuck, setStuck] = useState(false)

    // Estado "stuck": la barra se eleva (border-default + sombra) al pegarse (kit
    // coach-ficha.jsx). Se compara el top real de la barra contra su offset sticky
    // resuelto (getComputedStyle resuelve la var mobile / md:top-0 desktop a px).
    useEffect(() => {
        const bar = barRef.current
        if (!bar) return
        const onScroll = () => {
            const stickyTop = parseFloat(getComputedStyle(bar).top) || 0
            setStuck(bar.getBoundingClientRect().top <= stickyTop + 0.5)
        }
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true, capture: true })
        return () => window.removeEventListener('scroll', onScroll, { capture: true })
    }, [])

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
            ref={barRef}
            className={cn(
                'sticky z-20 mx-0 mb-2 w-full max-w-full min-w-0 border-b px-0 transition-[box-shadow,border-color] duration-200 ease-out',
                stuck
                    ? 'border-default shadow-[0_6px_16px_-10px_rgba(0,0,0,0.28)]'
                    : 'border-subtle',
                'bg-[color-mix(in_srgb,var(--surface-app)_80%,transparent)] [backdrop-filter:saturate(180%)_blur(12px)] [-webkit-backdrop-filter:saturate(180%)_blur(12px)]',
                'top-[var(--coach-mobile-content-top-offset)] md:top-0 print:static print:border-0 print:bg-transparent'
            )}
        >
            <div className="relative min-w-0">
                <div
                    ref={scrollRef}
                    className="relative z-10 flex min-w-0 gap-1.5 overflow-x-auto py-2 scrollbar-none"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {TABS.map((tab) => {
                        const active = activeTab === tab.id
                        const badge = badges?.[tab.id]
                        const isAlert = badge === '!'
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => onChange(tab.id)}
                                className={cn(
                                    'relative flex h-[38px] shrink-0 items-center gap-1.5 rounded-pill border-[1.5px] px-3.5 text-[13.5px] font-bold transition-[background-color,border-color,color] duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                                    active
                                        ? 'border-sport-500 bg-sport-500 text-[var(--text-on-sport)]'
                                        : 'border-default bg-surface-card text-muted hover:text-strong'
                                )}
                            >
                                <span className="whitespace-nowrap">{tab.label}</span>
                                {badge != null && badge !== '' && (
                                    <span
                                        className={cn(
                                            'flex h-[18px] min-w-[18px] items-center justify-center rounded-pill px-1.5 text-[11px] font-extrabold tabular-nums',
                                            isAlert
                                                ? 'bg-[var(--danger-500)] text-white'
                                                : active
                                                  ? 'bg-white/25 text-white'
                                                  : 'bg-surface-sunken text-muted'
                                        )}
                                    >
                                        {badge}
                                    </span>
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
                                background: 'linear-gradient(to right, transparent, var(--surface-app) 80%)',
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
