'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info, Dumbbell, Timer, TrendingUp, History, Quote, X, Settings, CheckCircle2, WifiOff, ChevronDown, List, GalleryHorizontal, Pencil, CalendarSync } from 'lucide-react'
import { computeEffectiveTarget } from '@/lib/workout/progression'
import { LogSetForm, type SetSyncResult } from './LogSetForm'
import { SingleExerciseCard } from './SingleExerciseCard'
import {
    formatTypedObjective,
    buildStepModel,
    firstIncompleteStepIndex,
    isStepComplete,
    stepIndexOfBlock,
    reconcileSessionLogs,
    type ReconciledSessionLog,
    applyOptimisticSessionLog,
    type OptimisticLogPayload,
    groupContiguousSupersetRuns,
    type WorkoutSectionKey,
    executionAreaGroupsFor,
    isTimeableInterval,
} from '@eva/workout-engine'
import { StepperExecution, type StepperStepView } from './StepperExecution'
import { STEPPER_MODE_KEY } from './rest-timer-preferences'
import { SubstituteExerciseSheet } from './_components/SubstituteExerciseSheet'
import { SUBSTITUTION_REASON } from '@/services/workout/exercise-substitution'
import type { SubstituteCandidate } from './_data/substitution.queries'
import { logSetAction, revalidateWorkoutViewAction } from './_actions/workout-log.actions'
import {
    flushWorkoutQueue,
    readWorkoutOfflineQueueForPlan,
    workoutLogToFormData,
} from '@/lib/workout-offline-queue'
import { WorkoutTimerProvider, useWorkoutTimer, parseRestTime } from './WorkoutTimerProvider'
import { WorkoutKeypadProvider } from './WorkoutKeypadProvider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import Image from 'next/image'
import { WorkoutSummaryOverlay } from './WorkoutSummaryOverlay'
import { WorkoutTimerSettingsPanel } from './WorkoutTimerSettingsPanel'
import { cn } from '@/lib/utils'
import { formatRelativeDate, getTodayInSantiago } from '@/lib/date-utils'
import {
    readSessionStart,
    persistSessionStart,
    clearSessionStart,
    sweepOtherDaySessionStarts,
    elapsedSecondsSince,
} from './session-clock'
import { clearAllDrafts, sweepStaleDrafts } from './workout-draft-store'
import {
    readSessionSnapshot,
    writeSessionSnapshot,
    clearSessionSnapshot,
    sweepOtherDaySnapshots,
} from './session-logs.snapshot'
import { bottomVisibilityBoundary, isTargetWithinViewport } from './scroll-visibility'
import { springs } from '@/lib/animation-presets'
import { useBasePath } from '@/components/client/BasePathProvider'
import { useScreenWakeLock } from '@/lib/client/use-screen-wake-lock'
import { markFirstWorkoutCompleted } from '@/lib/pwa/install-signals'
import { EXERCISE_TYPE_META } from '@/lib/workout-exercise-type'
import type { IntervalConfig, WorkoutArea, ExerciseType as WorkoutKind } from '@/domain/workout/types'
import { effectiveExerciseType, compactDistance, compactDuration } from '@/lib/workout-exercise-type'
import { formatPace } from '@eva/cardio'
import { extractYoutubeVideoId } from '@/lib/youtube'
import { ExerciseVideo } from '@/components/exercise/ExerciseVideo'
import type { ClientCardioView } from './_data/workout-execution.queries'
import { TargetDateProvider } from './target-date-context'
import { weekdayNameFromIso } from '@/lib/workout/executor-recovery'

