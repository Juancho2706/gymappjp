'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    ChevronLeft,
    ChevronRight,
    Info,
    Dumbbell,
    HeartPulse,
    Move,
    GitCommitHorizontal,
    Timer,
    Play,
    Flag,
    History,
    Quote,
    X,
    Settings,
    CheckCircle2,
    WifiOff,
} from 'lucide-react'
import { LogSetForm } from './LogSetForm'
import { WorkoutTimerProvider, useWorkoutTimer } from './WorkoutTimerProvider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import Image from 'next/image'
import { WorkoutSummaryOverlay } from './WorkoutSummaryOverlay'
import { WorkoutTimerSettingsPanel } from './WorkoutTimerSettingsPanel'
import { cn } from '@/lib/utils'
import { formatRelativeDate } from '@/lib/date-utils'
import { springs } from '@/lib/animation-presets'
import { useBasePath } from '@/components/client/BasePathProvider'
import { executionAreaGroupsFor } from '@/lib/workout-areas'
import type { IntervalConfig, WorkoutArea, ExerciseType as WorkoutKind } from '@/domain/workout/types'
import { effectiveExerciseType, compactDistance, compactDuration } from '@/lib/workout-exercise-type'
import { isTimeableInterval } from '@/lib/workout-interval'
import { formatPace } from '@/domain/cardio/pace'
import { extractYoutubeVideoId } from '@/lib/youtube'
import { ExerciseVideo } from '@/components/exercise/ExerciseVideo'
import type { ClientCardioView } from './_data/workout-execution.queries'

interface ExerciseType {
    id: string
    name: string
    muscle_group: string
    video_url: string | null
    video_start_time: number | null
    video_end_time: number | null
    gif_url: string | null
    instructions: string[] | null
    exercise_type?: string | null
}

interface BlockType {
    id: string
    order_index: number
    sets: number
    reps: string
    target_weight_kg: number | null
    tempo: string | null
    rir: string | null
    rest_time: string | null
    notes: string | null
    section: 'warmup' | 'main' | 'cooldown' | null
    section_template_id: string | null
    superset_group: string | null
    progression_type: 'weight' | 'reps' | null
    progression_value: number | null
    is_override: boolean
    // Prescripción polimórfica (null en planes legacy — AC3)
    exercise_type_override?: string | null
    side_mode?: string | null
    reps_value?: number | null
    reps_unit?: string | null
    load_value?: number | null
    load_unit?: string | null
    distance_value?: number | null
    distance_unit?: string | null
    duration_sec?: number | null
    target_pace_sec_per_km?: number | null
    hr_zone?: number | null
    instructions?: string | null
    interval_config?: IntervalConfig | null
    exercises: ExerciseType | ExerciseType[]
}

interface PlanType {
    id: string
    title: string
    assigned_date: string
    day_of_week: number | null
    week_variant: 'A' | 'B' | null
    program_id: string | null
    workout_blocks: BlockType[]
}

interface ProgramType {
    id: string
    name: string
    program_phases: { name: string; weeks: number; color?: string }[] | null
    program_structure_type: 'weekly' | 'cycle' | null
    cycle_length: number | null
    ab_mode: boolean | null
}

interface Props {
    plan: PlanType
    program: ProgramType | null
    logs: Array<{
        block_id: string
        set_number: number
        weight_kg: number | null
        reps_done: number | null
        rpe: number | null
        rir?: number | null
        actual_duration_sec?: number | null
        actual_distance_m?: number | null
        actual_hold_sec?: number | null
        actual_avg_hr?: number | null
    }>
    previousHistory?: Record<string, { weight_kg: number | null, reps_done: number | null, date: string }[]>
    coachSlug: string
    exerciseMaxes?: Record<string, number>
    activeWeekVariant?: 'A' | 'B' | null
    /** Areas (no clasicas) referenciadas por el plan, resueltas server-side; vacio en planes viejos */
    areas?: WorkoutArea[]
    /** Módulo cardio: zonas personalizadas del alumno (chips "Z4 · 150–168 bpm"); OFF ⇒ solo "Z4" */
    cardio?: ClientCardioView
}

