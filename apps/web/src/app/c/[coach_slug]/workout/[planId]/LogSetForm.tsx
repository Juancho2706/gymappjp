'use client'

import { useActionState, useRef, useOptimistic, useState, startTransition } from 'react'
import { useParams } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { logSetAction, type LogState } from './_actions/workout-log.actions'
import { useWorkoutTimer } from './WorkoutTimerProvider'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { enqueueWorkoutLog } from '@/lib/workout-offline-queue'

const initialState: LogState = {}

/** Variante del registro por tipo efectivo (specs/movida-entrenamiento, AC4). */
export type LogSetMode = 'strength' | 'cardio' | 'mobility' | 'roller'

interface Props {
    blockId: string
    setNumber: number
    restTimeStr: string | null
    existingLog?: {
        weight_kg: number | null
        reps_done: number | null
        rpe: number | null
        rir?: number | null
        actual_duration_sec?: number | null
        actual_distance_m?: number | null
        actual_hold_sec?: number | null
        actual_avg_hr?: number | null
    }
    autoTimerEnabled?: boolean
    /** default 'strength' ⇒ render EXACTAMENTE el de siempre (anti-regresión). */
    mode?: LogSetMode
    onLogged?: (payload: {
        blockId: string
        setNumber: number
        weightKg: number | null
        repsDone: number | null
        rpe: number | null
        rir: number | null
    }) => void
}

export function LogSetForm(props: Props) {
    // Bloques cardio/movilidad/roller registran sus propios ejes (AC4);
    // strength sigue por el camino histórico sin UN SOLO cambio visual/funcional.
    if (props.mode && props.mode !== 'strength') {
        return <TypedLogSetRow {...props} mode={props.mode} />
    }
    return <StrengthLogSetForm {...props} />
}

