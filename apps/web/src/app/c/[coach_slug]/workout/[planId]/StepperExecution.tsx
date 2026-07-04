'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { easings } from '@/lib/animation-presets'

/** Vista presentacional de un paso para el rail + anuncios a11y (el card lo pinta `renderStep`). */
export interface StepperStepView {
    key: string
    kind: 'single' | 'superset'
    /** Nombre(s) del ejercicio del paso — anuncio aria-live + aria-label del rail. */
    title: string
    /** Sección del paso (eyebrow "Calentamiento / Bloque Principal / …"). */
    sectionTitle: string
    /** Warmup/cooldown ⇒ eyebrow atenuado. */
    muted: boolean
    /** ¿El paso está completo? (color del chip del rail). */
    complete: boolean
}

interface Props {
    steps: StepperStepView[]
    /** Índice del paso visible (controlado por el orquestador: swipe/rail/botones + auto-avance). */
    currentIndex: number
    onIndexChange: (index: number) => void
    /** Renderiza el card del paso `index` (mismo `SingleExerciseCard`/`SupersetGroupCard` de la lista). */
    renderStep: (index: number) => ReactNode
    reducedMotion: boolean | null
}

// Umbrales de swipe (copiados de `DayNavigator` — patrón canónico del repo, sin librería nueva).
const SWIPE_OFFSET = 60
const SWIPE_VELOCITY = 400
// Deslizamiento sobrio del paso (px) — el pan real lo maneja el drag; esto es solo la transición.
const SLIDE = 48

/**
 * Pager del modo "paso a paso" (Fase L · workstream A). Muestra UN paso a la vez (un bloque suelto o
 * una superserie completa, DA-5) con: rail de progreso navegable, botones prev/next SIEMPRE presentes,
 * swipe horizontal (framer-motion drag + `touch-action: pan-y` para no trabar el scroll vertical), y
 * transición direccional con `AnimatePresence`. Con `reduced-motion` cae a crossfade y desactiva drag.
 *
 * 100% presentación/navegación: el motor (logging/offline/descanso/progresión) vive en el card que
 * `renderStep` pinta — el MISMO componente que la lista clásica (una sola fuente de verdad, cero
 * divergencia). El `RestTimer`/`WorkoutTimerProvider`/header/barra "Finalizar" quedan FUERA del pager
 * (no se desmontan al cambiar de paso, DA-6).
 */