/** Metadatos de tipo efectivo del bloque (icono + color de acento). */
const TYPE_META: Record<WorkoutKind, { label: string; Icon: typeof Dumbbell; color: string }> = {
    strength: { label: 'Fuerza', Icon: Dumbbell, color: 'var(--sport-500)' },
    cardio: { label: 'Cardio', Icon: HeartPulse, color: 'var(--ember-500)' },
    mobility: { label: 'Movilidad', Icon: Move, color: 'var(--aqua-500, #14B8A6)' },
    roller: { label: 'Roller', Icon: GitCommitHorizontal, color: '#C77DFF' },
}

const SIDE_LABEL: Record<string, string> = {
    per_side: 'Por lado',
    alternating: 'Alternado',
}

/** Chip de objetivo (label + valor) sobre la superficie inmersiva oscura. */
function TargetChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div
            className={cn(
                'flex-1 min-w-[64px] rounded-sm border px-2.5 py-2',
                highlight
                    ? 'border-[var(--ember-500)]/30 bg-[var(--ember-500)]/[0.14]'
                    : 'border-[var(--border-inverse)] bg-white/[0.05]'
            )}
        >
            <div
                className={cn(
                    'text-[9.5px] font-bold uppercase tracking-wide',
                    highlight ? 'text-[var(--ember-300)]' : 'text-on-dark-muted'
                )}
            >
                {label}
            </div>
            <div
                className={cn(
                    'font-mono text-[15px] font-bold tabular-nums mt-0.5',
                    highlight ? 'text-[var(--ember-200)]' : 'text-on-dark'
                )}
            >
                {value}
            </div>
        </div>
    )
}

/** Grid de objetivos por tipo (cardio/movilidad/roller) — strength tiene su propio set de chips. */
function TypedTargetGrid({ block, kind, cardio }: { block: BlockType; kind: WorkoutKind; cardio?: ClientCardioView }) {
    const cards: { label: string; value: string; highlight?: boolean }[] = []

    if (kind === 'cardio') {
        if (block.interval_config) {
            const work = block.interval_config.work.distance_m != null
                ? compactDistance(block.interval_config.work.distance_m, 'm')
                : block.interval_config.work.duration_sec != null
                    ? compactDuration(block.interval_config.work.duration_sec)
                    : '—'
            const rec = block.interval_config.recovery?.duration_sec
            cards.push({
                label: 'Intervalos',
                value: `${block.interval_config.repeats}× ${work}${rec ? ` / r${rec}s` : ''}`,
            })
        }
        if ((block.duration_sec ?? 0) > 0) cards.push({ label: 'Duración', value: compactDuration(block.duration_sec as number) })
        if ((block.distance_value ?? 0) > 0) cards.push({ label: 'Distancia', value: compactDistance(block.distance_value as number, block.distance_unit) })
        if (block.target_pace_sec_per_km != null) cards.push({ label: 'Pace obj.', value: `${formatPace(block.target_pace_sec_per_km)} /km` })
        if (block.hr_zone != null) {
            const range = cardio?.enabled ? cardio.zones?.find((z) => z.zone === block.hr_zone) ?? null : null
            cards.push({
                label: 'Zona FC',
                value: range ? `Z${block.hr_zone} · ${range.minBpm}–${range.maxBpm} bpm` : `Z${block.hr_zone}`,
                highlight: true,
            })
        }
        if (block.sets > 1) cards.push({ label: 'Rondas', value: `${block.sets}` })
    }

    if (kind === 'mobility') {
        if ((block.duration_sec ?? 0) > 0) cards.push({ label: 'Hold', value: `${block.duration_sec}s` })
        cards.push({ label: 'Series', value: `${block.sets}` })
        if (block.reps_unit === 'breaths' && (block.reps_value ?? 0) > 0) {
            cards.push({ label: 'Respiraciones', value: `${block.reps_value}` })
        }
    }

    if (kind === 'roller') {
        if (block.reps_unit === 'passes' && (block.reps_value ?? 0) > 0) {
            cards.push({ label: 'Pasadas', value: `${block.reps_value}` })
        } else if ((block.duration_sec ?? 0) > 0) {
            cards.push({ label: 'Duración', value: `${block.duration_sec}s` })
        }
    }

    if (block.side_mode && SIDE_LABEL[block.side_mode]) cards.push({ label: 'Lado', value: SIDE_LABEL[block.side_mode] })
    if (block.load_value != null && block.load_value > 0) {
        cards.push({ label: 'Carga', value: `${block.load_value} ${block.load_unit ?? 'kg'}` })
    }
    if (block.rest_time) cards.push({ label: 'Descanso', value: block.rest_time })

    if (!cards.length) {
        cards.push({ label: 'Objetivo', value: block.reps || '—' })
    }

    return (
        <div className="flex flex-wrap gap-2">
            {cards.map((card) => (
                <TargetChip key={card.label} label={card.label} value={card.value} highlight={card.highlight} />
            ))}
        </div>
    )
}

