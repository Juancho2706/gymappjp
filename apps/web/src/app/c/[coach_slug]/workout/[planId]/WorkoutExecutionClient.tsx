'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info, Dumbbell, HeartPulse, Move, GitCommit, Timer, TrendingUp, History, Quote, X, Settings, CheckCircle2, WifiOff, Play, ChevronDown, type LucideIcon } from 'lucide-react'
import { computeEffectiveTarget } from '@/lib/workout/progression'
import { LogSetForm } from './LogSetForm'
import { WorkoutTimerProvider, useWorkoutTimer, parseRestTime } from './WorkoutTimerProvider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import Image from 'next/image'
import { WorkoutSummaryOverlay } from './WorkoutSummaryOverlay'
import { WorkoutTimerSettingsPanel } from './WorkoutTimerSettingsPanel'
import { cn } from '@/lib/utils'
import { formatRelativeDate } from '@/lib/date-utils'
import { springs } from '@/lib/animation-presets'
import { useBasePath } from '@/components/client/BasePathProvider'
import { useScreenWakeLock } from '@/lib/client/use-screen-wake-lock'
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
        note?: string | null
        actual_duration_sec?: number | null
        actual_distance_m?: number | null
        actual_hold_sec?: number | null
        actual_avg_hr?: number | null
    }>
    previousHistory?: Record<string, { weight_kg: number | null, reps_done: number | null, date: string }[]>
    coachSlug: string
    exerciseMaxes?: Record<string, number>
    /** Fecha (ISO) del máximo histórico por ejercicio — el overlay muestra "superaste tus X kg del …". */
    exerciseMaxDates?: Record<string, string>
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
            className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-control bg-[var(--ember-500)]/15 text-[var(--ember-200)] border border-[var(--ember-500)]/25 text-xs font-bold transition-all hover:bg-[var(--ember-500)]/25 active:scale-95"
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

/** Meta por tipo de bloque para el chip de tipo (color + label + icono tipado), estilo CD. */
const RUT_TYPE_META: Record<WorkoutKind, { label: string; color: string; icon: LucideIcon }> = {
    strength: { label: 'Fuerza', color: 'var(--sport-500)', icon: Dumbbell },
    cardio: { label: 'Cardio', color: 'var(--ember-500)', icon: HeartPulse },
    mobility: { label: 'Movilidad', color: '#14b8a6', icon: Move },
    roller: { label: 'Roller', color: '#8b5cf6', icon: GitCommit },
}

/** Icono tipado por tipo de bloque, coloreado con el color del tipo (kit alumno-rutina §183). */
function TypeGlyph({ kind, className = 'h-3 w-3' }: { kind: WorkoutKind; className?: string }) {
    const Icon = RUT_TYPE_META[kind].icon
    return <Icon className={className} style={{ color: RUT_TYPE_META[kind].color }} />
}

/** Nombre de la fase activa del programa (semanas de program_phases acumuladas vs semana actual). */
function currentPhaseName(
    phases: { name: string; weeks: number }[] | null | undefined,
    week: number | null | undefined,
): string | null {
    if (!phases?.length || week == null) return null
    let acc = 0
    for (const ph of phases) {
        acc += ph.weeks
        if (week <= acc) return ph.name
    }
    return phases[phases.length - 1]?.name ?? null
}

