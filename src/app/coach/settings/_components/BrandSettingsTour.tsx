'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

export type BrandTourStep = {
    id: string
    title: string
    description: string
    placement?: 'top' | 'bottom'
}

interface BrandSettingsTourProps {
    open: boolean
    steps: BrandTourStep[]
    onClose: (completed: boolean) => void
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

export function BrandSettingsTour({
    open,
    steps,
    onClose,
}: BrandSettingsTourProps) {
    const [currentIdx, setCurrentIdx] = useState(0)
    const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)

    const visibleSteps = useMemo(() => steps.filter(Boolean), [steps])
    const activeStep = visibleSteps[currentIdx]
    const total = visibleSteps.length

    useEffect(() => {
        if (!open) return
        setCurrentIdx(0)
    }, [open])

    useEffect(() => {
        if (!open || !activeStep) return

        function updateRect() {
            const el = document.querySelector(`[data-tour-id="${activeStep.id}"]`) as HTMLElement | null
            if (!el) {
                setSpotlightRect(null)
                return
            }
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
            const r = el.getBoundingClientRect()
            const pad = 10
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
    }, [open, activeStep])

    useEffect(() => {
        if (!open || !activeStep) return
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
    }, [open, activeStep, total, onClose])

    // Bloquear scroll del body mientras el tour está abierto
    useEffect(() => {
        if (!open) return
        const originalOverflow = document.body.style.overflow
        const originalTouchAction = document.body.style.touchAction
        document.body.style.overflow = 'hidden'
        document.body.style.touchAction = 'none'

        // Bloquear scroll táctil en móvil (el scroll real está en <main>, no en body)
        const preventScroll = (e: TouchEvent) => {
            e.preventDefault()
        }
        document.addEventListener('touchmove', preventScroll, { passive: false })

        return () => {
            document.body.style.overflow = originalOverflow
            document.body.style.touchAction = originalTouchAction
            document.removeEventListener('touchmove', preventScroll)
        }
    }, [open])

    if (!open || !activeStep || total === 0) return null

    const rect = spotlightRect ?? getDefaultRect()
    const isLast = currentIdx >= total - 1
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const isVeryNarrow = typeof window !== 'undefined' && window.innerWidth < 375
    // En móvil, si el foco está en la mitad inferior, forzar la tarjeta arriba para evitar la bottom nav
    const needsTopPlacement =
        typeof window !== 'undefined' && rect.top + rect.height + (isMobile ? 320 : 220) > window.innerHeight
    const preferTop = activeStep.placement === 'top' || needsTopPlacement

    const cardTopPxFromAnchor = preferTop ? Math.max(12, rect.top - 172) : rect.top + rect.height + 10
    // En móvil reservamos más espacio (18rem ≈ 288px) para tarjeta + bottom nav + safe area
    const bottomReserve = isMobile ? '18rem' : '13rem'
    const cardTopStyle = preferTop
        ? `max(calc(env(safe-area-inset-top, 0px) + 0.75rem), ${cardTopPxFromAnchor}px)`
        : `max(calc(env(safe-area-inset-top, 0px) + 0.75rem), min(calc(100svh - env(safe-area-inset-bottom, 0px) - ${bottomReserve}), ${cardTopPxFromAnchor}px))`
    const cardLeftStyle = isVeryNarrow
        ? `max(calc(env(safe-area-inset-left, 0px) + 12px), calc(50% - min(340px, calc(100vw - 24px)) / 2))`
        : `clamp(calc(env(safe-area-inset-left, 0px) + 12px), ${rect.left}px, calc(100vw - env(safe-area-inset-right, 0px) - min(340px, calc(100vw - 24px)) - 12px))`

    return (
        <div className="fixed inset-0 z-[120]">
            {/* Spotlight: pointer-events-none para que el usuario pueda interactuar con el área focuseada */}
            <div
                className="absolute rounded-xl border-2 border-primary transition-all duration-300 pointer-events-none"
                style={{
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
                }}
            />

            {/* Tarjeta de guía: clicks habilitados, z-[60] para estar por encima de la bottom nav (z-50) */}
            <div
                className="absolute z-[60] w-[min(340px,calc(100vw-24px))] rounded-xl border border-border bg-background/95 backdrop-blur p-3 md:p-4 pb-safe shadow-2xl"
                style={{ top: cardTopStyle, left: cardLeftStyle }}
            >
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">
                    Mi Marca · Paso {currentIdx + 1} de {total}
                </p>
                <h3 className="text-sm font-bold text-foreground leading-tight">{activeStep.title}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{activeStep.description}</p>

                <div className="mt-3 flex items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => onClose(false)}>
                        Saltar
                    </Button>
                    <div className="flex items-center gap-2">
                        {currentIdx > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
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
