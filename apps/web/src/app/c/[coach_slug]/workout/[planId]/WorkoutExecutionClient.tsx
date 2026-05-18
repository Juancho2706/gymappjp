'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Zap, Info, Dumbbell, Timer, X, Settings, CheckCircle2, WifiOff } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { LogSetForm } from './LogSetForm'
import { WorkoutTimerProvider, useWorkoutTimer } from './WorkoutTimerProvider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'
import { WorkoutSummaryOverlay } from './WorkoutSummaryOverlay'
import { WorkoutTimerSettingsPanel } from './WorkoutTimerSettingsPanel'
import { cn } from '@/lib/utils'
import { formatRelativeDate } from '@/lib/date-utils'
import { springs } from '@/lib/animation-presets'
import {
    effectiveWorkoutSection,
    groupContiguousSupersetRuns,
    WORKOUT_SECTION_ORDER,
    type WorkoutSectionKey,
} from '@/lib/workout-block-grouping'

interface ExerciseType {
    id: string
    name: string
    muscle_group: string
    video_url: string | null
    gif_url: string | null
    instructions: string[] | null
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
    superset_group: string | null
    progression_type: 'weight' | 'reps' | null
    progression_value: number | null
    is_override: boolean
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
    }>
    previousHistory?: Record<string, { weight_kg: number | null, reps_done: number | null, date: string }[]>
    coachSlug: string
    exerciseMaxes?: Record<string, number>
    activeWeekVariant?: 'A' | 'B' | null
}

