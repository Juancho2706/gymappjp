'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import * as Sentry from '@sentry/nextjs'
import { resolveLaunchBrand } from '@/lib/workout/exec-launch-brand'
import { clearCeremonyDom, clearMorphFlag, markCeremonyDom, markMorphFlag } from '@/lib/workout/launch-ceremony'
import { useCaptureStudentWorkoutLaunched } from '@/lib/posthog/events'

/**
 * Ejecutor V3 — DESPEGUE (loader de lanzamiento del workout, diseño del CEO "Despegue Final").
 *
 * Al tocar "Empezar entrenamiento" (o una day-card) el COMPONENTE REAL clickeado morfea: un clon de
 * su rect exacto (tamaño/posición/radio) colapsa a burbuja, anticipa (squash) y DESPEGA con stretch +
 * estela; el fondo de marca sube con wipe cubriendo el dashboard; 3 estelas de luz caen; el logo del
 * coach ATERRIZA con rebote + onda de impacto y queda en "PREPARANDO TU SESIÓN" con dots en loop.
 *
 * Contrato del CEO:
 *  - El morph nace del rect del trigger (no de una píldora fija) — Web Animations API con keyframes
 *    computados desde `getBoundingClientRect()`.
 *  - La animación SIEMPRE se completa y luego ESPERA el TAP del alumno para entrar a Inicio.
 *  - Durante toda la ceremonia se BLOQUEAN los taps (una capa full-screen los captura) para que no se
 *    pueda skipear clickeando la pantalla; sólo cuando está listo el tap avanza.
 *  - La navegación ocurre DESPUÉS de que el fondo de marca ya cubrió todo (~1,3s), para que el swap
 *    de ruta (dashboard → ejecutor) quede oculto tras el azul y no se vea el flash del contenido.
 *
 * El provider vive en el layout `/c` (persiste entre rutas) → el overlay sobrevive al swap. Toda la
 * ceremonia posterior al morph es CSS keyframes (transform/opacity). White-label: deriva de
 * `--theme-primary`. Via morph el ejecutor salta el splash viejo y va directo a fase 'start'.
 */

/** Navegar cuando el wipe de marca ya cubre todo (delay .6s + dur .6s = 1.2s) → swap oculto. */
const NAV_AT_MS = 1300
/** Animación "arribada" (logo aterrizado + PREPARANDO). Tras esto se puede habilitar el tap. */
const ANIM_DONE_MS = 2700
/** Fallback: si la ruta nunca commitea, habilitar el tap igual para no atrapar al alumno. */
const READY_FALLBACK_MS = 4600
/** Fade de salida al tap (revela Inicio ya montado debajo). */
const EXIT_MS = 320

/** Reloj monótono a nivel módulo (evita `Date.now()` en handlers del render — lint react-compiler). */
const perfNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

interface Rect { top: number; left: number; width: number; height: number; radius: number }
interface MorphState {
    href: string
    startedAt: number
    startPath: string
    rect: Rect
    label: string
    logoUrl: string | null
    initial: string | null
}

interface LaunchApi {
    launch: (el: HTMLElement, href: string) => void
}

const WorkoutLaunchContext = createContext<LaunchApi | null>(null)

/** Hook de los triggers. `morph` queda null (el overlay lo renderiza el provider del layout). */
export function useWorkoutLaunch(): { launch: (el: HTMLElement, href: string) => void; morph: null } {
    const ctx = useContext(WorkoutLaunchContext)
    return { launch: ctx?.launch ?? (() => {}), morph: null }
}