/** Barra de timer del bloque: descanso (fuerza) / intervalos / hold / cronómetro (AC5). */
function BlockTimerBar({ block, kind }: { block: BlockType; kind: WorkoutKind }) {
    const { startRest, startHold, startInterval, startStopwatch } = useWorkoutTimer()

    let label: string
    let onClick: () => void
    if (kind === 'cardio') {
        if (block.interval_config && isTimeableInterval(block.interval_config)) {
            const config = block.interval_config
            const rec = config.recovery?.duration_sec
            const work = config.work.duration_sec != null ? `${config.work.duration_sec}s` : ''
            label = `Iniciar intervalos · ${config.repeats}×${work ? ` ${work}` : ''}${rec ? `/${rec}s` : ''}`
            onClick = () => startInterval(config, block.sets || 1)
        } else {
            label = 'Cronómetro'
            onClick = () => startStopwatch()
        }
    } else if (kind === 'mobility' && (block.duration_sec ?? 0) > 0) {
        const seconds = block.duration_sec as number
        label = `Timer de hold · ${seconds}s`
        onClick = () => startHold(seconds, 'Hold')
    } else if (kind === 'roller' && (block.duration_sec ?? 0) > 0) {
        const seconds = block.duration_sec as number
        label = `Cronómetro · ${seconds}s`
        onClick = () => startStopwatch()
    } else {
        const rest = block.rest_time || '90s'
        label = `Descanso · ${rest}`
        onClick = () => startRest(block.rest_time || '90')
    }

    return (
        <button
            onClick={onClick}
            className="mt-1 flex w-full items-center gap-2.5 rounded-control bg-primary/[0.12] p-3 text-left transition-colors hover:bg-primary/20 active:scale-[0.99]"
        >
            <Timer className="w-[19px] h-[19px] shrink-0 text-[var(--sport-300)]" />
            <span className="text-[13.5px] font-semibold text-on-dark">{label}</span>
            <Play className="w-4 h-4 shrink-0 ml-auto text-on-dark-muted" />
        </button>
    )
}

/** Encabezados de la tabla de registro por tipo (la de strength queda intacta). */
function TypedLogHeader({ kind }: { kind: WorkoutKind }) {
    if (kind === 'cardio') {
        return (
            <div className="grid grid-cols-[auto_3.5rem_3.5rem_3rem_auto] md:grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-2 pb-2 text-[10px] font-bold text-on-dark-muted uppercase tracking-wider border-b border-white/10">
                <div className="w-4 text-center">Set</div>
                <div className="text-center">Min</div>
                <div className="text-center">Metros</div>
                <div className="text-center">FC</div>
                <div className="w-8"></div>
            </div>
        )
    }
    if (kind === 'roller') {
        return (
            <div className="grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 px-2 pb-2 text-[10px] font-bold text-on-dark-muted uppercase tracking-wider border-b border-white/10">
                <div className="w-4 text-center">Set</div>
                <div className="text-center">Seg</div>
                <div className="text-center">Pasadas</div>
                <div className="w-8"></div>
            </div>
        )
    }
    if (kind === 'mobility') {
        return (
            <div className="grid grid-cols-[auto_5rem_auto] md:grid-cols-[auto_1fr_auto] gap-2 px-2 pb-2 text-[10px] font-bold text-on-dark-muted uppercase tracking-wider border-b border-white/10">
                <div className="w-4 text-center">Set</div>
                <div className="text-center">Seg de hold</div>
                <div className="w-8"></div>
            </div>
        )
    }
    // strength
    return (
        <div className="grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 px-2 pb-2 text-[10px] font-bold text-on-dark-muted uppercase tracking-wider border-b border-white/10">
            <div className="w-4 text-center">Set</div>
            <div className="text-center">Kg</div>
            <div className="text-center">Reps</div>
            <div className="w-8"></div>
        </div>
    )
}

