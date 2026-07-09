'use client'

import { useActionState, useEffect, useRef, useOptimistic, useState, startTransition, type RefObject } from 'react'
import { useParams } from 'next/navigation'
import { Check, Loader2, StickyNote, CloudOff } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { logSetAction, type LogState } from './_actions/workout-log.actions'
import { useWorkoutTimer, parseRestTime } from './WorkoutTimerProvider'
import {
    enqueueWorkoutLog,
    dequeueWorkoutLog,
    readWorkoutOfflineQueue,
    workoutLogKey,
    type WorkoutOfflineLog,
} from '@/lib/workout-offline-queue'
import { triggerHaptic } from '@/lib/client/haptics'
import { useCoarsePointer } from '@/lib/client/useCoarsePointer'
import { useWorkoutKeypad } from './WorkoutKeypadProvider'
import { ScaleDots, EffortHelp, RPE_HELP, RIR_HELP } from './EffortScale'
import { typedKeypadFields, formatWeightEsCl, type TypedKeypadMode, type OptimisticLogPayload } from '@eva/workout-engine'
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
    /**
     * Objetivo del teclado numérico custom (Fase L · workstream B). Opcionales/aditivos: alimentan
     * el header del keypad ("Objetivo {sets}×{reps} · {peso} kg" + "Última vez") que viaja con el
     * teclado (DB-5). Sólo se usan en pointer coarse; en desktop son inertes.
     */
    targetReps?: number | string | null
    lastSet?: { weightKg: number | null; reps: number | null } | null
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
        /**
         * Reconciliación (informe forense 2026-07-04): la serie está en `sessionLogs` porque la reconció
         * el padre desde la COLA offline, pero el server AÚN no la confirmó. `true` ⇒ se muestra como
         * PENDING ("sin sincronizar"), no como guardada — un `existingLog` sin esta marca (server real u
         * optimismo online) sigue siendo 'saved' como siempre.
         */
        _pending?: boolean
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
    /**
     * Sustitución de máquina ocupada (Fase L · workstream C): si el bloque tiene una sustitución
     * activa, estos campos viajan con CADA serie logueada (FormData + cola offline) → el coach ve
     * "hizo X · sustituyó Y" en la ficha. NUNCA toca `exercise_id` del log (AC-C7). null/undefined
     * ⇒ serie normal (no envía las keys; los items legacy siguen parseando).
     */
    substitution?: { exerciseId: string; exerciseName: string; reason: string } | null
    /**
     * Objetivo prescrito del bloque tipado (cardio/movilidad/roller) ya formateado — alimenta el
     * header del teclado numérico custom de las filas tipadas (DB-5). Sólo se usa en pointer coarse.
     */
    typedObjective?: string
    /**
     * Reporta la serie recién confirmada al padre (optimismo de `sessionLogs`). Incluye los ejes
     * polimórficos (actual_*) para las filas tipadas — sin ellos el optimismo pisaba el log de HOLD
     * con NULLs y la fila se re-renderizaba vacía (bug forense hold, ver `session-logs.optimistic`).
     */
    onLogged?: (payload: OptimisticLogPayload) => void
    /**
     * Resultado REAL del guardado en server (reconciliación del optimismo del padre).
     * 'ok' = confirmado en DB · 'error' = falló (el padre debe REVERTIR su log optimista para que
     * la fila se re-expanda y el error sea visible aunque el bloque se hubiera colapsado) ·
     * 'pending' = encolado sin conexión (se sincroniza luego). El motor identidad no cambia.
     */
    onResult?: (blockId: string, setNumber: number, result: SetSyncResult) => void
}

/** Estado de sincronización de una serie de cara al usuario (contrato a). */
export type SetSyncStatus = 'saved' | 'pending' | 'error'
export type SetSyncResult = 'ok' | 'error' | 'pending'

/** Lee el item encolado (sin sincronizar) de una serie concreta, si existe. */
function readQueuedFor(blockId: string, setNumber: number): WorkoutOfflineLog | null {
    const key = workoutLogKey(blockId, setNumber)
    for (const item of readWorkoutOfflineQueue()) {
        if (workoutLogKey(item.blockId, item.setNumber) === key) return item
    }
    return null
}