export interface ExerciseType {
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

export interface BlockType {
    id: string
    order_index: number
    sets: number
    reps: string
    target_weight_kg: number | null
    tempo: string | null
    rir: string | null
    rest_time: string | null
    /** Descanso de las series de aproximación (Fase M — 8b); null ⇒ un solo descanso (rest_time). */
    warmup_rest_time: string | null
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

/**
 * Log de una serie de la sesión (elemento de `Props['logs']` / `sessionLogs`). Exportado para que
 * `SingleExerciseCard` tipee `blockLogs` con el MISMO shape (evita drift; estructuralmente idéntico
 * al inline de `Props['logs']`). Fuente de verdad del shape = `session-logs.reconcile.ts` (incluye la
 * marca `_pending` de series encoladas sin confirmar por el server).
 */
export type WorkoutSessionLog = ReconciledSessionLog

/**
 * Sustitución activa de un bloque en la sesión (Fase L · workstream C). Snapshot de los datos del
 * sustituto necesarios para el override de la card (nombre/gif/técnica) + el badge; `prescribedName`
 * es el ejercicio original (para el badge "en vez de X" y la ficha del coach). Los campos de media
 * pueden venir null tras una rehidratación desde logs (el log sólo guarda id + nombre + motivo).
 */
export type SessionSubstitution = {
    id: string
    name: string
    gif_url: string | null
    video_url: string | null
    video_start_time: number | null
    video_end_time: number | null
    instructions: string[] | null
    muscle_group: string | null
    equipment: string | null
    exercise_type: string | null
    prescribedName: string
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
        // Sustitución de máquina ocupada (Fase L · C): rehidratan `substitutionByBlock` tras reload.
        substituted_exercise_id?: string | null
        substituted_exercise_name?: string | null
        substitution_reason?: string | null
        // Reconciliación (informe forense 2026-07-04): serie en cola offline sin confirmar por server.
        _pending?: boolean
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
    /**
     * Día objetivo (Ola 1, decisión CEO 10): ISO `YYYY-MM-DD` ya VALIDADO en el server cuando el
     * ejecutor se abrió con `?fecha=…` para editar un día pasado. `null` = sesión de HOY normal. Viaja
     * a cada `LogSetForm` por contexto → `target_date` en el submit (modo solo-UPDATE) + banner "Editando".
     */
    targetDate?: string | null
    /**
     * Día a recuperar (Ola 1, decisión CEO 9): ISO `YYYY-MM-DD` ya validado cuando se abrió con
     * `?recuperar=…` desde un pendiente de la semana. SOLO visual (banner ámbar "Recuperando"); el
     * guardado sigue siendo el flujo normal de HOY y la atribución la resuelve `deriveWeekWorkoutStatus`.
     */
    recoverDate?: string | null
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

/** Meta por tipo de bloque para el chip de tipo (color + label + icono tipado). Deriva de la
 *  fuente única del lib (`EXERCISE_TYPE_META`) para no duplicar el mapa con el builder. */
export const RUT_TYPE_META = EXERCISE_TYPE_META

/** Icono tipado por tipo de bloque, coloreado con el color del tipo (kit alumno-rutina §183). */
export function TypeGlyph({ kind, className = 'h-3 w-3' }: { kind: WorkoutKind; className?: string }) {
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

/** mm:ss desde segundos (cronómetro de sesión); desde 1h rueda a H:MM:SS (ej. "1:05:32"). */
function fmtElapsed(totalSec: number): string {
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
}

/** Volumen de sesión compacto (kg acumulados → "850 kg" / "5.2 t"). null si 0. */
function fmtVolume(kg: number): string | null {
    if (kg <= 0) return null
    if (kg >= 1000) return `${(kg / 1000).toFixed(kg >= 10000 ? 0 : 1)} t`
    return `${Math.round(kg)} kg`
}

/** Cards de objetivo por tipo (cardio/movilidad/roller) — los strength quedan intactos (AC3). */
export function TypedTargetGrid({ block, kind, cardio }: { block: BlockType; kind: WorkoutKind; cardio?: ClientCardioView }) {
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
export function TypedBlockTimerButton({ block, kind }: { block: BlockType; kind: WorkoutKind }) {
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
export function TypedLogHeader({ kind }: { kind: WorkoutKind }) {
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

/**
 * Auto-scroll a la siguiente serie SÓLO si hace falta (forense W6, síntoma 1): antes cada cierre de
 * serie disparaba un `scrollIntoView` incondicional a los 350 ms; si la fila destino ya estaba a la
 * vista, ese scroll competía con la animación `layout` del colapso → la página "subía y bajaba" y se
 * quedaba donde estaba (rebote). Ahora, si el objetivo ya está cómodamente dentro del viewport (bajo
 * el header sticky y sobre la barra de finalizar), NO se mueve nada. Sólo se hace scroll suave cuando
 * el objetivo está fuera de vista de verdad.
 */
function smoothScrollIntoViewIfNeeded(el: HTMLElement | null | undefined, block: ScrollLogicalPosition) {
    if (!el || typeof window === 'undefined') return
    const rect = el.getBoundingClientRect()
    const vh = window.innerHeight || document.documentElement.clientHeight
    const HEADER_H = 96 // header sticky aprox. (título + progreso)
    const FOOTER_H = 88 // barra fija "Finalizar" aprox. — fallback si no se pudo medir.
    // Sub-fix 3: la obstrucción inferior REAL se mide al momento de disparar. Cuando el RestTimer
    // (sheet inferior, arranca al guardar) está montado, tapa MÁS que la barra "Finalizar" sola → sin
    // medirlo el gate se equivocaba y disparaba un scroll = "se mueve solo". Medimos el borde superior
    // de la barra Finalizar y del sheet del RestTimer; la frontera es el más alto (pura, testeada).
    const obstructionTops: number[] = []
    const finishBar = document.querySelector('.exec-finish-bar')
    if (finishBar) obstructionTops.push(finishBar.getBoundingClientRect().top)
    document.querySelectorAll('[data-exec-bottom-sheet]').forEach((sheet) => {
        obstructionTops.push(sheet.getBoundingClientRect().top)
    })
    const bottomBoundary = bottomVisibilityBoundary(vh, FOOTER_H, obstructionTops)
    if (isTargetWithinViewport({ rectTop: rect.top, rectBottom: rect.bottom, headerH: HEADER_H, bottomBoundary })) return
    el.scrollIntoView({ behavior: 'smooth', block })
}

/** Separador compacto (·) entre segmentos de la línea de prescripción. */
export const Sep = () => <span className="text-on-dark-muted/40">·</span>

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
        return eff.status === 'holding' ? `Mantén ${eff.weightKg} kg` : `Objetivo ${eff.weightKg} kg`
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
        if (eff.status === 'holding') return `Doble progresión: mantén ${eff.weightKg} kg y completa ${eff.repsTopToUnlock} reps en todas las series para subir.`
        if (eff.status === 'progressed') {
            return eff.isProgressed
                ? `Doble progresión: ¡subiste! Objetivo ${eff.weightKg} kg (base ${eff.baseWeightKg}).`
                : `Doble progresión: objetivo ${eff.weightKg} kg (aún por debajo de la base ${eff.baseWeightKg}).`
        }
        return `Doble progresión: sube +${v} kg cuando completes ${eff.repsTopToUnlock} reps en todas las series.`
    }
    if (eff.isProgressed && currentWeek != null) return `Semana ${currentWeek}: objetivo ${eff.weightKg} kg (base ${eff.baseWeightKg} +${eff.addedKg}).`
    return `Sube +${v} kg cada semana (esta semana arrancas en la base).`
}

interface SupersetGroupCardProps {
    info: SupersetInfo
    sessionLogs: Props['logs']
    currentWeek: number | null
    weeksToRepeat?: number
    previousHistory: Record<string, { weight_kg: number | null; reps_done: number | null; date: string }[]>
    lastSessionByBlock: Record<string, { date: string; sets: Array<{ weight_kg: number | null; reps_done: number | null }> }>
    exerciseMaxes: Record<string, number>
    cardio?: ClientCardioView
    autoTimerEnabled: boolean
    nextCue: { blockId: string; set: number } | null
    onLogged: (payload: OptimisticLogPayload) => void
    onResult: (blockId: string, setNumber: number, result: SetSyncResult) => void
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
    exerciseMaxes,
    cardio,
    autoTimerEnabled,
    nextCue,
    onLogged,
    onResult,
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
            // Mejor sesión previa del miembro → alimenta el header "Última vez" del teclado custom
            // (Fase L · workstream B) en el keypad de las filas de la superserie (DB-5).
            const prevList = previousHistory[exercise.id] ?? []
            const bestPrev = prevList.length
                ? prevList.reduce((mx, s) => ((s.weight_kg ?? 0) > (mx.weight_kg ?? 0) ? s : mx), prevList[0])
                : null
            return {
                block,
                exercise,
                effType,
                eff,
                suggestedWeightKg,
                bestPrev,
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
                    Rondas: <strong className="text-on-dark">{firstLabel}</strong> → <strong className="text-on-dark">{secondLabel}</strong> sin descanso, descansa al cerrar la ronda.
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
                                Trabaja por rondas: haz <strong>{firstLabel}</strong>, sigue con <strong>{secondLabel}</strong> sin
                                descanso, y descansa al <strong>cerrar la ronda</strong>. Repite hasta completar todas las series.
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
                                            <TrendingUp className="h-3 w-3" /> Supera tu marca
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
                                            nextUpLabel={memberVMs[0]?.exercise.name}
                                            existingLog={existing}
                                            suggestedWeightKg={m.suggestedWeightKg}
                                            prThresholdKg={exerciseMaxes[m.exercise.id] ?? null}
                                            targetReps={m.block.reps}
                                            lastSet={m.bestPrev ? { weightKg: m.bestPrev.weight_kg, reps: m.bestPrev.reps_done } : null}
                                            autoTimerEnabled={autoTimerEnabled}
                                            mode={m.effType}
                                            isActive={isNext}
                                            typedObjective={m.effType !== 'strength' ? formatTypedObjective(m.block, m.effType) : undefined}
                                            supersetRest={{
                                                groupRestSeconds,
                                                closesRound: () => isRoundComplete(members, round, sessionLogs, m.block.id),
                                            }}
                                            onLogged={onLogged}
                                            onResult={onResult}
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

/**
 * Recap colapsado de un ejercicio/superserie COMPLETADO: fila delgada a opacidad PLENA (el plegado
 * es útil, no una atenuación — decisión CEO); tap la expande de nuevo a la card completa. Si
 * `celebrate`, el check entra elástico + un barrido sutil del borde (floreo al cerrar el ejercicio).
 * Todo respeta reduced-motion.
 */
function CollapsedExerciseBar({
    name,
    sub,
    onExpand,
    reducedMotion,
    celebrate,
}: {
    name: string
    sub: string
    onExpand: () => void
    reducedMotion: boolean | null
    celebrate: boolean
}) {
    return (
        <motion.button
            type="button"
            layout={!reducedMotion}
            onClick={onExpand}
            transition={reducedMotion ? { duration: 0 } : springs.smooth}
            className="relative flex w-full items-center gap-2.5 overflow-hidden rounded-card border border-[var(--sport-500)]/25 bg-[var(--sport-500)]/[0.05] px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--sport-500)]/[0.09] active:scale-[0.99]"
            aria-label={`${name} — completado, toca para ver o editar`}
        >
            {celebrate && (
                <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-card border-2 border-[var(--sport-500)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.55, 0] }}
                    transition={{ duration: 0.5, times: [0, 0.35, 1] }}
                />
            )}
            <motion.span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sport-500)]/15 text-[var(--sport-400)]"
                initial={celebrate ? { scale: 0 } : false}
                animate={{ scale: 1 }}
                transition={celebrate ? springs.elastic : { duration: 0 }}
            >
                <CheckCircle2 className="h-5 w-5" />
            </motion.span>
            <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[15px] font-bold text-on-dark">{name}</span>
                <span className="block truncate font-mono text-[11px] text-on-dark-muted">{sub}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-on-dark-muted" />
        </motion.button>
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
    targetDate = null,
    recoverDate = null,
}: Props) {
    const router = useRouter()
    const base = useBasePath(`/c/${coachSlug}`)
    const reducedMotion = useReducedMotion()
    // Marca "esta sesión tuvo actividad" (informe forense 2026-07-04, Fix A). El snapshot viejo del
    // client Router Cache puede reentrar VACÍO (logs=[]), así que el prop `logs` NO distingue "primera
    // visita limpia" de "ya entrené acá y vuelvo por atrás". sessionStorage por plan (se auto-limpia al
    // cerrar la pestaña, y una carga fría trae RSC fresco de todos modos) sí lo distingue → gatea el refresh.
    const workoutTouchedKey = `eva:workout-touched:${plan.id}`
    const markWorkoutTouched = useCallback(() => {
        try { sessionStorage.setItem(workoutTouchedKey, '1') } catch { /* private mode / SSR */ }
    }, [workoutTouchedKey])
    const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    // Superserie (F2): refs por fila de serie (block:set) para el auto-scroll intercalado.
    const setRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
    // Guard reentrante del gate de "Finalizar" (evita doble flush si el usuario toca dos veces).
    const finishing = useRef(false)
    const [nextCue, setNextCue] = useState<{ blockId: string; set: number } | null>(null)
    const blocks = useMemo(() => [...plan.workout_blocks].sort((a, b) => a.order_index - b.order_index), [plan.workout_blocks])
    const [showTechnique, setShowTechnique] = useState(false)
    const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)
    // Preferencia persistida (QA CEO 2026-07-03): el toggle escribía localStorage pero nunca lo
    // leía → cada entreno arrancaba en ON. Se lee post-montaje (no en el initializer) para no
    // desalinear la hidratación SSR.
    useEffect(() => {
        if (localStorage.getItem('omni_autotimer') === 'false') setAutoTimerEnabled(false)
    }, [])
    // Modo "paso a paso" (Fase L · workstream A) — opt-in por dispositivo, mismo carril EXACTO que el
    // auto-timer: localStorage 'omni_stepper', leído post-montaje (hidratación-safe), default OFF.
    // `currentStepIndex` = paso visible del pager (swipe/rail/botones + auto-avance lo mueven).
    const [stepperEnabled, setStepperEnabled] = useState(false)
    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const [showTimerSettings, setShowTimerSettings] = useState(false)
    const [showCompleted, setShowCompleted] = useState(false)
    const [selectedExercise, setSelectedExercise] = useState<ExerciseType | null>(null)
    const [sessionLogs, setSessionLogs] = useState(logs)
    const [isOffline, setIsOffline] = useState(false)
    const [sessionElapsed, setSessionElapsed] = useState(0)
    // Duración congelada al finalizar → el resumen post-entreno muestra el tiempo real de la
    // sesión (el cronómetro sigue corriendo detrás del overlay; sin congelar, "Duración" tickearía).
    const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null)
    // Ancla del cronómetro de sesión (BUG 1). Epoch ms del inicio real, PERSISTIDO en localStorage por
    // (plan, día) para sobrevivir remontajes (atrás+volver, reload, kill de la PWA) — antes era un
    // `Date.now()` solo-en-memoria que se reseteaba a 0 en cada montaje. El día ISO Santiago y el flag
    // "ya persistido" viven en refs porque los tocan el efecto del intervalo, handleLogged y handleFinish.
    const sessionAnchorRef = useRef<number>(0)
    const sessionDayIsoRef = useRef<string>('')
    const sessionAnchorPersistedRef = useRef(false)
    // Disclosure "Detalles" por ejercicio (instrucciones + nota + historial detrás de un tap).
    const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({})
    const toggleDetails = useCallback((id: string) => setOpenDetails((prev) => ({ ...prev, [id]: !prev[id] })), [])
    // Prefill "= última vez" (quick-win E2-3): tap en la línea de historial autollena la serie activa.
    // `setNumber` acota el fill a la serie que estaba activa al tocar (no arrastra a las siguientes).
    const [fillByBlock, setFillByBlock] = useState<Record<string, { weight: number | null; reps: number | null; nonce: number; setNumber: number }>>({})
    // Deshacer (quick-win E2-4): reabre la última serie logueada para corregir (no existe DELETE del log).
    const [reopenSignal, setReopenSignal] = useState<{ blockId: string; setNumber: number; nonce: number } | null>(null)
    // Modelo de foco (M1): los ejercicios/superseries COMPLETADOS colapsan a un recap delgado; el
    // usuario puede reexpandir cualquiera (para editar una serie) con un tap. Clave = block.id (bloque
    // suelto) o group.key (superserie).
    const [expandedDone, setExpandedDone] = useState<Record<string, boolean>>({})
    const toggleExpandDone = useCallback((key: string) => setExpandedDone((prev) => ({ ...prev, [key]: !prev[key] })), [])
    // Floreo al cerrar un ejercicio (M1): id del bloque recién completado + nonce para disparar la
    // celebración una sola vez en el recap colapsado (el check elástico + barrido del borde).
    const [justCompleted, setJustCompleted] = useState<{ id: string; nonce: number } | null>(null)

