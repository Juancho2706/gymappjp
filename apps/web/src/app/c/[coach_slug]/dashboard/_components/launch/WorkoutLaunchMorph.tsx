'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { resolveLaunchBrand } from '@/lib/workout/exec-launch-brand'

/**
 * Ejecutor V3 (QA6) — MORPH DE LANZAMIENTO. Puente visual efímero dashboard→ejecutor: el trigger
 * (CTA "Empezar entrenamiento" o una day-card) se tiñe de MARCA y expande a pantalla completa,
 * cruza al tono del splash V3 (misma fórmula) y muestra el logo del coach en la posición del avatar,
 * mientras el App Router hace el swap y el splash SSR del ejecutor toma el relevo (handoff invisible:
 * mismo fondo, mismo avatar). El overlay portalea a <body> con z-index máximo y NO toca el tema de la
 * página (el dashboard es zona clara/oscura; este overlay es efímero). Motor de guardado y navegación
 * INTOCADOS: sólo interceptamos el click para animar mientras se navega al MISMO destino de hoy.
 *
 * Coreografía (contrato del jefe):
 *   1. tap → texto del trigger fade-out 120 ms + scale 1.02 (CSS `[data-exec-morphing]`).
 *   2. clon fixed del rect del trigger (sólido de marca, mismo radio) anima a inset:0 y radio→0 en
 *      ~480 ms con cubic-bezier(.22,1,.36,1). `router.push` dispara al INICIO de esta fase.
 *   3. desde ~300 ms: el sólido cruza al tono splash + el logo aparece escalando 0.6→1 (círculo 116px).
 *   4. si la carga tarda, "Preparando tu sesión" aparece con fade a los ~900 ms.
 *   5. prefers-reduced-motion: crossfade simple sin expansión.
 */

const MORPH_EASE = [0.22, 1, 0.36, 1] as const

interface MorphState {
    rect: { top: number; left: number; width: number; height: number }
    radius: number
    href: string
    logoUrl: string | null
    initial: string | null
}

/**
 * Hook reutilizable: expone `launch(triggerEl, href)` (dispara la coreografía) y `morph` (el overlay
 * a renderizar). Guard anti doble-tap. En éxito, el swap del App Router desmonta este árbol (dashboard)
 * y con él el overlay; sólo revertimos si la navegación falla o nunca ocurre (safety).
 */
export function useWorkoutLaunch() {
    const router = useRouter()
    const reduced = useReducedMotion()
    const [state, setState] = useState<MorphState | null>(null)
    const [expanded, setExpanded] = useState(false)
    const activeElRef = useRef<HTMLElement | null>(null)
    const timersRef = useRef<number[]>([])

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((t) => window.clearTimeout(t))
        timersRef.current = []
    }, [])

    const revert = useCallback(
        (msg?: string) => {
            clearTimers()
            const el = activeElRef.current
            if (el) el.removeAttribute('data-exec-morphing')
            activeElRef.current = null
            setExpanded(false)
            setState(null)
            if (msg) toast.error(msg)
        },
        [clearTimers]
    )

    const launch = useCallback(
        (el: HTMLElement, href: string) => {
            if (activeElRef.current) return // guard anti doble-tap
            const rect = el.getBoundingClientRect()
            const cs = window.getComputedStyle(el)
            const radius = parseFloat(cs.borderTopLeftRadius) || 0
            const brand = resolveLaunchBrand(el)

            activeElRef.current = el
            el.setAttribute('data-exec-morphing', '')
            setState({
                rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                radius,
                href,
                logoUrl: brand.logoUrl,
                initial: brand.initial,
            })
            setExpanded(false)

            // Handoff sin pop: el splash del ejecutor lee esta marca y llega ASENTADO (su avatar no
            // re-anima desde scale 0.3 — el morph ya hizo esa entrada).
            try { sessionStorage.setItem('eva:exec-v3-morph', '1') } catch { /* private mode */ }

            const NAV_ERROR = 'No pudimos abrir tu sesión. Intenta de nuevo.'
            const go = () => {
                try {
                    router.push(href)
                } catch {
                    revert(NAV_ERROR)
                }
            }

            if (reduced) {
                // Crossfade simple sin expansión: el overlay hace de puente mientras se navega.
                go()
            } else {
                // Fase 1 (0–120 ms): fade del texto del trigger (CSS). Fase 2 (~120 ms): expansión + push.
                timersRef.current.push(
                    window.setTimeout(() => {
                        setExpanded(true)
                        go()
                    }, 120)
                )
            }

            // Safety: si tras varios segundos seguimos montados (nav fallida silenciosa), revertimos.
            // En éxito este árbol se desmonta con el swap del router y el timer se limpia solo.
            timersRef.current.push(window.setTimeout(() => revert(NAV_ERROR), 6000))
        },
        [reduced, router, revert]
    )

    useEffect(() => () => clearTimers(), [clearTimers])

    const morph = state ? <WorkoutLaunchMorph state={state} expanded={expanded} reduced={!!reduced} /> : null
    return { launch, morph }
}

