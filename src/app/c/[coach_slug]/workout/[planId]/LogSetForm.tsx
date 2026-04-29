'use client'

import { useActionState, useRef, useOptimistic, useState, startTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { logSetAction, type LogState } from './actions'
import { useWorkoutTimer } from './WorkoutTimerProvider'
import { springs } from '@/lib/animation-presets'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const initialState: LogState = {}

interface Props {
    blockId: string
    setNumber: number
    restTimeStr: string | null
    existingLog?: { weight_kg: number | null; reps_done: number | null; rpe: number | null; rir?: number | null }
    autoTimerEnabled?: boolean
    onLogged?: (payload: {
        blockId: string
        setNumber: number
        weightKg: number | null
        repsDone: number | null
        rpe: number | null
        rir: number | null
    }) => void
}

export function LogSetForm({
    blockId,
    setNumber,
    restTimeStr,
    existingLog,
    autoTimerEnabled = true,
    onLogged,
}: Props) {
    const { t } = useTranslation()
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
        <motion.div
            layout
            animate={{
                backgroundColor: isLogged
                    ? 'color-mix(in srgb, #10b981 10%, transparent)'
                    : 'transparent',
            }}
            transition={{ duration: reducedMotion ? 0 : 0.4 }}
            className="rounded-xl"
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
        </motion.div>
    )
}

function SubmitSetButton({ isLogged }: { isLogged: boolean }) {
    const { pending } = useFormStatus()
    const reducedMotion = useReducedMotion()
    return (
        <motion.button
            type="submit"
            key={isLogged ? 'logged' : 'idle'}
            initial={isLogged && !reducedMotion ? { scale: 0.5, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : springs.elastic}
            className={`w-10 h-10 md:w-7 md:h-7 rounded-md flex items-center justify-center transition-all shadow-sm
            ${isLogged ? 'bg-emerald-500/20 text-emerald-400' : 'bg-secondary text-muted-foreground hover:bg-violet-600 hover:text-white'}`}
            title={pending ? 'Guardando set...' : isLogged ? 'Set guardado · toca para editar' : 'Guardar set'}
            aria-label={pending ? 'Guardando set...' : isLogged ? 'Set guardado, toca para editar' : 'Guardar set'}
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-5 h-5 md:w-4 md:h-4" />}
        </motion.button>
    )
}