/** Provider del Despegue — montar UNA vez en el layout `/c` envolviendo `{children}`. */
export function WorkoutLaunchProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const reduced = useReducedMotion()
    const captureLaunched = useCaptureStudentWorkoutLaunched()
    const [state, setState] = useState<MorphState | null>(null)
    const [animDone, setAnimDone] = useState(false)
    const [routeReady, setRouteReady] = useState(false)
    // QA "se recarga la pagina": `routeReady` (cambio de pathname) NO garantiza que el ejecutor ya pinto
    // la pantalla de Inicio — puede seguir en el cover de ruta (loading.tsx) o con SessionStart aun
    // transparente, dejando ver el stepper base al despedir el overlay. `execReady` es la senal REAL del
    // WEC: la pantalla de Inicio (SessionStart) ya esta montada y pintada. Se despide sobre eso, no antes.
    const [execReady, setExecReady] = useState(false)
    const [forceReady, setForceReady] = useState(false)
    const [leaving, setLeaving] = useState(false)
    const activeRef = useRef(false)
    const timersRef = useRef<number[]>([])
    // Espejos de las señales de listo para leerlas SIN cierre stale dentro del timer de `forceReady`
    // (la telemetría necesita saber si la señal real ya había llegado cuando ganó el fallback).
    const execReadyRef = useRef(false)
    const routeReadyRef = useRef(false)

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((t) => window.clearTimeout(t))
        timersRef.current = []
    }, [])

    const clearAll = useCallback(() => {
        clearTimers()
        activeRef.current = false
        execReadyRef.current = false
        routeReadyRef.current = false
        clearCeremonyDom() // se acabó la ceremonia → los sync de cola pueden refrescar
        setState(null)
        setAnimDone(false)
        setRouteReady(false)
        setExecReady(false)
        setForceReady(false)
        setLeaving(false)
    }, [clearTimers])

    const launch = useCallback(
        (el: HTMLElement, href: string) => {
            if (activeRef.current || state) return // guard anti doble-tap
            const r = el.getBoundingClientRect()
            const cs = window.getComputedStyle(el)
            const rect: Rect = { top: r.top, left: r.left, width: r.width, height: r.height, radius: parseFloat(cs.borderTopLeftRadius) || 14 }
            const brand = resolveLaunchBrand(el)
            // Texto real del trigger ("Empezar entrenamiento" / "Continuar"): el clon lo usa para que el
            // swap (ocultar original → mostrar clon) sea invisible en el CTA.
            const label = (el.textContent || '').replace(/\s+/g, ' ').trim()
            activeRef.current = true
            execReadyRef.current = false
            routeReadyRef.current = false
            const launchedAtPerf = perfNow()
            el.setAttribute('data-exec-morphing', '') // oculta el trigger real COMPLETO durante el vuelo
            // Restaurar sólo bien después de que el wipe de marca ya cubrió todo (~1,2s) y de navegar
            // (~1,3s, donde el dashboard se desmonta): así el trigger nunca reaparece a la vista.
            window.setTimeout(() => el.removeAttribute('data-exec-morphing'), 1500)

            // Marca de ceremonia en el DOM → los sync de cola del layout difieren su refresh mientras dure.
            markCeremonyDom()

            setState({ href, startedAt: launchedAtPerf, startPath: pathname, rect, label, logoUrl: brand.logoUrl, initial: brand.initial })
            setAnimDone(false)
            setRouteReady(false)
            setExecReady(false)
            setForceReady(false)
            setLeaving(false)

            // Marca de handoff del morph con TTL (el ejecutor la consume en fase 'start'; ver launch-ceremony).
            markMorphFlag()
            try {
                // Reset de la senal de Inicio-listo del WEC (la del lanzamiento anterior no debe contar).
                sessionStorage.removeItem('eva:exec-v3-ready')
                if (brand.logoUrl) sessionStorage.setItem('eva:exec-v3-morph-logo', brand.logoUrl)
                else sessionStorage.removeItem('eva:exec-v3-morph-logo')
            } catch { /* private mode */ }

            // Telemetría: rastro del lanzamiento (para reconstruir la carrera si el overlay muere).
            Sentry.addBreadcrumb({ category: 'exec-v3', message: 'launch', level: 'info', data: { startPath: pathname, href } })
            // Evento de producto del ALUMNO (PostHog ya está gated por consentimiento → no-op sin `ph`).
            // `start_path` es el origen barato disponible acá; la identidad exacta del trigger exigiría
            // tocar los call-sites de `launch()` (fuera de carril) → se deja anotado.
            captureLaunched({ start_path: pathname })

            // Navegar DESPUÉS de que el wipe de marca cubrió todo → el swap de ruta queda oculto.
            timersRef.current.push(window.setTimeout(() => {
                try {
                    router.push(href)
                } catch (err) {
                    // Antes se tragaba: reportamos para no perder de vista un push que falló (el fallback
                    // de ~4,6s habilita igual el tap y el alumno reintenta).
                    Sentry.captureException(err)
                }
            }, reduced ? 60 : NAV_AT_MS))
            timersRef.current.push(window.setTimeout(() => setAnimDone(true), reduced ? 500 : ANIM_DONE_MS))
            timersRef.current.push(window.setTimeout(() => {
                // Si el fallback gana la carrera con la señal REAL aún sin llegar, es una degradación
                // (red lenta / ruta que no commiteó): la reportamos con el tiempo transcurrido.
                if (!execReadyRef.current || !routeReadyRef.current) {
                    Sentry.captureMessage('exec-v3: fallback 4.6s gano la carrera', {
                        level: 'warning',
                        extra: { sinceLaunchMs: Math.round(perfNow() - launchedAtPerf) },
                    })
                }
                setForceReady(true)
            }, READY_FALLBACK_MS))
        },
        [pathname, reduced, router, state, captureLaunched]
    )

    useEffect(() => {
        if (!state) return
        if (pathname !== state.startPath) {
            if (!routeReady) setRouteReady(true)
            return
        }
        // Volvimos al path de lanzamiento estando ya fuera → el alumno tocó "atrás" del teléfono:
        // el overlay debe irse (no quedar pegado sobre el dashboard). ABORTO: una ceremonia muerta no
        // debe dejar la marca de morph rancia, o la próxima entrada saltaría fases indebidamente.
        if (routeReady) {
            clearMorphFlag()
            clearAll()
        }
    }, [pathname, state, routeReady, clearAll])

    // Espejo de las señales de listo en refs (para el timer de `forceReady`, que las lee sin stale).
    useEffect(() => { routeReadyRef.current = routeReady }, [routeReady])

    // El WEC avisa (evento `eva:exec-v3-ready` + flag en sessionStorage) cuando la pantalla de Inicio
    // (SessionStart) ya esta montada y pintada. El provider persiste en el layout /c → este listener ya
    // esta enganchado ANTES de que el ejecutor monte, asi que no hay carrera. El flag cubre el caso raro
    // de que el evento se emita durante un remonte del provider.
    useEffect(() => {
        const onExecReady = () => setExecReady(true)
        window.addEventListener('eva:exec-v3-ready', onExecReady)
        try { if (sessionStorage.getItem('eva:exec-v3-ready') === '1') setExecReady(true) } catch { /* private */ }
        return () => window.removeEventListener('eva:exec-v3-ready', onExecReady)
    }, [state])

    // Espejo de la señal de Inicio-listo en un ref (mismo motivo que `routeReadyRef`).
    useEffect(() => { execReadyRef.current = execReady }, [execReady])

    // `ready` (habilita el tap y despide el overlay) exige que el Inicio del ejecutor ya este pintado
    // (`execReady`), no solo que la ruta commiteo (`routeReady`). `forceReady` (fallback ~4,6s) sigue
    // siendo la valvula para no atrapar al alumno si la senal nunca llega.
    const ready = !!state && animDone && (routeReady || forceReady) && (execReady || forceReady)

    const dismiss = useCallback(() => {
        if (!ready || leaving) return
        // NO borramos 'eva:exec-v3-morph' aquí: la consume SOLO el ejecutor al montar. Si la ruta
        // carga lento y aún no la leyó, borrarla acá la dejaba sin marca → mostraba el splash VIEJO
        // (la "animación que se repetía" del QA). El ejecutor es el único consumidor.
        setLeaving(true)
        timersRef.current.push(window.setTimeout(clearAll, EXIT_MS + 40))
    }, [ready, leaving, clearAll])

    // Al desmontar el provider (p. ej. navegación dura del layout) no debe quedar la marca de ceremonia
    // pegada en <html>, o los sync de cola diferirían su refresh eternamente hasta el timeout.
    useEffect(() => () => { clearTimers(); clearCeremonyDom() }, [clearTimers])

    return (
        <WorkoutLaunchContext.Provider value={{ launch }}>
            {children}
            {state && (
                <DespegueOverlay
                    rect={state.rect}
                    label={state.label}
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
    rect,
    label,
    logoUrl,
    initial,
    ready,
    leaving,
    reduced,
    onTap,
}: {
    rect: Rect
    label: string
    logoUrl: string | null
    initial: string | null
    ready: boolean
    leaving: boolean
    reduced: boolean
    onTap: () => void
}) {
    // Morph desde el RECT REAL del trigger: colapsa a burbuja centrada en su propio centro, anticipa
    // (squash) y despega (stretch). Web Animations API — keyframes computados desde el rect. El callback
    // ref garantiza que la animacion se dispare cuando la pildora YA existe en el DOM (un useEffect con
    // el gate `mounted` corria antes de montarla → el clon quedaba congelado y no despegaba).
    const runPillMorph = useCallback((node: HTMLDivElement | null) => {
        if (!node || reduced) return
        const base = 'translate(-50%,-50%)'
        // El easing va POR KEYFRAME (como CSS `@keyframes` + timing-function): la WAAPI aplica el
        // `easing` de las OPCIONES al tiempo GLOBAL (deforma los offsets → la burbuja se formaba a
        // ~700ms en vez de 304ms). Con `easing` por keyframe cada segmento usa la curva y los offsets
        // caen en su tiempo real: colapsa a burbuja al 32% (304ms), anticipa, despega.
        const ease = 'cubic-bezier(.6,0,.75,.4)'
        node.animate(
            [
                { width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${rect.radius}px`, transform: `${base} translateY(0) scale(1,1)`, offset: 0, easing: ease },
                { width: '52px', height: '52px', borderRadius: '50%', transform: `${base} translateY(0) scale(1,1)`, offset: 0.32, easing: ease },
                { width: '52px', height: '52px', borderRadius: '50%', transform: `${base} translateY(18px) scale(1.18,0.78)`, offset: 0.48, easing: ease },
                { width: '52px', height: '52px', borderRadius: '50%', transform: `${base} translateY(-60px) scale(0.9,1.3)`, offset: 0.6, easing: ease },
                { width: '52px', height: '52px', borderRadius: '50%', transform: `${base} translateY(-780px) scale(0.82,1.4)`, offset: 1 },
            ],
            { duration: 950, fill: 'forwards' }
        )
    }, [rect, reduced])

    // Centro del rect (la burbuja colapsa hacia el centro del componente clickeado).
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const wideEnough = rect.width >= 150 // sólo el CTA muestra la etiqueta (en cards se omite)

    return createPortal(
        <motion.div
            className={`exec-dsp${ready ? ' is-ready' : ''}`}
            aria-label="Preparando tu sesión"
            role="status"
            initial={false}
            animate={{ opacity: leaving ? 0 : 1 }}
            transition={{ duration: leaving ? EXIT_MS / 1000 : 0, ease: 'easeOut' }}
        >
            {/* Fondo de marca que sube (wipe) + estelas de luz que caen. */}
            <div className="exec-dsp-bg" aria-hidden>
                {/* Borde superior como AGUA: cresta ondulada (no un corte recto) que sube con el fondo. */}
                <span className="exec-dsp-wave" />
                <span className="exec-dsp-line" style={{ left: '22%', height: 120, animation: 'exec-dsp-line 0.7s ease-in 0.95s both' }} />
                <span className="exec-dsp-line" style={{ left: '58%', height: 180, animation: 'exec-dsp-line 0.8s ease-in 1.05s both' }} />
                <span className="exec-dsp-line" style={{ left: '80%', height: 90, animation: 'exec-dsp-line 0.65s ease-in 1.15s both' }} />
            </div>

            {/* Píldora = clon del trigger real (posición/tamaño del rect); morfea y despega. */}
            {!reduced && (
                <div
                    ref={runPillMorph}
                    className="exec-dsp-pill"
                    aria-hidden
                    style={{ left: cx, top: cy, width: rect.width, height: rect.height, borderRadius: rect.radius, transform: 'translate(-50%,-50%)' }}
                >
                    {wideEnough && (
                        <span className="exec-dsp-pill-label">
                            <PlayIcon /> {label || 'Empezar entrenamiento'}
                        </span>
                    )}
                    <span className="exec-dsp-trail" />
                </div>
            )}

            {/* Centro: logo del coach que aterriza + "PREPARANDO TU SESIÓN" con dots en loop. */}
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
                    {/* Al estar listo, "PREPARANDO…" + dots se desvanecen y "LISTO" cruza en el mismo bloque. */}
                    <span className="exec-dsp-prep-t">PREPARANDO TU SESIÓN</span>
                    <span className="exec-dsp-dots" aria-hidden><i /><i /><i /></span>
                    <span className="exec-dsp-prep-ready" aria-hidden>LISTO</span>
                </div>
            </div>

            <div className="exec-dsp-hint">TOCA PARA COMENZAR</div>
            {/* Capa que CAPTURA todos los taps durante la ceremonia (no se puede skipear). Antes de estar
                listo no hace nada (bloquea el pass-through); al estar listo, avanza a Inicio. */}
            <button
                type="button"
                className="exec-dsp-tap"
                style={{ cursor: ready ? 'pointer' : 'default' }}
                onClick={ready ? onTap : undefined}
                aria-label={ready ? 'Comenzar entrenamiento' : undefined}
                aria-hidden={!ready}
                tabIndex={ready ? 0 : -1}
            />
        </motion.div>,
        document.body
    )
}