function loggedSetsInBlock(
    block: BlockType,
    logs: Array<{ block_id: string; set_number: number }>
) {
    let done = 0
    for (let i = 1; i <= block.sets; i += 1) {
        if (logs.some((log) => log.block_id === block.id && log.set_number === i)) done += 1
    }
    return done
}

/** Counts unique (block_id, set_number) within each block's planned set range (handles duplicate rows). */
function countUniqueLoggedSets(
    blocks: BlockType[],
    logs: Array<{ block_id: string; set_number: number }>
) {
    const blockById = new Map(blocks.map((b) => [b.id, b]))
    const seen = new Set<string>()
    for (const log of logs) {
        const b = blockById.get(log.block_id)
        if (!b) continue
        if (log.set_number < 1 || log.set_number > b.sets) continue
        seen.add(`${log.block_id}:${log.set_number}`)
    }
    return seen.size
}

const WORKOUT_SECTION_TITLE: Record<'warmup' | 'main' | 'cooldown' | 'other', string> = {
    warmup: 'Calentamiento',
    main: 'Principal',
    cooldown: 'Vuelta a la calma',
    other: 'Otros bloques',
}

export function WorkoutExecutionClient({
    plan,
    program,
    logs,
    previousHistory = {},
    coachSlug,
    exerciseMaxes = {},
    activeWeekVariant = null,
    areas = [],
    cardio,
}: Props) {
    const router = useRouter()
    const base = useBasePath(`/c/${coachSlug}`)
    const reducedMotion = useReducedMotion()
    const blocks = useMemo(() => [...plan.workout_blocks].sort((a, b) => a.order_index - b.order_index), [plan.workout_blocks])
    const [idx, setIdx] = useState(0)
    const [showTechnique, setShowTechnique] = useState(false)
    const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)
    const [showTimerSettings, setShowTimerSettings] = useState(false)
    const [showCompleted, setShowCompleted] = useState(false)
    const [selectedExercise, setSelectedExercise] = useState<ExerciseType | null>(null)
    const [sessionLogs, setSessionLogs] = useState(logs)
    const [isOffline, setIsOffline] = useState(false)
    const [elapsed, setElapsed] = useState(0)

    // Cronómetro de sesión (mm:ss) — arranca al montar la ejecución.
    useEffect(() => {
        const t = setInterval(() => setElapsed((e) => e + 1), 1000)
        return () => clearInterval(t)
    }, [])

    useEffect(() => {
        const onOnline = () => setIsOffline(false)
        const onOffline = () => setIsOffline(true)
        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        if (typeof navigator !== 'undefined' && !navigator.onLine) setIsOffline(true)
        return () => {
            window.removeEventListener('online', onOnline)
            window.removeEventListener('offline', onOffline)
        }
    }, [])

    const getExercise = (block: BlockType) => (Array.isArray(block.exercises) ? block.exercises[0] : block.exercises) || null

    // Título de área por bloque (Calentamiento / Principal / Vuelta a la calma / área custom),
    // resuelto server-side con fallback legacy.
    const areaTitleByBlock = useMemo(() => {
        const map = new Map<string, string>()
        for (const areaGroup of executionAreaGroupsFor(blocks, areas)) {
            const title = areaGroup.name ?? WORKOUT_SECTION_TITLE[areaGroup.legacySection ?? 'main']
            for (const b of areaGroup.blocks) map.set(b.id, title)
        }
        return map
    }, [blocks, areas])

    // Conteo de ejercicios por superserie (chip "Superserie A · N ejercicios").
    const supersetCounts = useMemo(() => {
        const counts = new Map<string, number>()
        for (const b of blocks) {
            if (b.superset_group) counts.set(b.superset_group, (counts.get(b.superset_group) ?? 0) + 1)
        }
        return counts
    }, [blocks])

    if (!blocks.length) {
        return (
            <div className="is-workout-page min-h-dvh bg-[var(--ink-950)] text-on-dark flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 bg-white/[0.06] rounded-full flex items-center justify-center mb-4 text-on-dark-muted">
                    <Dumbbell className="w-8 h-8" />
                </div>
                <h1 className="font-display text-xl font-bold text-on-dark mb-2">Rutina sin ejercicios</h1>
                <p className="text-sm text-on-dark-muted mb-6">Esta rutina ya no tiene ejercicios asociados. Tu coach probablemente esté actualizando tu plan.</p>
                <Link href={`${base}/dashboard`} className="px-6 py-2 bg-primary text-primary-foreground rounded-control font-bold shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
                    Volver al Dashboard
                </Link>
            </div>
        )
    }

    const requiredSets = blocks.reduce((acc, b) => acc + b.sets, 0)
    const completedSetCount = countUniqueLoggedSets(blocks, sessionLogs)
    const completionPct = requiredSets === 0 ? 0 : Math.min(100, Math.round((completedSetCount / requiredSets) * 100))
    const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

    const safeIdx = Math.min(idx, blocks.length - 1)
    const block = blocks[safeIdx]
    const exercise = getExercise(block)
    const effType: WorkoutKind = exercise ? effectiveExerciseType(block, exercise) : 'strength'
    const meta = TYPE_META[effType]
    const areaTitle = areaTitleByBlock.get(block.id) ?? 'Principal'
    const groupLabel = block.superset_group ? `Superserie ${block.superset_group}` : `Ejercicio ${safeIdx + 1}`
    const blockLogs = sessionLogs.filter((log) => log.block_id === block.id)
    const doneCount = loggedSetsInBlock(block, sessionLogs)
    const nSets = block.sets
    const prevHistory = exercise ? previousHistory[exercise.id] : undefined
    const prevSummary = prevHistory && prevHistory.length > 0
        ? prevHistory.map((l, i) => `S${i + 1}: ${l.weight_kg ? `${l.weight_kg}kg` : '-'}×${l.reps_done || '-'}`).join('  ')
        : null

    const subtitle = [
        plan.title,
        activeWeekVariant != null ? `Semana ${activeWeekVariant}` : null,
        program?.program_structure_type === 'cycle'
            ? `Día ${plan.day_of_week || 1} de ${program.cycle_length || '?'}`
            : program?.name || null,
    ].filter(Boolean).join(' · ')

    const toggleAutoTimer = () => {
        const newValue = !autoTimerEnabled
        setAutoTimerEnabled(newValue)
        localStorage.setItem('omni_autotimer', String(newValue))
    }
    const openTechnique = (exercise: ExerciseType | null) => {
        if (!exercise) return
        setSelectedExercise(exercise)
        setShowTechnique(true)
    }
    const handleLogged = (payload: { blockId: string; setNumber: number; weightKg: number | null; repsDone: number | null; rpe: number | null; rir: number | null }) => {
        setSessionLogs((prev) => {
            const next = prev.filter((log) => !(log.block_id === payload.blockId && log.set_number === payload.setNumber))
            next.push({
                block_id: payload.blockId,
                set_number: payload.setNumber,
                weight_kg: payload.weightKg,
                reps_done: payload.repsDone,
                rpe: payload.rpe,
                rir: payload.rir,
            })
            return next
        })
    }
    const handleFinish = () => {
        setShowCompleted(true)
    }

    const goPrev = () => setIdx((i) => Math.max(0, i - 1))
    const goNext = () => setIdx((i) => Math.min(blocks.length - 1, i + 1))

    return (
        <WorkoutTimerProvider>
            <div className="is-workout-page relative flex min-h-dvh flex-col bg-[var(--ink-950)] text-on-dark">
                <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
                    {/* header */}
                    <div className="flex items-center gap-2.5 px-5 pt-safe pb-3">
                        <Link
                            href={`${base}/dashboard`}
                            aria-label="Salir"
                            className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-white/[0.08] text-on-dark transition-colors hover:bg-white/[0.14]"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Link>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[11.5px] font-bold uppercase tracking-[0.06em] text-on-dark-muted">
                                {subtitle}
                            </div>
                            <div className="font-display text-base font-extrabold text-on-dark">
                                {areaTitle} · {groupLabel}
                            </div>
                        </div>
                        {isOffline && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warning-500)]/[0.16] px-2.5 py-1.5 text-[11px] font-bold text-[var(--warning-500)]">
                                <WifiOff className="w-3.5 h-3.5" /> Sin conexión
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowTimerSettings(true)}
                            aria-label="Descanso y alarma"
                            title="Descanso y alarma"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-white/[0.08] text-on-dark transition-colors hover:bg-white/[0.14]"
                        >
                            <Settings className="w-[18px] h-[18px]" />
                        </button>
                    </div>

                    {/* progress */}
                    <div className="px-5 mb-3.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                            <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: 'var(--sport-500)' }}
                                initial={{ width: 0 }}
                                animate={{ width: `${completionPct}%` }}
                                transition={reducedMotion ? { duration: 0 } : springs.smooth}
                            />
                        </div>
                        <div className="mt-1.5 flex justify-between font-mono text-[11px] tabular-nums">
                            <span className="text-on-dark-muted">
                                {completedSetCount}/{requiredSets} series · bloque {safeIdx + 1}/{blocks.length}
                            </span>
                            <span className="font-bold" style={{ color: 'var(--sport-400)' }}>
                                {completionPct}% · {elapsedLabel}
                            </span>
                        </div>
                    </div>

                    {/* block card (carousel) */}
                    <div className="flex-1 px-5 pb-5">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={block.id}
                                initial={reducedMotion ? false : { opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={reducedMotion ? undefined : { opacity: 0, x: -16 }}
                                transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
                                className="space-y-3.5 rounded-card border border-[var(--border-inverse)] bg-[var(--ink-900)] p-5"
                            >
                                {/* type + superset row */}
                                <div className="flex items-center gap-2">
                                    <span
                                        className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold"
                                        style={{ color: meta.color }}
                                    >
                                        <meta.Icon className="w-3.5 h-3.5" /> {meta.label}
                                    </span>
                                    {block.superset_group && (
                                        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-on-dark-muted">
                                            Superserie {block.superset_group} · {supersetCounts.get(block.superset_group) ?? 1} ejercicios
                                        </span>
                                    )}
                                </div>

                                {/* exercise header */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h2 className="font-display text-[23px] font-black leading-[1.1] tracking-[-0.02em] text-on-dark">
                                            {exercise?.name ?? 'Ejercicio'}
                                        </h2>
                                        <div className="mt-1.5 flex items-center gap-1.5">
                                            {exercise?.muscle_group && (
                                                <span className="inline-flex items-center rounded-full bg-[var(--sport-500)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--sport-300)]">
                                                    {exercise.muscle_group}
                                                </span>
                                            )}
                                            {(exercise?.gif_url || exercise?.video_url || (exercise?.instructions?.length ?? 0) > 0) && (
                                                <button
                                                    onClick={() => openTechnique(exercise)}
                                                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark"
                                                >
                                                    <Info className="w-3.5 h-3.5" /> Ver técnica
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openTechnique(exercise)}
                                        aria-label="Ver video"
                                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-white transition-transform active:scale-95"
                                        style={{ background: meta.color }}
                                    >
                                        <Play className="w-[22px] h-[22px]" />
                                    </button>
                                </div>

                                {/* target grid (typed) */}
                                {effType === 'strength' ? (
                                    <div className="flex flex-wrap gap-2">
                                        <TargetChip label="Series×reps" value={`${block.sets}×${block.reps}`} />
                                        <TargetChip label="Peso" value={`${block.target_weight_kg ?? '—'} kg`} />
                                        {block.rest_time && <TargetChip label="Descanso" value={block.rest_time} />}
                                        {block.tempo && <TargetChip label="Tempo" value={block.tempo} />}
                                        {block.rir && <TargetChip label="RIR" value={block.rir} />}
                                    </div>
                                ) : (
                                    <TypedTargetGrid block={block} kind={effType} cardio={cardio} />
                                )}

                                {/* previous session — strength only */}
                                {effType === 'strength' && prevSummary && prevHistory && (
                                    <div className="flex flex-wrap items-center gap-2 rounded-sm bg-white/[0.04] px-3 py-2">
                                        <History className="w-3.5 h-3.5 shrink-0 text-on-dark-muted" />
                                        <span className="text-xs text-on-dark-muted">
                                            Sesión anterior · {formatRelativeDate(prevHistory[0].date)}:
                                        </span>
                                        <span className="font-mono text-xs font-semibold text-on-dark">{prevSummary}</span>
                                    </div>
                                )}

                                {/* typed instructions (datos reales — no se descartan) */}
                                {effType !== 'strength' && block.instructions && (
                                    <div className="flex gap-2 rounded-sm border border-primary/20 bg-primary/[0.10] px-3 py-2.5">
                                        <Info className="w-3.5 h-3.5 shrink-0 text-[var(--sport-300)] mt-0.5" />
                                        <span className="text-[12.5px] leading-relaxed text-on-dark/90">{block.instructions}</span>
                                    </div>
                                )}

                                {/* block notes */}
                                {block.notes && (
                                    <div className="flex gap-2 rounded-sm border border-primary/20 bg-primary/[0.10] px-3 py-2.5">
                                        <Quote className="w-3.5 h-3.5 shrink-0 text-[var(--sport-300)] mt-0.5" />
                                        <span className="text-[12.5px] leading-relaxed text-on-dark/90">{block.notes}</span>
                                    </div>
                                )}

                                {/* log header (typed) */}
                                <div className="pt-1">
                                    <TypedLogHeader kind={effType} />
                                    {/* log rows (typed, editable — server actions reales) */}
                                    <div className="space-y-1 pt-2">
                                        {Array.from({ length: block.sets }).map((_, i) => {
                                            const setNumber = i + 1
                                            const log = blockLogs.find((entry) => entry.set_number === setNumber)
                                            return (
                                                <LogSetForm
                                                    key={`${block.id}-${setNumber}`}
                                                    blockId={block.id}
                                                    setNumber={setNumber}
                                                    restTimeStr={block.rest_time}
                                                    existingLog={log}
                                                    autoTimerEnabled={autoTimerEnabled}
                                                    mode={effType}
                                                    onLogged={handleLogged}
                                                />
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* timer bar */}
                                <BlockTimerBar block={block} kind={effType} />
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* footer nav */}
                    <div className="flex gap-2.5 px-5 pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))]">
                        <button
                            onClick={goPrev}
                            disabled={safeIdx === 0}
                            aria-label="Anterior"
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-white/[0.08] text-on-dark transition-colors hover:bg-white/[0.14] disabled:opacity-40"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        {safeIdx < blocks.length - 1 ? (
                            <button
                                onClick={goNext}
                                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-control bg-primary font-bold text-primary-foreground transition-transform active:scale-[0.99]"
                            >
                                {doneCount === nSets ? 'Siguiente bloque' : `Completar (${doneCount}/${nSets})`}
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        ) : (
                            <button
                                onClick={handleFinish}
                                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-control bg-primary font-bold text-primary-foreground transition-transform active:scale-[0.99]"
                            >
                                <Flag className="w-5 h-5" />
                                Finalizar entrenamiento
                            </button>
                        )}
                    </div>
                </div>

                {/* Descanso, alarma y auto-timer (tuerca header) */}
                <Dialog open={showTimerSettings} onOpenChange={setShowTimerSettings}>
                    <DialogContent className="max-w-sm rounded-sheet p-6 bg-card border-border max-h-[min(90dvh,32rem)] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="font-display text-xl font-bold">Descanso y alarma</DialogTitle>
                        </DialogHeader>
                        <WorkoutTimerSettingsPanel
                            autoTimerEnabled={autoTimerEnabled}
                            onToggleAutoTimer={toggleAutoTimer}
                        />
                        <button
                            type="button"
                            onClick={() => setShowTimerSettings(false)}
                            className="w-full mt-6 py-3 rounded-control bg-secondary text-secondary-foreground font-bold"
                        >
                            Cerrar
                        </button>
                    </DialogContent>
                </Dialog>

                {/* Workout Completed Overlay */}
                {showCompleted ? createPortal(
                    <WorkoutSummaryOverlay
                        planTitle={plan.title}
                        logs={sessionLogs}
                        blocks={plan.workout_blocks}
                        exerciseMaxes={exerciseMaxes}
                        onDone={() => router.push(`${base}/dashboard`)}
                    />,
                    document.body
                ) : null}

                {/* Technique Modal */}
                <Dialog open={showTechnique} onOpenChange={setShowTechnique}>
                    <DialogContent
                        showCloseButton={false}
                        className="bg-card border-border rounded-sheet overflow-hidden p-0 max-w-md w-[90vw] max-h-[85dvh] flex flex-col focus:outline-none"
                    >
                        {(() => {
                            const exercise = selectedExercise
                            if (!exercise) return null
                            const isYouTube = exercise.video_url?.includes('youtube.com') || exercise.video_url?.includes('youtu.be');

                            const ytId = exercise.video_url ? extractYoutubeVideoId(exercise.video_url) : null;

                            if (isYouTube && ytId) {
                                return (
                                    <div className="relative w-full h-48 md:h-64 shrink-0 bg-black/5 dark:bg-black/20 flex items-center justify-center">
                                        <ExerciseVideo
                                            videoId={ytId}
                                            start={exercise.video_start_time}
                                            end={exercise.video_end_time}
                                            className="w-full h-full"
                                            title={exercise.name}
                                        />
                                    </div>
                                );
                            }

                            if (exercise.gif_url) {
                                return (
                                    <div className="relative w-full h-48 md:h-64 shrink-0 bg-muted flex items-center justify-center">
                                        <Image
                                            src={exercise.gif_url}
                                            alt={exercise.name}
                                            fill
                                            className="object-contain p-4"
                                            unoptimized
                                        />
                                    </div>
                                );
                            }

                            if (exercise.video_url) {
                                const urlLower = exercise.video_url.toLowerCase();
                                const isMp4 = urlLower.includes('.mp4') || urlLower.includes('.mov') || urlLower.includes('.webm') || (urlLower.includes('supabase.co/storage') && !urlLower.includes('.gif') && !urlLower.includes('.jpg') && !urlLower.includes('.png'));

                                if (isMp4) {
                                    return (
                                        <div className="relative w-full h-48 md:h-64 shrink-0 bg-white flex items-center justify-center border-b border-border/50">
                                            <video
                                                src={exercise.video_url}
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                                className="w-full h-full object-contain"
                                            />
                                        </div>
                                    );
                                }

                                return (
                                    <div className="relative w-full h-48 md:h-64 shrink-0 bg-white flex items-center justify-center border-b border-border/50">
                                        <Image
                                            src={exercise.video_url}
                                            alt={exercise.name}
                                            fill
                                            className="object-contain"
                                            unoptimized
                                        />
                                    </div>
                                );
                            }

                            return null;
                        })()}
                        <div className="p-6 pt-6 flex-1 overflow-y-auto custom-scrollbar">
                            <DialogHeader className="mb-4">
                                <div className="flex items-start justify-between gap-4">
                                    <DialogTitle className="font-display text-xl font-extrabold text-foreground">{selectedExercise?.name}</DialogTitle>
                                    <DialogClose className="p-2 -mr-2 -mt-2 rounded-full hover:bg-muted transition-colors shrink-0">
                                        <X className="w-5 h-5 text-muted-foreground" />
                                    </DialogClose>
                                </div>
                            </DialogHeader>
                                    {selectedExercise?.instructions && selectedExercise.instructions.length > 0 ? (
                                        <ol className="space-y-3">
                                            {selectedExercise.instructions.map((step, i) => (
                                                <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                                                    <span
                                                        className="flex-shrink-0 w-6 h-6 rounded-full font-bold flex items-center justify-center text-xs mt-0.5"
                                                        style={{
                                                            backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)',
                                                            color: 'var(--theme-primary)'
                                                        }}
                                                    >
                                                        {i + 1}
                                                    </span>
                                                    <span className="leading-relaxed">{step.replace(/^Step:\d+\s*/i, '')}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    ) : (
                                <p className="text-muted-foreground text-sm">No hay instrucciones detalladas disponibles para este ejercicio.</p>
                            )}
                            <button
                                onClick={() => setShowTechnique(false)}
                                className="w-full mt-6 py-3 rounded-control bg-secondary text-secondary-foreground font-bold shrink-0"
                            >
                                Entendido
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>

            </div>
        </WorkoutTimerProvider>
    )
}
