'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { resolveLaunchBrand } from '@/lib/workout/exec-launch-brand'

/**
 * Ejecutor V3 — DESPEGUE (loader de lanzamiento del workout, diseño del CEO "Despegue Final").
 *
 * Puente dashboard→ejecutor: al tocar "Empezar entrenamiento" (o una day-card) la píldora del CTA
 * morfea a burbuja, anticipa (squash) y DESPEGA con stretch + estela; el fondo de marca sube con un
 * wipe cubriendo el dashboard; el logo del coach ATERRIZA con rebote + onda de impacto y queda en
 * "PREPARANDO TU SESIÓN" con los dots en loop. Mientras tanto el App Router carga el ejecutor detrás.
 *
 * Contrato del CEO: la animación SIEMPRE se completa (aunque el workout cargue antes) y luego ESPERA
 * el TAP del alumno para entrar a la pantalla de Inicio ("Día N · plan + EMPEZAR"). Por eso NO hay
 * auto-dismiss: el overlay se despide sólo al tap, y sólo cuando ya está listo (animación terminada +
 * ruta montada). El provider vive en el layout `/c` (persiste entre rutas) → el overlay sobrevive al
 * swap del router. Toda la coreografía es CSS keyframes (transform/opacity, 60fps); ver globals.css
 * `.exec-dsp*`. White-label: todo deriva de `--theme-primary`.
 */

/** Animación "arribada" (logo aterrizado + PREPARANDO visible). Tras esto se puede habilitar el tap. */
const ANIM_DONE_MS = 2700
/** Fallback: si la ruta nunca commitea, habilitar el tap igual para no dejar al alumno atrapado. */
const READY_FALLBACK_MS = 4500
/** Fade de salida al tap (revela la pantalla de Inicio ya montada debajo). */
const EXIT_MS = 320

interface MorphState {
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

/** Provider del Despegue — montar UNA vez en el layout `/c` envolviendo `{children}`. */
export function WorkoutLaunchProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const reduced = useReducedMotion()
    const [state, setState] = useState<MorphState | null>(null)
    const [animDone, setAnimDone] = useState(false)
    const [routeReady, setRouteReady] = useState(false)
    const [forceReady, setForceReady] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const activeRef = useRef(false)
    const timersRef = useRef<number[]>([])

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((t) => window.clearTimeout(t))
        timersRef.current = []
    }, [])

    const clearAll = useCallback(() => {
        clearTimers()
        activeRef.current = false
        setState(null)
        setAnimDone(false)
        setRouteReady(false)
        setForceReady(false)
        setLeaving(false)
    }, [clearTimers])

    const launch = useCallback(
        (el: HTMLElement, href: string) => {
            if (activeRef.current || state) return // guard anti doble-tap
            const brand = resolveLaunchBrand(el)
            activeRef.current = true
            el.setAttribute('data-exec-morphing', '')
            // El trigger real se oculta durante el vuelo (el clon vive en el overlay). Se restaura al limpiar.
            window.setTimeout(() => el.removeAttribute('data-exec-morphing'), 700)

            setState({ href, startedAt: performance.now(), startPath: pathname, logoUrl: brand.logoUrl, initial: brand.initial })
            setAnimDone(false)
            setRouteReady(false)
            setForceReady(false)
            setLeaving(false)

            // El ejecutor lee esta marca → salta el splash viejo y va DIRECTO a Inicio (el Despegue ES el
            // splash), y llega asentado.
            try {
                sessionStorage.setItem('eva:exec-v3-morph', '1')
                if (brand.logoUrl) sessionStorage.setItem('eva:exec-v3-morph-logo', brand.logoUrl)
                else sessionStorage.removeItem('eva:exec-v3-morph-logo')
            } catch { /* private mode */ }

            // Navegación en paralelo (la ruta carga detrás del Despegue).
            timersRef.current.push(window.setTimeout(() => {
                try { router.push(href) } catch { /* si falla, el fallback habilita el tap y el alumno reintenta */ }
            }, 120))
            // La animación siempre corre completa: a los ANIM_DONE_MS habilitamos el tap (si además la ruta
            // ya montó). El fallback lo habilita pase lo que pase, para no atrapar al alumno.
            timersRef.current.push(window.setTimeout(() => setAnimDone(true), ANIM_DONE_MS))
            timersRef.current.push(window.setTimeout(() => setForceReady(true), READY_FALLBACK_MS))
        },
        [pathname, router, state]
    )

    // Ruta montada (pathname cambió respecto al de lanzamiento).
    useEffect(() => {
        if (state && !routeReady && pathname !== state.startPath) setRouteReady(true)
    }, [pathname, state, routeReady])

    const ready = !!state && animDone && (routeReady || forceReady)

    // Tap del alumno (sólo cuando está listo): fade de salida → revela Inicio y limpia.
    const dismiss = useCallback(() => {
        if (!ready || leaving) return
        try { sessionStorage.removeItem('eva:exec-v3-morph') } catch { /* private */ }
        // La marca ya la consumió el ejecutor al montar; removerla aquí es defensivo (nav lenta).
        setLeaving(true)
        timersRef.current.push(window.setTimeout(clearAll, EXIT_MS + 40))
    }, [ready, leaving, clearAll])

    useEffect(() => () => clearTimers(), [clearTimers])

    return (
        <WorkoutLaunchContext.Provider value={{ launch }}>
            {children}
            {state && (
                <DespegueOverlay
                    logoUrl={state.logoUrl}
                    initial={state.initial}
                    ready={ready}
                    leaving={leaving}
                    reduced={!!reduced}
                    onTap={dismiss}
                />
            )}
        </WorkoutLaunchContext.Provider>
    )
}

