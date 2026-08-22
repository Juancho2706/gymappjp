'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, Minus } from 'lucide-react'
import {
    ONBOARDING_STEP_KEYS,
    nextStep,
    progress,
    type OnboardingStepKey,
} from '@eva/onboarding'
import type { Persona } from '@eva/schemas'
import type { Json } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { parseOnboardingGuide } from '@/app/coach/dashboard/_lib/onboarding-guide-state'
import { postGuideEngagement } from '@/app/coach/dashboard/_lib/onboarding-telemetry.client'
import { GUIDE_ROUTE, shouldShowGuidePill } from '@/app/coach/guia/_lib/guide-first-entry'
import { useTabbarMinimized } from './use-tabbar-minimized'

/**
 * Píldora flotante de la guía de inicio — el único rastro de la guía dentro del panel
 * (decisión del owner 22-08: el dashboard del día 1 se ve LLENO, la guía vive en `/coach/guia`).
 *
 * Minimizada es un círculo de 48 px con el monito blanco de EVA sobre el color de marca y un
 * anillo de progreso; maximizada dice en qué va la guía y cuál es el siguiente paso, y lleva a la
 * pantalla. El estado (abierta/cerrada) es POR COACH en `localStorage`: dos cuentas en el mismo
 * navegador no se pisan.
 *
 * Comportamiento (QA del owner 22-08, espejo de la app):
 *  1. Teaser: aparece abierta («Tu guía · n/5 · Siguiente…») y a los ~3 s el panel se desliza
 *     hacia el círculo y desaparece detrás de él — queda solo el botón. Una vez por sesión del
 *     navegador y por coach; quien la minimizó a mano alguna vez arranca ya minimizada.
 *  2. En móvil sigue a la cápsula del nav: cuando el coach scrollea hacia abajo y la cápsula se
 *     esconde (`useTabbarMinimized`, la misma regla que usa `CoachSidebar`), la píldora se esconde
 *     con ella. No bloquea ni compite con la animación del nav.
 *
 * Geometría: `position: fixed` abajo a la izquierda. En móvil queda POR ENCIMA de la cápsula
 * flotante del nav (`CoachSidebar`: `bottom = safe-area + 16px`, alto ≈ 69 px ⇒ 16 + 69 + 12 de
 * aire = 97 px). En desktop se apoya en el borde izquierdo del contenido: en vez de hardcodear el
 * ancho del sidebar (76 px colapsado / 248 px expandido, más el modo compacto de 760-1080 px) se
 * MIDE `#coach-main`, así el colapso del menú la reacomoda sola. El FAB del builder vive a la
 * derecha; los sheets y diálogos van en z-70/z-110, muy por encima de esta z-40.
 *
 * Datos: persona + `onboarding_guide.completed` YA persistido. Sin consultas nuevas — el hook de
 * la guía persiste los pasos auto-tildados cuando el coach abre `/coach/guia`, y esa foto es la
 * que lee la píldora. Un coach que nunca abrió la guía puede verla en 0/5 hasta que entre una vez
 * (que es exactamente lo que la píldora le está pidiendo).
 */

/** Estado abierto/cerrado, por coach. */
function pillStorageKey(coachId: string): string {
    return `eva.guide-pill.v1:${coachId}`
}

/** «Ya vio el teaser en esta sesión», por coach. */
function pillTeaseKey(coachId: string): string {
    return `eva:guide-pill-teased:${coachId}`
}

/** Telemetría de exploración: una vez por acción y por sesión de navegador. */
function pillTelemetryKey(coachId: string, action: string): string {
    return `eva:guide-pill-telemetry:${coachId}:${action}`
}

/** Separación del borde izquierdo del contenido (y del viewport en móvil). */
const LEFT_GUTTER = 16
/** Cuánto dura abierto el teaser antes de deslizarse al botón. */
export const TEASER_MS = 3200
/** Cuánto queda abierta tras un toque en el círculo si el coach no hace nada. */
export const REOPEN_MS = 6000

