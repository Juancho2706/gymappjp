'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info, Dumbbell, Timer, TrendingUp, History, Quote, X, Settings, CheckCircle2, WifiOff } from 'lucide-react'
import { computeEffectiveTarget } from '@/lib/workout/progression'
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
import {
    groupContiguousSupersetRuns,
    type WorkoutSectionKey,
} from '@/lib/workout-block-grouping'
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
    progression_mode: 'weekly_linear' | 'double' | 'session_linear' | 'adaptive' | null
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
    start_date: string | null
    weeks_to_repeat: number
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
    /** Semana 1-based del programa (sobrecarga progresiva). null si falta start_date. */
    currentWeek?: number | null
    /** Doble progresión: última sesión registrada por bloque (peso + reps por serie). */
    lastSessionByBlock?: Record<string, { date: string; sets: Array<{ weight_kg: number | null; reps_done: number | null }> }>
    /** Areas (no clasicas) referenciadas por el plan, resueltas server-side; vacio en planes viejos */
    areas?: WorkoutArea[]
    /** Módulo cardio: zonas personalizadas del alumno (chips "Z4 · 150–168 bpm"); OFF ⇒ solo "Z4" */
    cardio?: ClientCardioView
}

function ManualTimerButton({ defaultTime }: { defaultTime: string | null }) {
    const { startRest } = useWorkoutTimer()
    return (
        <button
            onClick={() => startRest(defaultTime || '90')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-white/[0.08] text-on-dark text-xs font-bold transition-all hover:bg-white/[0.14] active:scale-95"
        >
            <Timer className="w-3.5 h-3.5" />
            Descanso ({defaultTime || '90s'})
        </button>
    )
}

const SIDE_LABEL: Record<string, string> = {
    per_side: 'Por lado',
    alternating: 'Alternado',
}

/** Cards de objetivo por tipo (cardio/movilidad/roller) — los strength quedan intactos (AC3). */
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
        if (block.target_pace_sec_per_km != null) cards.push({ label: 'Pace objetivo', value: `${formatPace(block.target_pace_sec_per_km)} /km` })
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
                <div
                    key={card.label}
                    className={cn(
                        'flex-1 min-w-[64px] rounded-sm border px-2.5 py-2',
                        card.highlight
                            ? 'border-[var(--ember-500)]/30 bg-[var(--ember-500)]/[0.14]'
                            : 'border-[var(--border-inverse)] bg-white/[0.05]'
                    )}
                >
                    <p className={cn('text-[9.5px] font-bold uppercase tracking-wide', card.highlight ? 'text-[var(--ember-300)]' : 'text-on-dark-muted')}>{card.label}</p>
                    <p className={cn('font-mono text-[15px] font-bold tabular-nums mt-0.5', card.highlight ? 'text-[var(--ember-200)]' : 'text-on-dark')}>{card.value}</p>
                </div>
            ))}
        </div>
    )
}

/** Botón de timer según el tipo del bloque: intervalos / hold / cronómetro (AC5). */
function TypedBlockTimerButton({ block, kind }: { block: BlockType; kind: WorkoutKind }) {
    const { startHold, startInterval, startStopwatch } = useWorkoutTimer()

    if (kind === 'cardio') {
        if (block.interval_config && isTimeableInterval(block.interval_config)) {
            const config = block.interval_config
            return (
                <button
                    onClick={() => startInterval(config, block.sets || 1)}
                    className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary/[0.12] text-on-dark border border-[var(--border-inverse)] text-xs font-bold transition-all hover:bg-primary/20 active:scale-95"
                >
                    <Timer className="w-3.5 h-3.5" />
                    Iniciar intervalos
                </button>
            )
        }
        return (
            <button
                onClick={() => startStopwatch()}
                className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary/[0.12] text-on-dark border border-[var(--border-inverse)] text-xs font-bold transition-all hover:bg-primary/20 active:scale-95"
            >
                <Timer className="w-3.5 h-3.5" />
                Cronómetro
            </button>
        )
    }

    if ((kind === 'mobility' || kind === 'roller') && (block.duration_sec ?? 0) > 0) {
        const seconds = block.duration_sec as number
        const label = kind === 'mobility'
            ? `Timer de hold (${seconds}s)`
            : `Timer (${seconds}s)`
        return (
            <button
                onClick={() => startHold(seconds, kind === 'mobility' ? 'Hold' : 'Roller')}
                className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary/[0.12] text-on-dark border border-[var(--border-inverse)] text-xs font-bold transition-all hover:bg-primary/20 active:scale-95"
            >
                <Timer className="w-3.5 h-3.5" />
                {label}
            </button>
        )
    }

    return null
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
    return (
        <div className="grid grid-cols-[auto_5rem_auto] md:grid-cols-[auto_1fr_auto] gap-2 px-2 pb-2 text-[10px] font-bold text-on-dark-muted uppercase tracking-wider border-b border-white/10">
            <div className="w-4 text-center">Set</div>
            <div className="text-center">Seg de hold</div>
            <div className="w-8"></div>
        </div>
    )
}