const PlayIcon = ({ size = 15 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <path d="M4 2l10 6-10 6z" fill="#ffffff" />
    </svg>
)

function DespegueOverlay({
    logoUrl,
    initial,
    ready,
    leaving,
    reduced,
    onTap,
}: {
    logoUrl: string | null
    initial: string | null
    ready: boolean
    leaving: boolean
    reduced: boolean
    onTap: () => void
}) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    if (!mounted) return null

    return createPortal(
        <motion.div
            className={`exec-dsp${ready ? ' is-ready' : ''}`}
            aria-label="Preparando tu sesión"
            role="status"
            initial={false}
            animate={{ opacity: leaving ? 0 : 1 }}
            transition={{ duration: leaving ? EXIT_MS / 1000 : 0, ease: 'easeOut' }}
        >
            {/* Fondo de marca que sube (wipe) + estelas de luz. */}
            <div className="exec-dsp-bg" aria-hidden>
                <span className="exec-dsp-line" style={{ left: '22%', height: 120, animation: 'exec-dsp-line 0.7s ease-in 0.95s both' }} />
                <span className="exec-dsp-line" style={{ left: '58%', height: 180, animation: 'exec-dsp-line 0.8s ease-in 1.05s both' }} />
                <span className="exec-dsp-line" style={{ left: '80%', height: 90, animation: 'exec-dsp-line 0.65s ease-in 1.15s both' }} />
            </div>

            {/* Píldora del CTA que morfea y despega (oculta en reduced-motion). */}
            {!reduced && (
                <div className="exec-dsp-pill" aria-hidden>
                    <span className="exec-dsp-pill-label">
                        <PlayIcon /> Empezar entrenamiento
                    </span>
                    <span className="exec-dsp-trail" />
                </div>
            )}

            {/* Centro: logo del coach que aterriza + "PREPARANDO TU SESIÓN" con dots. */}
            <div className="exec-dsp-center">
                <div className="exec-dsp-logo-wrap">
                    <span className="exec-dsp-ring" aria-hidden />
                    <div className="exec-dsp-logo">
                        {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt="" className="exec-dsp-logo-img" />
                        ) : initial ? (
                            <span className="exec-dsp-logo-initial">{initial}</span>
                        ) : (
                            <PlayIcon size={38} />
                        )}
                    </div>
                </div>
                <div className="exec-dsp-prep">
                    <span className="exec-dsp-prep-t">PREPARANDO TU SESIÓN</span>
                    <span className="exec-dsp-dots" aria-hidden><i /><i /><i /></span>
                </div>
            </div>

            <div className="exec-dsp-hint">TOCA PARA COMENZAR</div>
            {/* Capa de tap: sólo activa cuando está listo (animación completa + ruta montada). */}
            {ready && <button type="button" className="exec-dsp-tap" onClick={onTap} aria-label="Comenzar entrenamiento" />}
        </motion.div>,
        document.body
    )
}
