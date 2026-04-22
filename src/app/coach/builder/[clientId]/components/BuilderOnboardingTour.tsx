'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

export type BuilderTourStep = {
    id: string
    title: string
    description: string
    placement?: 'top' | 'bottom'
}

interface BuilderOnboardingTourProps {
    open: boolean
    steps: BuilderTourStep[]
    mode: 'short' | 'full'
    onClose: (completed: boolean) => void
    onStepChange?: (step: BuilderTourStep | null, index: number) => void
    /** Texto opcional bajo la descripción (p. ej. aclaración móvil para un paso concreto). */
    getFooterHint?: (step: BuilderTourStep) => string | undefined
    /**
     * Pasos cuyo ancla aparece en el DOM solo tras un layout async (p. ej. panel Config).
     * No se auto-avanza si el target aún no existe: evita saltar el paso antes de que el padre pinte la UI.
     */
    deferAutoSkipIfTargetMissing?: ReadonlySet<string>
    /** Cambia cuando el layout relevante cambia (p. ej. showConfig) para volver a medir el spotlight. */
    spotlightRemeasureSignal?: unknown
}

type SpotlightRect = {
    top: number
    left: number
    width: number
    height: number
}

function getDefaultRect(): SpotlightRect {
    if (typeof window === 'undefined') {
        return { top: 120, left: 16, width: 260, height: 64 }
    }
    return {
        top: Math.max(16, Math.floor(window.innerHeight * 0.25)),
        left: 16,
        width: Math.max(220, Math.floor(window.innerWidth - 32)),
        height: 64,
    }
}

export function BuilderOnboardingTour({
    open,
    steps,
    mode,
    onClose,
    onStepChange,
    getFooterHint,
    deferAutoSkipIfTargetMissing,
    spotlightRemeasureSignal,
}: BuilderOnboardingTourProps) {
    const [currentIdx, setCurrentIdx] = useState(0)
    const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)
    const [viewport, setViewport] = useState({ width: 1280, height: 800 })

    const visibleSteps = useMemo(() => steps.filter(Boolean), [steps])
    const activeStep = visibleSteps[currentIdx]
    const total = visibleSteps.length

    useEffect(() => {
        if (!open) return
        setCurrentIdx(0)
    }, [open, mode])

    useEffect(() => {
        if (!open) {
            onStepChange?.(null, -1)
            return
        }
        onStepChange?.(activeStep ?? null, currentIdx)
    }, [open, activeStep, currentIdx, onStepChange])

    useEffect(() => {
        if (!open) return
        if (!activeStep) return

        function updateRect() {
            const el = document.querySelector(`[data-tour-id="${activeStep.id}"]`) as HTMLElement | null
            if (!el) {
                setSpotlightRect(null)
                return
            }
            const r = el.getBoundingClientRect()
            const pad = 8
            setSpotlightRect({
                top: Math.max(8, r.top - pad),
                left: Math.max(8, r.left - pad),
                width: Math.min(window.innerWidth - 16, r.width + pad * 2),
                height: r.height + pad * 2,
            })
        }

        updateRect()
        window.addEventListener('resize', updateRect)
        window.addEventListener('scroll', updateRect, true)
        return () => {
            window.removeEventListener('resize', updateRect)
            window.removeEventListener('scroll', updateRect, true)
        }
    }, [open, activeStep, spotlightRemeasureSignal])

    useEffect(() => {
        if (!open) return
        const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
        updateViewport()
        window.addEventListener('resize', updateViewport)
        return () => window.removeEventListener('resize', updateViewport)
    }, [open])

    useEffect(() => {
        if (!open) return
        if (!activeStep) return
        if (deferAutoSkipIfTargetMissing?.has(activeStep.id)) return
        // Skip unavailable targets to keep flow smooth on responsive layouts.
        const el = document.querySelector(`[data-tour-id="${activeStep.id}"]`)
        if (el) return
        const timer = setTimeout(() => {
            setCurrentIdx((idx) => {
                if (idx >= total - 1) {
                    onClose(false)
                    return idx
                }
                return idx + 1
            })
        }, 80)
        return () => clearTimeout(timer)
    }, [open, activeStep, total, onClose, deferAutoSkipIfTargetMissing])

    if (!open || !activeStep || total === 0) return null

    const footerHint = getFooterHint?.(activeStep)

    const rect = spotlightRect ?? getDefaultRect()
    const isLast = currentIdx >= total - 1
    const cardMaxWidth = 360
    const cardLeft = Math.min(
        Math.max(12, rect.left),
        Math.max(12, viewport.width - cardMaxWidth - 12)
    )
    const preferTop = activeStep.placement === 'top'
    const cardTop = preferTop ? Math.max(12, rect.top - 172) : Math.min(viewport.height - 164, rect.top + rect.height + 10)

    return (
        <div className="fixed inset-0 z-[120]">
            <div className="absolute inset-0 bg-black/65" />
            <div
                className="absolute rounded-xl border border-primary/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] transition-all duration-200 pointer-events-none"
                style={{
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                }}
            />

            <div
                className="absolute w-[min(360px,calc(100vw-24px))] rounded-xl border border-border bg-background/95 backdrop-blur p-3 shadow-2xl"
                style={{ top: cardTop, left: cardLeft }}
            >
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                    Guía del builder · {currentIdx + 1}/{total}
                </p>
                <h3 className="text-sm font-bold text-foreground leading-tight">{activeStep.title}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{activeStep.description}</p>
                {footerHint ? (
                    <p className="text-[10px] text-muted-foreground mt-2 leading-snug border-t border-border/60 pt-2">
                        {footerHint}
                    </p>
                ) : null}

                <div className="mt-3 flex items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => onClose(false)}>
                        Saltar
                    </Button>
                    <div className="flex items-center gap-2">
                        {!isLast && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                                disabled={currentIdx === 0}
                            >
                                Atrás
                            </Button>
                        )}
                        <Button
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                                if (isLast) onClose(true)
                                else setCurrentIdx((i) => i + 1)
                            }}
                        >
                            {isLast ? 'Finalizar' : 'Siguiente'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