function isBlockComplete(
    block: BlockType,
    logs: Array<{ block_id: string; set_number: number }>
) {
    let done = 0
    for (let i = 1; i <= block.sets; i += 1) {
        if (logs.some((log) => log.block_id === block.id && log.set_number === i)) done += 1
    }
    return done >= block.sets
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

const WORKOUT_SECTION_TITLE: Record<WorkoutSectionKey, string> = {
    warmup: 'Calentamiento',
    main: 'Bloque Principal',
    cooldown: 'Enfriamiento',
    other: 'Otros bloques',
}

const WORKOUT_SECTION_SUBTITLE: Record<WorkoutSectionKey, string> = {
    warmup: 'Movilidad y activación suave antes del trabajo intenso.',
    main: 'Bloque de mayor esfuerzo: respeta series, reps y descansos.',
    cooldown: 'Baja la intensidad y cierra la sesión con control.',
    other: 'Ejercicios sin sección definida. Si no estás seguro, consulta a tu coach.',
}

/** Subtitulos de las areas system no clasicas (por slug); areas custom van sin subtitulo. */
const SYSTEM_AREA_SUBTITLE: Record<string, string> = {
    mobility: 'Trabajo de movilidad y rango articular, controlado y sin prisa.',
    core_activation: 'Activa la zona media antes del trabajo principal.',
    power: 'Movimientos explosivos: calidad antes que cantidad, descansos completos.',
    conditioning: 'Acondicionamiento metabólico: mantén el ritmo que te indique tu coach.',
}

export function WorkoutExecutionClient({
    plan,
    program,
    logs,
    previousHistory = {},
    coachSlug,
    exerciseMaxes = {},
    activeWeekVariant = null,
    currentWeek = null,
    lastSessionByBlock = {},
    areas = [],
    cardio,
}: Props) {
    const router = useRouter()
    const base = useBasePath(`/c/${coachSlug}`)
    const reducedMotion = useReducedMotion()
    const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const blocks = useMemo(() => [...plan.workout_blocks].sort((a, b) => a.order_index - b.order_index), [plan.workout_blocks])
    const [showTechnique, setShowTechnique] = useState(false)
    const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)
    const [showTimerSettings, setShowTimerSettings] = useState(false)
    const [showCompleted, setShowCompleted] = useState(false)
    const [selectedExercise, setSelectedExercise] = useState<ExerciseType | null>(null)
    const [sessionLogs, setSessionLogs] = useState(logs)
    const [isOffline, setIsOffline] = useState(false)

    useEffect(() => {
        const onOnline = () => setIsOffline(false)
        const onOffline = () => setIsOffline(true)
        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        return () => {
            window.removeEventListener('online', onOnline)
            window.removeEventListener('offline', onOffline)
        }
    }, [])

    const getExercise = (block: BlockType) => (Array.isArray(block.exercises) ? block.exercises[0] : block.exercises) || null

    // F5: agrupacion por AREA con fallback legacy (AC3: plan viejo — solo section o
    // clasicos — produce exactamente los grupos/titulos/subtitulos de siempre).
    const sectioned = useMemo(() => {
        return executionAreaGroupsFor(blocks, areas)
            .map((areaGroup) => ({
                sectionKey: areaGroup.key,
                title: areaGroup.name ?? WORKOUT_SECTION_TITLE[areaGroup.legacySection ?? 'main'],
                subtitle: areaGroup.legacySection
                    ? WORKOUT_SECTION_SUBTITLE[areaGroup.legacySection]
                    : (areaGroup.slug && SYSTEM_AREA_SUBTITLE[areaGroup.slug]) || null,
                muted: areaGroup.legacySection === 'warmup' || areaGroup.legacySection === 'cooldown',
                groups: groupContiguousSupersetRuns(areaGroup.blocks),
            }))
            .filter((section) => section.groups.length > 0)
    }, [blocks, areas])

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

    const isSetLogged = (blockId: string, setNumber: number) => sessionLogs.some((log) => log.block_id === blockId && log.set_number === setNumber)
    const isBlockCompleted = (block: BlockType) => isBlockComplete(block, sessionLogs)

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
            const wasComplete = blocks.some((b) => b.id === payload.blockId && isBlockComplete(b, prev))
            const next = prev.filter((log) => !(log.block_id === payload.blockId && log.set_number === payload.setNumber))
            next.push({
                block_id: payload.blockId,
                set_number: payload.setNumber,
                weight_kg: payload.weightKg,
                reps_done: payload.repsDone,
                rpe: payload.rpe,
                rir: payload.rir,
            })
            const nowComplete = blocks.some((b) => b.id === payload.blockId && isBlockComplete(b, next))
            if (!wasComplete && nowComplete) {
                setTimeout(() => {
                    const nextIncomplete = blocks.find((b) => !isBlockComplete(b, next))
                    if (nextIncomplete) {
                        blockRefs.current
                            .get(nextIncomplete.id)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                }, 350)
            }
            return next
        })
    }
    const handleFinish = () => {
        setShowCompleted(true)
    }

    return (
        <WorkoutTimerProvider>
            <div className="is-workout-page min-h-dvh bg-[var(--ink-950)] text-on-dark">
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    className="sticky top-0 z-20 bg-[var(--ink-950)]/95 pt-safe backdrop-blur border-b border-white/10"
                >
                    <div className="px-4 py-3 md:px-8 max-w-5xl mx-auto w-full">
                        <div className="flex items-center justify-between mb-3 gap-2">
                            <Link href={`${base}/dashboard`} className="p-2 -ml-2 text-on-dark-muted hover:text-on-dark transition-colors shrink-0">
                                <ArrowLeft className="w-6 h-6" />
                            </Link>
                            <div className="min-w-0 px-2 text-center flex-1">
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <h1 className="font-display text-lg md:text-xl font-bold text-on-dark truncate">
                                        {plan.title}
                                    </h1>
                                    {activeWeekVariant != null && (
                                        <span
                                            className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0"
                                            style={{
                                                borderColor: 'color-mix(in srgb, var(--theme-primary) 40%, transparent)',
                                                color: 'var(--theme-primary)',
                                            }}
                                        >
                                            Semana {activeWeekVariant}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-on-dark-muted">
                                    {program?.program_structure_type === 'cycle'
                                        ? `Día ${plan.day_of_week || 1} de ${program.cycle_length || '?'}`
                                        : 'Programa semanal'}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowTimerSettings(true)}
                                    className="flex h-10 w-10 items-center justify-center rounded-control text-on-dark hover:bg-white/[0.08] transition-colors"
                                    title="Descanso y alarma"
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: 'var(--sport-500)' }}
                                initial={{ width: 0 }}
                                animate={{ width: `${completionPct}%` }}
                                transition={reducedMotion ? { duration: 0 } : springs.smooth}
                            />
                        </div>
                        <div className="flex justify-between mt-1.5 font-mono text-[11px] tabular-nums text-on-dark-muted">
                            <span>
                                <strong className="text-on-dark">{completedSetCount}</strong>/{requiredSets} series
                            </span>
                            <span style={{ color: 'var(--sport-400)' }} className="font-bold">
                                {completionPct}%
                            </span>
                        </div>
                    </div>
                </motion.div>

                {isOffline && (
                    <div className="sticky top-[var(--workout-header-h,80px)] z-10 flex items-center gap-2.5 bg-amber-500/90 backdrop-blur-sm px-4 py-2.5 text-amber-950 dark:bg-amber-600/90 dark:text-amber-50">
                        <WifiOff className="w-4 h-4 shrink-0" />
                        <p className="text-xs font-semibold">Sin conexión — los datos se guardarán al reconectar.</p>
                    </div>
                )}

                <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto pb-32">
                    <div className="space-y-6">
                        {sectioned.map((section) => (
                            <section key={section.sectionKey} className="space-y-3">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-1 self-stretch min-h-[1.25rem] rounded-full shrink-0"
                                            style={{
                                                backgroundColor: 'var(--sport-500)',
                                                opacity: section.muted ? 0.4 : 1,
                                            }}
                                        />
                                        <h2 className="text-sm font-bold uppercase tracking-wider text-on-dark-muted shrink-0">
                                            {section.title}
                                        </h2>
                                        <hr className="flex-1 h-px bg-white/10 border-0 min-w-[2rem]" />
                                        <span className="text-xs text-on-dark-muted whitespace-nowrap">
                                            {section.groups.length} bloque(s)
                                        </span>
                                    </div>
                                    {section.subtitle && (
                                        <p className="text-xs leading-relaxed text-on-dark-muted pl-4 border-l-2 border-white/10">
                                            {section.subtitle}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {section.groups.map((group, groupIndex) => (
                                        <div key={group.key} className={cn("rounded-card border border-[var(--border-inverse)] bg-[var(--ink-900)] p-4", group.type === 'superset' && "border-primary/30 bg-primary/[0.08]")}>
                                            <div className="mb-3 space-y-2">
                                                <p className="font-display text-sm font-bold text-on-dark">
                                                    {group.type === 'superset'
                                                        ? `Superserie (grupo ${group.supersetLetter ?? group.key})`
                                                        : `Ejercicio ${groupIndex + 1}`}
                                                </p>
                                                {group.type === 'superset' && (
                                                    <div className="rounded-sm border border-primary/20 bg-primary/[0.10] p-3 text-xs leading-relaxed text-on-dark/90 space-y-2.5">
                                                        <p className="font-semibold text-[var(--sport-300)]">Cómo hacerla</p>
                                                        <ol className="list-decimal space-y-1.5 pl-4 marker:font-semibold">
                                                            <li>
                                                                Completa <strong>una serie</strong> del primer ejercicio y regístrala abajo.
                                                            </li>
                                                            <li>
                                                                Completa <strong>una serie</strong> del siguiente ejercicio y regístrala.
                                                            </li>
                                                            <li>
                                                                Respeta los descansos que indique cada ejercicio; <strong>repite</strong> hasta
                                                                terminar todas las series de <strong>cada</strong> ejercicio.
                                                            </li>
                                                        </ol>
                                                        <p className="border-t border-white/10 pt-2 text-on-dark-muted">
                                                            Cada ejercicio tiene sus propias series: el contador superior suma todas las
                                                            series de la rutina.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-4">
                                                {group.blocks.sort((a, b) => a.order_index - b.order_index).map((block, blockIndex) => {
                                                    const exercise = getExercise(block)
                                                    if (!exercise) return null
                                                    const blockLogs = sessionLogs.filter((log) => log.block_id === block.id)
                                                    const complete = isBlockCompleted(block)
                                                    // Tipo efectivo (specs/movida-entrenamiento): strength ⇒ render
                                                    // EXACTAMENTE el de siempre; cardio/movilidad/roller ⇒ variantes.
                                                    const effType = effectiveExerciseType(block, exercise)
                                                    // Sobrecarga progresiva: peso objetivo EFECTIVO de hoy. weekly_linear usa la
                                                    // semana; double (doble progresión) ancla en la última sesión registrada.
                                                    const lastSession = (() => {
                                                        const ls = lastSessionByBlock[block.id]
                                                        if (!ls || ls.sets.length === 0) return null
                                                        const weightKg = ls.sets.reduce<number | null>(
                                                            (m, s) => (s.weight_kg != null && (m == null || s.weight_kg > m) ? s.weight_kg : m),
                                                            null,
                                                        )
                                                        return { weightKg, repsDone: ls.sets.map((s) => s.reps_done) }
                                                    })()
                                                    const eff = effType === 'strength'
                                                        ? computeEffectiveTarget(block, { currentWeek, weeksToRepeat: program?.weeks_to_repeat, lastSession })
                                                        : null
                                                    const suggestedWeightKg = eff?.weightKg ?? block.target_weight_kg
                                                    return (
                                                        <Fragment key={block.id}>
                                                            {blockIndex > 0 && group.type === 'superset' && (
                                                                <div className="flex items-center justify-center gap-2 py-1 text-[10px] font-bold uppercase tracking-widest text-on-dark-muted">
                                                                    <span className="h-px max-w-[72px] flex-1 bg-white/10" />
                                                                    <span>Luego</span>
                                                                    <span className="h-px max-w-[72px] flex-1 bg-white/10" />
                                                                </div>
                                                            )}
                                                        <motion.div
                                                            layout
                                                            ref={(el) => {
                                                                if (el) blockRefs.current.set(block.id, el)
                                                                else blockRefs.current.delete(block.id)
                                                            }}
                                                            animate={{ opacity: complete ? 0.6 : 1 }}
                                                            transition={reducedMotion ? { duration: 0 } : springs.smooth}
                                                            className={cn(
                                                                'rounded-card border bg-white/[0.03] p-3 space-y-3 relative',
                                                                complete
                                                                    ? 'border-[var(--sport-500)]/30'
                                                                    : 'border-[var(--border-inverse)]'
                                                            )}
                                                        >
                                                            {complete && (
                                                                <motion.div
                                                                    initial={reducedMotion ? false : { scale: 0 }}
                                                                    animate={{ scale: 1 }}
                                                                    transition={reducedMotion ? { duration: 0 } : springs.elastic}
                                                                    className="absolute top-2 right-2 text-[var(--sport-400)]"
                                                                >
                                                                    <CheckCircle2 className="w-6 h-6" />
                                                                </motion.div>
                                                            )}
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0 flex-1">
                                                                    <h3 className="font-display text-[19px] font-black leading-[1.15] tracking-[-0.02em] text-on-dark">{exercise.name}</h3>
                                                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                                        <span className="inline-flex items-center rounded-full bg-[var(--sport-500)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--sport-300)]">
                                                                            {group.type === 'superset'
                                                                                ? `${group.supersetLetter ?? 'SS'}-${blockIndex + 1} · ${exercise.muscle_group}`
                                                                                : exercise.muscle_group}
                                                                        </span>
                                                                        {(exercise.gif_url || exercise.video_url) && (
                                                                            <button onClick={() => openTechnique(exercise)} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark">
                                                                                <Info className="w-3.5 h-3.5" /> Ver técnica
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <span className={cn("shrink-0 text-xs px-2 py-1 rounded-full border", complete ? "bg-[var(--sport-500)]/15 border-[var(--sport-500)]/30 text-[var(--sport-300)]" : "bg-white/[0.06] border-[var(--border-inverse)] text-on-dark-muted")}>
                                                                    {complete ? 'Completado' : 'Pendiente'}
                                                                </span>
                                                            </div>
                                                            {effType === 'strength' ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                <div className="flex-1 min-w-[64px] rounded-sm border border-[var(--border-inverse)] bg-white/[0.05] px-2.5 py-2">
                                                                    <p className="text-[9.5px] font-bold uppercase tracking-wide text-on-dark-muted">Series x reps</p>
                                                                    <p className="font-mono text-[15px] font-bold tabular-nums mt-0.5 text-on-dark">{block.sets} x {block.reps}</p>
                                                                </div>
                                                                {block.target_weight_kg != null && (() => {
                                                                    const highlight = eff != null && eff.status !== 'flat'
                                                                    const showBase = eff != null && eff.weightKg != null && eff.baseWeightKg != null && eff.weightKg !== eff.baseWeightKg
                                                                    const label = eff?.status === 'holding' ? 'Peso a mantener' : eff?.status === 'progressed' ? 'Peso hoy' : 'Peso'
                                                                    return (
                                                                        <div className={cn('flex-1 min-w-[64px] rounded-sm border px-2.5 py-2', highlight ? 'border-emerald-500/40 bg-emerald-500/[0.12]' : 'border-[var(--border-inverse)] bg-white/[0.05]')}>
                                                                            <p className={cn('text-[9.5px] font-bold uppercase tracking-wide', highlight ? 'text-emerald-300' : 'text-on-dark-muted')}>{label}</p>
                                                                            <p className={cn('font-mono text-[15px] font-bold tabular-nums mt-0.5', highlight ? 'text-emerald-300' : 'text-on-dark')}>
                                                                                {(eff?.weightKg ?? block.target_weight_kg)}kg
                                                                            </p>
                                                                            {showBase && <p className="text-[9px] leading-none text-on-dark-muted mt-0.5">base {eff!.baseWeightKg}kg</p>}
                                                                        </div>
                                                                    )
                                                                })()}
                                                                {block.rest_time && <div className="flex-1 min-w-[64px] rounded-sm border border-[var(--border-inverse)] bg-white/[0.05] px-2.5 py-2"><p className="text-[9.5px] font-bold uppercase tracking-wide text-on-dark-muted">Descanso</p><p className="font-mono text-[15px] font-bold tabular-nums mt-0.5 text-on-dark">{block.rest_time}</p></div>}
                                                                {block.tempo && <div className="flex-1 min-w-[64px] rounded-sm border border-[var(--border-inverse)] bg-white/[0.05] px-2.5 py-2"><p className="text-[9.5px] font-bold uppercase tracking-wide text-on-dark-muted">Tempo</p><p className="font-mono text-[15px] font-bold tabular-nums mt-0.5 text-on-dark">{block.tempo}</p></div>}
                                                                {block.rir && <div className="flex-1 min-w-[64px] rounded-sm border border-[var(--border-inverse)] bg-white/[0.05] px-2.5 py-2"><p className="text-[9.5px] font-bold uppercase tracking-wide text-on-dark-muted">RIR</p><p className="font-mono text-[15px] font-bold tabular-nums mt-0.5 text-[var(--sport-300)]">{block.rir}</p></div>}
                                                            </div>
                                                            ) : (
                                                                <>
                                                                    <TypedTargetGrid block={block} kind={effType} cardio={cardio} />
                                                                    <div className="flex justify-end">
                                                                        <TypedBlockTimerButton block={block} kind={effType} />
                                                                    </div>
                                                                </>
                                                            )}
                                                            {/* Sobrecarga progresiva. Para PESO con motor (weekly_linear) muestra el objetivo
                                                                calculado de la semana; si no, cae al cartel-instrucción (reps, o sin semana). */}
                                                            {effType === 'strength' && block.progression_type && block.progression_value != null && (block.progression_type !== 'weight' || block.target_weight_kg != null) && (
                                                                <div className="flex items-center gap-2 rounded-sm border border-emerald-500/25 bg-emerald-500/[0.12] px-3 py-2.5 text-sm">
                                                                    <TrendingUp className="w-4 h-4 shrink-0 text-emerald-300" />
                                                                    <p className="text-emerald-100/95">
                                                                        {(() => {
                                                                            const v = block.progression_value
                                                                            const S = ({ children }: { children: React.ReactNode }) => (
                                                                                <span className="font-semibold text-emerald-200">{children}</span>
                                                                            )
                                                                            // reps, o modo sin motor → cartel-instrucción simple.
                                                                            if (block.progression_type !== 'weight' || !eff?.modeImplemented) {
                                                                                return (<><S>Sobrecarga progresiva:</S> sube <span className="font-bold">+{v} {block.progression_type === 'weight' ? 'kg cada semana' : 'rep cada sesión'}</span></>)
                                                                            }
                                                                            if (eff.mode === 'double') {
                                                                                if (eff.status === 'holding') {
                                                                                    return (<><S>Doble progresión:</S> mantené <span className="font-bold">{eff.weightKg} kg</span> y completá <span className="font-bold">{eff.repsTopToUnlock} reps</span> en todas las series para subir</>)
                                                                                }
                                                                                if (eff.status === 'progressed') {
                                                                                    return eff.isProgressed ? (
                                                                                        <><S>Doble progresión · ¡subiste!</S> objetivo <span className="font-bold">{eff.weightKg} kg</span> <span className="text-emerald-300/70">(base {eff.baseWeightKg})</span></>
                                                                                    ) : (
                                                                                        <><S>Doble progresión:</S> objetivo <span className="font-bold">{eff.weightKg} kg</span> <span className="text-emerald-300/70">(aún por debajo de la base {eff.baseWeightKg})</span></>
                                                                                    )
                                                                                }
                                                                                return (<><S>Doble progresión:</S> subí <span className="font-bold">+{v} kg</span> cuando completes <span className="font-bold">{eff.repsTopToUnlock} reps</span> en todas las series</>)
                                                                            }
                                                                            // weekly_linear
                                                                            if (eff.isProgressed && currentWeek != null) {
                                                                                return (<><S>Sobrecarga progresiva · Semana {currentWeek}:</S> objetivo <span className="font-bold">{eff.weightKg} kg</span> <span className="text-emerald-300/70">(base {eff.baseWeightKg} +{eff.addedKg})</span></>)
                                                                            }
                                                                            return (<><S>Sobrecarga progresiva:</S> sube <span className="font-bold">+{v} kg cada semana</span> <span className="text-emerald-300/70">(esta semana arrancás en la base)</span></>)
                                                                        })()}
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {effType !== 'strength' && block.instructions && (
                                                                <div className="flex gap-2 rounded-sm border border-primary/20 bg-primary/[0.10] px-3 py-2.5 text-sm">
                                                                    <Info className="w-3.5 h-3.5 shrink-0 text-[var(--sport-300)] mt-0.5" />
                                                                    <div>
                                                                        <p className="font-semibold text-[var(--sport-300)]">Instrucciones</p>
                                                                        <p className="text-on-dark/90">{block.instructions}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {block.notes && (
                                                                <div className="flex gap-2 rounded-sm border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm">
                                                                    <Quote className="w-3.5 h-3.5 shrink-0 text-amber-300 mt-0.5" />
                                                                    <div>
                                                                        <p className="font-semibold text-amber-300">Nota del coach</p>
                                                                        <p className="text-amber-100/90">{block.notes}</p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {effType === 'strength' && previousHistory[exercise.id] && previousHistory[exercise.id].length > 0 && (
                                                                <div className="rounded-sm bg-white/[0.04] px-3 py-2.5">
                                                                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-on-dark-muted">
                                                                        <History className="w-3 h-3 shrink-0" />
                                                                        Sesión anterior ·{' '}
                                                                        {formatRelativeDate(previousHistory[exercise.id][0].date)}
                                                                    </p>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {previousHistory[exercise.id].map((log, idx) => (
                                                                            <span key={idx} className="font-mono text-xs px-2 py-1 rounded bg-white/[0.06] border border-[var(--border-inverse)] text-on-dark">
                                                                                S{idx + 1}: {log.weight_kg ? `${log.weight_kg}kg` : '-'} x {log.reps_done || '-'}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="rounded-card border border-[var(--border-inverse)] bg-white/[0.02] p-2">
                                                                {effType === 'strength' ? (
                                                                <div className="grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 px-2 pb-2 text-[10px] font-bold text-on-dark-muted uppercase tracking-wider border-b border-white/10">
                                                                    <div className="w-4 text-center">Set</div>
                                                                    <div className="text-center">Kg</div>
                                                                    <div className="text-center">Reps</div>
                                                                    <div className="w-8"></div>
                                                                </div>
                                                                ) : (
                                                                    <TypedLogHeader kind={effType} />
                                                                )}
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
                                                                                suggestedWeightKg={suggestedWeightKg}
                                                                                autoTimerEnabled={autoTimerEnabled}
                                                                                mode={effType}
                                                                                onLogged={handleLogged}
                                                                            />
                                                                        )
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                        </Fragment>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>

                <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[var(--ink-950)]/90 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] backdrop-blur-xl">
                    <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
                        <ManualTimerButton defaultTime={'90'} />
                        <button
                            onClick={handleFinish}
                            className="h-12 px-5 flex items-center gap-2 rounded-control bg-primary text-primary-foreground font-bold transition-transform active:scale-[0.99]"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Finalizar entrenamiento
                        </button>
                    </div>
                </div>

                {/* Descanso, alarma y auto-timer (tuerca header / footer) */}
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