export interface GuidePillProps {
    coachId: string
    /** `coaches.persona`. `null` ⇒ el siguiente paso es elegir especialidad. */
    persona: Persona | null
    /** `coaches.onboarding_guide` crudo: la píldora lo parsea con el mismo parser que la guía. */
    onboardingGuide: Json
    /** Coach de org/team: su panel lo define el tenant, no ve la guía. */
    managed: boolean
}

export function GuidePill({ coachId, persona, onboardingGuide, managed }: GuidePillProps) {
    const pathname = usePathname()
    const [mounted, setMounted] = useState(false)
    const [expanded, setExpanded] = useState(true)
    const [leftPx, setLeftPx] = useState(LEFT_GUTTER)
    const tabbarMinimized = useTabbarMinimized(pathname)
    const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // `true` mientras la apertura vigente la pidió el coach tocando el círculo (reloj largo);
    // `false` durante el teaser (reloj corto).
    const openedByTouch = useRef(false)

    const guide = useMemo(() => parseOnboardingGuide(onboardingGuide), [onboardingGuide])

    const visible = shouldShowGuidePill({ pathname: pathname ?? '', persona, guide, managed })

    const clearAutoTimer = useCallback(() => {
        if (autoTimer.current != null) {
            clearTimeout(autoTimer.current)
            autoTimer.current = null
        }
    }, [])

    // Estado guardado + medición del borde del contenido. Corre después de hidratar: así el
    // servidor no pinta una píldora en una posición que el cliente corregiría (y no hay
    // mismatch de hidratación por el `left` inline).
    useEffect(() => {
        try {
            const saved = localStorage.getItem(pillStorageKey(coachId))
            if (saved === 'collapsed') {
                // El coach la minimizó a mano alguna vez: se respeta.
                setExpanded(false)
            } else if (sessionStorage.getItem(pillTeaseKey(coachId))) {
                // Ya vio el teaser en esta sesión: arranca minimizada.
                setExpanded(false)
            } else {
                // Teaser: abierta unos segundos, después se desliza al botón.
                sessionStorage.setItem(pillTeaseKey(coachId), '1')
            }
        } catch {
            /* modo privado: queda expandida y el teaser la cierra */
        }
        openedByTouch.current = false
        setMounted(true)
    }, [coachId])

    useEffect(() => {
        if (!visible) return
        const main = document.getElementById('coach-main')
        const measure = () => {
            const left = main ? Math.round(main.getBoundingClientRect().left) : 0
            setLeftPx(Math.max(0, left) + LEFT_GUTTER)
        }
        measure()

        // El sidebar es sticky y en flujo: cuando el coach lo colapsa, `#coach-main` cambia de
        // ancho y el observer reacomoda la píldora sin que este componente sepa nada del menú.
        // (jsdom no trae `ResizeObserver`: sin él queda la medición inicial + el resize, que es
        // exactamente lo que necesitan los tests.)
        let observer: ResizeObserver | null = null
        if (main && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => measure())
            observer.observe(main)
        }
        window.addEventListener('resize', measure)
        return () => {
            observer?.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [visible, pathname])

    const completed = useMemo(() => {
        const out = {} as Record<OnboardingStepKey, boolean>
        for (const key of ONBOARDING_STEP_KEYS) out[key] = guide.completed[key] === true
        return out
    }, [guide.completed])

    const { done, total } = progress(completed)
    const step = persona != null ? nextStep(persona, completed) : null
    // Sin persona el siguiente paso no es de la guía: es elegir especialidad (decisión D8 — al
    // coach viejo no se lo secuestra con la pantalla completa, se lo invita desde acá).
    const nextLabel = persona == null ? 'Elige tu especialidad' : (step?.label ?? 'Todo listo')
    const nextHref = persona == null ? '/coach/onboarding/persona' : GUIDE_ROUTE
    const telemetryStepKey: OnboardingStepKey = step?.key ?? 'profile_branding'

    const track = useCallback(
        (action: 'pill_open' | 'pill_collapse' | 'pill_expand', extra?: { auto?: boolean }) => {
            try {
                const key = pillTelemetryKey(coachId, extra?.auto ? `${action}:auto` : action)
                if (sessionStorage.getItem(key)) return
                sessionStorage.setItem(key, '1')
            } catch {
                /* sin sessionStorage: se emite igual, la analítica de frecuencia lo tolera */
            }
            void postGuideEngagement(telemetryStepKey, {
                widget: 'guide_pill',
                action,
                progress_done: done,
                persona: persona ?? 'sin_persona',
                ...(extra?.auto ? { auto: true } : {}),
            })
        },
        [coachId, done, persona, telemetryStepKey]
    )

    /** Toque del coach: se recuerda (por coach) y se mide. */
    const setOpen = useCallback(
        (next: boolean) => {
            clearAutoTimer()
            openedByTouch.current = next
            setExpanded(next)
            try {
                localStorage.setItem(pillStorageKey(coachId), next ? 'expanded' : 'collapsed')
            } catch {
                /* modo privado: el estado dura lo que la pantalla */
            }
            track(next ? 'pill_expand' : 'pill_collapse')
        },
        [clearAutoTimer, coachId, track]
    )

    // Auto-colapso: el teaser dura TEASER_MS; una apertura manual, REOPEN_MS. No se persiste
    // como «minimizada»: eso solo lo decide el coach con el «–» (así el teaser vuelve en la
    // próxima sesión).
    useEffect(() => {
        clearAutoTimer()
        if (!mounted || !visible || !expanded) return
        const ms = openedByTouch.current ? REOPEN_MS : TEASER_MS
        autoTimer.current = setTimeout(() => {
            autoTimer.current = null
            setExpanded(false)
            track('pill_collapse', { auto: true })
        }, ms)
        return clearAutoTimer
    }, [mounted, visible, expanded, clearAutoTimer, track])

    // Sigue a la cápsula: si el nav se esconde al scrollear y la píldora estaba abierta, se cierra
    // (no tiene sentido un panel flotando sobre contenido en movimiento).
    useEffect(() => {
        if (tabbarMinimized && expanded) {
            clearAutoTimer()
            setExpanded(false)
        }
    }, [tabbarMinimized, expanded, clearAutoTimer])

    if (!mounted || !visible) return null

    return (
        <div
            // Escape acotado a la píldora (no global): al tocar el círculo el foco queda ahí, así
            // que el gesto funciona igual y no le roba el Escape a un diálogo abierto.
            onKeyDown={(event) => {
                if (event.key === 'Escape' && expanded) {
                    event.stopPropagation()
                    setOpen(false)
                }
            }}
            // Móvil: 16 px del bottom de la cápsula + ~69 px de su alto + 12 px de aire.
            // Desktop (md+): 24 px, ya sin cápsula. Con la cápsula escondida (scroll hacia
            // abajo) la píldora baja y se apaga con ella; en desktop no hay cápsula que seguir.
            className={cn(
                'fixed bottom-[calc(env(safe-area-inset-bottom,0px)+97px)] z-40 print:hidden md:bottom-6',
                'motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-[var(--ease-out)]',
                tabbarMinimized && 'max-md:pointer-events-none max-md:translate-y-3 max-md:opacity-0'
            )}
            data-tabbar-minimized={tabbarMinimized ? '' : undefined}
            style={{ left: leftPx }}
        >
            <div
                className={cn(
                    'flex items-center gap-2.5',
                    'motion-safe:transition-[background-color,border-color,box-shadow,padding] motion-safe:duration-[220ms] motion-safe:ease-[var(--ease-out)]',
                    expanded
                        ? 'rounded-pill border border-subtle bg-surface-card p-1.5 pr-2 shadow-[var(--shadow-lg)]'
                        : 'rounded-full border border-transparent p-0'
                )}
            >
                <button
                    type="button"
                    onClick={() => setOpen(!expanded)}
                    aria-expanded={expanded}
                    aria-label={`Guía de inicio, ${done} de ${total}`}
                    className={cn(
                        // `z-10`: el panel se desliza por DETRÁS del círculo al cerrarse — el
                        // botón se lo «traga».
                        'relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--sport-500)]',
                        'shadow-[var(--glow-sport)] motion-safe:transition-transform motion-safe:duration-[220ms] motion-safe:ease-[var(--ease-out)]',
                        'hover:scale-[1.04] active:scale-95',
                        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-app)]'
                    )}
                >
                    <PillProgressRing done={done} total={total} />
                    <Image
                        src="/LOGOS/eva-icon-white.png"
                        alt=""
                        width={24}
                        height={24}
                        className="size-6 object-contain"
                        priority={false}
                    />
                </button>

                {/* Se mantiene montado para que la transición tenga de dónde salir; `inert` +
                    `aria-hidden` lo sacan del foco y del árbol accesible cuando está minimizada.
                    Al cerrarse se desliza hacia el círculo (translate + scale desde el borde
                    izquierdo) mientras se encoge y se apaga. */}
                <div
                    aria-hidden={!expanded}
                    inert={!expanded}
                    className={cn(
                        'origin-left overflow-hidden',
                        'motion-safe:transition-[max-width,opacity,transform] motion-safe:duration-[260ms] motion-safe:ease-[var(--ease-out)]',
                        // `100vw - 104px` descuenta la geometría fija de la píldora (16 de
                        // gutter + 6 de padding + 48 del círculo + 10 de gap + 8 de padding
                        // derecho) más 16 px de aire contra el borde derecho: a 390 px la píldora
                        // abierta mide 368 y no toca el borde del viewport.
                        expanded
                            ? 'max-w-[min(280px,calc(100vw_-_104px))] translate-x-0 scale-100 opacity-100'
                            : 'max-w-0 -translate-x-8 scale-90 opacity-0'
                    )}
                >
                    {/* `w` DEFINIDO (no solo `max-w`) + `shrink-0` en los botones: con el ancho
                        indefinido el contenido medía ~286 px, el `overflow-hidden` del contenedor
                        recortaba el borde del botón «–» y el tap target quedaba mordido. Ahora el
                        que cede es el texto, que trunca. */}
                    <div className="flex w-[min(280px,calc(100vw_-_104px))] items-center gap-2.5 whitespace-nowrap pl-0.5">
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-extrabold text-[var(--text-strong)]">
                                Tu guía · {done}/{total}
                            </div>
                            <div className="truncate text-[11.5px] font-semibold text-[var(--text-muted)]">
                                Siguiente: {nextLabel}
                            </div>
                        </div>
                        <Link
                            href={nextHref}
                            onClick={() => {
                                clearAutoTimer()
                                track('pill_open')
                            }}
                            className={cn(
                                // 44 px de alto (no 36): la píldora mide 60 con su padding, así
                                // que el tap target mínimo entra sin agrandarla.
                                'inline-flex h-11 shrink-0 touch-manipulation items-center gap-1 rounded-pill px-3 text-[12.5px] font-bold',
                                'bg-[var(--cta-fill)] text-[var(--text-on-sport)] motion-safe:transition-colors hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]'
                            )}
                        >
                            Abrir
                            <ArrowRight className="size-3.5" />
                        </Link>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Minimizar la guía"
                            className="inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-surface-sunken hover:text-[var(--text-strong)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                        >
                            <Minus className="size-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

/** Anillo de progreso alrededor del monito. Blanco sobre el color de marca: legible en los dos modos. */
function PillProgressRing({ done, total }: { done: number; total: number }) {
    const size = 48
    const stroke = 3
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius
    const ratio = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0

    return (
        <svg
            aria-hidden="true"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="pointer-events-none absolute inset-0"
        >
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={stroke}
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#fff"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - ratio)}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[420ms] motion-safe:ease-[var(--ease-out)]"
            />
        </svg>
    )
}
