'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Trophy, Share2, Check, ArrowRight, HeartPulse, Move, GitCommit } from 'lucide-react'
import { epleyOneRM } from '@/app/coach/clients/[clientId]/profileTrainingAnalytics'
import { getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import { springs, fadeSlideUp, staggerContainer } from '@/lib/animation-presets'
import { compactDistance } from '@/lib/workout-exercise-type'
import { MuscleMapSvg } from './MuscleMapSvg'
import { muscleGroupsToRegionIntensity, MUSCLE_REGIONS } from './muscle-map'
import {
    summarizeSessionByKind,
    type SummaryBlock,
    type SummaryLogLike,
    type CardioItem,
    type MobilityItem,
} from './session-summary'
import { PRShareCardModal } from './PRShareCardModal'
import type { WorkoutPRCardData } from '@/lib/workout-pr-card-canvas'

/** "12 jun" — fecha corta es-CL, día calendario Santiago. */
function fmtShortDate(iso: string): string {
    const ymd = getSantiagoIsoYmdForUtcInstant(iso)
    return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    })
}

/** Duración de la sesión → "45:12" (mm:ss) o "1h 05" desde 1 hora. "—" si no llega el dato. */
function fmtDuration(totalSec: number | undefined): string {
    if (totalSec == null || totalSec <= 0) return '—'
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
}

// canvas-confetti uses CommonJS export=; bundler wraps it as { default: fn } at runtime
const fireConfetti = (opts: object) =>
    (import('canvas-confetti') as Promise<any>).then(m => (m.default ?? m)(opts))  // eslint-disable-line @typescript-eslint/no-explicit-any

export interface WorkoutSummaryOverlayProps {
    planTitle: string
    logs: SummaryLogLike[]
    blocks: SummaryBlock[]
    exerciseMaxes: Record<string, number>
    /** Fecha (ISO) del máximo histórico por ejercicio → "superaste tus 80 kg del 12 jun". */
    exerciseMaxDates?: Record<string, string>
    /** Duración de la sesión en segundos (cronómetro de sesión, congelado al finalizar). */
    durationSec?: number
    /** Nombre del programa activo (nudge "seguí tu progreso"). null en planes sueltos. */
    programName?: string | null
    /** Sub-línea del contexto del programa (fase · día X de Y / "Programa semanal"). */
    nextHint?: string | null
    /**
     * Bloques con sustitución de máquina ocupada activa (Fase L · C). Guard anti-PR-falso
     * (DC-4/AC-C5): su peso NO cuenta para detectar récords en el ejercicio PRESCRITO (el sustituto
     * pesado no debe marcar un PR falso en el slot original). El volumen sí se cuenta (fue trabajo real).
     */
    substitutedBlockIds?: string[]
    onDone: () => void
}

type SummaryTile = { value: string; unit?: string; label: string }

/** Tiles de un bloque de cardio (tiempo/distancia/FC/rondas), sólo con lo registrado. */
function cardioTiles(c: CardioItem): SummaryTile[] {
    const tiles: SummaryTile[] = []
    if (c.durationSec != null && c.durationSec > 0) tiles.push({ value: fmtDuration(c.durationSec), label: 'Tiempo' })
    if (c.distanceM != null && c.distanceM > 0) tiles.push({ value: compactDistance(c.distanceM, 'm'), label: 'Distancia' })
    if (c.avgHr != null && c.avgHr > 0) tiles.push({ value: String(c.avgHr), unit: 'bpm', label: 'FC media' })
    if (c.rounds > 1) tiles.push({ value: String(c.rounds), label: 'Rondas' })
    // Cardio sin actuals registrados: al menos mostramos que se completó (no dejar la card vacía).
    if (tiles.length === 0) tiles.push({ value: String(c.rounds), label: c.rounds === 1 ? 'Ronda' : 'Rondas' })
    return tiles
}

/** Tiles de un bloque de movilidad/roller (series completadas + hold total). */
function mobilityTiles(m: MobilityItem): SummaryTile[] {
    const tiles: SummaryTile[] = [{ value: String(m.sets), label: m.sets === 1 ? 'Serie' : 'Series' }]
    if (m.holdSec != null && m.holdSec > 0) tiles.push({ value: fmtDuration(m.holdSec), label: 'Hold total' })
    return tiles
}