/** mm:ss desde segundos (cronómetro de sesión). */
function fmtElapsed(totalSec: number): string {
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

/** Volumen de sesión compacto (kg acumulados → "850 kg" / "5.2 t"). null si 0. */
function fmtVolume(kg: number): string | null {
    if (kg <= 0) return null
    if (kg >= 1000) return `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)} t`
    return `${Math.round(kg)} kg`
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {cards.map((card) => (
                <div
                    key={card.label}
                    className={cn(
                        'rounded-sm border px-2.5 py-2',
                        card.highlight
                            ? 'border-[var(--ember-500)]/30 bg-[var(--ember-500)]/[0.14]'
                            : 'border-[var(--border-inverse)] bg-white/[0.05]'
                    )}
                >
                    <p className={cn('text-[9.5px] font-bold uppercase tracking-[0.06em]', card.highlight ? 'text-[var(--ember-300)]' : 'text-on-dark-muted')}>{card.label}</p>
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
                    className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-control bg-[var(--sport-500)]/[0.12] text-on-dark border border-[var(--border-inverse)] text-xs font-bold transition-all hover:bg-[var(--sport-500)]/20 active:scale-95"
                >
                    <Timer className="w-3.5 h-3.5" />
                    Iniciar intervalos
                </button>
            )
        }
        return (
            <button
                onClick={() => startStopwatch()}
                className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-control bg-[var(--sport-500)]/[0.12] text-on-dark border border-[var(--border-inverse)] text-xs font-bold transition-all hover:bg-[var(--sport-500)]/20 active:scale-95"
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
                className="flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-control bg-[var(--sport-500)]/[0.12] text-on-dark border border-[var(--border-inverse)] text-xs font-bold transition-all hover:bg-[var(--sport-500)]/20 active:scale-95"
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

// ─── Superserie: ejecución intercalada por rondas (F2) ───────────────────────

const SUPERSET_MEMBER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

type SessionLog = { block_id: string; set_number: number }

/** Info compartida de una superserie (una instancia por grupo, referenciada por cada miembro). */
interface SupersetInfo {
    members: BlockType[]
    /** Letra visible por bloque (A, B, C… por posición dentro del grupo). */
    letterByBlock: Map<string, string>
    /** Descanso completo del grupo = max de rest_seconds de los miembros. */
    groupRestSeconds: number
    /** Rondas = max de series entre los miembros. */
    maxSets: number
}

/** Aplica un log optimista (dedup por block+set) — misma forma que empuja `handleLogged`. */
function applyOptimisticLog<T extends SessionLog>(
    prev: T[],
    payload: { blockId: string; setNumber: number; weightKg: number | null; repsDone: number | null; rpe: number | null; rir: number | null; note?: string | null },
): T[] {
    const next = prev.filter((log) => !(log.block_id === payload.blockId && log.set_number === payload.setNumber))
    next.push({
        block_id: payload.blockId,
        set_number: payload.setNumber,
        weight_kg: payload.weightKg,
        reps_done: payload.repsDone,
        rpe: payload.rpe,
        rir: payload.rir,
        note: payload.note ?? null,
    } as unknown as T)
    return next
}

/** Orden de presentación intercalado: ronda 1 (A,B,C…), ronda 2 (A,B,C…)… saltando miembros sin serie. */
function buildRoundOrder(members: BlockType[]): { blockId: string; set: number }[] {
    const maxSets = members.reduce((mx, m) => Math.max(mx, m.sets), 0)
    const order: { blockId: string; set: number }[] = []
    for (let r = 1; r <= maxSets; r += 1) {
        for (const m of members) {
            if (m.sets >= r) order.push({ blockId: m.id, set: r })
        }
    }
    return order
}

/** ¿Está completa la ronda `round`? Todos los miembros con serie en esa ronda deben tener log. */
function isRoundComplete(
    members: BlockType[],
    round: number,
    logs: SessionLog[],
    extraLoggedBlockId?: string,
): boolean {
    for (const m of members) {
        if (m.sets < round) continue
        const logged =
            (extraLoggedBlockId != null && m.id === extraLoggedBlockId) ||
            logs.some((l) => l.block_id === m.id && l.set_number === round)
        if (!logged) return false
    }
    return true
}

/** Siguiente serie incompleta en orden intercalado (tras la recién logueada; envuelve si hace falta). */
function findNextIncompleteInRounds(
    order: { blockId: string; set: number }[],
    logs: SessionLog[],
    justLogged: { blockId: string; setNumber: number },
): { blockId: string; set: number } | null {
    const isLogged = (p: { blockId: string; set: number }) =>
        logs.some((l) => l.block_id === p.blockId && l.set_number === p.set)
    const idx = order.findIndex((p) => p.blockId === justLogged.blockId && p.set === justLogged.setNumber)
    for (let i = idx + 1; i < order.length; i += 1) if (!isLogged(order[i])) return order[i]
    for (let i = 0; i <= idx && i < order.length; i += 1) if (!isLogged(order[i])) return order[i]
    return null
}

/** Separador compacto (·) entre segmentos de la línea de prescripción. */
const Sep = () => <span className="text-on-dark-muted/40">·</span>

/** Chip compacto de sobrecarga progresiva (reemplaza el banner verboso). null ⇒ sin chip. */
function overloadChipLabel(
    block: BlockType,
    eff: ReturnType<typeof computeEffectiveTarget> | null,
    currentWeek: number | null | undefined,
): string | null {
    if (!block.progression_type || block.progression_value == null) return null
    if (block.progression_type === 'weight' && block.target_weight_kg == null) return null
    const v = block.progression_value
    if (block.progression_type !== 'weight' || !eff?.modeImplemented) {
        return block.progression_type === 'weight' ? `+${v} kg/sem` : `+${v} rep/ses`
    }
    if (eff.mode === 'double') {
        return eff.status === 'holding' ? `Mantené ${eff.weightKg} kg` : `Objetivo ${eff.weightKg} kg`
    }
    if (eff.isProgressed && currentWeek != null) return `Sem ${currentWeek} · ${eff.weightKg} kg`
    return `+${v} kg/sem`
}

/** Explicación completa de la sobrecarga (va a "Detalles", no a la card). */
function overloadDetailText(
    block: BlockType,
    eff: ReturnType<typeof computeEffectiveTarget> | null,
    currentWeek: number | null | undefined,
): string | null {
    if (!block.progression_type || block.progression_value == null) return null
    if (block.progression_type === 'weight' && block.target_weight_kg == null) return null
    const v = block.progression_value
    if (block.progression_type !== 'weight' || !eff?.modeImplemented) {
        return `Sube +${v} ${block.progression_type === 'weight' ? 'kg cada semana' : 'rep cada sesión'}.`
    }
    if (eff.mode === 'double') {
        if (eff.status === 'holding') return `Doble progresión: mantené ${eff.weightKg} kg y completá ${eff.repsTopToUnlock} reps en todas las series para subir.`
        if (eff.status === 'progressed') {
            return eff.isProgressed
                ? `Doble progresión: ¡subiste! Objetivo ${eff.weightKg} kg (base ${eff.baseWeightKg}).`
                : `Doble progresión: objetivo ${eff.weightKg} kg (aún por debajo de la base ${eff.baseWeightKg}).`
        }
        return `Doble progresión: subí +${v} kg cuando completes ${eff.repsTopToUnlock} reps en todas las series.`
    }
    if (eff.isProgressed && currentWeek != null) return `Semana ${currentWeek}: objetivo ${eff.weightKg} kg (base ${eff.baseWeightKg} +${eff.addedKg}).`
    return `Sube +${v} kg cada semana (esta semana arrancás en la base).`
}

interface SupersetGroupCardProps {
    info: SupersetInfo
    sessionLogs: Props['logs']
    currentWeek: number | null
    weeksToRepeat?: number
    previousHistory: Record<string, { weight_kg: number | null; reps_done: number | null; date: string }[]>
    lastSessionByBlock: Record<string, { date: string; sets: Array<{ weight_kg: number | null; reps_done: number | null }> }>
    cardio?: ClientCardioView
    autoTimerEnabled: boolean
    nextCue: { blockId: string; set: number } | null
    onLogged: (payload: { blockId: string; setNumber: number; weightKg: number | null; repsDone: number | null; rpe: number | null; rir: number | null; note?: string | null }) => void
    openTechnique: (exercise: ExerciseType | null) => void
    registerRowRef: (blockId: string, setNumber: number, el: HTMLDivElement | null) => void
    getExercise: (block: BlockType) => ExerciseType | null
}

/**
 * Card de superserie con ejecución HONESTA por rondas (F2): A1 → B1 → A2 → B2…
 * Cada fila es el MISMO LogSetForm (identidad bloque+set intacta); solo cambia el ORDEN de
 * presentación (rondas) y la guía visual (divisor por ronda + etiqueta A1/B1 + fila "sigue").
 * El descanso completo del grupo se dispara al cerrar la ronda (via `supersetRest`).
 */
function SupersetGroupCard({
    info,
    sessionLogs,
    currentWeek,
    weeksToRepeat,
    previousHistory,
    lastSessionByBlock,
    cardio,
    autoTimerEnabled,
    nextCue,
    onLogged,
    openTechnique,
    registerRowRef,
    getExercise,
}: SupersetGroupCardProps) {
    const { members, letterByBlock, groupRestSeconds, maxSets } = info
    const reducedMotion = useReducedMotion()
    const [howToOpen, setHowToOpen] = useState(false)

    const memberVMs = members
        .map((block) => {
            const exercise = getExercise(block)
            if (!exercise) return null
            const effType = effectiveExerciseType(block, exercise)
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
                ? computeEffectiveTarget(block, { currentWeek, weeksToRepeat, lastSession })
                : null
            const suggestedWeightKg = eff?.weightKg ?? block.target_weight_kg
            return {
                block,
                exercise,
                effType,
                eff,
                suggestedWeightKg,
                complete: isBlockComplete(block, sessionLogs),
                letter: letterByBlock.get(block.id) ?? '?',
            }
        })
        .filter((m): m is NonNullable<typeof m> => m != null)

    if (memberVMs.length < 2) return null

    const firstLabel = `${memberVMs[0].letter}1`
    const secondLabel = `${memberVMs[1].letter}1`

    return (
        <div className="rounded-card border border-[var(--sport-500)]/30 bg-[var(--sport-500)]/[0.05] p-4 space-y-3">
            <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <p className="font-display text-sm font-bold text-on-dark">Superserie</p>
                        <span className="text-[11px] font-semibold text-on-dark-muted">
                            {memberVMs.length} ejercicios · {maxSets} ronda{maxSets === 1 ? '' : 's'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setHowToOpen((o) => !o)}
                        aria-expanded={howToOpen}
                        className="flex h-8 items-center gap-1 rounded-control px-2 text-[11px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark"
                    >
                        Cómo hacerla
                        <ChevronDown className={cn('h-3 w-3 transition-transform', howToOpen && 'rotate-180')} />
                    </button>
                </div>
                <p className="text-[12px] leading-snug text-on-dark-muted">
                    Rondas: <strong className="text-on-dark">{firstLabel}</strong> → <strong className="text-on-dark">{secondLabel}</strong> sin descanso, descansá al cerrar la ronda.
                </p>
                <AnimatePresence initial={false}>
                    {howToOpen && (
                        <motion.div
                            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                            transition={reducedMotion ? { duration: 0 } : { duration: 0.25 }}
                            className="overflow-hidden"
                        >
                            <p className="rounded-sm border border-[var(--border-inverse)] bg-white/[0.03] p-3 text-[12px] leading-relaxed text-on-dark/90">
                                Trabajá por rondas: hacé <strong>{firstLabel}</strong>, seguí con <strong>{secondLabel}</strong> sin
                                descanso, y descansá al <strong>cerrar la ronda</strong>. Repetí hasta completar todas las series.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Leyenda: referencia rápida de cada ejercicio (objetivo, técnica, notas). */}
            <div className="space-y-2">
                {memberVMs.map((m) => (
                    <div
                        key={m.block.id}
                        className="rounded-card border border-[var(--border-inverse)] bg-white/[0.03] p-3 space-y-2"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sport-500)]/15 text-[12px] font-black text-[var(--sport-300)]">
                                    {m.letter}
                                </span>
                                <div className="min-w-0">
                                    <h3 className="font-display text-[17px] font-black leading-[1.15] tracking-[-0.02em] text-on-dark">
                                        {m.exercise.name}
                                    </h3>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-bold text-on-dark">
                                            <TypeGlyph kind={m.effType} className="h-3 w-3" />
                                            {m.exercise.muscle_group}
                                        </span>
                                        {(m.exercise.gif_url || m.exercise.video_url) && (
                                            <button
                                                onClick={() => openTechnique(m.exercise)}
                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark"
                                            >
                                                <Info className="w-3.5 h-3.5" /> Ver técnica
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {m.complete && (
                                <CheckCircle2 className="w-6 h-6 shrink-0 text-[var(--sport-400)]" />
                            )}
                        </div>

                        {m.effType === 'strength' ? (
                            <div className="flex flex-wrap gap-1.5 text-[11px]">
                                <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 font-mono font-semibold text-on-dark">
                                    {m.block.sets} × {m.block.reps}
                                </span>
                                {m.block.target_weight_kg != null && (
                                    <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 font-mono font-semibold text-on-dark">
                                        {m.suggestedWeightKg ?? m.block.target_weight_kg}kg
                                    </span>
                                )}
                                {m.block.rest_time && (
                                    <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 font-mono font-semibold text-on-dark-muted">
                                        Descanso {m.block.rest_time}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <TypedTargetGrid block={m.block} kind={m.effType} cardio={cardio} />
                                <div className="flex justify-end">
                                    <TypedBlockTimerButton block={m.block} kind={m.effType} />
                                </div>
                            </div>
                        )}

                        {m.effType === 'strength' && overloadChipLabel(m.block, m.eff, currentWeek) && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sport-500)]/30 bg-[var(--sport-500)]/[0.10] px-2 py-0.5 text-[10.5px] font-bold text-[var(--sport-300)]">
                                <TrendingUp className="w-3 h-3 shrink-0" />
                                {overloadChipLabel(m.block, m.eff, currentWeek)}
                            </span>
                        )}

                        {m.effType !== 'strength' && m.block.instructions && (
                            <div className="flex gap-2 rounded-sm border border-[var(--border-inverse)] bg-white/[0.03] px-2.5 py-1.5 text-[11px]">
                                <Info className="w-3.5 h-3.5 shrink-0 text-on-dark-muted mt-0.5" />
                                <p className="text-on-dark/90">{m.block.instructions}</p>
                            </div>
                        )}

                        {m.block.notes && (
                            <div className="flex gap-2 rounded-sm border border-[var(--border-inverse)] bg-white/[0.03] px-2.5 py-1.5 text-[11px]">
                                <Quote className="w-3.5 h-3.5 shrink-0 text-on-dark-muted mt-0.5" />
                                <p className="text-on-dark/90">{m.block.notes}</p>
                            </div>
                        )}

                        {m.effType === 'strength' && previousHistory[m.exercise.id] && previousHistory[m.exercise.id].length > 0 && (() => {
                            const prev = previousHistory[m.exercise.id]
                            const best = prev.reduce((mx, s) => ((s.weight_kg ?? 0) > (mx.weight_kg ?? 0) ? s : mx), prev[0])
                            // P12: micro-reto cuando el objetivo de hoy iguala o supera la última marca.
                            const beatIt = best.weight_kg != null && best.weight_kg > 0 && m.suggestedWeightKg != null && m.suggestedWeightKg >= best.weight_kg
                            return (
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm bg-white/[0.04] px-2.5 py-1.5">
                                    <History className="w-3.5 h-3.5 shrink-0 text-on-dark-muted" />
                                    <span className="text-[10.5px] font-semibold text-on-dark-muted">
                                        Sesión anterior · {formatRelativeDate(prev[0].date)}:
                                    </span>
                                    <span className="font-mono text-[11px] font-bold text-on-dark">
                                        {best.weight_kg ? `${best.weight_kg}kg` : '-'} × {best.reps_done || '-'}
                                    </span>
                                    {beatIt && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--sport-300)]">
                                            <TrendingUp className="h-3 w-3" /> Superá tu marca
                                        </span>
                                    )}
                                </div>
                            )
                        })()}
                    </div>
                ))}
            </div>

            {/* Rondas: series intercaladas A1 → B1 → A2 → B2… */}
            <div className="rounded-card border border-[var(--border-inverse)] bg-white/[0.02] p-2 space-y-3">
                {Array.from({ length: maxSets }).map((_, ri) => {
                    const round = ri + 1
                    const roundMembers = memberVMs.filter((m) => m.block.sets >= round)
                    return (
                        <div key={round} className="space-y-1.5">
                            <div className="flex items-center justify-center gap-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-on-dark-muted">
                                <span className="h-px max-w-[72px] flex-1 bg-white/10" />
                                <span>Ronda {round}</span>
                                <span className="h-px max-w-[72px] flex-1 bg-white/10" />
                            </div>
                            {roundMembers.map((m) => {
                                const label = `${m.letter}${round}`
                                const setLogged = sessionLogs.some((l) => l.block_id === m.block.id && l.set_number === round)
                                const isNext = !setLogged && nextCue?.blockId === m.block.id && nextCue?.set === round
                                const existing = sessionLogs.find((l) => l.block_id === m.block.id && l.set_number === round)
                                return (
                                    <div
                                        key={m.block.id}
                                        ref={(el) => registerRowRef(m.block.id, round, el)}
                                        className="space-y-1"
                                    >
                                        <div className="flex items-center gap-2 px-1.5">
                                            <span className="inline-flex items-center rounded-full bg-[var(--sport-500)]/15 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-[var(--sport-300)]">
                                                {label}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-on-dark">
                                                {m.exercise.name}
                                            </span>
                                            {isNext && (
                                                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[var(--sport-300)]">Sigue</span>
                                            )}
                                        </div>
                                        <LogSetForm
                                            key={`${m.block.id}-${round}`}
                                            blockId={m.block.id}
                                            setNumber={round}
                                            restTimeStr={m.block.rest_time}
                                            existingLog={existing}
                                            suggestedWeightKg={m.suggestedWeightKg}
                                            autoTimerEnabled={autoTimerEnabled}
                                            mode={m.effType}
                                            isActive={isNext}
                                            supersetRest={{
                                                groupRestSeconds,
                                                closesRound: () => isRoundComplete(members, round, sessionLogs, m.block.id),
                                            }}
                                            onLogged={onLogged}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export function WorkoutExecutionClient({
    plan,
    program,
    logs,
    previousHistory = {},
    coachSlug,
    exerciseMaxes = {},
    exerciseMaxDates = {},
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
    // Superserie (F2): refs por fila de serie (block:set) para el auto-scroll intercalado.
    const setRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    const [nextCue, setNextCue] = useState<{ blockId: string; set: number } | null>(null)
    const blocks = useMemo(() => [...plan.workout_blocks].sort((a, b) => a.order_index - b.order_index), [plan.workout_blocks])
    const [showTechnique, setShowTechnique] = useState(false)
    const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)
    const [showTimerSettings, setShowTimerSettings] = useState(false)
    const [showCompleted, setShowCompleted] = useState(false)
    const [selectedExercise, setSelectedExercise] = useState<ExerciseType | null>(null)
    const [sessionLogs, setSessionLogs] = useState(logs)
    const [isOffline, setIsOffline] = useState(false)
    const [sessionElapsed, setSessionElapsed] = useState(0)
    // Disclosure "Detalles" por ejercicio (instrucciones + nota + historial detrás de un tap).
    const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({})
    const toggleDetails = useCallback((id: string) => setOpenDetails((prev) => ({ ...prev, [id]: !prev[id] })), [])
    // Prefill "= última vez" (quick-win E2-3): tap en la línea de historial autollena la serie activa.
    // `setNumber` acota el fill a la serie que estaba activa al tocar (no arrastra a las siguientes).
    const [fillByBlock, setFillByBlock] = useState<Record<string, { weight: number | null; reps: number | null; nonce: number; setNumber: number }>>({})
    // Deshacer (quick-win E2-4): reabre la última serie logueada para corregir (no existe DELETE del log).
    const [reopenSignal, setReopenSignal] = useState<{ blockId: string; setNumber: number; nonce: number } | null>(null)

    // Wake lock de TODA la sesión (bug E2-1) — antes el lock solo cubría el descanso.
    useScreenWakeLock()

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

    // Cronómetro de sesión (32:14) — solo display, arranca al montar la pantalla.
    useEffect(() => {
        const start = Date.now()
        const id = window.setInterval(() => setSessionElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
        return () => window.clearInterval(id)
    }, [])

    const phaseName = currentPhaseName(program?.program_phases, currentWeek)

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

    // Superserie (F2): mapa blockId → info del grupo (miembros, letras, descanso del grupo).
    // Una sola fuente para el card (leyenda + rondas) y para el auto-scroll/guía de `handleLogged`.
    const supersetInfo = useMemo(() => {
        const map = new Map<string, SupersetInfo>()
        for (const section of sectioned) {
            for (const group of section.groups) {
                if (group.type !== 'superset') continue
                const members = [...group.blocks].sort((a, b) => a.order_index - b.order_index)
                const letterByBlock = new Map<string, string>()
                members.forEach((m, i) => letterByBlock.set(m.id, SUPERSET_MEMBER_LETTERS[i] ?? '?'))
                const groupRestSeconds = members.reduce((mx, m) => Math.max(mx, parseRestTime(m.rest_time)), 0)
                const maxSets = members.reduce((mx, m) => Math.max(mx, m.sets), 0)
                const info: SupersetInfo = { members, letterByBlock, groupRestSeconds, maxSets }
                for (const m of members) map.set(m.id, info)
            }
        }
        return map
    }, [sectioned])

    const registerRowRef = useCallback((blockId: string, setNumber: number, el: HTMLDivElement | null) => {
        const key = `${blockId}:${setNumber}`
        if (el) setRowRefs.current.set(key, el)
        else setRowRefs.current.delete(key)
    }, [])

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
    // Volumen de sesión en vivo (quick-win E2-5): Σ peso × reps de los logs locales (cero queries).
    const sessionVolumeKg = sessionLogs.reduce((acc, l) => acc + (l.weight_kg ?? 0) * (l.reps_done ?? 0), 0)
    const sessionVolumeLabel = fmtVolume(sessionVolumeKg)
    // "Ejercicio X de Y" — X = primer bloque incompleto (o el total si ya terminó todo).
    const totalExercises = blocks.length
    const currentExerciseIdx = blocks.findIndex((b) => !isBlockComplete(b, sessionLogs))
    const currentExerciseNum = currentExerciseIdx === -1 ? totalExercises : currentExerciseIdx + 1

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
    /** Scroll a la siguiente serie incompleta (superserie) o al siguiente bloque incompleto. */
    const scrollToNextIncomplete = (fromLogs: Props['logs']) => {
        const nextIncomplete = blocks.find((b) => !isBlockComplete(b, fromLogs))
        if (!nextIncomplete) return
        const info = supersetInfo.get(nextIncomplete.id)
        if (info) {
            const order = buildRoundOrder(info.members)
            const pos = order.find((p) => !fromLogs.some((l) => l.block_id === p.blockId && l.set_number === p.set))
            if (pos) {
                setRowRefs.current.get(`${pos.blockId}:${pos.set}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                return
            }
        }
        blockRefs.current.get(nextIncomplete.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const handleLogged = (payload: { blockId: string; setNumber: number; weightKg: number | null; repsDone: number | null; rpe: number | null; rir: number | null; note?: string | null }) => {
        // Estado (puro) — dedup por block+set, misma forma de siempre.
        setSessionLogs((prev) => applyOptimisticLog(prev, payload))

        // Guía/scroll (efectos) — calculados fuera del updater para no duplicarse en StrictMode.
        const prev = sessionLogs
        const nextLogs = applyOptimisticLog(prev, payload)
        const info = supersetInfo.get(payload.blockId)

        if (info) {
            // Superserie: la "siguiente" respeta el orden intercalado (tras A1 apunta a B1).
            const order = buildRoundOrder(info.members)
            const nextPos = findNextIncompleteInRounds(order, nextLogs, payload)
            setNextCue(nextPos)
            const round = payload.setNumber
            const roundClosed = isRoundComplete(info.members, round, nextLogs)
            if (nextPos) {
                if (!roundClosed) {
                    const label = `${info.letterByBlock.get(nextPos.blockId) ?? ''}${nextPos.set}`
                    toast.info(`Sin descanso — seguí con ${label}`)
                }
                setTimeout(() => {
                    setRowRefs.current
                        .get(`${nextPos.blockId}:${nextPos.set}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }, 350)
            } else {
                // Grupo completo → saltar al siguiente bloque/serie incompleto del plan.
                setTimeout(() => scrollToNextIncomplete(nextLogs), 350)
            }
            return
        }

        // Bloque suelto: comportamiento histórico (scroll solo al completar el bloque).
        setNextCue(null)
        const block = blocks.find((b) => b.id === payload.blockId)
        if (!block) return
        // Deshacer (quick-win E2-4): sin DELETE del log → "Deshacer" reabre la serie para corregir
        // (usa el path de edición existente del chip). Solo en fuerza (las variantes tipadas no colapsan a chip).
        const ex = getExercise(block)
        if (ex && effectiveExerciseType(block, ex) === 'strength') {
            toast('Serie registrada', {
                duration: 5000,
                action: {
                    label: 'Deshacer',
                    onClick: () => setReopenSignal({ blockId: payload.blockId, setNumber: payload.setNumber, nonce: Date.now() }),
                },
            })
        }
        const wasComplete = isBlockComplete(block, prev)
        const nowComplete = isBlockComplete(block, nextLogs)
        if (!wasComplete && nowComplete) {
            setTimeout(() => scrollToNextIncomplete(nextLogs), 350)
        }
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
                            <Link href={`${base}/dashboard`} aria-label="Salir" className="flex h-10 w-10 -ml-2 items-center justify-center rounded-control bg-white/[0.08] text-on-dark hover:bg-white/[0.14] transition-colors shrink-0">
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="min-w-0 px-2 text-center flex-1">
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <h1 className="font-display text-lg md:text-xl font-bold text-on-dark truncate">
                                        {plan.title}
                                    </h1>
                                    {activeWeekVariant != null && (
                                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/20 text-on-dark-muted shrink-0">
                                            Semana {activeWeekVariant}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-on-dark-muted truncate">
                                    {phaseName ? `${phaseName} · ` : ''}
                                    {program?.program_structure_type === 'cycle'
                                        ? `Día ${plan.day_of_week || 1} de ${program.cycle_length || '?'}`
                                        : 'Programa semanal'}
                                </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowTimerSettings(true)}
                                    className="flex h-10 w-10 items-center justify-center rounded-control bg-white/[0.08] text-on-dark hover:bg-white/[0.14] transition-colors"
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
                        <div className="flex items-start justify-between gap-2 mt-1.5 font-mono text-[11px] tabular-nums text-on-dark-muted">
                            <span className="shrink-0 pt-0.5">
                                <strong className="text-on-dark">Ejercicio {currentExerciseNum}</strong> de {totalExercises}
                            </span>
                            <span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5">
                                <span className="font-medium">{completedSetCount}/{requiredSets} series</span>
                                {sessionVolumeLabel && (
                                    <>
                                        <span className="font-medium">·</span>
                                        <span className="font-medium" title="Volumen de la sesión (kg × reps)">{sessionVolumeLabel}</span>
                                    </>
                                )}
                                <span className="font-medium">·</span>
                                <span className="font-medium">{fmtElapsed(sessionElapsed)}</span>
                                <span className="font-medium">·</span>
                                <motion.span
                                    key={completedSetCount}
                                    initial={reducedMotion ? false : { scale: 1.18 }}
                                    animate={{ scale: 1 }}
                                    transition={reducedMotion ? { duration: 0 } : springs.snappy}
                                    className="font-bold"
                                    style={{ color: 'var(--sport-400)' }}
                                >
                                    {completionPct}%
                                </motion.span>
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
                                    </div>
                                    {section.subtitle && (
                                        <p className="text-xs leading-relaxed text-on-dark-muted pl-4 border-l-2 border-white/10">
                                            {section.subtitle}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {section.groups.map((group, groupIndex) => group.type === 'superset' ? (
                                        <SupersetGroupCard
                                            key={group.key}
                                            info={supersetInfo.get(group.blocks[0].id)!}
                                            sessionLogs={sessionLogs}
                                            currentWeek={currentWeek}
                                            weeksToRepeat={program?.weeks_to_repeat}
                                            previousHistory={previousHistory}
                                            lastSessionByBlock={lastSessionByBlock}
                                            cardio={cardio}
                                            autoTimerEnabled={autoTimerEnabled}
                                            nextCue={nextCue}
                                            onLogged={handleLogged}
                                            openTechnique={openTechnique}
                                            registerRowRef={registerRowRef}
                                            getExercise={getExercise}
                                        />
                                    ) : (
                                        <div key={group.key} className="space-y-3">
                                            <div className="space-y-3">
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
                                                    const loggedSetNumbers = new Set(
                                                        blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number),
                                                    )
                                                    const doneCount = loggedSetNumbers.size
                                                    let firstUnlogged: number | null = null
                                                    for (let i = 1; i <= block.sets; i += 1) { if (!loggedSetNumbers.has(i)) { firstUnlogged = i; break } }
                                                    const detailsOpen = !!openDetails[block.id]
                                                    // Cue de técnica inline (reusa la 1ra instrucción del ejercicio; el resto en Detalles).
                                                    const cueLine = effType === 'strength'
                                                        ? (exercise.instructions?.[0]?.replace(/^Step:\d+\s*/i, '') ?? null)
                                                        : null
                                                    const overloadLabel = effType === 'strength' ? overloadChipLabel(block, eff, currentWeek) : null
                                                    const overloadDetail = effType === 'strength' ? overloadDetailText(block, eff, currentWeek) : null
                                                    const prevList = previousHistory[exercise.id] ?? []
                                                    const bestPrev = prevList.length
                                                        ? prevList.reduce((m, s) => ((s.weight_kg ?? 0) > (m.weight_kg ?? 0) ? s : m), prevList[0])
                                                        : null
                                                    const beatIt = bestPrev?.weight_kg != null && bestPrev.weight_kg > 0 && suggestedWeightKg != null && suggestedWeightKg >= bestPrev.weight_kg
                                                    const hasDetails =
                                                        (effType === 'strength' && ((exercise.instructions?.length ?? 0) > 0 || !!overloadDetail)) ||
                                                        (effType !== 'strength' && !!block.instructions) ||
                                                        !!block.notes ||
                                                        prevList.length > 0
                                                    return (
                                                        <Fragment key={block.id}>
                                                        <motion.div
                                                            layout
                                                            ref={(el) => {
                                                                if (el) blockRefs.current.set(block.id, el)
                                                                else blockRefs.current.delete(block.id)
                                                            }}
                                                            animate={{ opacity: complete ? 0.6 : 1 }}
                                                            transition={reducedMotion ? { duration: 0 } : springs.smooth}
                                                            className={cn(
                                                                'rounded-card border bg-white/[0.03] p-4 space-y-3 relative',
                                                                complete
                                                                    ? 'border-[var(--sport-500)]/30'
                                                                    : 'border-[var(--border-inverse)]'
                                                            )}
                                                        >
                                                            <div className="space-y-2">
                                                                {/* Fila silenciosa: tipo · músculo  +  acciones (Detalles, técnica) */}
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold">
                                                                        <TypeGlyph kind={effType} className="h-3.5 w-3.5 shrink-0" />
                                                                        <span className="shrink-0" style={{ color: RUT_TYPE_META[effType].color }}>{RUT_TYPE_META[effType].label}</span>
                                                                        <span className="text-on-dark-muted/40">·</span>
                                                                        <span className="truncate font-semibold text-on-dark-muted">
                                                                            {group.type === 'superset'
                                                                                ? `${group.supersetLetter ?? 'SS'}-${blockIndex + 1} · ${exercise.muscle_group}`
                                                                                : exercise.muscle_group}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex shrink-0 items-center gap-1">
                                                                        {hasDetails && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleDetails(block.id)}
                                                                                aria-expanded={detailsOpen}
                                                                                className="flex h-8 items-center gap-1 rounded-control px-2 text-[11px] font-semibold text-on-dark-muted transition-colors hover:text-on-dark"
                                                                            >
                                                                                <Info className="h-3.5 w-3.5" /> Detalles
                                                                                <ChevronDown className={cn('h-3 w-3 transition-transform', detailsOpen && 'rotate-180')} />
                                                                            </button>
                                                                        )}
                                                                        {(exercise.gif_url || exercise.video_url) && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openTechnique(exercise)}
                                                                                className="flex h-8 items-center gap-1 rounded-control bg-white/[0.06] px-2.5 text-[11px] font-bold text-on-dark transition-colors hover:bg-white/[0.12]"
                                                                                aria-label={`Ver técnica de ${exercise.name}`}
                                                                            >
                                                                                <Play className="h-3 w-3 fill-current" /> Técnica
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {/* Nombre + dots de progreso de series (o check al completar) */}
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <h3 className="min-w-0 flex-1 font-display text-[22px] font-black leading-[1.1] tracking-[-0.02em] text-on-dark">{exercise.name}</h3>
                                                                    {complete ? (
                                                                        <motion.div
                                                                            initial={reducedMotion ? false : { scale: 0 }}
                                                                            animate={{ scale: 1 }}
                                                                            transition={reducedMotion ? { duration: 0 } : springs.elastic}
                                                                            className="shrink-0 text-[var(--sport-400)]"
                                                                        >
                                                                            <CheckCircle2 className="w-7 h-7" />
                                                                        </motion.div>
                                                                    ) : (
                                                                        <div className="flex shrink-0 items-center gap-1 pt-2">
                                                                            {Array.from({ length: block.sets }).map((_, i) => (
                                                                                <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < doneCount ? 'bg-[var(--sport-400)]' : 'bg-white/15')} />
                                                                            ))}
                                                                            <span className="ml-1 font-mono text-[11px] tabular-nums text-on-dark-muted">{doneCount}/{block.sets}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {effType === 'strength' ? (
                                                                <>
                                                                    {/* Línea de prescripción + chip compacto de sobrecarga */}
                                                                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[13px] font-semibold text-on-dark">
                                                                            <span>{block.sets} × {block.reps}</span>
                                                                            {block.target_weight_kg != null && (<><Sep /><span>{suggestedWeightKg ?? block.target_weight_kg} kg</span></>)}
                                                                            {block.rest_time && (<><Sep /><span className="text-on-dark-muted">desc {block.rest_time}</span></>)}
                                                                            {block.tempo && (<><Sep /><span className="text-on-dark-muted">tempo {block.tempo}</span></>)}
                                                                            {block.rir && (<><Sep /><span className="text-on-dark-muted">RIR {block.rir}</span></>)}
                                                                        </div>
                                                                        {overloadLabel && (
                                                                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--sport-500)]/30 bg-[var(--sport-500)]/[0.10] px-2 py-0.5 text-[11px] font-bold text-[var(--sport-300)]">
                                                                                <TrendingUp className="h-3 w-3" /> {overloadLabel}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {/* "La vez anterior" inline (muted) — tap autollena la serie activa (quick-win E2-3/8) */}
                                                                    {bestPrev && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (firstUnlogged == null) return
                                                                                setFillByBlock((prev) => ({
                                                                                    ...prev,
                                                                                    [block.id]: { weight: bestPrev.weight_kg, reps: bestPrev.reps_done, nonce: Date.now(), setNumber: firstUnlogged },
                                                                                }))
                                                                            }}
                                                                            disabled={firstUnlogged == null}
                                                                            className="flex min-h-[40px] w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control py-1 text-left text-[11px] transition-colors enabled:hover:bg-white/[0.05] enabled:active:scale-[0.99] disabled:cursor-default"
                                                                            aria-label={firstUnlogged != null && bestPrev.weight_kg ? `Autollenar la serie activa con ${bestPrev.weight_kg} kg por ${bestPrev.reps_done ?? '-'} reps` : undefined}
                                                                        >
                                                                            <History className="h-3.5 w-3.5 shrink-0 text-on-dark-muted" />
                                                                            <span className="font-semibold text-on-dark-muted">Última vez:</span>
                                                                            <span className="font-mono font-bold text-on-dark">
                                                                                {bestPrev.weight_kg ? `${bestPrev.weight_kg}kg` : '-'} × {bestPrev.reps_done || '-'}
                                                                            </span>
                                                                            {beatIt && (
                                                                                <span className="inline-flex items-center gap-1 font-bold text-[var(--sport-300)]">
                                                                                    <TrendingUp className="h-3 w-3" /> Superá tu marca
                                                                                </span>
                                                                            )}
                                                                            {firstUnlogged != null && (
                                                                                <span className="ml-auto shrink-0 font-bold text-[var(--sport-300)]">= usar</span>
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                    {/* Cue de técnica inline (1 línea, muted) — el resto en Detalles */}
                                                                    {cueLine && (
                                                                        <p className="line-clamp-1 text-[12px] leading-snug text-on-dark-muted">{cueLine}</p>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <TypedTargetGrid block={block} kind={effType} cardio={cardio} />
                                                                    <div className="flex justify-end">
                                                                        <TypedBlockTimerButton block={block} kind={effType} />
                                                                    </div>
                                                                </>
                                                            )}
                                                            {/* Detalles (disclosure): técnica completa + nota del coach + sobrecarga + historial */}
                                                            <AnimatePresence initial={false}>
                                                                {detailsOpen && (
                                                                    <motion.div
                                                                        initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                                                                        animate={{ height: 'auto', opacity: 1 }}
                                                                        exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                                                                        transition={reducedMotion ? { duration: 0 } : { duration: 0.25 }}
                                                                        className="overflow-hidden"
                                                                    >
                                                                        <div className="space-y-3 rounded-card border border-[var(--border-inverse)] bg-white/[0.02] p-3">
                                                                            {effType !== 'strength' && block.instructions && (
                                                                                <div>
                                                                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Instrucciones</p>
                                                                                    <p className="text-[12px] leading-relaxed text-on-dark/90">{block.instructions}</p>
                                                                                </div>
                                                                            )}
                                                                            {effType === 'strength' && exercise.instructions && exercise.instructions.length > 0 && (
                                                                                <div>
                                                                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Técnica</p>
                                                                                    <ol className="space-y-1">
                                                                                        {exercise.instructions.map((step, i) => (
                                                                                            <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-on-dark/90">
                                                                                                <span className="font-mono text-on-dark-muted">{i + 1}.</span>
                                                                                                <span>{step.replace(/^Step:\d+\s*/i, '')}</span>
                                                                                            </li>
                                                                                        ))}
                                                                                    </ol>
                                                                                </div>
                                                                            )}
                                                                            {block.notes && (
                                                                                <div>
                                                                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Nota del coach</p>
                                                                                    <p className="flex gap-2 text-[12px] leading-relaxed text-on-dark/90">
                                                                                        <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-on-dark-muted" />
                                                                                        {block.notes}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                            {effType === 'strength' && overloadDetail && (
                                                                                <div>
                                                                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Sobrecarga progresiva</p>
                                                                                    <p className="text-[12px] leading-relaxed text-on-dark/90">{overloadDetail}</p>
                                                                                </div>
                                                                            )}
                                                                            {prevList.length > 0 && (
                                                                                <div>
                                                                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">Historial</p>
                                                                                    <ul className="space-y-0.5">
                                                                                        {prevList.slice(0, 5).map((s, i) => (
                                                                                            <li key={i} className="flex justify-between font-mono text-[11px] text-on-dark-muted">
                                                                                                <span>{formatRelativeDate(s.date)}</span>
                                                                                                <span className="text-on-dark">{s.weight_kg ? `${s.weight_kg}kg` : '-'} × {s.reps_done || '-'}</span>
                                                                                            </li>
                                                                                        ))}
                                                                                    </ul>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                            {effType === 'strength' ? (
                                                                <div className="space-y-1.5">
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
                                                                                isActive={setNumber === firstUnlogged}
                                                                                prefill={fillByBlock[block.id]?.setNumber === setNumber ? fillByBlock[block.id] : undefined}
                                                                                reopenNonce={reopenSignal?.blockId === block.id && reopenSignal?.setNumber === setNumber ? reopenSignal.nonce : undefined}
                                                                                onLogged={handleLogged}
                                                                            />
                                                                        )
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="rounded-card border border-[var(--border-inverse)] bg-white/[0.02] p-2">
                                                                    <TypedLogHeader kind={effType} />
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
                                                                                    isActive={setNumber === firstUnlogged}
                                                                                    onLogged={handleLogged}
                                                                                />
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
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
                            className="h-12 px-5 flex items-center gap-2 rounded-control bg-[var(--sport-500)] text-white font-bold transition-transform active:scale-[0.99]"
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
                        exerciseMaxDates={exerciseMaxDates}
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
                                                            backgroundColor: 'color-mix(in srgb, var(--sport-500) 15%, transparent)',
                                                            color: 'var(--sport-500)'
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