function ManualTimerButton({ defaultTime }: { defaultTime: string | null }) {
    const { startRest } = useWorkoutTimer()
    return (
        <button
            onClick={() => startRest(defaultTime || '90')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-bold transition-all hover:bg-secondary/80 active:scale-95"
        >
            <Timer className="w-3.5 h-3.5" />
            Descanso ({defaultTime || '90s'})
        </button>
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

export function WorkoutExecutionClient({
    plan,
    program,
    logs,
    previousHistory = {},
    coachSlug,
    exerciseMaxes = {},
    activeWeekVariant = null,
}: Props) {
    const router = useRouter()
    const { t } = useTranslation()
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

    const sectioned = useMemo(() => {
        return WORKOUT_SECTION_ORDER.map((sectionKey) => {
            const sectionBlocks = blocks
                .filter((block) => effectiveWorkoutSection(block.section) === sectionKey)
                .sort((a, b) => a.order_index - b.order_index)
            const grouped = groupContiguousSupersetRuns(sectionBlocks)
            return { sectionKey, title: WORKOUT_SECTION_TITLE[sectionKey], groups: grouped }
        }).filter((section) => section.groups.length > 0)
    }, [blocks])

    if (!blocks.length) {
        return (
            <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                    <Dumbbell className="w-8 h-8" />
                </div>
                <h1 className="text-xl font-bold text-foreground mb-2">Rutina sin ejercicios</h1>
                <p className="text-sm text-muted-foreground mb-6">Esta rutina ya no tiene ejercicios asociados. Tu coach probablemente esté actualizando tu plan.</p>
                <Link href={`/c/${coachSlug}/dashboard`} className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
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
            <div className="min-h-dvh bg-background">
                <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    className="sticky top-0 z-20 bg-background/95 pt-safe backdrop-blur border-b border-border/60"
                >
                    <div className="px-4 py-3 md:px-8 max-w-5xl mx-auto w-full">
                        <div className="flex items-center justify-between mb-3 gap-2">
                            <Link href={`/c/${coachSlug}/dashboard`} className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                                <ArrowLeft className="w-6 h-6" />
                            </Link>
                            <div className="min-w-0 px-2 text-center flex-1">
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <h1 className="text-lg md:text-xl font-bold text-foreground truncate">
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
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    {program?.program_structure_type === 'cycle'
                                        ? `Día ${plan.day_of_week || 1} de ${program.cycle_length || '?'}`
                                        : 'Programa semanal'}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <InfoTooltip content={t('section.workoutExecution')} />
                                <button
                                    type="button"
                                    onClick={() => setShowTimerSettings(true)}
                                    className="p-2 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                                    title="Descanso y alarma"
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                                <ThemeToggle />
                            </div>
                        </div>

                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: 'var(--theme-primary)' }}
                                initial={{ width: 0 }}
                                animate={{ width: `${completionPct}%` }}
                                transition={reducedMotion ? { duration: 0 } : springs.smooth}
                            />
                        </div>
                        <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                            <span>
                                <strong className="text-foreground">{completedSetCount}</strong>/{requiredSets} series
                            </span>
                            <span style={{ color: 'var(--theme-primary)' }} className="font-bold">
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
                                                backgroundColor: 'var(--theme-primary)',
                                                opacity:
                                                    section.sectionKey === 'warmup' || section.sectionKey === 'cooldown'
                                                        ? 0.4
                                                        : 1,
                                            }}
                                        />
                                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground shrink-0">
                                            {section.title}
                                        </h2>
                                        <hr className="flex-1 h-px bg-border/50 border-0 min-w-[2rem]" />
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                            {section.groups.length} bloque(s)
                                        </span>
                                    </div>
                                    <p className="text-xs leading-relaxed text-muted-foreground pl-4 border-l-2 border-border/60">
                                        {WORKOUT_SECTION_SUBTITLE[section.sectionKey]}
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    {section.groups.map((group, groupIndex) => (
                                        <div key={group.key} className={cn("rounded-2xl border bg-card p-4", group.type === 'superset' && "border-primary/30 bg-primary/5")}>
                                            <div className="mb-3 space-y-2">
                                                <p className="text-sm font-semibold">
                                                    {group.type === 'superset'
                                                        ? `Superserie (grupo ${group.supersetLetter ?? group.key})`
                                                        : `Ejercicio ${groupIndex + 1}`}
                                                </p>
                                                {group.type === 'superset' && (
                                                    <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-3 text-xs leading-relaxed text-foreground/90 space-y-2.5">
                                                        <p className="font-semibold text-primary">Cómo hacerla</p>
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
                                                        <p className="border-t border-border/50 pt-2 text-muted-foreground">
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
                                                    return (
                                                        <Fragment key={block.id}>
                                                            {blockIndex > 0 && group.type === 'superset' && (
                                                                <div className="flex items-center justify-center gap-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                                    <span className="h-px max-w-[72px] flex-1 bg-border" />
                                                                    <span>Luego</span>
                                                                    <span className="h-px max-w-[72px] flex-1 bg-border" />
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
                                                                'rounded-xl border bg-background/60 p-3 space-y-3 relative',
                                                                complete
                                                                    ? 'border-emerald-500/30'
                                                                    : 'border-border/70'
                                                            )}
                                                        >
                                                            {complete && (
                                                                <motion.div
                                                                    initial={reducedMotion ? false : { scale: 0 }}
                                                                    animate={{ scale: 1 }}
                                                                    transition={reducedMotion ? { duration: 0 } : springs.elastic}
                                                                    className="absolute top-2 right-2 text-emerald-500"
                                                                >
                                                                    <CheckCircle2 className="w-6 h-6" />
                                                                </motion.div>
                                                            )}
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                                                        {group.type === 'superset'
                                                                            ? `${group.supersetLetter ?? 'SS'}-${blockIndex + 1}`
                                                                            : exercise.muscle_group}
                                                                    </p>
                                                                    <h3 className="text-lg font-bold">{exercise.name}</h3>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {(exercise.gif_url || exercise.video_url) && (
                                                                        <button onClick={() => openTechnique(exercise)} aria-label="Ver técnica del ejercicio" className="h-9 w-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
                                                                            <Info className="w-4 h-4" />
                                                                        </button>
                                                                    )}
                                                                    <span className={cn("text-xs px-2 py-1 rounded-full border", complete ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600" : "bg-muted border-border text-muted-foreground")}>
                                                                        {complete ? 'Completado' : 'Pendiente'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                                                <div className="rounded-lg border p-2 text-center">
                                                                    <p className="text-[10px] uppercase text-muted-foreground">Series x reps</p>
                                                                    <p className="font-semibold">{block.sets} x {block.reps}</p>
                                                                </div>
                                                                {block.target_weight_kg != null && <div className="rounded-lg border p-2 text-center"><p className="text-[10px] uppercase text-muted-foreground">Peso</p><p className="font-semibold">{block.target_weight_kg}kg</p></div>}
                                                                {block.rest_time && <div className="rounded-lg border p-2 text-center"><p className="text-[10px] uppercase text-muted-foreground">Descanso</p><p className="font-semibold">{block.rest_time}</p></div>}
                                                                {block.tempo && <div className="rounded-lg border p-2 text-center"><p className="text-[10px] uppercase text-muted-foreground">Tempo</p><p className="font-semibold">{block.tempo}</p></div>}
                                                                {block.rir && <div className="rounded-lg border p-2 text-center"><p className="text-[10px] uppercase text-muted-foreground">RIR</p><p className="font-semibold">{block.rir}</p></div>}
                                                            </div>
                                                            {block.notes && (
                                                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm">
                                                                    <p className="font-semibold text-amber-700 dark:text-amber-300">Nota del coach</p>
                                                                    <p className="text-amber-900/80 dark:text-amber-200/90">{block.notes}</p>
                                                                </div>
                                                            )}
                                                            {previousHistory[exercise.id] && previousHistory[exercise.id].length > 0 && (
                                                                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">
                                                                        Sesión anterior ·{' '}
                                                                        {formatRelativeDate(previousHistory[exercise.id][0].date)}
                                                                    </p>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {previousHistory[exercise.id].map((log, idx) => (
                                                                            <span key={idx} className="text-xs px-2 py-1 rounded bg-background border border-border">
                                                                                S{idx + 1}: {log.weight_kg ? `${log.weight_kg}kg` : '-'} x {log.reps_done || '-'}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="rounded-xl border border-border p-2">
                                                                <div className="grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 px-2 pb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/50">
                                                                    <div className="w-4 text-center">Set</div>
                                                                    <div className="text-center">Kg</div>
                                                                    <div className="text-center">Reps</div>
                                                                    <div className="w-8"></div>
                                                                </div>
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

                <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/20 bg-background/90 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] backdrop-blur-xl">
                    <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
                        <ManualTimerButton defaultTime={'90'} />
                        <button
                            onClick={handleFinish}
                            className="h-12 px-5 flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Finalizar entrenamiento
                        </button>
                    </div>
                </div>

                {/* Descanso, alarma y auto-timer (tuerca header / footer) */}
                <Dialog open={showTimerSettings} onOpenChange={setShowTimerSettings}>
                    <DialogContent className="max-w-sm rounded-3xl p-6 bg-card border-border max-h-[min(90dvh,32rem)] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold">Descanso y alarma</DialogTitle>
                        </DialogHeader>
                        <WorkoutTimerSettingsPanel
                            autoTimerEnabled={autoTimerEnabled}
                            onToggleAutoTimer={toggleAutoTimer}
                        />
                        <button
                            type="button"
                            onClick={() => setShowTimerSettings(false)}
                            className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-bold"
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
                        onDone={() => router.push(`/c/${coachSlug}/dashboard`)}
                    />,
                    document.body
                ) : null}

                {/* Technique Modal */}
                <Dialog open={showTechnique} onOpenChange={setShowTechnique}>
                    <DialogContent 
                        showCloseButton={false}
                        className="bg-card border-border rounded-3xl overflow-hidden p-0 max-w-md w-[90vw] max-h-[85vh] flex flex-col focus:outline-none"
                    >
                        {(() => {
                            const exercise = selectedExercise
                            if (!exercise) return null
                            const isYouTube = exercise.video_url?.includes('youtube.com') || exercise.video_url?.includes('youtu.be');
                            
                            const getYouTubeId = (url: string) => {
                                const match = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
                                return match ? match[1] : null;
                            };
                            
                            const ytId = isYouTube && exercise.video_url ? getYouTubeId(exercise.video_url) : null;
                            
                            if (isYouTube && ytId) {
                                return (
                                    <div className="relative w-full h-48 md:h-64 shrink-0 bg-black/5 dark:bg-black/20 flex items-center justify-center">
                                        <iframe
                                            className="w-full h-full"
                                            src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&modestbranding=1&rel=0&showinfo=0&controls=1`}
                                            title={exercise.name}
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                            allowFullScreen
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
                                    <DialogTitle className="text-xl font-extrabold text-foreground">{selectedExercise?.name}</DialogTitle>
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
                                className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-bold shrink-0"
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