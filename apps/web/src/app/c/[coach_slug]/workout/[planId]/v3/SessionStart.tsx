'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Item de la mini-lista del plan (Inicio). `tone` colorea el tag por tipo efectivo. */
export interface SessionStartExercise {
    name: string
    tag: string
    tone: 'strength' | 'cardio' | 'other'
}

interface SessionStartProps {
    /** Eyebrow contextual (p. ej. "Hoy · Martes 21"). */
    eyebrow: string
    /** Título del día (plan.title). */
    dayTitle: string
    /** Chips de contexto ya resueltos (semana / fase / variante). El último es "plain" si `plainLast`. */
    chips: string[]
    /** ¿El último chip es secundario (variante)? — sólo estilo. */
    plainLast?: boolean
    exercisesCount: number
    setsCount: number
    estimatedMin: number
    /** Primeros 3-4 ejercicios del plan. */
    miniList: SessionStartExercise[]
    /** Cuántos ejercicios quedan fuera de la mini-lista. */
    moreCount: number
    /** "La última vez" (volumen). null ⇒ se omite la pieza. */
    lastVolumeLabel: string | null
    /** ¿Hay series ya registradas hoy? Muestra "Saltar al ejercicio". */
    hasProgress: boolean
    /** EMPEZAR → aterriza en el primer ejercicio incompleto. */
    onStart: () => void
    /** "Saltar al ejercicio" → mismo destino, atajo cuando ya hay progreso. */
    onSkip: () => void
    reducedMotion: boolean | null
}

const TAG_TONE: Record<SessionStartExercise['tone'], string> = {
    strength: 'exec-v3-ptag',
    cardio: 'exec-v3-ptag is-cardio',
    other: 'exec-v3-ptag is-other',
}

/**
 * Ejecutor V3 (E2.2) — pantalla de INICIO. Contexto antes del esfuerzo: qué toca hoy, cuánto dura y
 * cómo fue la última vez, con un único destino (EMPEZAR juicy que respira). Traducción del mockup
 * `concepto-a-v3-core` (pantalla Inicio) y espejo de la RN. Overlay dark-only montado por el client
 * en modo V3 tras la Entrada; en >=768px queda en columna centrada `max-w`. Toda pieza sin dato se
 * omite (racha/nota de coach no viajan al client aún). El acento sale de `--exec-brand`.
 */
export function SessionStart({
    eyebrow,
    dayTitle,
    chips,
    plainLast = false,
    exercisesCount,
    setsCount,
    estimatedMin,
    miniList,
    moreCount,
    lastVolumeLabel,
    hasProgress,
    onStart,
    onSkip,
    reducedMotion,
}: SessionStartProps) {
    return (
        <motion.div
            className="exec-v3-start fixed inset-0 z-[65] overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
        >
            <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+28px)]">
                <span className="exec-v3-eyb">{eyebrow}</span>
                <h1 className="mt-3 font-display text-[34px] font-black leading-none tracking-[-0.03em] text-on-dark">
                    {dayTitle}
                </h1>

                {chips.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {chips.map((c, i) => (
                            <span
                                key={c}
                                className={cn('exec-v3-chip', plainLast && i === chips.length - 1 && 'is-plain')}
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                )}

                <div className="mt-3 font-mono text-[13px] font-bold tabular-nums text-on-dark/80">
                    <b className="text-[color:var(--exec-brand)]">
                        {exercisesCount} {exercisesCount === 1 ? 'ejercicio' : 'ejercicios'}
                    </b>{' '}
                    · {setsCount} series · ~{estimatedMin} min
                </div>

                {miniList.length > 0 && (
                    <div className="exec-v3-plan mt-4">
                        {miniList.map((ex, i) => (
                            <div key={`${ex.name}-${i}`} className="exec-v3-prow">
                                <span className="exec-v3-pidx">{i + 1}</span>
                                <span className="exec-v3-pname">{ex.name}</span>
                                <span className={TAG_TONE[ex.tone]}>{ex.tag}</span>
                            </div>
                        ))}
                        {moreCount > 0 && (
                            <div className="exec-v3-pmore tabular-nums">+ {moreCount} ejercicios más</div>
                        )}
                    </div>
                )}

                {lastVolumeLabel && (
                    <div className="exec-v3-ctx mt-3">
                        <div className="exec-v3-ctx-k">La última vez</div>
                        <div className="exec-v3-ctx-v tabular-nums">{lastVolumeLabel}</div>
                    </div>
                )}

                <div className="mt-auto pt-6">
                    <motion.button
                        type="button"
                        onClick={onStart}
                        className="exec-v3-juicy exec-v3-startcta"
                        animate={reducedMotion ? undefined : { scale: [1, 1.02, 1] }}
                        transition={reducedMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <span className="exec-v3-play" aria-hidden /> EMPEZAR
                    </motion.button>

                    {hasProgress && (
                        <button
                            type="button"
                            onClick={onSkip}
                            className="mt-3 w-full py-2 text-center text-[13px] font-bold text-on-dark-muted transition-colors hover:text-on-dark"
                        >
                            Saltar al ejercicio
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    )
}
