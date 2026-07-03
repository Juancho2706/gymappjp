'use client'

import { useActionState, useEffect, useRef, useOptimistic, useState, startTransition } from 'react'
import { useParams } from 'next/navigation'
import { Check, Loader2, StickyNote, Info } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { logSetAction, type LogState } from './_actions/workout-log.actions'
import { useWorkoutTimer, parseRestTime } from './WorkoutTimerProvider'
import { enqueueWorkoutLog } from '@/lib/workout-offline-queue'
import { triggerHaptic } from '@/lib/client/haptics'
import { cn } from '@/lib/utils'
import { springs } from '@/lib/animation-presets'

const initialState: LogState = {}

/** Variante del registro por tipo efectivo (specs/movida-entrenamiento, AC4). */
export type LogSetMode = 'strength' | 'cardio' | 'mobility' | 'roller'

interface Props {
    blockId: string
    setNumber: number
    restTimeStr: string | null
    /**
     * Descanso de aproximación (M2 · 6): si existe, la 1ª serie de un bloque de ≥3 series usa este
     * descanso (más corto) en vez de `restTimeStr`. Sólo aplica al camino strength de series sueltas
     * (las superseries mandan por `closesRound`). null ⇒ siempre `restTimeStr`.
     */
    warmupRestTimeStr?: string | null
    /** Total de series del bloque — heurística del descanso de aproximación (warmup sólo si ≥3). */
    totalSets?: number
    /** "Qué sigue" para la barra de descanso (M2 · 1) — nombre del ejercicio/serie próxima. */
    nextUpLabel?: string
    /** Peso objetivo sugerido (sobrecarga progresiva): pre-llena el input si no hay log aún. */
    suggestedWeightKg?: number | null
    /** Máximo histórico (kg) del ejercicio: si el peso registrado lo iguala o supera, la serie
     *  pulsa dorado (PR inline). Sólo presentación — no cambia el motor de logging. */
    prThresholdKg?: number | null
    existingLog?: {
        weight_kg: number | null
        reps_done: number | null
        rpe: number | null
        rir?: number | null
        note?: string | null
        actual_duration_sec?: number | null
        actual_distance_m?: number | null
        actual_hold_sec?: number | null
        actual_avg_hr?: number | null
    }
    autoTimerEnabled?: boolean
    /** default 'strength' ⇒ render EXACTAMENTE el de siempre (anti-regresión). */
    mode?: LogSetMode
    /**
     * Serie activa (primera sin registrar del bloque / ronda). Solo control de JERARQUÍA visual:
     * la fila activa es protagonista (inputs grandes + "✓ Listo"), las próximas quedan recesivas.
     * NO cambia el motor de logging ni permite/impide loggear fuera de orden.
     */
    isActive?: boolean
    /**
     * Prefill "= última vez" (quick-win E2-3): al cambiar `nonce`, escribe peso/reps en los
     * inputs (uncontrolled) de la serie activa. NO cambia el motor — solo pre-rellena para editar.
     */
    prefill?: { weight: number | null; reps: number | null; nonce: number }
    /**
     * Deshacer (quick-win E2-4): al cambiar el número, reabre esta fila (editing=true) para
     * corregir la última serie logueada (no existe DELETE del log — se reusa el path de edición).
     */
    reopenNonce?: number
    /**
     * Superserie (F2): la fila vive dentro de una ronda intercalada. Cambia SOLO el disparo
     * del descanso automático: no arranca el descanso del bloque por serie; arranca el descanso
     * COMPLETO del grupo (`groupRestSeconds`) recién cuando la serie CIERRA la ronda
     * (`closesRound()` → true). Si no cierra, no dispara descanso (el padre muestra la guía
     * "seguí con B1"). Sin esta prop, el comportamiento del descanso es el de siempre.
     */
    supersetRest?: {
        groupRestSeconds: number
        closesRound: () => boolean
    }
    onLogged?: (payload: {
        blockId: string
        setNumber: number
        weightKg: number | null
        repsDone: number | null
        rpe: number | null
        rir: number | null
        note?: string | null
    }) => void
}

