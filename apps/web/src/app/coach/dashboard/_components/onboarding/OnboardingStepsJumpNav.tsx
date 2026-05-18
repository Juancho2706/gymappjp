'use client'

import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'

const STEPS = [
    { id: 'coach-onboarding-step-1' as const, label: 'Marca' },
    { id: 'coach-onboarding-step-2' as const, label: 'Alumno' },
    { id: 'coach-onboarding-step-3' as const, label: 'Plan' },
    { id: 'coach-onboarding-step-4' as const, label: 'Uso' },
] as const

type StepId = (typeof STEPS)[number]['id']

/**
 * V2 ligero: anclas + scroll-snap horizontal; paso activo vía IntersectionObserver;
 * clic con scroll suave solo si no hay `prefers-reduced-motion: reduce`.
 */
export function OnboardingStepsJumpNav() {
    const [activeId, setActiveId] = useState<StepId>(STEPS[0].id)

    useEffect(() => {
        const elements = STEPS.map((s) => document.getElementById(s.id)).filter(
            (n): n is HTMLElement => n != null
        )
        if (elements.length === 0) return

        const io = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting && (e.intersectionRatio ?? 0) > 0.08)
                if (visible.length === 0) return
                const best = visible.reduce((a, b) =>
                    (b.intersectionRatio ?? 0) > (a.intersectionRatio ?? 0) ? b : a
                )
                const id = best.target.id
                if (STEPS.some((s) => s.id === id)) {
                    setActiveId(id as StepId)
                }
            },
            { root: null, rootMargin: '-10% 0px -36% 0px', threshold: [0, 0.1, 0.2, 0.35, 0.5] }
        )

        for (const el of elements) {
            io.observe(el)
        }
        return () => io.disconnect()
    }, [])

    const onStepClick = useCallback((e: MouseEvent<HTMLAnchorElement>, id: StepId) => {
        if (typeof window === 'undefined') return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return
        }
        e.preventDefault()
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [])

    return (
        <nav
            aria-label="Ir a un paso de la guía de inicio"
            className="mt-4 rounded-xl border border-border/50 bg-muted/10 px-2 py-2 sm:px-3"
        >
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Saltar a
            </p>
            <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {STEPS.map((s) => {
                    const isActive = activeId === s.id
                    return (
                        <li key={s.id} className="snap-start shrink-0">
                            <a
                                href={`#${s.id}`}
                                aria-current={isActive ? 'true' : undefined}
                                onClick={(e) => onStepClick(e, s.id)}
                                className={cn(
                                    'inline-flex h-10 min-h-10 min-w-[4.5rem] items-center justify-center rounded-lg border px-3 text-xs font-bold shadow-sm transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                    isActive
                                        ? 'border-[color:var(--theme-primary)]/60 bg-[color:var(--theme-primary)]/12 text-foreground'
                                        : 'border-border/70 bg-background/80 text-foreground hover:border-[color:var(--theme-primary)]/40 hover:bg-[color:var(--theme-primary)]/5'
                                )}
                            >
                                {s.label}
                            </a>
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}