export function LogSetForm(props: Props) {
    // Bloques cardio/movilidad/roller registran sus propios ejes (AC4);
    // strength sigue por el camino histórico sin UN SOLO cambio funcional.
    if (props.mode && props.mode !== 'strength') {
        return <TypedLogSetRow {...props} mode={props.mode} />
    }
    return <StrengthLogSetForm {...props} />
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
    targetReps,
    lastSet,
    existingLog,
    autoTimerEnabled = true,
    isActive = false,
    prefill,
    reopenNonce,
    supersetRest,
    substitution,
    onLogged,
    onResult,
}: Props) {
    const params = useParams<{ coach_slug: string; planId: string }>()
    // Teclado numérico custom (Fase L · workstream B). Gate por puntero grueso: en desktop el input
    // nativo queda EXACTAMENTE como hoy (Enter-no-cierra, Tab). El keypad muta `ref.value` (mismo
    // mecanismo del autofill "= última vez") → el pipeline submit/offline no se toca.
    const coarse = useCoarsePointer()
    const keypad = useWorkoutKeypad()
    const useKeypad = coarse && keypad != null
    const [state, formAction] = useActionState(logSetAction, initialState)
    // Item encolado (sin sincronizar) de ESTA serie tras un reload. Se hidrata en un EFECTO
    // post-montaje (no en el initializer) para evitar mismatch de hidratación: el server no ve
    // localStorage → render inicial idéntico, y el pendiente aparece al montar en el cliente.
    const [queuedInit, setQueuedInit] = useState<WorkoutOfflineLog | null>(null)
    const [optimisticLogged, addOptimisticLogged] = useOptimistic(
        !!existingLog || state.success,
        (_, newValue: boolean) => newValue
    )
    // Estado de sync de cara al usuario (contrato a). Fuente: server (saved) > cola (pending) > error.
    // Una serie merge-eada desde la cola por el padre llega con `existingLog._pending` → arranca PENDING
    // (no un check verde mentiroso); un `existingLog` confirmado por el server arranca 'saved'.
    const [syncStatus, setSyncStatus] = useState<SetSyncStatus | null>(
        existingLog ? (existingLog._pending ? 'pending' : 'saved') : null,
    )

    // Hidratación del pendiente (contrato b): si el server NO tiene esta serie pero hay un item en la
    // cola, mostrarla como PENDING con sus valores — nunca como fila vacía ni como "guardada ✔".
    useEffect(() => {
        if (existingLog) return
        const q = readQueuedFor(blockId, setNumber)
        if (!q) return
        setQueuedInit(q)
        setChipValues({ w: q.weightKg, r: q.repsDone })
        setRpe(q.rpe ?? null)
        setRir(q.rir != null && q.rir >= 1 && q.rir <= 10 ? q.rir : null)
        setNote(q.note ?? '')
        setSyncStatus('pending')
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Promoción pending → saved sin remontar: si el flush confirma con la pantalla abierta,
    // router.refresh() trae existingLog CONFIRMADO (server) pero este estado local seguiría 'pending' y
    // el chip ámbar mentiría. El server manda: llegó la fila confirmada → está guardada. Guard
    // `!_pending`: si el `existingLog` viene de la reconciliación de la COLA (aún sin confirmar) NO se
    // promueve — se mantiene "sin sincronizar" hasta que el server realmente la devuelva.
    useEffect(() => {
        if (existingLog && !existingLog._pending && syncStatus === 'pending') setSyncStatus('saved')
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingLog])

    const isLogged = optimisticLogged || syncStatus === 'pending'
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
    // Esfuerzo por serie: RPE y RIR, ambos escala 1-10 (dots), ambos opcionales (decisión CEO).
    // El name/payload no cambia — se inyectan en el submit igual que antes.
    const [rpe, setRpe] = useState<number | null>(existingLog?.rpe ?? null)
    // RIR = reps en reserva. Clampa un legacy fuera del rango de entrada 1-10 (p.ej. rir=0 viejo)
    // a "sin valor" para no mandar un valor que el Zod (min 1) rechazaría al editar una serie vieja.
    const [rir, setRir] = useState<number | null>(
        existingLog?.rir != null && existingLog.rir >= 1 && existingLog.rir <= 10 ? existingLog.rir : null,
    )
    // Nota rápida por serie (quick-win E2-6). Source of truth = state; viaja por un mirror oculto.
    const [note, setNote] = useState(existingLog?.note ?? '')
    const [noteOpen, setNoteOpen] = useState(false)
    // Respaldo de valores para el chip recap mientras el prop existingLog se propaga (o pendiente de cola).
    const [chipValues, setChipValues] = useState<{ w: number | null; r: number | null } | null>(null)

    // Prefill "= última vez" (quick-win E2-3): escribe en los inputs uncontrolled al cambiar el nonce.
    useEffect(() => {
        if (!prefill) return
        // Con teclado custom el input es es-CL (coma decimal); si el keypad está abierto sobre esta
        // fila, refresca su mirror con el valor autollenado.
        if (weightRef.current && prefill.weight != null) {
            weightRef.current.value = useKeypad ? formatWeightEsCl(prefill.weight) : String(prefill.weight)
        }
        if (repsRef.current && prefill.reps != null) repsRef.current.value = String(prefill.reps)
        keypad?.refreshDisplay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefill?.nonce])

    // Deshacer (quick-win E2-4): reabre esta fila para corregir la última serie logueada.
    useEffect(() => {
        if (reopenNonce == null) return
        setEditing(true)
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reopenNonce])

    // Reconciliación del guardado ONLINE (contrato a + e): el resultado REAL del server manda sobre
    // el optimismo. Confirmado → se saca de la cola (write-through) y queda 'saved'. Error → NO se
    // pierde el valor (sigue encolado como respaldo), la fila se REABRE y el padre revierte su log
    // optimista para que el error sea visible aunque el bloque se hubiera colapsado.
    const lastHandledState = useRef<LogState | null>(null)
    useEffect(() => {
        if (state === lastHandledState.current) return
        if (state.success) {
            lastHandledState.current = state
            dequeueWorkoutLog(blockId, setNumber)
            setSyncStatus('saved')
            onResult?.(blockId, setNumber, 'ok')
        } else if (state.error) {
            lastHandledState.current = state
            setSyncStatus('error')
            setEditing(true)
            onResult?.(blockId, setNumber, 'error')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state])

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

    // Abre el teclado numérico custom en el campo tocado (solo pointer coarse + provider presente).
    // El objetivo prescrito viaja en el header del keypad (DB-5); "Listo" reusa `requestSubmit()`.
    const openKeypadFor = (initialField: 'weight' | 'reps') => {
        if (!useKeypad || !keypad) return
        // El input pudo montar como number (punto decimal) antes del gate coarse; normaliza a coma.
        const w = weightRef.current
        if (w && w.value.includes('.')) w.value = w.value.replace('.', ',')
        keypad.openKeypad({
            fields: [
                { key: 'weight', label: 'Kg', unit: 'kg', allowDecimal: true, weightChips: true },
                { key: 'reps', label: 'Reps', unit: 'reps', allowDecimal: false },
            ],
            fieldRefs: { weight: weightRef, reps: repsRef },
            initialFieldKey: initialField,
            target: {
                sets: totalSets ?? null,
                reps: targetReps ?? null,
                suggestedWeightKg: suggestedWeightKg ?? null,
                lastWeightKg: lastSet?.weightKg ?? null,
                lastReps: lastSet?.reps ?? null,
                exerciseName: nextUpLabel,
            },
            // Paso OPCIONAL de esfuerzo tras reps: los controles del teclado escriben el MISMO estado
            // rpe/rir de esta fila (handleSubmit ya los inyecta al FormData) — cero pipeline nuevo.
            effort: {
                rpe,
                rir,
                onRpeChange: setRpe,
                onRirChange: setRir,
            },
            requestSubmit: () => formRef.current?.requestSubmit(),
        })
    }

    const handleSubmit = (formData: FormData) => {
        // RPE y RIR viajan por el submit igual que siempre; su origen son los controles segmentados.
        if (rpe != null) formData.set('rpe', String(rpe))
        else formData.delete('rpe')
        if (rir != null) formData.set('rir', String(rir))
        else formData.delete('rir')

        // Normalize decimal comma → dot (es/pt locales) — antes de leer, para que la cola guarde el número real.
        const wRaw0 = formData.get('weight_kg')
        if (wRaw0 !== null && wRaw0 !== '') formData.set('weight_kg', String(wRaw0).replace(',', '.'))
        const weightRaw = formData.get('weight_kg')
        const repsRaw = formData.get('reps_done')
        const w = weightRaw === null || weightRaw === '' ? null : Number(weightRaw)
        const r = repsRaw === null || repsRaw === '' ? null : Number(repsRaw)

        // Write-through SIEMPRE: el valor tipeado entra a la cola ANTES de tocar la red. Así una
        // request abortada/tragada en 4G inestable (navigator.onLine=true pero sin conectividad real)
        // NUNCA pierde lo tipeado (bug forense: "valores que jamás llegaron a la DB"). Confirmar el
        // guardado lo saca de la cola (efecto de reconciliación). Dedup por (block,set): última gana.
        enqueueWorkoutLog({
            blockId,
            setNumber,
            weightKg: w,
            repsDone: r,
            rpe,
            rir,
            note: noteTrimmed,
            planId: params.planId,
            coachSlug: params.coach_slug,
            timestamp: Date.now(),
            // Sustitución (Fase L · C): viaja con la serie si el bloque está sustituido (else null).
            substitutedExerciseId: substitution?.exerciseId ?? null,
            substitutedExerciseName: substitution?.exerciseName ?? null,
            substitutionReason: substitution?.reason ?? null,
        })
        settleRef.current = true
        prRef.current = prThresholdKg != null && w != null && w > 0 && w >= prThresholdKg
        setChipValues({ w, r })

        // Offline guard: encolado y en estado PENDIENTE (nunca "guardado ✔"), sin tocar el server.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            addOptimisticLogged(true)
            setSyncStatus('pending')
            setNoteOpen(false)
            setEditing(false)
            onResult?.(blockId, setNumber, 'pending')
            toast.info('Sin conexión — el log se guardará al reconectar')
            return
        }

        addOptimisticLogged(true)
        // En vuelo online: PENDIENTE hasta que el server confirme (contrato a). El efecto de
        // reconciliación lo pasa a 'saved' (✔) o 'error' (reabre + respaldo en cola).
        setSyncStatus('pending')
        setNoteOpen(false)
        setEditing(false)
        buildRest()

        onLogged?.({
            blockId,
            setNumber,
            weightKg: w,
            repsDone: r,
            rpe,
            rir,
            note: noteTrimmed,
        })

        formAction(formData)
    }

    // ── Chip recap (serie cerrada) — tap para reabrir editable ────────────────
    if (collapsed) {
        const dispW = existingLog?.weight_kg ?? chipValues?.w ?? null
        const dispR = existingLog?.reps_done ?? chipValues?.r ?? null
        // Se celebra sólo la serie recién cerrada en esta sesión (refs en false para logs cargados).
        const isPending = syncStatus === 'pending'
        const celebrate = !isPending && settleRef.current && !reducedMotion
        const prGlow = !isPending && prRef.current && !reducedMotion
        return (
            <motion.button
                layout={!reducedMotion}
                transition={reducedMotion ? { duration: 0 } : springs.smooth}
                type="button"
                onClick={() => setEditing(true)}
                className={cn(
                    'relative flex w-full items-center gap-2 overflow-hidden rounded-control border px-3 py-2 text-left transition-colors active:scale-[0.99]',
                    isPending
                        ? 'border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/[0.12]'
                        : 'border-[var(--sport-500)]/25 bg-[var(--sport-500)]/[0.06] hover:bg-[var(--sport-500)]/[0.12]',
                )}
                aria-label={
                    isPending
                        ? `Serie ${setNumber} sin sincronizar — tocá para editar`
                        : `Serie ${setNumber} registrada — tocá para editar`
                }
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
                {rir != null && (
                    <span className="font-mono text-[11px] font-semibold text-on-dark-muted">RIR {rir}</span>
                )}
                {noteTrimmed && (
                    <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="Serie con nota" />
                )}
                {isPending ? (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-amber-400">
                        <CloudOff className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Sin sincronizar</span>
                    </span>
                ) : (
                    <motion.span
                        className="ml-auto shrink-0 text-[var(--sport-400)]"
                        initial={celebrate ? { scale: 0, rotate: -25 } : false}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={celebrate ? springs.elastic : { duration: 0 }}
                    >
                        <Check className="h-4 w-4" />
                    </motion.span>
                )}
            </motion.button>
        )
    }

    // ── Fila de captura (activa = protagonista por TAMAÑO; próxima = compacta, sin atenuar) ──
    const inputClass = cn(
        'w-full rounded-control bg-white/[0.06] border text-center font-semibold font-mono transition-colors focus:outline-none focus:ring-1 text-on-dark border-[var(--border-inverse)] focus:border-[var(--sport-500)] focus:ring-[var(--sport-500)]',
        isActive ? 'h-14 text-2xl' : 'h-11 text-base',
    )

    // Con teclado custom el input es `type=text` es-CL (coma decimal, `inputMode=none`, readOnly →
    // no abre el teclado del SO, viaja igual en FormData); en desktop queda EXACTO como hoy.
    const weightDefaultNum = existingLog?.weight_kg ?? queuedInit?.weightKg ?? suggestedWeightKg ?? null
    const weightDefaultValue = useKeypad
        ? (weightDefaultNum != null ? formatWeightEsCl(weightDefaultNum) : '')
        : (weightDefaultNum ?? '')
    const repsDefaultValue = existingLog?.reps_done ?? queuedInit?.repsDone ?? ''

    return (
        <motion.div
            layout={!reducedMotion}
            transition={reducedMotion ? { duration: 0 } : springs.smooth}
            className={cn(
                'rounded-control border transition-colors',
                isActive
                    ? 'border-[var(--sport-500)]/50 bg-[var(--sport-500)]/[0.06]'
                    : 'border-[var(--border-inverse)] bg-white/[0.02]',
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
                {/* Sustitución de máquina ocupada (Fase L · C): sólo montados si el bloque está sustituido. */}
                {substitution && (
                    <>
                        <input type="hidden" name="substituted_exercise_id" value={substitution.exerciseId} />
                        <input type="hidden" name="substituted_exercise_name" value={substitution.exerciseName} />
                        <input type="hidden" name="substitution_reason" value={substitution.reason} />
                    </>
                )}

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
                                type={useKeypad ? 'text' : 'number'}
                                {...(useKeypad ? { readOnly: true } : { step: '0.5', min: '0' })}
                                inputMode={useKeypad ? 'none' : 'decimal'}
                                defaultValue={weightDefaultValue}
                                placeholder="-"
                                onFocus={useKeypad ? () => openKeypadFor('weight') : undefined}
                                // Enter NO cierra la serie (implicit submit) — pasa el foco a reps. Submit solo por "Listo".
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        repsRef.current?.focus()
                                    }
                                }}
                                className={inputClass}
                            />
                        </label>
                        <span className={cn('shrink-0 text-on-dark-muted', isActive ? 'pb-3 text-xl' : 'pb-2 text-base')}>×</span>
                        <label className="flex-1">
                            <span className="mb-1 block text-[9.5px] font-bold uppercase tracking-[0.08em] text-on-dark-muted">Reps</span>
                            <input
                                ref={repsRef}
                                name="reps_done"
                                type={useKeypad ? 'text' : 'number'}
                                {...(useKeypad ? { readOnly: true } : { min: '0' })}
                                inputMode={useKeypad ? 'none' : 'numeric'}
                                defaultValue={repsDefaultValue}
                                placeholder="-"
                                onFocus={useKeypad ? () => openKeypadFor('reps') : undefined}
                                // Enter cierra el teclado (blur) sin submitear — deja meter RPE/RIR antes de "Listo".
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        e.currentTarget.blur()
                                    }
                                }}
                                className={inputClass}
                            />
                        </label>
                    </div>
                </div>

                {/* Esfuerzo por serie: RPE y RIR en escala 1-10 (dots), ambos opcionales */}
                <div className="mt-3 space-y-2.5">
                    <div>
                        <span className="mb-1 flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-on-dark-muted">
                            Esfuerzo · RPE
                            <EffortHelp label="RPE" text={RPE_HELP} />
                        </span>
                        <ScaleDots name="RPE" value={rpe} onChange={setRpe} reducedMotion={reducedMotion} compact={!isActive} />
                    </div>
                    <div>
                        <span className="mb-1 flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-on-dark-muted">
                            Reps en reserva · RIR
                            <EffortHelp label="RIR" text={RIR_HELP} />
                        </span>
                        <ScaleDots name="RIR" value={rir} onChange={setRir} reducedMotion={reducedMotion} compact={!isActive} />
                    </div>
                </div>

                <div className="mt-3 flex justify-end">
                    <SubmitSetButton isLogged={Boolean(isLogged)} label={isActive ? (isLogged ? 'Guardar' : 'Listo') : undefined} />
                </div>

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