function WorkoutLaunchMorph({
    state,
    expanded,
    reduced,
}: {
    state: MorphState
    expanded: boolean
    reduced: boolean
}) {
    const [mounted, setMounted] = useState(false)
    const [showPrep, setShowPrep] = useState(false)

    useEffect(() => setMounted(true), [])
    useEffect(() => {
        if (reduced) {
            setShowPrep(true)
            return
        }
        const t = window.setTimeout(() => setShowPrep(true), 900)
        return () => window.clearTimeout(t)
    }, [reduced])

    if (!mounted) return null

    // `--exec-brand` = var(--theme-primary) → MISMA fórmula/tono que el splash V3 (white-label safe).
    // El overlay portalea fuera del wrapper /c, pero `--theme-primary` vive en `:root` (global).
    const brandVars = {
        '--exec-brand': 'var(--theme-primary, #2680FF)',
        '--exec-brand-ink': 'color-mix(in srgb, var(--theme-primary, #2680FF) 30%, #000)',
    } as React.CSSProperties

    const avatar = state.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.logoUrl} alt="" className="exec-morph-avatar-img" />
    ) : (
        <span className="exec-morph-avatar-initial">{state.initial || '•'}</span>
    )

    const stack = (
        <div className="exec-morph-stack">
            {reduced ? (
                <div className="exec-morph-avatar">{avatar}</div>
            ) : (
                <motion.div
                    className="exec-morph-avatar"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={
                        expanded
                            ? { opacity: 1, scale: [0.6, 1.045, 1] }
                            : { opacity: 0, scale: 0.6 }
                    }
                    transition={
                        expanded
                            ? { duration: 0.52, delay: 0.18, times: [0, 0.72, 1], ease: MORPH_EASE }
                            : { duration: 0.2 }
                    }
                >
                    {avatar}
                    {/* Aro de marca: una sola respiración al asentarse el logo. */}
                    <motion.span
                        className="exec-morph-avatar-ring"
                        aria-hidden
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={expanded ? { opacity: [0, 0.55, 0], scale: [0.92, 1.22, 1.3] } : { opacity: 0 }}
                        transition={{ duration: 0.7, delay: 0.32, ease: 'easeOut' }}
                    />
                </motion.div>
            )}
            {/* Reserva la altura del título del día del splash → alinea el avatar con el del splash. */}
            <div className="exec-morph-dayspacer" aria-hidden />
            <motion.div
                className="exec-morph-prep"
                initial={false}
                animate={{ opacity: showPrep ? 1 : 0 }}
                transition={{ duration: reduced ? 0 : 0.3 }}
            >
                Preparando tu sesión
            </motion.div>
        </div>
    )

    // Reduced motion: crossfade simple del fondo splash (sin clon ni expansión).
    if (reduced) {
        return createPortal(
            <div className="exec-morph" style={brandVars} aria-hidden>
                <motion.div
                    className="exec-morph-splashbg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                >
                    {stack}
                </motion.div>
            </div>,
            document.body
        )
    }

    return createPortal(
        <div className="exec-morph" style={brandVars} aria-hidden>
            {/* Clon del rect del trigger: sólido de marca que expande a pantalla completa (radio→0). */}
            <motion.div
                className="exec-morph-clone"
                initial={{
                    top: state.rect.top,
                    left: state.rect.left,
                    width: state.rect.width,
                    height: state.rect.height,
                    borderRadius: state.radius,
                }}
                animate={
                    expanded
                        ? {
                              top: 0,
                              left: 0,
                              width: window.innerWidth,
                              height: window.innerHeight,
                              borderRadius: 0,
                          }
                        : {}
                }
                transition={{ duration: 0.48, ease: MORPH_EASE }}
            />
            {/* Fondo splash (fórmula exacta) que cruza sobre el sólido desde ~300 ms + logo al centro. */}
            <motion.div
                className="exec-morph-splashbg"
                initial={{ opacity: 0 }}
                animate={{ opacity: expanded ? 1 : 0 }}
                transition={{ duration: 0.5, delay: expanded ? 0.22 : 0, ease: 'easeOut' }}
            >
                {stack}
            </motion.div>
        </div>,
        document.body
    )
}