export function LogSetForm(props: Props) {
    // Bloques cardio/movilidad/roller registran sus propios ejes (AC4);
    // strength sigue por el camino histórico sin UN SOLO cambio funcional.
    if (props.mode && props.mode !== 'strength') {
        return <TypedLogSetRow {...props} mode={props.mode} />
    }
    return <StrengthLogSetForm {...props} />
}

const RPE_OPTS = [6, 7, 8, 9, 10] as const

/** Tabla estática de RPE → reps en reserva (quick-win E2-7, mini-sheet explicativa 1-tap). */
const RPE_INFO: { rpe: number; text: string }[] = [
    { rpe: 10, text: 'Máximo esfuerzo · 0 reps en reserva (al fallo)' },
    { rpe: 9, text: 'Te quedaba 1 repetición' },
    { rpe: 8, text: 'Te quedaban 2 repeticiones' },
    { rpe: 7, text: 'Te quedaban 3 repeticiones' },
    { rpe: 6, text: 'Te quedaban 4 repeticiones' },
]

/**
 * Escala de esfuerzo ÚNICA por serie de fuerza (decisión CEO): RPE segmentado (dots 6-10).
 * Reemplaza el input numérico de RPE y el slider RIR. `name`/payload de RPE intactos —
 * el valor viaja por el submit igual que antes; esto es sólo la UI de captura.
 */
function RpeDots({
    value,
    onChange,
    reducedMotion,
    compact = false,
}: {
    value: number | null
    onChange: (v: number) => void
    reducedMotion: boolean | null
    compact?: boolean
}) {
    return (
        <div
            role="radiogroup"
            aria-label="RPE (esfuerzo percibido, 6-10)"
            className="flex items-center gap-0.5"
        >
            {RPE_OPTS.map((n) => {
                const filled = value != null && n <= value
                const selected = value === n
                return (
                    <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={`RPE ${n}`}
                        onClick={() => onChange(n)}
                        className={cn(
                            'flex h-11 items-center justify-center',
                            compact ? 'w-6' : 'w-7',
                        )}
                    >
                        <motion.span
                            className={cn(
                                'block rounded-full',
                                filled ? 'bg-[var(--sport-500)]' : 'bg-white/15',
                            )}
                            animate={{ scale: selected ? 1.3 : filled ? 1 : 0.7 }}
                            transition={reducedMotion ? { duration: 0 } : springs.snappy}
                            style={{ width: compact ? 9 : 11, height: compact ? 9 : 11 }}
                        />
                    </button>
                )
            })}
            <span className={cn('ml-1 w-5 text-center font-mono font-bold tabular-nums text-[var(--sport-300)]', compact ? 'text-[11px]' : 'text-xs')}>
                {value != null ? value : '–'}
            </span>
        </div>
    )
}

