'use client'

import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Trophy, Zap } from 'lucide-react'
import { epleyOneRM } from '@/app/coach/clients/[clientId]/profileTrainingAnalytics'
import { springs, fadeSlideUp, staggerContainer } from '@/lib/animation-presets'

interface ExerciseType {
    id: string
    name: string
    muscle_group: string
}

interface SummaryLog {
    block_id: string
    weight_kg: number | null
    reps_done: number | null
    rpe: number | null
    set_number: number
}

interface BlockSummary {
    id: string
    exercises: ExerciseType | ExerciseType[]
    sets: number
}

export interface WorkoutSummaryOverlayProps {
    planTitle: string
    logs: SummaryLog[]
    blocks: BlockSummary[]
    exerciseMaxes: Record<string, number>
    onDone: () => void
}

function normalizeExercise(block: BlockSummary): ExerciseType | null {
    const ex = block.exercises
    if (Array.isArray(ex)) return ex[0] ?? null
    return ex ?? null
}

export function WorkoutSummaryOverlay({
    planTitle,
    logs,
    blocks,
    exerciseMaxes,
    onDone,
}: WorkoutSummaryOverlayProps) {
    const reducedMotion = useReducedMotion()

    const exerciseBreakdown = useMemo(() => {
        type Row = {
            exerciseId: string
            name: string
            muscleGroup: string
            sets: SummaryLog[]
            totalVolume: number
            maxWeight: number
            best1RM: number
        }
        const byId = new Map<string, Row>()

        for (const block of blocks) {
            const exercise = normalizeExercise(block)
            if (!exercise) continue
            const blockLogs = logs.filter((l) => l.block_id === block.id)
            if (blockLogs.length === 0) continue

            let addVol = 0
            let addMaxW = 0
            let addBest1 = 0
            for (const l of blockLogs) {
                const w = l.weight_kg ?? 0
                const r = l.reps_done ?? 0
                addVol += w * r
                if (w > addMaxW) addMaxW = w
                const e1 = epleyOneRM(w, r)
                if (e1 > addBest1) addBest1 = e1
            }

            const prev = byId.get(exercise.id)
            if (prev) {
                prev.sets.push(...blockLogs)
                prev.totalVolume += addVol
                if (addMaxW > prev.maxWeight) prev.maxWeight = addMaxW
                if (addBest1 > prev.best1RM) prev.best1RM = addBest1
            } else {
                byId.set(exercise.id, {
                    exerciseId: exercise.id,
                    name: exercise.name,
                    muscleGroup: exercise.muscle_group,
                    sets: [...blockLogs],
                    totalVolume: addVol,
                    maxWeight: addMaxW,
                    best1RM: addBest1,
                })
            }
        }

        return [...byId.values()]
    }, [blocks, logs])

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
                    pct,
                    estimated1RM: Math.round(epleyOneRM(ex.maxWeight, Math.max(1, repsAtMax)) * 10) / 10,
                }
            })
    }, [exerciseBreakdown, exerciseMaxes])

    const muscleGroupVolume = useMemo(() => {
        const map = new Map<string, number>()
        for (const ex of exerciseBreakdown) {
            map.set(ex.muscleGroup, (map.get(ex.muscleGroup) ?? 0) + ex.totalVolume)
        }
        const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
        const maxV = entries[0]?.[1] ?? 1
        return entries.map(([group, vol]) => ({
            group,
            vol,
            pct: Math.round((vol / maxV) * 100),
        }))
    }, [exerciseBreakdown])

    const completedSets = logs.length
    const totalReps = logs.reduce((acc, l) => acc + (l.reps_done || 0), 0)
    const totalVolume = logs.reduce((acc, l) => acc + (l.weight_kg || 0) * (l.reps_done || 0), 0)

    useEffect(() => {
        if (detectedPRs.length > 0) {
            confetti({ particleCount: 200, spread: 100, origin: { y: 0.5 } })
            setTimeout(
                () => confetti({ particleCount: 80, spread: 60, origin: { x: 0.2, y: 0.6 } }),
                300
            )
            setTimeout(
                () => confetti({ particleCount: 80, spread: 60, origin: { x: 0.8, y: 0.6 } }),
                500
            )
        } else {
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } })
        }
    }, [])

    const motionOpts = reducedMotion ? { duration: 0 } : undefined

    return (
        <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm overflow-y-auto pt-safe pb-8">
            <div className="min-h-full flex flex-col items-stretch px-4 py-6 max-w-lg mx-auto w-full">
                <motion.header
                    initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionOpts ?? { duration: 0.35 }}
                    className="text-center mb-6"
                >
                    <div className="flex justify-center gap-2 mb-3">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-amber-500/15 border border-amber-500/30">
                            <Trophy className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-primary/10 border border-primary/25">
                            <Zap className="w-7 h-7 text-primary" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-black tracking-tight text-foreground">¡Sesión completada!</h2>
                    <p className="text-sm text-muted-foreground mt-1">{planTitle}</p>
                </motion.header>

                <motion.div
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionOpts ?? { delay: 0.05, duration: 0.3 }}
                    className="grid grid-cols-3 gap-2 mb-6"
                >
                    <div className="rounded-xl border border-border bg-card/50 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sets</p>
                        <p className="text-lg font-bold">{completedSets}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/50 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Reps</p>
                        <p className="text-lg font-bold">{totalReps}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card/50 p-3 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Volumen</p>
                        <p className="text-lg font-bold">{Math.round(totalVolume)} kg</p>
                    </div>
                </motion.div>

                {detectedPRs.length > 0 && (
                    <motion.section
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mb-6"
                    >
                        <div className="rounded-xl border border-yellow-400/40 bg-gradient-to-br from-amber-500/15 to-yellow-500/10 p-4 mb-3">
                            <p className="text-sm font-black text-amber-800 dark:text-amber-200 mb-3">
                                🏆 {detectedPRs.length}{' '}
                                {detectedPRs.length === 1 ? 'récord personal' : 'récords personales'}
                            </p>
                            <div className="space-y-2">
                                {detectedPRs.map((pr, i) => (
                                    <motion.div
                                        key={pr.exerciseName}
                                        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={
                                            reducedMotion
                                                ? { duration: 0 }
                                                : { delay: 0.1 * i, duration: 0.28 }
                                        }
                                        className="rounded-lg border border-yellow-400/30 bg-background/60 px-3 py-2 text-sm"
                                    >
                                        <p className="font-bold text-foreground">{pr.exerciseName}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {pr.prevWeightKg} kg → {pr.newWeightKg} kg
                                            {pr.pct > 0 ? ` (+${pr.pct}%)` : ''}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                            1RM estimado: <span className="font-semibold text-foreground">{pr.estimated1RM} kg</span>
                                        </p>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.section>
                )}

                <motion.section
                    variants={reducedMotion ? undefined : staggerContainer(0.06, 0.05)}
                    initial="hidden"
                    animate="show"
                    className="mb-6 space-y-2"
                >
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        Por ejercicio
                    </h3>
                    {exerciseBreakdown.map((ex, i) => (
                        <motion.div
                            key={`${ex.exerciseId}-${i}`}
                            variants={reducedMotion ? undefined : fadeSlideUp}
                            className="rounded-xl border border-border bg-card/40 px-3 py-2.5 flex flex-wrap items-baseline justify-between gap-2"
                        >
                            <div>
                                <p className="font-semibold text-sm">{ex.name}</p>
                                <p className="text-[10px] text-muted-foreground">{ex.muscleGroup}</p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                                <span className="font-bold text-foreground">{ex.sets.length}</span> series ·{' '}
                                <span className="font-bold text-foreground">{Math.round(ex.totalVolume)}</span> kg vol.
                            </div>
                        </motion.div>
                    ))}
                </motion.section>

                {muscleGroupVolume.length > 0 && (
                    <section className="mb-8">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                            Volumen por grupo
                        </h3>
                        <div className="space-y-2">
                            {muscleGroupVolume.map(({ group, pct, vol }) => (
                                <div key={group} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="font-medium">{group}</span>
                                        <span className="text-muted-foreground">{Math.round(vol)} kg</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
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

                <button
                    type="button"
                    onClick={onDone}
                    className="mt-auto w-full h-12 rounded-2xl font-bold text-primary-foreground shadow-lg"
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                >
                    Volver al inicio
                </button>
            </div>
        </div>
    )
}