function StrengthLogSetForm({
    blockId,
    setNumber,
    restTimeStr,
    existingLog,
    autoTimerEnabled = true,
    onLogged,
}: Props) {
    const { t } = useTranslation()
    const params = useParams<{ coach_slug: string; planId: string }>()
    const [state, formAction] = useActionState(logSetAction, initialState)
    const [optimisticLogged, addOptimisticLogged] = useOptimistic(
        !!existingLog || state.success,
        (_, newValue: boolean) => newValue
    )

    const isLogged = optimisticLogged
    const { startRest } = useWorkoutTimer()
    const reducedMotion = useReducedMotion()
    const weightRef = useRef<HTMLInputElement>(null)
    const repsRef = useRef<HTMLInputElement>(null)
    const formRef = useRef<HTMLFormElement>(null)
    const [rpeLocal, setRpeLocal] = useState<number | null>(existingLog?.rpe ?? null)
    const [rpeDraft, setRpeDraft] = useState(8)
    const [rirLocal, setRirLocal] = useState<number | null>(existingLog?.rir ?? null)
    const [rirDraft, setRirDraft] = useState(2)

    const handleSubmit = (formData: FormData) => {
        // Offline guard: enqueue and show optimistic state without hitting server
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            const wRaw = formData.get('weight_kg')
            const rRaw = formData.get('reps_done')
            const rpeRaw = formData.get('rpe')
            const rirRaw = formData.get('rir')
            enqueueWorkoutLog({
                blockId,
                setNumber,
                weightKg: wRaw === null || wRaw === '' ? null : Number(String(wRaw).replace(',', '.')),
                repsDone: rRaw === null || rRaw === '' ? null : Number(rRaw),
                rpe: rpeRaw === null || rpeRaw === '' ? null : Number(rpeRaw),
                rir: rirRaw === null || rirRaw === '' ? null : Number(rirRaw),
                planId: params.planId,
                coachSlug: params.coach_slug,
                timestamp: Date.now(),
            })
            addOptimisticLogged(true)
            toast.info('Sin conexión — el log se guardará al reconectar')
            return
        }

        addOptimisticLogged(true)

        if (autoTimerEnabled && !isLogged) {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(50)
            }
            startRest(restTimeStr)
        }

        // Normalize decimal comma → dot (es/pt locales)
        const wRaw = formData.get('weight_kg')
        if (wRaw !== null && wRaw !== '') formData.set('weight_kg', String(wRaw).replace(',', '.'))

        const weightRaw = formData.get('weight_kg')
        const repsRaw = formData.get('reps_done')
        const rpeRaw = formData.get('rpe')
        const rirRaw = formData.get('rir')
        onLogged?.({
            blockId,
            setNumber,
            weightKg: weightRaw === null || weightRaw === '' ? null : Number(weightRaw),
            repsDone: repsRaw === null || repsRaw === '' ? null : Number(repsRaw),
            rpe: rpeRaw === null || rpeRaw === '' ? null : Number(rpeRaw),
            rir: rirRaw === null || rirRaw === '' ? null : Number(rirRaw),
        })

        formAction(formData)
    }

    // Always show metrics panel once set is logged
    const showMetrics = isLogged

    const submitMetricsUpdate = (rpe: number | null, rir: number | null) => {
        const w = weightRef.current?.value
        const r = repsRef.current?.value
        const fd = new FormData()
        fd.set('block_id', blockId)
        fd.set('set_number', String(setNumber))
        if (w != null && w !== '') fd.set('weight_kg', String(w))
        if (r != null && r !== '') fd.set('reps_done', String(r))
        if (rpe != null) fd.set('rpe', String(rpe))
        if (rir != null) fd.set('rir', String(rir))
        onLogged?.({
            blockId,
            setNumber,
            weightKg: w === '' || w == null ? null : Number(w),
            repsDone: r === '' || r == null ? null : Number(r),
            rpe,
            rir,
        })
        startTransition(() => {
            formAction(fd)
        })
    }

    return (
        <div
            className={`rounded-xl transition-colors duration-[400ms] ${isLogged ? 'bg-emerald-500/10' : 'bg-transparent'}`}
        >
            <form
                key={existingLog ? `log-${existingLog.weight_kg}-${existingLog.reps_done}` : 'new'}
                ref={formRef}
                action={handleSubmit}
                className="grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 items-center px-1.5 md:px-2 py-1.5"
            >
                <input type="hidden" name="block_id" value={blockId} />
                <input type="hidden" name="set_number" value={setNumber} />

                <div
                    className={`w-4 md:w-5 text-center text-xs md:text-sm font-medium ${isLogged ? 'text-emerald-500' : 'text-muted-foreground'}`}
                >
                    {setNumber}
                </div>

                <input
                    ref={weightRef}
                    name="weight_kg"
                    type="number"
                    step="0.5"
                    min="0"
                    inputMode="decimal"
                    defaultValue={existingLog?.weight_kg ?? ''}
                    placeholder="-"
                    className={`h-9 md:h-9 px-1 md:px-2 text-center text-xs md:text-sm font-semibold rounded-lg bg-background border transition-colors focus:outline-none focus:ring-1
                ${isLogged ? 'text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500' : 'text-foreground border-border focus:border-violet-500 focus:ring-violet-500'}`}
                />

                <input
                    ref={repsRef}
                    name="reps_done"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    defaultValue={existingLog?.reps_done ?? ''}
                    placeholder="-"
                    className={`h-9 md:h-9 px-1 md:px-2 text-center text-xs md:text-sm font-semibold rounded-lg bg-background border transition-colors focus:outline-none focus:ring-1
                ${isLogged ? 'text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500' : 'text-foreground border-border focus:border-violet-500 focus:ring-violet-500'}`}
                />

                {/* Hidden inputs carry current RPE/RIR on main form submit */}
                {(rpeLocal != null) && (
                    <input type="hidden" name="rpe" value={rpeLocal} />
                )}
                {(rirLocal != null) && (
                    <input type="hidden" name="rir" value={rirLocal} />
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
                            className="text-[10px] font-bold text-red-400 border border-red-500/30 rounded-md px-2 py-0.5 hover:bg-red-500/10 transition-colors shrink-0"
                        >
                            Reintentar
                        </button>
                    </div>
                )}
            </form>

            {isLogged && !showMetrics && (
                <p className="text-[10px] text-emerald-500/50 text-center pb-1.5 px-2 leading-none">
                    Cambia los valores y presiona ✓ para actualizar
                </p>
            )}

            <AnimatePresence initial={false}>
                {showMetrics && (
                    <motion.div
                        initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
                        transition={reducedMotion ? { duration: 0 } : { duration: 0.25 }}
                        className="overflow-hidden px-2 pb-2 space-y-2"
                    >
                        {/* RPE slider */}
                        <div>
                            <div className="text-[10px] font-semibold text-muted-foreground mb-1 mt-1 flex items-center gap-1">
                                <span>RPE {rpeLocal != null ? `· ${rpeLocal}` : '(opcional)'}</span>
                                <InfoTooltip content={t('tooltip.rpe')} />
                            </div>
                            <input
                                type="range"
                                min={6}
                                max={10}
                                step={1}
                                value={rpeDraft}
                                className="w-full accent-emerald-500"
                                aria-label="RPE"
                                onChange={(e) => setRpeDraft(Number(e.target.value))}
                                onPointerUp={(e) => {
                                    const val = Number((e.currentTarget as HTMLInputElement).value)
                                    setRpeLocal(val)
                                    submitMetricsUpdate(val, rirLocal)
                                }}
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>6</span>
                                <span>10</span>
                            </div>
                        </div>

                        {/* RIR slider */}
                        <div>
                            <div className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                <span>RIR {rirLocal != null ? `· ${rirLocal}` : '(opcional)'}</span>
                                <InfoTooltip content={t('tooltip.rir')} />
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={5}
                                step={1}
                                value={rirDraft}
                                className="w-full accent-violet-500"
                                aria-label="RIR"
                                onChange={(e) => setRirDraft(Number(e.target.value))}
                                onPointerUp={(e) => {
                                    const val = Number((e.currentTarget as HTMLInputElement).value)
                                    setRirLocal(val)
                                    submitMetricsUpdate(rpeLocal, val)
                                }}
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>0</span>
                                <span>5</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

const TYPED_INPUT_CLASS = (isLogged: boolean) =>
    `h-9 px-1 md:px-2 text-center text-xs md:text-sm font-semibold rounded-lg bg-background border transition-colors focus:outline-none focus:ring-1 ${
        isLogged
            ? 'text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500'
            : 'text-foreground border-border focus:border-violet-500 focus:ring-violet-500'
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
    existingLog,
    autoTimerEnabled = true,
    mode,
    onLogged,
}: Props & { mode: Exclude<LogSetMode, 'strength'> }) {
    const params = useParams<{ coach_slug: string; planId: string }>()
    const [state, formAction] = useActionState(logSetAction, initialState)
    const [optimisticLogged, addOptimisticLogged] = useOptimistic(
        !!existingLog || state.success,
        (_, newValue: boolean) => newValue
    )
    const isLogged = optimisticLogged
    const { startRest } = useWorkoutTimer()
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
        if (autoTimerEnabled && !isLogged && restTimeStr) {
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50)
            startRest(restTimeStr)
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
        <div className={`rounded-xl transition-colors duration-[400ms] ${isLogged ? 'bg-emerald-500/10' : 'bg-transparent'}`}>
            <form
                key={existingLog ? `tlog-${existingLog.actual_duration_sec}-${existingLog.actual_hold_sec}-${existingLog.reps_done}` : 'new'}
                ref={formRef}
                action={handleSubmit}
                className={`grid ${gridCols} gap-2 items-center px-1.5 md:px-2 py-1.5`}
            >
                <input type="hidden" name="block_id" value={blockId} />
                <input type="hidden" name="set_number" value={setNumber} />
                {rpeLocal != null && <input type="hidden" name="rpe" value={rpeLocal} />}

                <div className={`w-4 md:w-5 text-center text-xs md:text-sm font-medium ${isLogged ? 'text-emerald-500' : 'text-muted-foreground'}`}>
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
                            className="text-[10px] font-bold text-red-400 border border-red-500/30 rounded-md px-2 py-0.5 hover:bg-red-500/10 transition-colors shrink-0"
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
                        <div className="text-[10px] font-semibold text-muted-foreground mb-1 mt-1">
                            RPE {rpeLocal != null ? `· ${rpeLocal}` : '(opcional)'}
                        </div>
                        <input
                            type="range"
                            min={6}
                            max={10}
                            step={1}
                            value={rpeDraft}
                            className="w-full accent-emerald-500"
                            aria-label="RPE"
                            onChange={(e) => setRpeDraft(Number(e.target.value))}
                            onPointerUp={(e) => {
                                const val = Number((e.currentTarget as HTMLInputElement).value)
                                setRpeLocal(val)
                                submitRpeUpdate(val)
                            }}
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>6</span>
                            <span>10</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function SubmitSetButton({ isLogged }: { isLogged: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            className={`w-10 h-10 md:w-7 md:h-7 rounded-md flex items-center justify-center transition-all shadow-sm
            ${isLogged ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary text-muted-foreground hover:bg-violet-600 hover:text-white'}`}
            title={pending ? 'Guardando set...' : isLogged ? 'Set guardado · toca para editar' : 'Guardar set'}
            aria-label={pending ? 'Guardando set...' : isLogged ? 'Set guardado, toca para editar' : 'Guardar set'}
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5 md:w-4 md:h-4" />}
        </button>
    )
}