/** Card del resumen para un bloque NO-fuerza (cardio/movilidad/roller). Tiles EVA DS. */
function NonStrengthCard({
    name,
    typeLabel,
    accent,
    icon,
    tiles,
    reducedMotion,
}: {
    name: string
    typeLabel: string
    accent: string
    icon: ReactNode
    tiles: SummaryTile[]
    reducedMotion: boolean | null
}) {
    return (
        <motion.div
            variants={reducedMotion ? undefined : fadeSlideUp}
            className="rounded-card border border-[var(--border-inverse)] bg-white/[0.03] px-3 py-3"
        >
            <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    {icon}
                    <p className="truncate text-sm font-semibold text-on-dark">{name}</p>
                </div>
                <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: accent, backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)` }}
                >
                    {typeLabel}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {tiles.map((t, i) => (
                    <div
                        key={i}
                        className="rounded-control border border-[var(--border-inverse)] bg-white/[0.05] px-3 py-2.5 text-center"
                    >
                        <p className="eva-metric text-[20px] leading-none text-on-dark">
                            {t.value}
                            {t.unit ? (
                                <span className="ml-0.5 text-[11px] font-bold text-on-dark-muted">{t.unit}</span>
                            ) : null}
                        </p>
                        <p className="mt-1.5 text-[10px] font-semibold text-on-dark-muted">{t.label}</p>
                    </div>
                ))}
            </div>
        </motion.div>
    )
}

export function WorkoutSummaryOverlay({
    planTitle,
    logs,
    blocks,
    exerciseMaxes,
    exerciseMaxDates = {},
    durationSec,
    programName = null,
    nextHint = null,
    substitutedBlockIds = [],
    onDone,
}: WorkoutSummaryOverlayProps) {
    const reducedMotion = useReducedMotion()

    // Derivación por-tipo en una sola pasada (fuerza + cardio + movilidad/roller). El bug CEO era
    // que sólo se contaba fuerza: movilidad/roller no encendían el mapa y cardio/movilidad no
    // aparecían en el resumen. Lógica pura y testeada → `summarizeSessionByKind`.
    const session = useMemo(
        () => summarizeSessionByKind(blocks, logs, substitutedBlockIds),
        [blocks, logs, substitutedBlockIds],
    )
    const exerciseBreakdown = session.strength

    const detectedPRs = useMemo(() => {
        return exerciseBreakdown
            .filter((ex) => {
                const historicMax = exerciseMaxes[ex.exerciseId]
                return historicMax != null && ex.maxWeight > historicMax
            })
            .map((ex) => {
                const setAtMax = ex.sets.reduce((best, cur) => {
                    const cw = cur.weight_kg ?? 0
                    const bw = best.weight_kg ?? 0
                    return cw > bw ? cur : best
                }, ex.sets[0])
                const repsAtMax = setAtMax?.reps_done ?? 1
                const prevKg = exerciseMaxes[ex.exerciseId]!
                const pct =
                    prevKg > 0 ? Math.round(((ex.maxWeight - prevKg) / prevKg) * 1000) / 10 : 100
                return {
                    exerciseName: ex.name,
                    newWeightKg: ex.maxWeight,
                    prevWeightKg: prevKg,
                    prevAchievedAt: exerciseMaxDates[ex.exerciseId] ?? null,
                    pct,
                    estimated1RM: Math.round(epleyOneRM(ex.maxWeight, Math.max(1, repsAtMax)) * 10) / 10,
                }
            })
    }, [exerciseBreakdown, exerciseMaxes, exerciseMaxDates])

    // Barras "Músculos trabajados" en kg → sólo volumen de FUERZA (kg es honesto ahí).
    const muscleGroupVolume = useMemo(() => {
        const maxV = session.strengthMuscleVolume[0]?.vol ?? 1
        return session.strengthMuscleVolume.map(({ group, vol }) => ({
            group,
            vol,
            pct: Math.round((vol / maxV) * 100),
        }))
    }, [session.strengthMuscleVolume])

    // El mapa muscular usa el trabajo COMBINADO (fuerza + movilidad/roller; cardio excluido) para
    // que las zonas de movilidad/roller también se enciendan. ¿Alguna región encendida?
    const hasMuscleMap = useMemo(() => {
        const intensity = muscleGroupsToRegionIntensity(session.muscleWork)
        return MUSCLE_REGIONS.some((r) => intensity[r] > 0)
    }, [session.muscleWork])

    const hasNonStrength = session.cardio.length > 0 || session.mobility.length > 0

    const completedSets = logs.length
    const totalReps = logs.reduce((acc, l) => acc + (l.reps_done || 0), 0)
    const totalVolume = logs.reduce((acc, l) => acc + (l.weight_kg || 0) * (l.reps_done || 0), 0)

    // Hero adaptativo: si no hubo fuerza (sesión cardio/movilidad), el 2º stat no puede ser "0 kg".
    const heroSecondary =
        totalVolume > 0
            ? { value: String(Math.round(totalVolume)), unit: 'kg', label: 'Volumen total' }
            : session.totalCardioDistanceM > 0
                ? { value: compactDistance(session.totalCardioDistanceM, 'm'), unit: undefined, label: 'Distancia' }
                : { value: String(completedSets), unit: undefined, label: completedSets === 1 ? 'Serie' : 'Series' }

    const [shared, setShared] = useState(false)
    const [prCard, setPrCard] = useState<WorkoutPRCardData | null>(null)

    const handleShare = useCallback(async () => {
        const prText = detectedPRs.length > 0 ? ` 🏆 ${detectedPRs.length} récord${detectedPRs.length > 1 ? 's' : ''}!` : ''
        const text = `¡Completé "${planTitle}"! 💪 ${completedSets} series · ${totalReps} reps · ${Math.round(totalVolume)} kg${prText}`
        if (navigator.share) {
            // White-label (W2): compartir con la marca del coach, no "EVA Fitness". El layout /c
            // fija data-brand-name en un wrapper del documento; este overlay se portalea a
            // document.body, así que lo leemos del DOM (siempre la marca del coach; 'EVA' fallback).
            const shareTitle =
                document.querySelector('[data-brand-name]')?.getAttribute('data-brand-name')?.trim() || 'EVA'
            await navigator.share({ title: shareTitle, text }).catch(() => null)
        } else {
            await navigator.clipboard.writeText(text).catch(() => null)
            setShared(true)
            setTimeout(() => setShared(false), 2000)
        }
    }, [planTitle, completedSets, totalReps, totalVolume, detectedPRs])

    // Celebración con papelitos al completar la sesión. Respeta reduced-motion (sin confetti). El
    // overlay se portalea a document.body con z-[9999] y un velo casi opaco; el canvas de
    // canvas-confetti usa z-index 100 por defecto → quedaba DETRÁS del velo (papelitos invisibles,
    // regresión del rework del resumen). Lo elevamos por encima del overlay con `zIndex`.
    useEffect(() => {
        if (reducedMotion) return
        const CONFETTI_Z = 10000
        if (detectedPRs.length > 0) {
            fireConfetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, zIndex: CONFETTI_Z })
            setTimeout(() => fireConfetti({ particleCount: 80, spread: 60, origin: { x: 0.2, y: 0.6 }, zIndex: CONFETTI_Z }), 300)
            setTimeout(() => fireConfetti({ particleCount: 80, spread: 60, origin: { x: 0.8, y: 0.6 }, zIndex: CONFETTI_Z }), 500)
        } else {
            fireConfetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, zIndex: CONFETTI_Z })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const motionOpts = reducedMotion ? { duration: 0 } : undefined

    return (
        <div className="fixed inset-0 z-[9999] bg-[var(--ink-950)]/95 backdrop-blur-sm overflow-y-auto pt-safe pb-8 text-on-dark">
            <div className="min-h-full flex flex-col items-stretch px-4 py-6 max-w-lg mx-auto w-full">
                <motion.header
                    initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionOpts ?? { duration: 0.35 }}
                    className="text-center mb-6"
                >
                    <div className="flex justify-center mb-4">
                        <div
                            className="flex h-[76px] w-[76px] items-center justify-center rounded-full text-white"
                            style={{ background: 'var(--sport-500)', boxShadow: 'var(--glow-sport)' }}
                        >
                            <Check className="h-9 w-9" />
                        </div>
                    </div>
                    <h2 className="font-display text-[28px] font-black tracking-[-0.02em] text-on-dark">¡Sesión completada!</h2>
                    <p className="text-sm text-on-dark-muted mt-1.5">{planTitle}</p>
                </motion.header>

                <motion.div
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionOpts ?? { delay: 0.05, duration: 0.3 }}
                    className="mb-6"
                >
                    {/* Hero: Duración + stat adaptativo (volumen kg / distancia / series) — CEO M5.1. */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-control border border-[var(--border-inverse)] bg-[var(--ink-900)] px-4 py-5 text-center">
                            <p className="eva-metric text-[34px] leading-none text-[var(--sport-500)]">{fmtDuration(durationSec)}</p>
                            <p className="text-[11px] font-semibold text-on-dark-muted mt-2">Duración</p>
                        </div>
                        <div className="rounded-control border border-[var(--border-inverse)] bg-[var(--ink-900)] px-4 py-5 text-center">
                            <p className="eva-metric text-[34px] leading-none text-[var(--sport-500)]">
                                {heroSecondary.value}
                                {heroSecondary.unit ? (
                                    <span className="text-base font-bold text-on-dark-muted ml-1">{heroSecondary.unit}</span>
                                ) : null}
                            </p>
                            <p className="text-[11px] font-semibold text-on-dark-muted mt-2">{heroSecondary.label}</p>
                        </div>
                    </div>
                    {/* Secundario: series · reps (línea fina). Reps sólo si hubo (cardio/movilidad ⇒ 0). */}
                    <div className="mt-2 flex items-center justify-center gap-2 rounded-control border border-[var(--border-inverse)] bg-white/[0.03] px-4 py-2.5 text-sm text-on-dark-muted tabular-nums">
                        <span><span className="font-bold text-on-dark">{completedSets}</span> series</span>
                        {totalReps > 0 && (
                            <>
                                <span className="text-on-dark-muted/50">·</span>
                                <span><span className="font-bold text-on-dark">{totalReps}</span> reps</span>
                            </>
                        )}
                    </div>
                </motion.div>

                {detectedPRs.length > 0 && (
                    <motion.section
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mb-6"
                    >
                        <div className="rounded-card border border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-yellow-500/10 p-4 mb-3">
                            <p className="mb-3 flex items-center gap-2 text-sm font-black text-amber-200">
                                <Trophy className="h-4 w-4 shrink-0" />
                                {detectedPRs.length}{' '}
                                {detectedPRs.length === 1 ? 'récord personal' : 'récords personales'}
                            </p>
                            <div className="space-y-2">
                                {detectedPRs.map((pr, i) => (
                                    <motion.button
                                        key={pr.exerciseName}
                                        type="button"
                                        onClick={() =>
                                            setPrCard({
                                                exerciseName: pr.exerciseName,
                                                newWeightKg: pr.newWeightKg,
                                                prevWeightKg: pr.prevWeightKg,
                                                pct: pr.pct,
                                                estimated1RM: pr.estimated1RM,
                                            })
                                        }
                                        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={
                                            reducedMotion
                                                ? { duration: 0 }
                                                : { delay: 0.1 * i, duration: 0.28 }
                                        }
                                        className="group w-full rounded-lg border border-amber-400/25 bg-white/[0.06] px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.1] active:bg-white/[0.12]"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="font-bold text-on-dark">{pr.exerciseName}</p>
                                            <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-amber-200/90">
                                                <Share2 className="h-3 w-3" /> Compartir
                                            </span>
                                        </div>
                                        <p className="text-xs text-on-dark-muted mt-0.5">
                                            {pr.prevWeightKg} kg → {pr.newWeightKg} kg
                                            {pr.pct > 0 ? ` (+${pr.pct}%)` : ''}
                                        </p>
                                        {pr.prevAchievedAt ? (
                                            <p className="text-[10px] text-amber-200/80 mt-1">
                                                Superaste tus {pr.prevWeightKg} kg del {fmtShortDate(pr.prevAchievedAt)}
                                            </p>
                                        ) : null}
                                        <p className="text-[10px] text-on-dark-muted mt-1">
                                            1RM estimado: <span className="font-semibold text-on-dark">{pr.estimated1RM} kg</span>
                                        </p>
                                    </motion.button>
                                ))}
                            </div>
                        </div>
                    </motion.section>
                )}

                {exerciseBreakdown.length > 0 && (
                    <motion.section
                        variants={reducedMotion ? undefined : staggerContainer(0.06, 0.05)}
                        initial="hidden"
                        animate="show"
                        className="mb-6 space-y-2"
                    >
                        <h3 className="text-xs font-bold uppercase tracking-widest text-on-dark-muted mb-2">
                            Por ejercicio
                        </h3>
                        {exerciseBreakdown.map((ex, i) => (
                            <motion.div
                                key={`${ex.exerciseId}-${i}`}
                                variants={reducedMotion ? undefined : fadeSlideUp}
                                className="rounded-card border border-[var(--border-inverse)] bg-white/[0.04] px-3 py-2.5 flex flex-wrap items-baseline justify-between gap-2"
                            >
                                <div>
                                    <p className="font-semibold text-sm text-on-dark">{ex.name}</p>
                                    <p className="text-[10px] text-on-dark-muted">{ex.muscleGroup}</p>
                                </div>
                                <div className="text-right text-xs text-on-dark-muted tabular-nums">
                                    <span className="font-bold text-on-dark">{ex.sets.length}</span> series ·{' '}
                                    <span className="font-bold text-on-dark">{Math.round(ex.totalVolume)}</span> kg vol.
                                </div>
                            </motion.div>
                        ))}
                    </motion.section>
                )}

                {/* Cardio y movilidad/roller: lo NO-fuerza que antes no aparecía en el resumen (bug CEO).
                    Garantiza que una sesión sólo de cardio/movilidad no quede vacía. */}
                {hasNonStrength && (
                    <motion.section
                        variants={reducedMotion ? undefined : staggerContainer(0.06, 0.05)}
                        initial="hidden"
                        animate="show"
                        className="mb-6 space-y-2"
                    >
                        <h3 className="text-xs font-bold uppercase tracking-widest text-on-dark-muted mb-2">
                            Cardio y movilidad
                        </h3>
                        {session.cardio.map((c) => (
                            <NonStrengthCard
                                key={c.blockId}
                                name={c.name}
                                typeLabel="Cardio"
                                accent="var(--ember-500)"
                                icon={<HeartPulse className="h-4 w-4 shrink-0" style={{ color: 'var(--ember-500)' }} />}
                                tiles={cardioTiles(c)}
                                reducedMotion={reducedMotion}
                            />
                        ))}
                        {session.mobility.map((m) => (
                            <NonStrengthCard
                                key={m.blockId}
                                name={m.name}
                                typeLabel={m.kind === 'roller' ? 'Foam roller' : 'Movilidad'}
                                accent={m.kind === 'roller' ? '#8b5cf6' : '#14b8a6'}
                                icon={
                                    m.kind === 'roller' ? (
                                        <GitCommit className="h-4 w-4 shrink-0" style={{ color: '#8b5cf6' }} />
                                    ) : (
                                        <Move className="h-4 w-4 shrink-0" style={{ color: '#14b8a6' }} />
                                    )
                                }
                                tiles={mobilityTiles(m)}
                                reducedMotion={reducedMotion}
                            />
                        ))}
                    </motion.section>
                )}

                {(hasMuscleMap || muscleGroupVolume.length > 0) && (
                    <section className="mb-8">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-on-dark-muted mb-3">
                            Músculos trabajados
                        </h3>
                        {hasMuscleMap && (
                            <motion.div
                                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
                                className="mb-4 rounded-card border border-[var(--border-inverse)] bg-white/[0.03] px-3 pt-3 pb-1"
                            >
                                <MuscleMapSvg groups={session.muscleWork} reducedMotion={reducedMotion} />
                            </motion.div>
                        )}
                        <div className="space-y-2">
                            {muscleGroupVolume.map(({ group, pct, vol }) => (
                                <div key={group} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="font-medium text-on-dark">{group}</span>
                                        <span className="text-on-dark-muted">{Math.round(vol)} kg</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ backgroundColor: 'var(--theme-primary)' }}
                                            initial={reducedMotion ? { width: `${pct}%` } : { width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={reducedMotion ? { duration: 0 } : springs.smooth}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {programName && (
                    <motion.section
                        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reducedMotion ? { duration: 0 } : { delay: 0.1, duration: 0.3 }}
                        className="mb-6"
                    >
                        <div className="flex items-center gap-3 rounded-card border border-[var(--sport-500)]/25 bg-[var(--sport-500)]/[0.08] px-4 py-3">
                            <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                                style={{ background: 'var(--sport-500)' }}
                            >
                                <ArrowRight className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--sport-300)]">Lo que viene</p>
                                <p className="text-sm font-bold text-on-dark truncate">Seguí tu progreso en {programName}</p>
                                {nextHint && <p className="text-xs text-on-dark-muted truncate">{nextHint}</p>}
                            </div>
                        </div>
                    </motion.section>
                )}

                <div className="mt-auto flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={handleShare}
                        className="w-full h-10 rounded-control font-semibold text-sm border border-[var(--border-inverse)] bg-white/[0.08] text-on-dark hover:bg-white/[0.14] transition-colors flex items-center justify-center gap-2"
                    >
                        {shared ? (
                            <><Check className="w-4 h-4 text-emerald-500" /> Copiado</>
                        ) : (
                            <><Share2 className="w-4 h-4" /> Compartir logro</>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onDone}
                        className="w-full h-12 rounded-control font-bold text-primary-foreground shadow-lg"
                        style={{ backgroundColor: 'var(--theme-primary)' }}
                    >
                        Volver al inicio
                    </button>
                </div>
            </div>

            {prCard && <PRShareCardModal pr={prCard} onClose={() => setPrCard(null)} />}
        </div>
    )
}