    // Sustitución de máquina ocupada (Fase L · workstream C). Swap in-place SOLO de esta sesión: el
    // plan/DB del bloque NO se toca. Estado por bloque → la card, el nombre, el gif y la técnica pasan
    // a mostrar el sustituto (el padre hace el override de `exercise`), y cada serie logueada del
    // bloque persiste las columnas dedicadas del log. Se rehidrata desde los logs de HOY tras reload.
    const [substitutionByBlock, setSubstitutionByBlock] = useState<Record<string, SessionSubstitution>>({})
    // Bloque cuyo bottom-sheet de sustitución está abierto (null = cerrado).
    const [substituteSheetBlockId, setSubstituteSheetBlockId] = useState<string | null>(null)

    // Rehidratación (AC-C4): tras un reload, si algún log de HOY del bloque trae `substituted_*`, la
    // card arranca en modo sustituido. Reconstrucción liviana (id + nombre snapshot); el gif/técnica
    // del sustituto no viaja en el log → se degradan a null (la card muestra nombre + badge y sigue
    // persistiendo la sustitución en las series nuevas). Corre una sola vez, post-montaje.
    useEffect(() => {
        const initial: Record<string, SessionSubstitution> = {}
        for (const log of logs) {
            if (!log.substituted_exercise_id || initial[log.block_id]) continue
            const block = plan.workout_blocks.find((b) => b.id === log.block_id)
            const prescribed = block ? (Array.isArray(block.exercises) ? block.exercises[0] : block.exercises) : null
            initial[log.block_id] = {
                id: log.substituted_exercise_id,
                name: log.substituted_exercise_name ?? 'Sustituto',
                gif_url: null,
                video_url: null,
                video_start_time: null,
                video_end_time: null,
                instructions: null,
                muscle_group: prescribed?.muscle_group ?? null,
                equipment: null,
                exercise_type: prescribed?.exercise_type ?? null,
                prescribedName: prescribed?.name ?? 'Ejercicio',
            }
        }
        if (Object.keys(initial).length > 0) setSubstitutionByBlock(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Reconciliación de `sessionLogs` (informe forense 2026-07-04, Root Cause B). Antes estaba congelado
    // en `useState(logs)`: cuando el prop `logs` llega fresco (Fix A: router.refresh al reentrar; o el
    // back/forward re-monta con un snapshot viejo del client Router Cache) la UI NO lo repintaba → el
    // alumno veía VACÍO/"a medias" pese a tener la DB íntegra. Merge server∪cola (server gana por
    // (block,set); la cola conserva lo aún-no-confirmado marcado `_pending`, que el chip pinta "sin
    // sincronizar"). SÓLO estado: sin toasts, scroll, celebraciones ni auto-avance (esos viven en
    // handleLogged, intacto). En sesión normal `logs` no cambia (no hay revalidate por serie) → el
    // efecto no vuelve a correr y el optimismo en vuelo se preserva.
    useEffect(() => {
        // Snapshot local (BUG 2 · sub-fix 2): re-inyecta las series ya confirmadas en esta sesión donde
        // el server stale (logs=[]) y la cola drenada no aportan → la pantalla nunca colapsa a vacío. El
        // día ISO vive en sessionDayIsoRef (Wave B), pero ESTE efecto corre ANTES que el del cronómetro
        // en el primer montaje (orden de declaración) → si el ref aún no está seteado lo calculamos acá.
        const dayIso = sessionDayIsoRef.current || getTodayInSantiago().iso
        setSessionLogs(
            reconcileSessionLogs(
                logs,
                readWorkoutOfflineQueueForPlan(plan.id),
                readSessionSnapshot(plan.id, dayIso),
            ),
        )
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logs])

    // Persistencia del snapshot (BUG 2 · sub-fix 2): cada vez que `sessionLogs` cambia guardamos las
    // filas CONFIRMADAS (writeSessionSnapshot filtra `_pending`) por (plan, día). Ligero (pocas filas,
    // 1 write por serie) → sin debounce. Es lo que el reconcile de arriba re-inyecta al reentrar con red
    // mala. Al desmontar por finalizar, handleFinish limpia la clave (abajo).
    useEffect(() => {
        const dayIso = sessionDayIsoRef.current || getTodayInSantiago().iso
        writeSessionSnapshot(plan.id, dayIso, sessionLogs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionLogs])

    // Frescura al (re)entrar (informe forense 2026-07-04, Root Cause A). En back/forward Next reutiliza
    // el snapshot cacheado del client Router Cache IGNORANDO `staleTimes` (doc oficial) → el ejecutor
    // re-monta con `logs` viejo (típicamente []). `router.refresh()` trae los logs reales del server y
    // Fix B los pinta; `visibilitychange` cubre el retorno al tab/PWA. GATEADO: sólo refresca si hay
    // indicios de actividad previa (logs del server, cola pendiente, o la marca de sesión) — una
    // primera visita 100% limpia no paga un fetch extra.
    // Y NUNCA offline (QA CEO 2026-07-07, modo avión): un `router.refresh()` sin red hace que Next
    // falle el fetch RSC y caiga a NAVEGACIÓN COMPLETA del browser ("falling back to browser
    // navigation") → el service worker no puede resolverla y sirve su página "Sin conexión",
    // expulsando al alumno del entreno que justo estaba protegido por la cola offline. Con red de
    // vuelta, el evento 'online' (OfflineWorkoutQueueSync) flushea y refresca — no se pierde frescura.
    useEffect(() => {
        if (logs.length > 0) markWorkoutTouched()
        const readTouched = () => {
            try { return sessionStorage.getItem(workoutTouchedKey) === '1' } catch { return false }
        }
        const hasPriorData = () =>
            logs.length > 0 || readWorkoutOfflineQueueForPlan(plan.id).length > 0 || readTouched()
        const online = () => typeof navigator === 'undefined' || navigator.onLine
        if (online() && hasPriorData()) router.refresh()
        const onVisible = () => {
            if (document.visibilityState === 'visible' && online() && hasPriorData()) router.refresh()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

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

    // Precache de ESTA página en el NAV_CACHE del service worker (QA CEO 2026-07-07, modo avión).
    // La entrada al workout es navegación SPA → la URL nunca pasaba por el handler de navegaciones
    // duras del SW y NAV_CACHE quedaba sin ella: si el browser descartaba la pestaña en background y
    // la recargaba OFFLINE, el SW caía a offline.html ("No puedes entrenar sin internet") y expulsaba
    // al alumno del entreno. El SW fetchea el HTML completo y lo guarda; la recarga offline bootea la
    // página real y el estado local (cola/drafts/snapshot/ancla) restaura la sesión. Best-effort:
    // sin SW controlando (primera visita) o sin red, no hace nada; reintenta al volver la conexión.
    useEffect(() => {
        const cacheNav = () => {
            try {
                if (!navigator.onLine) return
                navigator.serviceWorker?.controller?.postMessage({
                    type: 'eva:cache-nav',
                    url: window.location.href,
                })
            } catch {
                /* best-effort */
            }
        }
        cacheNav()
        window.addEventListener('online', cacheNav)
        // controllerchange: si el SW NUEVO toma control con esta pestaña ya abierta (deploy en
        // caliente), el postMessage del montaje se lo mandó al SW viejo (o a nadie) — reintentar.
        navigator.serviceWorker?.addEventListener('controllerchange', cacheNav)
        return () => {
            window.removeEventListener('online', cacheNav)
            navigator.serviceWorker?.removeEventListener('controllerchange', cacheNav)
        }
    }, [])

    // Cronómetro de sesión (32:14) anclado a un timestamp PERSISTIDO (BUG 1). El ancla es el `Date.now()`
    // del montaje, pero SÓLO se persiste cuando la sesión está "activa": ya hay ≥1 serie de hoy al montar
    // (rehidratación) o el alumno loguea la 1ª serie de este montaje (ver handleLogged). Un montaje "de
    // paseo" (mirar la rutina en la mañana, 0 series, salir) NO persiste nada → no infla la duración del
    // entreno real de la tarde. El intervalo RECALCULA desde el ancla (nunca acumula) → inmune a un tick
    // perdido cuando el tab está en background.
    useEffect(() => {
        const { iso: dayIso } = getTodayInSantiago()
        sessionDayIsoRef.current = dayIso
        // Higiene: borra anclas de OTROS días (sesiones abandonadas que nunca se finalizaron/limpiaron).
        sweepOtherDaySessionStarts(dayIso)
        // Higiene BUG 2: borradores viejos (>24h) del plan y snapshots de OTROS días (sesiones
        // abandonadas). No borra los borradores del día en curso ni el snapshot de hoy.
        sweepStaleDrafts(plan.id, Date.now())
        sweepOtherDaySnapshots(dayIso)

        const persisted = readSessionStart(plan.id, dayIso)
        const anchor = persisted ?? Date.now()
        sessionAnchorRef.current = anchor
        sessionAnchorPersistedRef.current = persisted != null

        // Rehidratación: si YA había actividad de hoy (logs del server o cola no vacía) pero NO había ancla
        // persistida, la persistimos ahora. Es "mejor tarde que resetear a 0": la sesión claramente ya
        // estaba corriendo. OJO — el ancla tardío SUBCUENTA (arranca en este montaje, no en la 1ª serie
        // real); es el fallback aceptado frente al reset del bug original.
        if (!sessionAnchorPersistedRef.current) {
            const hasTodayActivity = logs.length > 0 || readWorkoutOfflineQueueForPlan(plan.id).length > 0
            if (hasTodayActivity) {
                sessionAnchorPersistedRef.current = persistSessionStart(plan.id, dayIso, anchor)
            }
        }

        const tick = () => setSessionElapsed(elapsedSecondsSince(sessionAnchorRef.current, Date.now()))
        tick() // pinta inmediato al montar/rehidratar (no esperar el primer segundo)
        const id = window.setInterval(tick, 1000)
        // visibilitychange → visible: recalcular YA para que el número no se vea congelado al volver del
        // lock de pantalla / cambio de tab (no esperar el próximo tick). Listener propio; el otro listener
        // de visibilitychange (frescura de logs) queda intacto.
        const onVisible = () => {
            if (document.visibilityState === 'visible') tick()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            window.clearInterval(id)
            document.removeEventListener('visibilitychange', onVisible)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Modelo de pasos del stepper (puro): cada grupo de `sectioned` = un paso (superserie = 1 paso).
    const steps = useMemo(() => buildStepModel(sectioned), [sectioned])
    // Mapa paso.key → { section, group } para pintar el MISMO card en lista y stepper (una sola verdad).
    const groupCtxByKey = useMemo(() => {
        const m = new Map<string, { section: (typeof sectioned)[number]; group: (typeof sectioned)[number]['groups'][number] }>()
        for (const section of sectioned) for (const group of section.groups) m.set(group.key, { section, group })
        return m
    }, [sectioned])

    // Lectura post-montaje del toggle (hidratación-safe, patrón `omni_autotimer`): si estaba activo,
    // arranca en el primer paso incompleto (no en el 0).
    useEffect(() => {
        if (localStorage.getItem(STEPPER_MODE_KEY) === 'true') {
            setStepperEnabled(true)
            setCurrentStepIndex(firstIncompleteStepIndex(steps, logs))
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const registerRowRef = useCallback((blockId: string, setNumber: number, el: HTMLDivElement | null) => {
        const key = `${blockId}:${setNumber}`
        if (el) setRowRefs.current.set(key, el)
        else setRowRefs.current.delete(key)
    }, [])

    // Reconciliación del optimismo (contrato a + e): el hijo reporta el resultado REAL del server.
    // 'error' → REVERTIR el log optimista de esta serie para que el bloque se re-expanda y el error
    // (con "Reintentar") sea visible aunque el bloque se hubiera colapsado. El valor tipeado NO se
    // pierde: sigue como respaldo en la cola (write-through) y el hijo reabre la fila editable.
    // Declarado ANTES del early return "Rutina sin ejercicios" (rules-of-hooks).
    const handleResult = useCallback((blockId: string, setNumber: number, result: SetSyncResult) => {
        if (result === 'error') {
            setSessionLogs((prev) => prev.filter((l) => !(l.block_id === blockId && l.set_number === setNumber)))
        }
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
    // Marcador de progreso (decisión CEO: SIN atenuar — el alumno elige cuál hacer cuando quiera):
    // el primer bloque incompleto del plan sólo recibe un borde sport sutil + elevación (marcador
    // discreto, opacidad PLENA); los completados colapsan a recap. Todas las cards se ven plenas.
    const activeBlockId = currentExerciseIdx === -1 ? null : blocks[currentExerciseIdx].id

    const isBlockCompleted = (block: BlockType) => isBlockComplete(block, sessionLogs)

    const toggleAutoTimer = () => {
        const newValue = !autoTimerEnabled
        setAutoTimerEnabled(newValue)
        localStorage.setItem('omni_autotimer', String(newValue))
    }
    // Toggle "Lista / Paso a paso" del header (mirror de `toggleAutoTimer`, persiste device-scoped).
    // Al ENTRAR al modo stepper aterriza en el primer paso incompleto.
    const setStepperMode = (on: boolean) => {
        if (on === stepperEnabled) return
        setStepperEnabled(on)
        localStorage.setItem(STEPPER_MODE_KEY, String(on))
        if (on) setCurrentStepIndex(firstIncompleteStepIndex(steps, sessionLogs))
    }
    const openTechnique = (exercise: ExerciseType | null) => {
        if (!exercise) return
        setSelectedExercise(exercise)
        setShowTechnique(true)
    }
    // Sustitución de máquina ocupada (Fase L · C): construye el `ExerciseType` del sustituto para el
    // override de la card (nombre/gif/técnica). Su `id` es el del sustituto → `previousHistory` y
    // `exerciseMaxes` (keyeados por id) quedan vacíos por construcción ⇒ guard anti-PR-falso gratis
    // (no "Última vez", no umbral de PR inline en el slot prescrito).
    const substitutionToExercise = (sub: SessionSubstitution): ExerciseType => ({
        id: sub.id,
        name: sub.name,
        muscle_group: sub.muscle_group ?? '',
        video_url: sub.video_url,
        video_start_time: sub.video_start_time,
        video_end_time: sub.video_end_time,
        gif_url: sub.gif_url,
        instructions: sub.instructions,
        exercise_type: sub.exercise_type,
    })
    // Confirmar la elección del sheet → swap in-place SOLO de esta sesión (el plan NO se toca).
    const confirmSubstitution = (option: SubstituteCandidate) => {
        const blockId = substituteSheetBlockId
        if (!blockId) return
        const block = blocks.find((b) => b.id === blockId)
        const prescribed = block ? getExercise(block) : null
        setSubstitutionByBlock((prev) => ({
            ...prev,
            [blockId]: {
                id: option.id,
                name: option.name,
                gif_url: option.gif_url,
                video_url: option.video_url,
                video_start_time: option.video_start_time,
                video_end_time: option.video_end_time,
                instructions: option.instructions,
                muscle_group: option.muscle_group,
                equipment: option.equipment,
                exercise_type: option.exercise_type,
                prescribedName: prescribed?.name ?? 'Ejercicio',
            },
        }))
        setSubstituteSheetBlockId(null)
    }
    // Deshacer (solo antes del 1er set logueado del bloque — NG-5): el bloque vuelve al prescrito.
    const undoSubstitution = (blockId: string) => {
        setSubstitutionByBlock((prev) => {
            if (!prev[blockId]) return prev
            const next = { ...prev }
            delete next[blockId]
            return next
        })
    }
    /** Scroll a la siguiente serie incompleta (superserie) o al siguiente bloque incompleto. */
    const scrollToNextIncomplete = (fromLogs: Props['logs']) => {
        const nextIncomplete = blocks.find((b) => !isBlockComplete(b, fromLogs))
        if (!nextIncomplete) return
        // Modo stepper: en vez de scrollear, avanza de PASO (auto-avance suave). Dentro de una
        // superserie este handler solo corre cuando el GRUPO cerró (nextPos == null en `handleLogged`),
        // así que no rompe la guía interleaved A1→B1 (esa sigue con `nextCue` + toast, sin cambiar de paso).
        if (stepperEnabled) {
            const idx = stepIndexOfBlock(steps, nextIncomplete.id)
            if (idx >= 0) setCurrentStepIndex(idx)
            return
        }
        const info = supersetInfo.get(nextIncomplete.id)
        if (info) {
            const order = buildRoundOrder(info.members)
            const pos = order.find((p) => !fromLogs.some((l) => l.block_id === p.blockId && l.set_number === p.set))
            if (pos) {
                smoothScrollIntoViewIfNeeded(setRowRefs.current.get(`${pos.blockId}:${pos.set}`), 'center')
                return
            }
        }
        smoothScrollIntoViewIfNeeded(blockRefs.current.get(nextIncomplete.id), 'start')
    }

    const handleLogged = (payload: OptimisticLogPayload) => {
        // Marca de actividad (Fix A): al primer log, futuras REENTRADAS por atrás refrescan aunque el
        // snapshot del client Router Cache vuelva vacío.
        markWorkoutTouched()
        // Cronómetro (BUG 1): al PRIMER log de este montaje materializamos el ancla en localStorage si aún
        // no lo estaba → la duración sobrevive un remontaje posterior (atrás/reload/kill de la PWA).
        // Idempotente: montajes "de paseo" (sin logs) nunca escriben, así no inflan el entreno real.
        if (!sessionAnchorPersistedRef.current) {
            sessionAnchorPersistedRef.current = persistSessionStart(
                plan.id,
                sessionDayIsoRef.current,
                sessionAnchorRef.current,
            )
        }
        // Estado (puro) — dedup por block+set, PRESERVANDO los ejes tipados (actual_*) del payload
        // para que la fila de hold/cardio no se re-renderice vacía al confirmar (bug forense hold).
        setSessionLogs((prev) => applyOptimisticSessionLog(prev, payload))

        // Guía/scroll (efectos) — calculados fuera del updater para no duplicarse en StrictMode.
        const prev = sessionLogs
        const nextLogs = applyOptimisticSessionLog(prev, payload)
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
                    toast.info(`Sin descanso — sigue con ${label}`)
                }
                setTimeout(() => {
                    smoothScrollIntoViewIfNeeded(setRowRefs.current.get(`${nextPos.blockId}:${nextPos.set}`), 'center')
                }, 350)
            } else {
                // Grupo completo → floreo del recap + saltar al siguiente bloque/serie incompleto.
                setJustCompleted({ id: payload.blockId, nonce: Date.now() })
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
            // Floreo al cerrar el ejercicio: la card colapsa a recap y el recap celebra una vez.
            setJustCompleted({ id: payload.blockId, nonce: Date.now() })
            setTimeout(() => scrollToNextIncomplete(nextLogs), 350)
        }
    }
    const handleFinish = async () => {
        if (finishing.current) return
        // Contrato (c): no finalizar en falso si quedan series sin sincronizar. PERO el write-through
        // encola SIEMPRE antes de la red, y la reconciliación que saca el item de la cola vive en un
        // efecto del hijo que NO corre si la fila colapsó/desmontó (última serie de un bloque/grupo)
        // antes de que llegara `state.success` → el item queda HUÉRFANO aunque el server YA guardó.
        // Por eso, si hay pendientes, intentamos un flush inmediato: los huérfanos ya-guardados se
        // reenvían idempotente (last-wins por block/set/día) y salen de la cola; sólo si algo queda de
        // verdad (sin red) avisamos. Esto mata el falso "1 serie sin sincronizar" con buena conexión.
        const pending = readWorkoutOfflineQueueForPlan(plan.id)
        if (pending.length > 0) {
            finishing.current = true
            let stillPending = pending.length
            try {
                const res = await flushWorkoutQueue(
                    (item) => {
                        const fd = workoutLogToFormData(item)
                        // Editando un día pasado: el flush de la cola también debe editar ESA fecha
                        // (modo solo-UPDATE), no insertar un log de HOY. Sin `targetDate` no-op.
                        if (targetDate) fd.set('target_date', targetDate)
                        return logSetAction({}, fd)
                    },
                    { planId: plan.id },
                )
                stillPending = res.remainingInScope
                if (res.flushed > 0) router.refresh()
            } catch {
                // Flush no pudo correr (excepción global) → conservamos el conteo original y avisamos.
            } finally {
                finishing.current = false
            }
            if (stillPending > 0) {
                const n = stillPending
                toast.warning(
                    `${n} serie${n !== 1 ? 's' : ''} sin sincronizar`,
                    {
                        description: 'Se guardarán cuando vuelva la conexión. Puedes finalizar igual o esperar.',
                        duration: 6000,
                        action: {
                            label: 'Finalizar igual',
                            onClick: () => {
                                // Fix C (informe forense, P2): invalidación server-side de la vista al
                                // terminar (defensa complementaria a A+B, no sustituto). Fire-and-forget.
                                void revalidateWorkoutViewAction(coachSlug, plan.id).catch(() => {})
                                markFirstWorkoutCompleted()
                                // Duración final desde el ancla EN ESTE INSTANTE (no el último tick del
                                // estado, que puede ir ~1s atrasado). Luego limpiamos el ancla → una 2ª
                                // sesión del mismo día arranca de cero (BUG 1).
                                setFinishedElapsed(elapsedSecondsSince(sessionAnchorRef.current, Date.now()))
                                clearSessionStart(plan.id, sessionDayIsoRef.current)
                                // BUG 2: la sesión terminó → los borradores y el snapshot local ya no aplican.
                                clearAllDrafts(plan.id)
                                clearSessionSnapshot(plan.id, sessionDayIsoRef.current)
                                setShowCompleted(true)
                            },
                        },
                    },
                )
                return
            }
        }
        // Fix C (informe forense, P2): al FINALIZAR (no por serie — evita parpadeo/scroll) invalidamos la
        // ruta del workout + dashboard, para que una navegación posterior no reuse una entrada stale.
        // Complementa A+B (el garante de la frescura al reentrar sigue siendo el router.refresh de Fix A).
        void revalidateWorkoutViewAction(coachSlug, plan.id).catch(() => {})
        // Señal de "primer workout completado" → arma el prompt de instalación PWA (gating por engagement).
        markFirstWorkoutCompleted()
        // Duración final desde el ancla EN ESTE INSTANTE (no el último tick del estado) + limpieza del
        // ancla persistido → una 2ª sesión del mismo día arranca de cero (BUG 1).
        setFinishedElapsed(elapsedSecondsSince(sessionAnchorRef.current, Date.now()))
        clearSessionStart(plan.id, sessionDayIsoRef.current)
        // BUG 2: la sesión terminó → los borradores y el snapshot local ya no aplican.
        clearAllDrafts(plan.id)
        clearSessionSnapshot(plan.id, sessionDayIsoRef.current)
        setShowCompleted(true)
    }
    // Contexto del programa para el nudge "lo que viene" del resumen (reusa la sub-línea del header;
    // sin queries — el próximo plan concreto no está en el payload → no se resuelve acá).
    const nextHint = phaseName || program
        ? `${phaseName ? `${phaseName} · ` : ''}${program?.program_structure_type === 'cycle'
            ? `Día ${plan.day_of_week || 1} de ${program.cycle_length || '?'}`
            : 'Programa semanal'}`
        : null

    // Render de UN grupo (superserie o bloque suelto) → misma salida en lista y stepper (una sola
    // verdad, cero divergencia visual). `allowCollapse`: true en la lista (los completados colapsan a
    // recap para ahorrar espacio); false en el stepper (un paso a la vez, siempre card completa para
    // poder editar). "Mover sin cambiar": el JSX y las keys son idénticos a los del render inline.
    const renderGroup = (
        group: (typeof sectioned)[number]['groups'][number],
        { allowCollapse }: { allowCollapse: boolean },
    ) => {
        if (group.type === 'superset') {
            const info = supersetInfo.get(group.blocks[0].id)!
            const members = info.members
            const groupComplete = members.every((m) => isBlockCompleted(m))
            const groupActive = activeBlockId != null && members.some((m) => m.id === activeBlockId)
            const groupFocus: 'active' | 'upcoming' | 'done' = groupComplete ? 'done' : groupActive ? 'active' : 'upcoming'
            // Superserie completa → colapsa a recap (reexpandible con un tap). Solo en la lista.
            if (allowCollapse && groupFocus === 'done' && !expandedDone[group.key]) {
                const names = members.map((m) => getExercise(m)?.name).filter(Boolean).join(' + ')
                return (
                    <CollapsedExerciseBar
                        key={group.key}
                        name={names || 'Superserie'}
                        sub={`Superserie · ${members.length} ejercicios`}
                        reducedMotion={reducedMotion}
                        celebrate={justCompleted != null && members.some((m) => m.id === justCompleted.id) && !reducedMotion}
                        onExpand={() => toggleExpandDone(group.key)}
                    />
                )
            }
            return (
                <motion.div
                    key={group.key}
                    layout={!reducedMotion}
                    className="rounded-card"
                    transition={reducedMotion ? { duration: 0 } : springs.smooth}
                    style={groupFocus === 'active' ? { boxShadow: '0 8px 32px -14px color-mix(in srgb, var(--sport-500) 60%, transparent)' } : undefined}
                >
                    <SupersetGroupCard
                        info={info}
                        sessionLogs={sessionLogs}
                        currentWeek={currentWeek}
                        weeksToRepeat={program?.weeks_to_repeat}
                        previousHistory={previousHistory}
                        lastSessionByBlock={lastSessionByBlock}
                        exerciseMaxes={exerciseMaxes}
                        cardio={cardio}
                        autoTimerEnabled={autoTimerEnabled}
                        nextCue={nextCue}
                        onLogged={handleLogged}
                        onResult={handleResult}
                        openTechnique={openTechnique}
                        registerRowRef={registerRowRef}
                        getExercise={getExercise}
                    />
                </motion.div>
            )
        }
        return (
        <div key={group.key} className="space-y-3">
            <div className="space-y-3">
                {group.blocks.sort((a, b) => a.order_index - b.order_index).map((block, blockIndex) => {
                    const prescribed = getExercise(block)
                    if (!prescribed) return null
                    // Sustitución activa (Fase L · C): la card, el nombre, el gif y la técnica pasan al
                    // sustituto. El `id` override vacía `previousHistory`/`exerciseMaxes` keyeados por id
                    // ⇒ guard anti-PR-falso (no "Última vez", no umbral de PR) sin tocar el motor.
                    const sub = substitutionByBlock[block.id]
                    const exercise = sub ? substitutionToExercise(sub) : prescribed
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
                    // Marcador de progreso (SIN atenuar — decisión CEO): la card activa (primer bloque
                    // incompleto) sólo lleva borde sport + elevación (marcador discreto); las completadas
                    // colapsan a recap. TODAS las cards a opacidad e iluminación plenas.
                    const focus: 'active' | 'upcoming' | 'done' = complete
                        ? 'done'
                        : block.id === activeBlockId ? 'active' : 'upcoming'
                    const recapWeight = suggestedWeightKg ?? block.target_weight_kg
                    const recapSub = effType === 'strength'
                        ? `${block.sets} × ${block.reps}${recapWeight != null ? ` · ${recapWeight} kg` : ''}`
                        : `${block.sets} ${block.sets === 1 ? 'serie' : 'series'} · ${exercise.muscle_group}`
                    // Completado → recap delgado; tap lo reexpande para editar una serie. Solo en la lista.
                    if (allowCollapse && focus === 'done' && !expandedDone[block.id]) {
                        return (
                            <Fragment key={block.id}>
                                <CollapsedExerciseBar
                                    name={exercise.name}
                                    sub={recapSub}
                                    reducedMotion={reducedMotion}
                                    celebrate={justCompleted?.id === block.id && !reducedMotion}
                                    onExpand={() => toggleExpandDone(block.id)}
                                />
                            </Fragment>
                        )
                    }
                    return (
                        <Fragment key={block.id}>
                        <SingleExerciseCard
                            block={block}
                            blockIndex={blockIndex}
                            group={group}
                            exercise={exercise}
                            effType={effType}
                            focus={focus}
                            complete={complete}
                            doneCount={doneCount}
                            firstUnlogged={firstUnlogged}
                            suggestedWeightKg={suggestedWeightKg}
                            overloadLabel={overloadLabel}
                            overloadDetail={overloadDetail}
                            cueLine={cueLine}
                            hasDetails={hasDetails}
                            detailsOpen={detailsOpen}
                            prevList={prevList}
                            bestPrev={bestPrev}
                            beatIt={beatIt}
                            blockLogs={blockLogs}
                            exerciseMaxes={exerciseMaxes}
                            fillByBlock={fillByBlock}
                            reopenSignal={reopenSignal}
                            cardio={cardio}
                            autoTimerEnabled={autoTimerEnabled}
                            reducedMotion={reducedMotion}
                            blockRefs={blockRefs}
                            toggleDetails={toggleDetails}
                            toggleExpandDone={toggleExpandDone}
                            setFillByBlock={setFillByBlock}
                            openTechnique={openTechnique}
                            substitution={sub ? { exerciseId: sub.id, exerciseName: sub.name, reason: SUBSTITUTION_REASON, prescribedName: sub.prescribedName } : null}
                            canSubstitute={effType === 'strength' && doneCount === 0}
                            onOpenSubstitute={() => setSubstituteSheetBlockId(block.id)}
                            onUndoSubstitution={() => undoSubstitution(block.id)}
                            handleLogged={handleLogged}
                            handleResult={handleResult}
                        />
                        </Fragment>
                    )
                })}
            </div>
        </div>
        )
    }

    // Vistas del rail + anuncio a11y del stepper (nombre del ejercicio por paso, estado de completitud).
    const stepTitle = (step: (typeof steps)[number]): string => {
        if (step.kind === 'superset') {
            const names = step.blocks.map((b) => getExercise(b)?.name).filter(Boolean)
            return names.length ? `Superserie · ${names.join(' + ')}` : 'Superserie'
        }
        return getExercise(step.blocks[0])?.name ?? 'Ejercicio'
    }
    const stepViews: StepperStepView[] = steps.map((step) => ({
        key: step.key,
        kind: step.kind,
        title: stepTitle(step),
        sectionTitle: step.sectionTitle,
        muted: step.muted,
        complete: isStepComplete(step, sessionLogs),
    }))
    // Pinta el card del paso `index` reusando `renderGroup` (siempre completo — sin colapsar).
    const renderStepNode = (index: number) => {
        const step = steps[index]
        if (!step) return null
        const ctx = groupCtxByKey.get(step.key)
        if (!ctx) return null
        return renderGroup(ctx.group, { allowCollapse: false })
    }

    // Banners de Ola 1 (mockup v3.3): "Editando" (día pasado, `?fecha=`) y "Recuperando" (pendiente de
    // la semana, `?recuperar=`). Sólo uno suele estar activo; el nombre del día sale de la fecha validada.
    const editWeekday = targetDate ? weekdayNameFromIso(targetDate) : ''
    const recoverWeekday = recoverDate ? weekdayNameFromIso(recoverDate) : ''

    return (
        <TargetDateProvider value={targetDate}>
        <WorkoutTimerProvider>
          <WorkoutKeypadProvider>
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
                            <div className="flex items-center gap-1.5 shrink-0">
                                {/* Toggle "Lista / Paso a paso" (DA-3) — control segmentado, opt-in device-scoped. */}
                                <div role="group" aria-label="Modo de ejecución" className="flex rounded-control bg-white/[0.06] p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setStepperMode(false)}
                                        aria-pressed={!stepperEnabled}
                                        title="Ver todos los ejercicios en lista"
                                        className={cn(
                                            'flex h-9 items-center gap-1 rounded-[10px] px-2 text-[11px] font-bold transition-colors',
                                            !stepperEnabled ? 'bg-[var(--sport-500)] text-white' : 'text-on-dark-muted hover:text-on-dark',
                                        )}
                                    >
                                        <List className="h-3.5 w-3.5" /> Lista
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStepperMode(true)}
                                        aria-pressed={stepperEnabled}
                                        title="Un ejercicio a la vez"
                                        className={cn(
                                            'flex h-9 items-center gap-1 rounded-[10px] px-2 text-[11px] font-bold transition-colors',
                                            stepperEnabled ? 'bg-[var(--sport-500)] text-white' : 'text-on-dark-muted hover:text-on-dark',
                                        )}
                                    >
                                        <GalleryHorizontal className="h-3.5 w-3.5" /> Pasos
                                    </button>
                                </div>
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

                {/* Editando un día PASADO (Ola 1): cada serie edita esa fecha en modo solo-UPDATE. */}
                {targetDate && (
                    <div className="flex items-center gap-2.5 border-b border-white/10 bg-white/[0.05] px-4 py-2.5 backdrop-blur-sm">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-[var(--sport-500)]/15 text-[var(--sport-300)]">
                            <Pencil className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-xs font-semibold text-on-dark">
                            Editando registros del{' '}
                            <span className="font-bold text-on-dark">{editWeekday.toLowerCase()}</span>
                        </p>
                    </div>
                )}

                {/* Recuperando un pendiente de la semana (Ola 1): SOLO visual; el guardado es de HOY. */}
                {recoverDate && (
                    <div className="flex items-center gap-2.5 border-b border-amber-400/25 bg-amber-500/[0.14] px-4 py-2.5 backdrop-blur-sm dark:bg-amber-500/[0.12]">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-amber-400/20 text-amber-300">
                            <CalendarSync className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[13px] font-black leading-tight text-amber-200">
                                Recuperando: {recoverWeekday}
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-amber-100/80">
                                Al terminar, tu {recoverWeekday.toLowerCase()} queda listo en esta semana
                            </p>
                        </div>
                    </div>
                )}

                {stepperEnabled ? (
                    /* Modo "paso a paso" — un ejercicio/superserie a la vez (Fase L · workstream A).
                       El RestTimer/WorkoutTimerProvider/header/barra "Finalizar" quedan FUERA del pager. */
                    <StepperExecution
                        steps={stepViews}
                        currentIndex={currentStepIndex}
                        onIndexChange={setCurrentStepIndex}
                        renderStep={renderStepNode}
                        reducedMotion={reducedMotion}
                    />
                ) : (
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
                                    {section.groups.map((group) => renderGroup(group, { allowCollapse: true }))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
                )}

                <div className="exec-finish-bar fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[var(--ink-950)]/90 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] backdrop-blur-xl">
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
                        durationSec={finishedElapsed ?? sessionElapsed}
                        programName={program?.name ?? null}
                        nextHint={nextHint}
                        // Guard anti-PR-falso (DC-4/AC-C5): un bloque sustituido no marca PR en el slot
                        // prescrito (su peso no cuenta como récord ni dispara la PRShareCardModal).
                        substitutedBlockIds={Object.keys(substitutionByBlock)}
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

                {/* Bottom-sheet de sustitución de máquina ocupada (Fase L · workstream C). */}
                {(() => {
                    const openBlock = substituteSheetBlockId ? blocks.find((b) => b.id === substituteSheetBlockId) : null
                    const openEx = openBlock ? getExercise(openBlock) : null
                    return (
                        <SubstituteExerciseSheet
                            open={substituteSheetBlockId != null}
                            onOpenChange={(o) => { if (!o) setSubstituteSheetBlockId(null) }}
                            blockId={substituteSheetBlockId}
                            prescribedName={openEx?.name ?? 'Ejercicio'}
                            muscleGroup={openEx?.muscle_group ?? ''}
                            onConfirm={confirmSubstitution}
                        />
                    )
                })()}

            </div>
          </WorkoutKeypadProvider>
        </WorkoutTimerProvider>
        </TargetDateProvider>
    )
}