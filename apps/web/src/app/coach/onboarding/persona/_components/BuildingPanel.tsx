'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { cn } from '@/lib/utils'

/**
 * Interstitial «Armando tu panel» (SPEC coach-onboarding-v2, TASKS F2.2).
 *
 * Reemplaza al spinner genérico: mientras la action escribe persona + preferencias + siembra el
 * alumno de ejemplo, el coach ve el ESQUELETO de los tres bloques del dashboard día 1 y tres
 * líneas que se van tildando. La promesa («te estamos armando el panel») se cumple a la vista, no
 * se anuncia.
 *
 * Duración: los tildes van a 0,35 / 0,75 / 1,15 s, y quien lo monta garantiza el mínimo de 1,2 s
 * (`MIN_BUILD_MS` en PersonaPicker) esperando en paralelo a la action. Si el trabajo real tarda
 * más, la última línea se queda pendiente hasta que la navegación commitea — nunca miente
 * diciendo «listo» antes de tiempo.
 *
 * `prefers-reduced-motion`: sin pulso en los esqueletos y sin transición en los tildes; los pasos
 * igual se marcan (la información no depende del movimiento).
 */

const BUILD_STEPS = [
    { key: 'domains', label: 'Eligiendo tus módulos', atMs: 350 },
    { key: 'demo', label: 'Sembrando tu alumno de ejemplo', atMs: 750 },
    { key: 'guide', label: 'Preparando tu guía', atMs: 1150 },
] as const

export function BuildingPanel() {
    const reduceMotion = useReducedMotion()
    const [doneCount, setDoneCount] = useState(0)

    useEffect(() => {
        const timers = BUILD_STEPS.map((step, index) =>
            setTimeout(() => setDoneCount((current) => Math.max(current, index + 1)), step.atMs),
        )
        return () => timers.forEach(clearTimeout)
    }, [])

    return (
        <section
            aria-live="polite"
            aria-busy="true"
            className="mx-auto w-full max-w-2xl"
        >
            <h2 className="font-display text-2xl font-black tracking-tight text-strong">
                Armando tu panel…
            </h2>

            <ol className="mt-5 space-y-2.5">
                {BUILD_STEPS.map((step, index) => {
                    const done = index < doneCount
                    return (
                        <li key={step.key} className="flex items-center gap-3">
                            <span
                                className={cn(
                                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                                    !reduceMotion && 'transition-colors duration-200',
                                    done
                                        ? 'border-transparent bg-[var(--sport-500)] text-[var(--text-on-sport)]'
                                        : 'border-subtle bg-surface-sunken text-transparent',
                                )}
                            >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                            <span
                                className={cn(
                                    'text-sm',
                                    done ? 'font-semibold text-strong' : 'text-muted',
                                )}
                            >
                                {step.label}
                            </span>
                        </li>
                    )
                })}
            </ol>

            {/* Esqueleto de los 3 bloques del día 1: guía, marca en 60 s y alumnos. */}
            <div className="mt-7 space-y-4" aria-hidden="true">
                <SkeletonBlock reduceMotion={reduceMotion} lines={3} tall />
                <SkeletonBlock reduceMotion={reduceMotion} lines={2} />
                <SkeletonBlock reduceMotion={reduceMotion} lines={2} />
            </div>
        </section>
    )
}

function SkeletonBlock({
    reduceMotion,
    lines,
    tall = false,
}: {
    reduceMotion: boolean
    lines: number
    tall?: boolean
}) {
    return (
        <div className="rounded-card border border-subtle bg-surface-card p-4">
            <div
                className={cn(
                    'h-4 w-2/5 rounded-full bg-surface-sunken',
                    !reduceMotion && 'animate-pulse',
                )}
            />
            <div className={cn('mt-3 space-y-2', tall && 'space-y-3')}>
                {Array.from({ length: lines }).map((_, index) => (
                    <div
                        key={index}
                        className={cn(
                            'h-3 rounded-full bg-surface-sunken',
                            index === lines - 1 ? 'w-3/5' : 'w-full',
                            !reduceMotion && 'animate-pulse',
                        )}
                    />
                ))}
            </div>
        </div>
    )
}