function StrengthLogSetForm({
    blockId,
    setNumber,
    restTimeStr,
    warmupRestTimeStr,
    totalSets,
    nextUpLabel,
    suggestedWeightKg,
    prThresholdKg,
    existingLog,
    autoTimerEnabled = true,
    isActive = false,
    prefill,
    reopenNonce,
    supersetRest,
    onLogged,
}: Props) {
    const params = useParams<{ coach_slug: string; planId: string }>()
    const [state, formAction] = useActionState(logSetAction, initialState)
    const [optimisticLogged, addOptimisticLogged] = useOptimistic(
        !!existingLog || state.success,
        (_, newValue: boolean) => newValue
    )

    const isLogged = optimisticLogged
    const { startRest, cancelRest } = useWorkoutTimer()
    const reducedMotion = useReducedMotion()
    const weightRef = useRef<HTMLInputElement>(null)
    const repsRef = useRef<HTMLInputElement>(null)
    const formRef = useRef<HTMLFormElement>(null)
    // Celebraciones sobrias (M1): al cerrar la serie el chip hace un settle (check elástico); si el
    // peso alcanza el máximo histórico, un pulso dorado 300ms. Refs (no state) porque el chip se
    // MONTA de nuevo al colapsar y lee el valor vigente sin disparar un re-render extra. En logs ya
    // existentes (carga de página) quedan en false ⇒ sin animación fantasma.
    const settleRef = useRef(false)
    const prRef = useRef(false)
    // Reapertura de una serie cerrada (tap en el chip recap → fila editable).
    const [editing, setEditing] = useState(false)
    // Escala única surfaceada: RPE (dots). El name/payload no cambia — se inyecta en el submit.
    const [rpe, setRpe] = useState<number | null>(existingLog?.rpe ?? null)
    // Explicación RPE 1-tap (quick-win E2-7).
    const [rpeInfoOpen, setRpeInfoOpen] = useState(false)
    // Nota rápida por serie (quick-win E2-6). Source of truth = state; viaja por un mirror oculto.
    const [note, setNote] = useState(existingLog?.note ?? '')
    const [noteOpen, setNoteOpen] = useState(false)
    // El RIR prescrito ya no se captura por serie (decisión CEO). Preservamos el histórico
    // en re-submits de edición para no perder datos viejos.
    const rirCarry = existingLog?.rir ?? null
    // Respaldo de valores para el chip recap mientras el prop existingLog se propaga.
    const [chipValues, setChipValues] = useState<{ w: number | null; r: number | null } | null>(null)

    // Prefill "= última vez" (quick-win E2-3): escribe en los inputs uncontrolled al cambiar el nonce.
    useEffect(() => {
        if (!prefill) return
        if (weightRef.current && prefill.weight != null) weightRef.current.value = String(prefill.weight)
        if (repsRef.current && prefill.reps != null) repsRef.current.value = String(prefill.reps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefill?.nonce])

    // Deshacer (quick-win E2-4): reabre esta fila para corregir la última serie logueada.
    useEffect(() => {
        if (reopenNonce == null) return
        setEditing(true)
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reopenNonce])

    const noteTrimmed = note.trim() || null
    const showNoteControls = isActive || editing

    const collapsed = isLogged && !editing

    const buildRest = () => {
        // Editar una serie ya cerrada no toca el descanso en curso.
        if (isLogged) return
        // Auto-skip (M2 · 4): con auto-timer OFF, registrar la serie corta cualquier descanso manual en curso.
        if (!autoTimerEnabled) { cancelRest(); return }
        triggerHaptic(50)
        if (supersetRest) {
            // Superserie: descanso completo del grupo SOLO al cerrar la ronda (semántica intacta);
            // si no la cierra, seguís con el otro ejercicio → cortá el descanso en curso (auto-skip).
            if (supersetRest.closesRound()) startRest(String(supersetRest.groupRestSeconds), { label: nextUpLabel })
            else cancelRest()
        } else {
            // Descanso de aproximación (M2 · 6): la 1ª serie de un bloque de ≥3 series usa el warmup.
            const useWarmup = !!warmupRestTimeStr && setNumber === 1 && (totalSets ?? 0) >= 3
            const restStr = useWarmup ? (warmupRestTimeStr as string) : restTimeStr
            if (parseRestTime(restStr) > 0) startRest(restStr, { label: nextUpLabel, warmup: useWarmup })
            else cancelRest()
        }
    }

    const handleSubmit = (formData: FormData) => {
        // El RPE viaja por el submit igual que siempre; ahora su origen es el control segmentado.
        if (rpe != null) formData.set('rpe', String(rpe))
        else formData.delete('rpe')
        if (rirCarry != null) formData.set('rir', String(rirCarry))

        // Offline guard: enqueue and show optimistic state without hitting server
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const wRaw = formData.get('weight_kg')
            const rRaw = formData.get('reps_done')
            const w = wRaw === null || wRaw === '' ? null : Number(String(wRaw).replace(',', '.'))
            const r = rRaw === null || rRaw === '' ? null : Number(rRaw)
            enqueueWorkoutLog({
                blockId,
                setNumber,
                weightKg: w,
                repsDone: r,
                rpe,
                rir: rirCarry,
                note: noteTrimmed,
                planId: params.planId,
                coachSlug: params.coach_slug,
                timestamp: Date.now(),
            })
            settleRef.current = true
            prRef.current = prThresholdKg != null && w != null && w > 0 && w >= prThresholdKg
            setChipValues({ w, r })
            addOptimisticLogged(true)
            setNoteOpen(false)
            setEditing(false)
            toast.info('Sin conexión — el log se guardará al reconectar')
            return
        }

        addOptimisticLogged(true)
        setNoteOpen(false)
        setEditing(false)
        buildRest()

        // Normalize decimal comma → dot (es/pt locales)
        const wRaw = formData.get('weight_kg')
        if (wRaw !== null && wRaw !== '') formData.set('weight_kg', String(wRaw).replace(',', '.'))

        const weightRaw = formData.get('weight_kg')
        const repsRaw = formData.get('reps_done')
        const w = weightRaw === null || weightRaw === '' ? null : Number(weightRaw)
        const r = repsRaw === null || repsRaw === '' ? null : Number(repsRaw)
        settleRef.current = true
        prRef.current = prThresholdKg != null && w != null && w > 0 && w >= prThresholdKg
        setChipValues({ w, r })
        onLogged?.({
            blockId,
            setNumber,
            weightKg: w,
            repsDone: r,
            rpe,
            rir: rirCarry,
            note: noteTrimmed,
        })

        formAction(formData)
    }

    // ── Chip recap (serie cerrada) — tap para reabrir editable ────────────────
    if (collapsed) {
        const dispW = existingLog?.weight_kg ?? chipValues?.w ?? null
        const dispR = existingLog?.reps_done ?? chipValues?.r ?? null
        // Se celebra sólo la serie recién cerrada en esta sesión (refs en false para logs cargados).
        const celebrate = settleRef.current && !reducedMotion
        const prGlow = prRef.current && !reducedMotion
        return (
            <motion.button
                layout={!reducedMotion}
                transition={reducedMotion ? { duration: 0 } : springs.smooth}
                type="button"
                onClick={() => setEditing(true)}
                className="relative flex w-full items-center gap-2 overflow-hidden rounded-control border border-[var(--sport-500)]/25 bg-[var(--sport-500)]/[0.06] px-3 py-2 text-left transition-colors hover:bg-[var(--sport-500)]/[0.12] active:scale-[0.99]"
                aria-label={`Serie ${setNumber} registrada — tocá para editar`}
            >
                {prGlow && (
                    <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-control ring-2 ring-amber-400"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.8, 0] }}
                        transition={{ duration: 0.32, times: [0, 0.4, 1] }}
                    />
                )}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sport-500)]/20 text-[11px] font-black tabular-nums text-[var(--sport-300)]">
                    {setNumber}
                </span>
                <span className="font-mono text-[13px] font-bold tabular-nums text-on-dark">
                    {dispW ?? '–'}
                    <span className="text-on-dark-muted"> × </span>
                    {dispR ?? '–'}
                </span>
                {rpe != null && (
                    <span className="font-mono text-[11px] font-semibold text-on-dark-muted">RPE {rpe}</span>
                )}
                {noteTrimmed && (
                    <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="Serie con nota" />
                )}
                <motion.span
                    className="ml-auto shrink-0 text-[var(--sport-400)]"
                    initial={celebrate ? { scale: 0, rotate: -25 } : false}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={celebrate ? springs.elastic : { duration: 0 }}
                >
                    <Check className="h-4 w-4" />
                </motion.span>
            </motion.button>
        )
    }

    // ── Fila de captura (activa = protagonista; próxima = recesiva) ────────────
    const inputClass = cn(
        'w-full rounded-control bg-white/[0.06] border text-center font-semibold font-mono transition-colors focus:outline-none focus:ring-1 text-on-dark border-[var(--border-inverse)] focus:border-[var(--sport-500)] focus:ring-[var(--sport-500)]',
        isActive ? 'h-14 text-2xl' : 'h-11 text-base',
    )

    return (
        <motion.div
            layout={!reducedMotion}
            transition={reducedMotion ? { duration: 0 } : springs.smooth}
            className={cn(
                'rounded-control border transition-colors',
                isActive
                    ? 'border-[var(--sport-500)]/50 bg-[var(--sport-500)]/[0.06]'
                    : 'border-[var(--border-inverse)] bg-white/[0.02] opacity-60',
            )}
        >
            <form
                key={existingLog ? `log-${existingLog.weight_kg}-${existingLog.reps_done}` : 'new'}
                ref={formRef}
                action={handleSubmit}
                className="p-3"
            >
                <input type="hidden" name="block_id" value={blockId} />
                <input type="hidden" name="set_number" value={setNumber} />
                {/* Nota (quick-win E2-6): mirror oculto — SIEMPRE montado → viaja en cada submit sin duplicar name. */}
                <input type="hidden" name="note" value={note} />

                <div className="flex items-center gap-2.5">
                    <span
                        className={cn(
                            'flex shrink-0 items-center justify-center rounded-full font-black tabular-nums',
                            isActive
                                ? 'h-7 w-7 bg-[var(--sport-500)]/20 text-[13px] text-[var(--sport-300)]'
                                : 'h-6 w-6 bg-white/[0.06] text-[11px] text-on-dark-muted',
                        )}
                    >
                        {setNumber}
                    </span>
                    <div className="flex flex-1 items-end gap-2">
                        <label className="flex-1">
                            <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.08em] text-on-dark-muted">Kg</span>
                            <input
                                ref={weightRef}
                                name="weight_kg"
                                type="number"
                                step="0.5"
                                min="0"
                                inputMode="decimal"
                                defaultValue={existingLog?.weight_kg ?? suggestedWeightKg ?? ''}
                                placeholder="-"
                                className={inputClass}
                            />
                        </label>
                        <span className={cn('shrink-0 text-on-dark-muted', isActive ? 'pb-3 text-xl' : 'pb-2 text-base')}>×</span>
                        <label className="flex-1">
                            <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.08em] text-on-dark-muted">Reps</span>
                            <input
                                ref={repsRef}
                                name="reps_done"
                                type="number"
                                min="0"
                                inputMode="numeric"
                                defaultValue={existingLog?.reps_done ?? ''}
                                placeholder="-"
                                className={inputClass}
                            />
                        </label>
                    </div>
                </div>

                <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                        <span className="mb-1 flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-on-dark-muted">
                            Esfuerzo · RPE
                            {isActive && (
                                <button
                                    type="button"
                                    onClick={() => setRpeInfoOpen((o) => !o)}
                                    aria-expanded={rpeInfoOpen}
                                    aria-label="¿Qué es el RPE?"
                                    className="flex h-5 w-5 items-center justify-center rounded-full text-on-dark-muted transition-colors hover:text-on-dark"
                                >
                                    <Info className="h-3 w-3" />
                                </button>
                            )}
                        </span>
                        <RpeDots value={rpe} onChange={setRpe} reducedMotion={reducedMotion} compact={!isActive} />
                    </div>
                    <SubmitSetButton isLogged={Boolean(isLogged)} label={isActive ? (isLogged ? 'Guardar' : 'Listo') : undefined} />
                </div>

                {/* Explicación RPE 1-tap (quick-win E2-7) — tabla estática 6-10 */}
                <AnimatePresence initial={false}>
                    {rpeInfoOpen && (
                        <motion.div
                            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                            transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <ul className="mt-2 space-y-0.5 rounded-control border border-[var(--border-inverse)] bg-white/[0.03] p-2.5">
                                {RPE_INFO.map((row) => (
                                    <li key={row.rpe} className="flex items-baseline gap-2 text-[11px] leading-snug">
                                        <span className="w-11 shrink-0 font-mono font-bold text-[var(--sport-300)]">RPE {row.rpe}</span>
                                        <span className="text-on-dark/85">{row.text}</span>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Nota rápida por serie (quick-win E2-6) — input inline; viaja por el mirror oculto */}
                {showNoteControls && (
                    <div className="mt-2">
                        <button
                            type="button"
                            onClick={() => setNoteOpen((o) => !o)}
                            aria-expanded={noteOpen}
                            className={cn(
                                'flex min-h-[36px] items-center gap-1.5 rounded-control px-2 text-[11px] font-semibold transition-colors',
                                noteTrimmed ? 'text-amber-300' : 'text-on-dark-muted hover:text-on-dark',
                            )}
                        >
                            <StickyNote className="h-3.5 w-3.5" />
                            {noteTrimmed ? 'Nota añadida' : 'Agregar nota'}
                        </button>
                        <AnimatePresence initial={false}>
                            {noteOpen && (
                                <motion.div
                                    initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                                    transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <input
                                        type="text"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        maxLength={300}
                                        placeholder="Ej: sentí molestia en el hombro"
                                        aria-label="Nota de la serie para tu coach"
                                        className="mt-1.5 w-full rounded-control border border-[var(--border-inverse)] bg-white/[0.06] px-3 py-2 text-[13px] text-on-dark placeholder:text-on-dark-muted/60 focus:border-[var(--sport-500)] focus:outline-none focus:ring-1 focus:ring-[var(--sport-500)]"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {state.error && (
                    <div className="mt-2 flex items-center gap-2 px-1">
                        <p className="flex-1 text-xs text-red-400">{state.error}</p>
                        <button
                            type="button"
                            onClick={() => formRef.current?.requestSubmit()}
                            className="shrink-0 rounded-control border border-red-500/30 px-2 py-0.5 text-[10px] font-bold text-red-400 transition-colors hover:bg-red-500/10"
                        >
                            Reintentar
                        </button>
                    </div>
                )}
            </form>
        </motion.div>
    )
}

const TYPED_INPUT_CLASS = (isLogged: boolean) =>
    `h-11 md:h-9 px-1 md:px-2 text-center text-xs md:text-sm font-semibold font-mono rounded-control bg-white/[0.06] border transition-colors focus:outline-none focus:ring-1 ${
        isLogged
            ? 'text-primary border-primary/40 focus:border-primary focus:ring-primary'
            : 'text-on-dark border-[var(--border-inverse)] focus:border-primary focus:ring-primary'
    }`

/**
 * Registro polimórfico: cardio (min/distancia/FC prom), movilidad (hold seg),
 * roller (seg o pasadas). Misma maquinaria: useActionState + useOptimistic +
 * useFormStatus + cola offline (AC4).
 */
function TypedLogSetRow({
    blockId,
    setNumber,
    restTimeStr,
    nextUpLabel,
    existingLog,
    autoTimerEnabled = true,
    mode,
    supersetRest,
    onLogged,
}: Props & { mode: Exclude<LogSetMode, 'strength'> }) {
    const params = useParams<{ coach_slug: string; planId: string }>()
    const [state, formAction] = useActionState(logSetAction, initialState)
    const [optimisticLogged, addOptimisticLogged] = useOptimistic(
        !!existingLog || state.success,
        (_, newValue: boolean) => newValue
    )
    const isLogged = optimisticLogged
    const { startRest, cancelRest } = useWorkoutTimer()
    const formRef = useRef<HTMLFormElement>(null)
    const [rpeLocal, setRpeLocal] = useState<number | null>(existingLog?.rpe ?? null)
    const [rpeDraft, setRpeDraft] = useState(8)
    const reducedMotion = useReducedMotion()

    const parseNum = (raw: FormDataEntryValue | null): number | null => {
        if (raw === null || raw === '') return null
        const n = Number(String(raw).replace(',', '.'))
        return Number.isFinite(n) ? n : null
    }

    /** Normaliza los inputs visibles a las keys actual_* que espera logSetAction. */
    const normalizeFormData = (formData: FormData) => {
        if (mode === 'cardio') {
            const min = parseNum(formData.get('cardio_min'))
            formData.delete('cardio_min')
            if (min != null && min > 0) formData.set('actual_duration_sec', String(Math.round(min * 60)))
        }
        // movilidad usa actual_hold_sec directo; roller usa actual_duration_sec + reps_done
    }

    const collectValues = (formData: FormData) => ({
        actualDurationSec: parseNum(formData.get('actual_duration_sec')),
        actualDistanceM: parseNum(formData.get('actual_distance_m')),
        actualHoldSec: parseNum(formData.get('actual_hold_sec')),
        actualAvgHr: parseNum(formData.get('actual_avg_hr')),
        repsDone: parseNum(formData.get('reps_done')),
        rpe: parseNum(formData.get('rpe')),
    })

    const handleSubmit = (formData: FormData) => {
        normalizeFormData(formData)
        const values = collectValues(formData)

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            enqueueWorkoutLog({
                blockId,
                setNumber,
                weightKg: null,
                repsDone: values.repsDone,
                rpe: values.rpe,
                rir: null,
                actualDurationSec: values.actualDurationSec,
                actualDistanceM: values.actualDistanceM,
                actualHoldSec: values.actualHoldSec,
                actualAvgHr: values.actualAvgHr,
                planId: params.planId,
                coachSlug: params.coach_slug,
                timestamp: Date.now(),
            })
            addOptimisticLogged(true)
            toast.info('Sin conexión — el registro se guardará al reconectar')
            return
        }

        addOptimisticLogged(true)
        // Descanso + auto-skip (M2 · 4): editar una serie ya cerrada no toca el descanso en curso.
        if (!isLogged) {
            if (!autoTimerEnabled) {
                cancelRest()
            } else if (supersetRest) {
                // Superserie: descanso completo del grupo SOLO al cerrar la ronda (semántica intacta).
                triggerHaptic(50)
                if (supersetRest.closesRound()) startRest(String(supersetRest.groupRestSeconds), { label: nextUpLabel })
                else cancelRest()
            } else if (restTimeStr) {
                triggerHaptic(50)
                startRest(restTimeStr, { label: nextUpLabel })
            } else {
                cancelRest()
            }
        }
        onLogged?.({
            blockId,
            setNumber,
            weightKg: null,
            repsDone: values.repsDone,
            rpe: values.rpe,
            rir: null,
        })
        formAction(formData)
    }

    const submitRpeUpdate = (rpe: number) => {
        const form = formRef.current
        if (!form) return
        const fd = new FormData(form)
        fd.set('rpe', String(rpe))
        normalizeFormData(fd)
        onLogged?.({ blockId, setNumber, weightKg: null, repsDone: parseNum(fd.get('reps_done')), rpe, rir: null })
        startTransition(() => {
            formAction(fd)
        })
    }

    const gridCols =
        mode === 'cardio'
            ? 'grid-cols-[auto_3.5rem_3.5rem_3rem_auto] md:grid-cols-[auto_1fr_1fr_1fr_auto]'
            : mode === 'roller'
                ? 'grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto]'
                : 'grid-cols-[auto_5rem_auto] md:grid-cols-[auto_1fr_auto]'

    return (
        <div className={`rounded-control transition-colors duration-[400ms] ${isLogged ? 'bg-primary/10' : 'bg-transparent'}`}>
            <form
                key={existingLog ? `tlog-${existingLog.actual_duration_sec}-${existingLog.actual_hold_sec}-${existingLog.reps_done}` : 'new'}
                ref={formRef}
                action={handleSubmit}
                className={`grid ${gridCols} gap-2 items-center px-1.5 md:px-2 py-1.5`}
            >
                <input type="hidden" name="block_id" value={blockId} />
                <input type="hidden" name="set_number" value={setNumber} />
                {rpeLocal != null && <input type="hidden" name="rpe" value={rpeLocal} />}

                <div className={`w-4 md:w-5 text-center text-xs md:text-sm font-medium font-mono ${isLogged ? 'text-primary' : 'text-on-dark-muted'}`}>
                    {setNumber}
                </div>

                {mode === 'cardio' && (
                    <>
                        <input
                            name="cardio_min"
                            type="number"
                            step="0.5"
                            min="0"
                            inputMode="decimal"
                            defaultValue={existingLog?.actual_duration_sec != null ? Math.round((existingLog.actual_duration_sec / 60) * 10) / 10 : ''}
                            placeholder="-"
                            aria-label="Minutos"
                            className={TYPED_INPUT_CLASS(Boolean(isLogged))}
                        />
                        <input
                            name="actual_distance_m"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            defaultValue={existingLog?.actual_distance_m ?? ''}
                            placeholder="-"
                            aria-label="Metros"
                            className={TYPED_INPUT_CLASS(Boolean(isLogged))}
                        />
                        <input
                            name="actual_avg_hr"
                            type="number"
                            min="25"
                            max="250"
                            inputMode="numeric"
                            defaultValue={existingLog?.actual_avg_hr ?? ''}
                            placeholder="-"
                            aria-label="FC promedio"
                            className={TYPED_INPUT_CLASS(Boolean(isLogged))}
                        />
                    </>
                )}

                {mode === 'mobility' && (
                    <input
                        name="actual_hold_sec"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        defaultValue={existingLog?.actual_hold_sec ?? ''}
                        placeholder="seg"
                        aria-label="Segundos de hold"
                        className={TYPED_INPUT_CLASS(Boolean(isLogged))}
                    />
                )}

                {mode === 'roller' && (
                    <>
                        <input
                            name="actual_duration_sec"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            defaultValue={existingLog?.actual_duration_sec ?? ''}
                            placeholder="seg"
                            aria-label="Segundos"
                            className={TYPED_INPUT_CLASS(Boolean(isLogged))}
                        />
                        <input
                            name="reps_done"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            defaultValue={existingLog?.reps_done ?? ''}
                            placeholder="pas."
                            aria-label="Pasadas"
                            className={TYPED_INPUT_CLASS(Boolean(isLogged))}
                        />
                    </>
                )}

                <div className="w-8 flex justify-center">
                    <SubmitSetButton isLogged={Boolean(isLogged)} />
                </div>
                {state.error && (
                    <div className="col-span-full flex items-center gap-2 px-2 mt-1">
                        <p className="flex-1 text-xs text-red-400">{state.error}</p>
                        <button
                            type="button"
                            onClick={() => formRef.current?.requestSubmit()}
                            className="text-[10px] font-bold text-red-400 border border-red-500/30 rounded-control px-2 py-0.5 hover:bg-red-500/10 transition-colors shrink-0"
                        >
                            Reintentar
                        </button>
                    </div>
                )}
            </form>

            <AnimatePresence initial={false}>
                {isLogged && (
                    <motion.div
                        initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                        transition={reducedMotion ? { duration: 0 } : { duration: 0.25 }}
                        className="overflow-hidden px-2 pb-2"
                    >
                        <div className="text-[10px] font-semibold text-on-dark-muted mb-1 mt-1">
                            RPE {rpeLocal != null ? `· ${rpeLocal}` : '(opcional)'}
                        </div>
                        <input
                            type="range"
                            min={6}
                            max={10}
                            step={1}
                            value={rpeDraft}
                            className="w-full accent-[var(--sport-500)]"
                            aria-label="RPE"
                            onChange={(e) => setRpeDraft(Number(e.target.value))}
                            onPointerUp={(e) => {
                                const val = Number((e.currentTarget as HTMLInputElement).value)
                                setRpeLocal(val)
                                submitRpeUpdate(val)
                            }}
                        />
                        <div className="flex justify-between text-[10px] text-on-dark-muted">
                            <span>6</span>
                            <span>10</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function SubmitSetButton({ isLogged, label }: { isLogged: boolean; label?: string }) {
    const { pending } = useFormStatus()
    // Variante etiquetada ("✓ Listo" / "Guardar") para la serie activa protagonista.
    if (label) {
        return (
            <button
                type="submit"
                className="flex h-12 min-w-[104px] items-center justify-center gap-2 rounded-control bg-[var(--sport-500)] px-4 font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-70"
                title={pending ? 'Guardando set...' : label}
                aria-label={pending ? 'Guardando set...' : label}
            >
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-5 w-5" /> {label}</>}
            </button>
        )
    }
    return (
        <button
            type="submit"
            className={`w-11 h-11 md:w-8 md:h-8 rounded-full border-2 flex items-center justify-center transition-all shrink-0
            ${isLogged ? 'bg-[var(--sport-500)] border-[var(--sport-500)] text-white' : 'border-white/25 text-on-dark-muted hover:border-[var(--sport-500)] hover:text-[var(--sport-500)]'}`}
            title={pending ? 'Guardando set...' : isLogged ? 'Set guardado · toca para editar' : 'Guardar set'}
            aria-label={pending ? 'Guardando set...' : isLogged ? 'Set guardado, toca para editar' : 'Guardar set'}
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className={`w-5 h-5 md:w-4 md:h-4 ${isLogged ? '' : 'opacity-40'}`} />}
        </button>
    )
}