export function StepperExecution({ steps, currentIndex, onIndexChange, renderStep, reducedMotion }: Props) {
    const total = steps.length
    const idx = Math.max(0, Math.min(currentIndex, total - 1))
    const active = steps[idx]

    // Dirección del deslizamiento (adelante/atrás) — derivada del paso anterior (state, no ref, para no
    // leer durante el render). Vale para swipe/rail y para el auto-avance externo (el padre mueve el idx).
    const [prevIndex, setPrevIndex] = useState(idx)
    const direction = idx >= prevIndex ? 1 : -1
    useEffect(() => {
        if (prevIndex !== idx) setPrevIndex(idx)
    }, [idx, prevIndex])

    const goPrev = () => {
        if (idx > 0) onIndexChange(idx - 1)
    }
    const goNext = () => {
        if (idx < total - 1) onIndexChange(idx + 1)
    }

    // Swipe izquierda → siguiente; derecha → anterior (mismo criterio que `DayNavigator`).
    const onDragEnd = (_e: unknown, info: PanInfo) => {
        const { offset, velocity } = info
        if (offset.x < -SWIPE_OFFSET || velocity.x < -SWIPE_VELOCITY) goNext()
        else if (offset.x > SWIPE_OFFSET || velocity.x > SWIPE_VELOCITY) goPrev()
    }

    const variants = {
        enter: (d: number) => (reducedMotion ? { opacity: 0 } : { opacity: 0, x: d > 0 ? SLIDE : -SLIDE }),
        center: { opacity: 1, x: 0 },
        exit: (d: number) => (reducedMotion ? { opacity: 0 } : { opacity: 0, x: d > 0 ? -SLIDE : SLIDE }),
    }

    if (!active) return null

    return (
        <section
            aria-roledescription="carrusel de ejercicios"
            aria-label="Ejercicios de la rutina"
            className="mx-auto w-full max-w-3xl px-4 py-4 pb-32"
        >
            {/* Chrome superior: prev/next SIEMPRE presentes + eyebrow de sección + "Ejercicio X de Y". */}
            <div className="mb-3 flex items-center gap-2">
                <NavButton onClick={goPrev} disabled={idx === 0} aria-label="Ejercicio anterior">
                    <ChevronLeft className="h-5 w-5" />
                </NavButton>
                <div className="min-w-0 flex-1 text-center">
                    <p
                        className={cn(
                            'truncate text-[10px] font-bold uppercase tracking-widest',
                            active.muted ? 'text-on-dark-muted/60' : 'text-[var(--sport-300)]',
                        )}
                    >
                        {active.sectionTitle}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-on-dark-muted">
                        <strong className="text-on-dark">Ejercicio {idx + 1}</strong> de {total}
                    </p>
                </div>
                <NavButton onClick={goNext} disabled={idx === total - 1} aria-label="Ejercicio siguiente">
                    <ChevronRight className="h-5 w-5" />
                </NavButton>
            </div>

            {/* Rail de progreso: segmentos tappables (saltá a cualquier paso, incluso a editar). */}
            <div role="group" aria-label="Progreso de ejercicios" className="mb-4 flex items-stretch gap-1">
                {steps.map((s, i) => {
                    const state = i === idx ? 'active' : s.complete ? 'done' : 'upcoming'
                    return (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => onIndexChange(i)}
                            aria-label={`Ir al ejercicio ${i + 1} de ${total}: ${s.title}`}
                            aria-current={i === idx ? 'step' : undefined}
                            className="group -my-2 flex flex-1 items-center py-2"
                        >
                            <span
                                className={cn(
                                    'block h-1.5 w-full rounded-full transition-colors',
                                    state === 'active'
                                        ? 'bg-[var(--sport-400)]'
                                        : state === 'done'
                                            ? 'bg-[var(--sport-500)]/60'
                                            : 'bg-white/15 group-hover:bg-white/25',
                                )}
                            />
                        </button>
                    )
                })}
            </div>

            {/* Pager: solo el paso actual. `overflow-x-clip` clipa el deslizamiento sin scroll horizontal
                del body; `touch-action: pan-y` deja vivo el scroll vertical del paso (ejercicio largo). */}
            <motion.div
                className="relative overflow-x-clip"
                style={{ touchAction: 'pan-y' }}
                drag={reducedMotion ? false : 'x'}
                dragSnapToOrigin
                dragElastic={0.12}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={reducedMotion ? undefined : onDragEnd}
            >
                <AnimatePresence mode="wait" custom={direction} initial={false}>
                    <motion.div
                        key={active.key}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={reducedMotion ? { duration: 0.12 } : { duration: 0.26, ease: easings.dirSlide }}
                        role="group"
                        aria-roledescription="ejercicio"
                        aria-label={`Ejercicio ${idx + 1} de ${total}`}
                    >
                        {renderStep(idx)}
                    </motion.div>
                </AnimatePresence>
            </motion.div>

            {/* Pie: "Siguiente ejercicio" cuando el paso ya está completo (afirma el auto-avance). */}
            {active.complete && idx < total - 1 && (
                <button
                    type="button"
                    onClick={goNext}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-control border border-[var(--sport-500)]/40 bg-[var(--sport-500)]/[0.08] py-3 text-sm font-bold text-[var(--sport-300)] transition-colors hover:bg-[var(--sport-500)]/[0.16]"
                >
                    <CheckCircle2 className="h-4 w-4" /> Siguiente ejercicio
                    <ChevronRight className="h-4 w-4" />
                </button>
            )}

            {/* Anuncio del cambio de paso para lectores de pantalla (AC-A7). */}
            <p className="sr-only" aria-live="polite">
                Ejercicio {idx + 1} de {total}: {active.title}
            </p>
        </section>
    )
}

/** Botón prev/next del pager — target ≥44px, focusable, deshabilitado en los extremos. */
function NavButton({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
}: {
    children: ReactNode
    onClick: () => void
    disabled: boolean
    'aria-label': string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors',
                disabled
                    ? 'border-[var(--border-inverse)] text-on-dark-muted/30'
                    : 'border-[var(--border-inverse)] bg-white/[0.06] text-on-dark hover:bg-white/[0.12] active:scale-95',
            )}
        >
            {children}
        </button>
    )
}