/**
 * Registro polimórfico: cardio (min/distancia/FC prom), movilidad (hold seg),
 * roller (seg o pasadas). Misma maquinaria: useActionState + useOptimistic +
 * useFormStatus + cola offline (AC4). Re-skin EVA DS dark (Fase L·CEO 2026-07-04): mismos tokens
 * de input/foco (sport-500) que fuerza, RPE con la escala segmentada `ScaleDots` (adiós barra) y
 * teclado numérico custom por campo en pointer coarse. El pipeline de submit tipado queda INTACTO.
 */
function TypedLogSetRow({
    blockId,
    setNumber,
    restTimeStr,
    nextUpLabel,
    existingLog,
    autoTimerEnabled = true,
    mode,
    isActive = false,
    typedObjective,
    supersetRest,
    onLogged,
    onResult,
}: Props & { mode: Exclude<LogSetMode, 'strength'> }) {
    const params = useParams<{ coach_slug: string; planId: string }>()
    // Teclado numérico custom por campo (gate por puntero grueso, como fuerza). En desktop los inputs
    // quedan EXACTAMENTE como hoy (type=number). El keypad muta `ref.value` → submit/offline intacto.
    const coarse = useCoarsePointer()
    const keypad = useWorkoutKeypad()
    const useKeypad = coarse && keypad != null
    const [state, formAction] = useActionState(logSetAction, initialState)
    const [optimisticLogged, addOptimisticLogged] = useOptimistic(
        !!existingLog || state.success,
        (_, newValue: boolean) => newValue
    )
    const isLogged = optimisticLogged
    const { startRest, cancelRest } = useWorkoutTimer()
    const formRef = useRef<HTMLFormElement>(null)
    // Un ref por eje posible (subconjunto usado por modo); el teclado apunta al `<input>` por `key`.
    const cardioMinRef = useRef<HTMLInputElement>(null)
    const distanceRef = useRef<HTMLInputElement>(null)
    const hrRef = useRef<HTMLInputElement>(null)
    const holdRef = useRef<HTMLInputElement>(null)
    const durationRef = useRef<HTMLInputElement>(null)
    const passesRef = useRef<HTMLInputElement>(null)
    const refByKey: Record<string, RefObject<HTMLInputElement | null>> = {
        cardio_min: cardioMinRef,
        actual_distance_m: distanceRef,
        actual_avg_hr: hrRef,
        actual_hold_sec: holdRef,
        actual_duration_sec: durationRef,
        reps_done: passesRef,
    }
    const [rpeLocal, setRpeLocal] = useState<number | null>(existingLog?.rpe ?? null)
    const reducedMotion = useReducedMotion()

    // Abre el teclado custom en el campo tocado (solo pointer coarse). El objetivo tipado viaja en el
    // header (DB-5); "Listo" reusa `requestSubmit()`. Reglas decimales por campo vienen de typedKeypadFields.
    const openKeypadFor = (key: string) => {
        if (!useKeypad || !keypad) return
        const fieldDefs = typedKeypadFields(mode as TypedKeypadMode)
        // Normaliza a coma es-CL los decimales que hayan montado como number (punto) antes del gate coarse.
        for (const f of fieldDefs) {
            if (!f.allowDecimal) continue
            const el = refByKey[f.key]?.current
            if (el && el.value.includes('.')) el.value = el.value.replace('.', ',')
        }
        const fieldRefs: Record<string, RefObject<HTMLInputElement | null>> = {}
        for (const f of fieldDefs) fieldRefs[f.key] = refByKey[f.key]
        keypad.openKeypad({
            fields: fieldDefs,
            fieldRefs,
            initialFieldKey: key,
            target: { exerciseName: nextUpLabel, objective: typedObjective },
            requestSubmit: () => formRef.current?.requestSubmit(),
        })
    }

    /** Default del input: es-CL (coma) en modo teclado; número crudo en desktop. */
    const inputDefault = (n: number | null): string | number => (n == null ? '' : useKeypad ? formatWeightEsCl(n) : n)
    /** Props del `<input>` según pointer: keypad (readonly text) o nativo (number + reglas). */
    const fieldProps = (key: string, nativeInputMode: 'decimal' | 'numeric', nativeExtra: Record<string, string>) =>
        useKeypad
            ? ({ type: 'text', readOnly: true, inputMode: 'none', onFocus: () => openKeypadFor(key) } as const)
            : ({ type: 'number', inputMode: nativeInputMode, ...nativeExtra } as const)

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

    // Reconciliación del guardado (contrato a + e): éxito → sale de la cola; error → respaldo en cola
    // + el padre revierte su optimismo (onResult).
    const lastHandledState = useRef<LogState | null>(null)
    useEffect(() => {
        if (state === lastHandledState.current) return
        if (state.success) {
            lastHandledState.current = state
            dequeueWorkoutLog(blockId, setNumber)
            onResult?.(blockId, setNumber, 'ok')
        } else if (state.error) {
            lastHandledState.current = state
            onResult?.(blockId, setNumber, 'error')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state])

    const handleSubmit = (formData: FormData) => {
        normalizeFormData(formData)
        const values = collectValues(formData)

        // Write-through SIEMPRE: el registro entra a la cola antes de tocar la red (respaldo ante
        // request abortada en red inestable). Confirmar el guardado lo saca (efecto de arriba).
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

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            addOptimisticLogged(true)
            onResult?.(blockId, setNumber, 'pending')
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
            // Ejes tipados: el optimismo del padre los preserva → la fila de hold no se re-renderiza vacía.
            actualDurationSec: values.actualDurationSec,
            actualDistanceM: values.actualDistanceM,
            actualHoldSec: values.actualHoldSec,
            actualAvgHr: values.actualAvgHr,
        })
        formAction(formData)
    }

    const submitRpeUpdate = (rpe: number) => {
        const form = formRef.current
        if (!form) return
        const fd = new FormData(form)
        fd.set('rpe', String(rpe))
        normalizeFormData(fd)
        const rpeValues = collectValues(fd)
        onLogged?.({
            blockId,
            setNumber,
            weightKg: null,
            repsDone: rpeValues.repsDone,
            rpe,
            rir: null,
            actualDurationSec: rpeValues.actualDurationSec,
            actualDistanceM: rpeValues.actualDistanceM,
            actualHoldSec: rpeValues.actualHoldSec,
            actualAvgHr: rpeValues.actualAvgHr,
        })
        startTransition(() => {
            formAction(fd)
        })
    }

    // Enter en cualquier input NO submitea (implicit submission cerraba la serie sin dejar meter RPE):
    // avanza al siguiente numérico, y en el último hace blur. Submit solo por el botón explícito.
    const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key !== 'Enter') return
        const target = e.target as HTMLInputElement
        if (target.tagName !== 'INPUT' || target.type !== 'number') return
        e.preventDefault()
        const inputs = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>('input[type="number"]'))
        const next = inputs[inputs.indexOf(target) + 1]
        if (next) next.focus()
        else target.blur()
    }

    const gridCols =
        mode === 'cardio'
            ? 'grid-cols-[auto_3.5rem_3.5rem_3rem_auto] md:grid-cols-[auto_1fr_1fr_1fr_auto]'
            : mode === 'roller'
                ? 'grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto]'
                : 'grid-cols-[auto_5rem_auto] md:grid-cols-[auto_1fr_auto]'

    // Mismos tokens que la fila strength (sport-500 focus, on-dark, font-mono) — re-skin EVA DS.
    const typedInputClass = cn(
        'w-full h-11 md:h-10 rounded-control border bg-white/[0.06] px-1 text-center text-sm font-semibold font-mono text-on-dark transition-colors focus:outline-none focus:ring-1 focus:border-[var(--sport-500)] focus:ring-[var(--sport-500)]',
        isLogged ? 'border-[var(--sport-500)]/40' : 'border-[var(--border-inverse)]',
    )

    return (
        <div
            className={cn(
                'rounded-control transition-colors duration-[400ms]',
                isActive && !isLogged
                    ? 'bg-[var(--sport-500)]/[0.06] ring-1 ring-[var(--sport-500)]/40'
                    : isLogged
                        ? 'bg-[var(--sport-500)]/10'
                        : 'bg-transparent',
            )}
        >
            <form
                key={existingLog ? `tlog-${existingLog.actual_duration_sec}-${existingLog.actual_hold_sec}-${existingLog.reps_done}` : 'new'}
                ref={formRef}
                action={handleSubmit}
                onKeyDown={handleFormKeyDown}
                className={`grid ${gridCols} gap-2 items-center px-1.5 md:px-2 py-1.5`}
            >
                <input type="hidden" name="block_id" value={blockId} />
                <input type="hidden" name="set_number" value={setNumber} />
                {rpeLocal != null && <input type="hidden" name="rpe" value={rpeLocal} />}

                <div className={cn('w-4 md:w-5 text-center text-xs md:text-sm font-bold font-mono tabular-nums', isLogged ? 'text-[var(--sport-300)]' : 'text-on-dark-muted')}>
                    {setNumber}
                </div>

                {mode === 'cardio' && (
                    <>
                        <input
                            ref={cardioMinRef}
                            name="cardio_min"
                            {...fieldProps('cardio_min', 'decimal', { step: '0.5', min: '0' })}
                            defaultValue={inputDefault(existingLog?.actual_duration_sec != null ? Math.round((existingLog.actual_duration_sec / 60) * 10) / 10 : null)}
                            placeholder="-"
                            aria-label="Minutos"
                            className={typedInputClass}
                        />
                        <input
                            ref={distanceRef}
                            name="actual_distance_m"
                            {...fieldProps('actual_distance_m', 'decimal', { min: '0' })}
                            defaultValue={inputDefault(existingLog?.actual_distance_m ?? null)}
                            placeholder="-"
                            aria-label="Metros"
                            className={typedInputClass}
                        />
                        <input
                            ref={hrRef}
                            name="actual_avg_hr"
                            {...fieldProps('actual_avg_hr', 'numeric', { min: '25', max: '250' })}
                            defaultValue={inputDefault(existingLog?.actual_avg_hr ?? null)}
                            placeholder="-"
                            aria-label="FC promedio"
                            className={typedInputClass}
                        />
                    </>
                )}

                {mode === 'mobility' && (
                    <input
                        ref={holdRef}
                        name="actual_hold_sec"
                        {...fieldProps('actual_hold_sec', 'numeric', { min: '0' })}
                        defaultValue={inputDefault(existingLog?.actual_hold_sec ?? null)}
                        placeholder="seg"
                        aria-label="Segundos de hold"
                        className={typedInputClass}
                    />
                )}

                {mode === 'roller' && (
                    <>
                        <input
                            ref={durationRef}
                            name="actual_duration_sec"
                            {...fieldProps('actual_duration_sec', 'numeric', { min: '0' })}
                            defaultValue={inputDefault(existingLog?.actual_duration_sec ?? null)}
                            placeholder="seg"
                            aria-label="Segundos"
                            className={typedInputClass}
                        />
                        <input
                            ref={passesRef}
                            name="reps_done"
                            {...fieldProps('reps_done', 'numeric', { min: '0' })}
                            defaultValue={inputDefault(existingLog?.reps_done ?? null)}
                            placeholder="pas."
                            aria-label="Pasadas"
                            className={typedInputClass}
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
                        {/* RPE post-registro con la MISMA escala segmentada de fuerza (adiós barra pre-rediseño) */}
                        <div className="mb-1.5 mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-on-dark-muted">
                            Esfuerzo · RPE
                            <EffortHelp label="RPE" text={RPE_HELP} />
                        </div>
                        <ScaleDots
                            name="RPE"
                            value={rpeLocal}
                            onChange={(v) => {
                                setRpeLocal(v)
                                submitRpeUpdate(v)
                            }}
                            reducedMotion={reducedMotion}
                            compact
                        />
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
