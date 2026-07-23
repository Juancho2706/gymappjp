'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { resolveLaunchBrand } from '@/lib/workout/exec-launch-brand'

/**
 * Ejecutor V3 (QA6→QA8) — MORPH DE LANZAMIENTO. Puente visual dashboard→ejecutor: el trigger
 * (CTA "Empezar entrenamiento" o una day-card) se tiñe de MARCA y expande a pantalla completa,
 * cruza al tono del splash V3 y muestra el logo del coach + "PREPARANDO TU SESIÓN" con puntos
 * animados — el overlay ES el loader del workout mientras el App Router carga detrás.
 *
 * ARQUITECTURA (QA8, causa raíz del video del CEO): el overlay vivía en el árbol del DASHBOARD y el
 * `router.push` (con prefetch) hacía el swap en ~1 frame → el overlay moría ANTES de expandirse (corte
 * duro a la cover estática). Ahora vive en un PROVIDER montado en el layout `/c` — que PERSISTE entre
 * rutas — así la coreografía corre completa sobre la navegación y se despide sola cuando el destino ya
 * montó y cumplió el tiempo mínimo de la ceremonia.
 *
 * Coreografía: (1) tap → texto del trigger cae y se apaga 150ms; (2) clon del rect expande a inset:0
 * (620ms, cubic-bezier(.22,1,.36,1)) + `router.push`; (3) crossfade al tono splash + logo con
 * overshoot y aro que respira una vez; (4) "PREPARANDO TU SESIÓN · · ·" (puntos con rebote) — el
 * loader; (5) con la ruta montada y ≥1.6s de ceremonia → fade de salida 280ms revelando el splash SSR
 * (que llega ASENTADO vía la marca `eva:exec-v3-morph`). reduced-motion: crossfade simple.
 */

const MORPH_EASE = [0.22, 1, 0.36, 1] as const
/** Tiempo mínimo del overlay (la ceremonia completa) antes de poder despedirse. */
const MIN_HOLD_MS = 1600
/** Fade de salida (revela el splash ya montado debajo). */
const EXIT_MS = 280

interface MorphState {
    rect: { top: number; left: number; width: number; height: number }
    radius: number
    href: string
    startedAt: number
    startPath: string
    logoUrl: string | null
    initial: string | null
}

interface LaunchApi {
    launch: (el: HTMLElement, href: string) => void
}

const WorkoutLaunchContext = createContext<LaunchApi | null>(null)

/**
 * Hook de los triggers (hero / day-cards / done-sheet). `morph` queda por compatibilidad de firma y
 * es SIEMPRE null: el overlay lo renderiza el provider del layout (sobrevive al swap de ruta).
 */
export function useWorkoutLaunch(): { launch: (el: HTMLElement, href: string) => void; morph: null } {
    const ctx = useContext(WorkoutLaunchContext)
    return { launch: ctx?.launch ?? (() => {}), morph: null }
}

