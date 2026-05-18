'use client'

import { Activity, ChevronLeft, ChevronRight, ClipboardList, Sparkles, Users } from 'lucide-react'
import { useCallback, useRef, type MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { postGuideEngagement } from '../../_lib/onboarding-telemetry.client'

type StepKey = 'profile_branding' | 'first_client' | 'first_plan' | 'first_checkin'

const VIGNETTES: Array<{
    id: 'coach-onboarding-step-1' | 'coach-onboarding-step-2' | 'coach-onboarding-step-3' | 'coach-onboarding-step-4'
    stepKey: StepKey
    label: string
    title: string
    blurb: string
    Icon: typeof Sparkles
}> = [
    {
        id: 'coach-onboarding-step-1',
        stepKey: 'profile_branding',
        label: 'Paso 1',
        title: 'Tu marca',
        blurb: 'Logo y color en la app del alumno.',
        Icon: Sparkles,
    },
    {
        id: 'coach-onboarding-step-2',
        stepKey: 'first_client',
        label: 'Paso 2',
        title: 'Primer alumno',
        blurb: 'Un perfil para asignar planes.',
        Icon: Users,
    },
    {
        id: 'coach-onboarding-step-3',
        stepKey: 'first_plan',
        label: 'Paso 3',
        title: 'Plan activo',
        blurb: 'Programa asignado en la práctica.',
        Icon: ClipboardList,
    },
    {
        id: 'coach-onboarding-step-4',
        stepKey: 'first_checkin',
        label: 'Paso 4',
        title: 'Uso real',
        blurb: 'Check-in o entreno en 30 días.',
        Icon: Activity,
    },
]

function scrollToStepAnchor(
    e: MouseEvent<HTMLAnchorElement>,
    id: string,
    stepKey: StepKey
) {
    void postGuideEngagement(stepKey, { widget: 'vignette_card', target: id })
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return
    }
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * V2: viñetas horizontales con snap + flechas (teclado/screen reader friendly).
 */
export function OnboardingStepsVignetteCarousel({
    completed,
}: {
    completed: Record<StepKey, boolean>
}) {
    const scRef = useRef<HTMLDivElement>(null)

    const scrollBy = useCallback((dir: -1 | 1) => {
        const el = scRef.current
        if (!el) return
        void postGuideEngagement('profile_branding', {
            widget: 'vignette_carousel',
            action: dir < 0 ? 'arrow_prev' : 'arrow_next',
        })
        const card = el.querySelector<HTMLElement>('[data-vignette-card]')
        const w = card?.offsetWidth ?? 280
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollBy({ left: dir * (w + 12), behavior: reduce ? 'auto' : 'smooth' })
    }, [])

    return (
        <section
            className="relative mt-5"
            aria-label="Cuatro hitos de la guía en viñetas"
        >
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Capítulos
            </p>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="absolute left-0 top-[calc(50%+0.75rem)] z-10 h-9 w-9 -translate-y-1/2 touch-manipulation shadow-sm md:left-1"
                aria-label="Viñeta anterior"
                onClick={() => scrollBy(-1)}
            >
                <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="absolute right-0 top-[calc(50%+0.75rem)] z-10 h-9 w-9 -translate-y-1/2 touch-manipulation shadow-sm md:right-1"
                aria-label="Viñeta siguiente"
                onClick={() => scrollBy(1)}
            >
                <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>

            <div
                ref={scRef}
                className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-10 pb-1 motion-reduce:scroll-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {VIGNETTES.map((v) => {
                    const done = completed[v.stepKey]
                    const Icon = v.Icon
                    return (
                        <a
                            key={v.id}
                            data-vignette-card
                            href={`#${v.id}`}
                            onClick={(e) => scrollToStepAnchor(e, v.id, v.stepKey)}
                            className={cn(
                                'relative flex min-h-[8.5rem] w-[85vw] max-w-xs min-w-[16rem] shrink-0 snap-center flex-col rounded-2xl border p-4 transition-colors',
                                'border-border/80 bg-card/60 hover:border-[color:var(--theme-primary)]/35 hover:bg-[color:var(--theme-primary)]/5',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                done && 'border-emerald-500/35 bg-emerald-500/5'
                            )}
                        >
                            {done ? (
                                <span className="absolute right-2 top-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                    Listo
                                </span>
                            ) : null}
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {v.label}
                            </span>
                            <div className="mt-2 flex items-center gap-2">
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--theme-primary)]/12">
                                    <Icon className="h-4 w-4 text-[color:var(--theme-primary)]" aria-hidden />
                                </span>
                                <span className="text-sm font-black text-foreground">{v.title}</span>
                            </div>
                            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">{v.blurb}</p>
                            <span className="mt-3 text-[11px] font-bold uppercase tracking-wide text-[color:var(--theme-primary)]">
                                Ir al paso ↓
                            </span>
                        </a>
                    )
                })}
            </div>
        </section>
    )
}