/** Provider del morph — montar UNA vez en el layout `/c` envolviendo `{children}`. */
export function WorkoutLaunchProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const reduced = useReducedMotion()
    const [state, setState] = useState<MorphState | null>(null)
    const [expanded, setExpanded] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const activeElRef = useRef<HTMLElement | null>(null)
    const timersRef = useRef<number[]>([])

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((t) => window.clearTimeout(t))
        timersRef.current = []
    }, [])

    const clearAll = useCallback(() => {
        clearTimers()
        const el = activeElRef.current
        if (el) el.removeAttribute('data-exec-morphing')
        activeElRef.current = null
        setExpanded(false)
        setLeaving(false)
        setState(null)
    }, [clearTimers])

    // Aborto SILENCIOSO: la navegación nunca cambió la ruta (RSC abortado / dedupe / edge server) →
    // retiramos el overlay sin un toast alarmante (el dashboard ya está debajo, el alumno reintenta).
    // Limpiamos la marca de morph para que un lanzamiento posterior no herede la ceremonia.
    const abortSilently = useCallback(() => {
        try { sessionStorage.removeItem('eva:exec-v3-morph') } catch { /* private */ }
        clearAll()
    }, [clearAll])

    const launch = useCallback(
        (el: HTMLElement, href: string) => {
            if (activeElRef.current || state) return // guard anti doble-tap
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
                startedAt: performance.now(),
                startPath: pathname,
                logoUrl: brand.logoUrl,
                initial: brand.initial,
            })
            setExpanded(false)
            setLeaving(false)

            // Handoff: el ejecutor lee esta marca → SIEMPRE ceremonia completa (splash → Inicio) y el
            // avatar del splash llega ASENTADO (la entrada ya la hizo este overlay).
            try {
                sessionStorage.setItem('eva:exec-v3-morph', '1')
                if (brand.logoUrl) sessionStorage.setItem('eva:exec-v3-morph-logo', brand.logoUrl)
                else sessionStorage.removeItem('eva:exec-v3-morph-logo')
            } catch { /* private mode */ }

            const go = () => {
                try {
                    router.push(href)
                } catch {
                    abortSilently()
                }
            }

            if (reduced) {
                go()
            } else {
                // Fase 1 (0–150ms): el texto del trigger cae y se apaga (CSS). Fase 2: expansión + push.
                timersRef.current.push(
                    window.setTimeout(() => {
                        setExpanded(true)
                        go()
                    }, 150)
                )
            }

            // Safety SILENCIOSO: con loading.tsx la ruta commitea (pathname cambia) muy por debajo de
            // esto; si a los 3,5s NO cambió, el push no prosperó → retiramos el overlay sin error rojo.
            // El camino feliz cancela este timer al despedirse (clearAll limpia todos los timers).
            timersRef.current.push(window.setTimeout(abortSilently, 3500))
        },
        [abortSilently, pathname, reduced, router, state]
    )

    // Despedida: la ruta destino ya montó (pathname cambió) → esperar el resto de la ceremonia mínima
    // y hacer fade de salida. El splash SSR ya está debajo con el MISMO fondo/avatar.
    useEffect(() => {
        if (!state || leaving) return
        if (pathname === state.startPath) return
        const elapsed = performance.now() - state.startedAt
        const wait = Math.max(0, MIN_HOLD_MS - elapsed)
        const t1 = window.setTimeout(() => setLeaving(true), wait)
        const t2 = window.setTimeout(() => clearAll(), wait + EXIT_MS + 60)
        timersRef.current.push(t1, t2)
        return () => {
            window.clearTimeout(t1)
            window.clearTimeout(t2)
        }
    }, [pathname, state, leaving, clearAll])

    useEffect(() => () => clearTimers(), [clearTimers])

    return (
        <WorkoutLaunchContext.Provider value={{ launch }}>
            {children}
            {state && <MorphOverlay state={state} expanded={expanded} leaving={leaving} reduced={!!reduced} />}
        </WorkoutLaunchContext.Provider>
    )
}

function MorphOverlay({
    state,
    expanded,
    leaving,
    reduced,
}: {
    state: MorphState
    expanded: boolean
    leaving: boolean
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
        const t = window.setTimeout(() => setShowPrep(true), 700)
        return () => window.clearTimeout(t)
    }, [reduced])

    if (!mounted) return null

    // `--exec-brand` = var(--theme-primary) → MISMA fórmula/tono que el splash V3 (white-label safe).
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
                    animate={expanded ? { opacity: 1, scale: [0.6, 1.045, 1] } : { opacity: 0, scale: 0.6 }}
                    transition={
                        expanded
                            ? { duration: 0.62, delay: 0.26, times: [0, 0.72, 1], ease: MORPH_EASE }
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
                        transition={{ duration: 0.8, delay: 0.44, ease: 'easeOut' }}
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
                <span className="exec-morph-dots" aria-hidden>
                    <i /><i /><i />
                </span>
            </motion.div>
        </div>
    )

    return createPortal(
        <motion.div
            className="exec-morph"
            style={brandVars}
            aria-hidden
            initial={false}
            animate={{ opacity: leaving ? 0 : 1 }}
            transition={{ duration: reduced ? 0.12 : EXIT_MS / 1000, ease: 'easeOut' }}
        >
            {reduced ? (
                <motion.div
                    className="exec-morph-splashbg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                >
                    {stack}
                </motion.div>
            ) : (
                <>
                    {/* Clon del rect del trigger: sólido de marca que expande a pantalla completa. */}
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
                                ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight, borderRadius: 0 }
                                : {}
                        }
                        transition={{ duration: 0.62, ease: MORPH_EASE }}
                    />
                    {/* Fondo splash (fórmula exacta) que cruza sobre el sólido + logo al centro. */}
                    <motion.div
                        className="exec-morph-splashbg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: expanded ? 1 : 0 }}
                        transition={{ duration: 0.65, delay: expanded ? 0.3 : 0, ease: 'easeOut' }}
                    >
                        {stack}
                    </motion.div>
                </>
            )}
        </motion.div>,
        document.body
    )
}
