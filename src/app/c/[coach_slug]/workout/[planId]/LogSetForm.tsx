'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { logSetAction, type LogState } from './actions'
import { useWorkoutTimer } from './WorkoutTimerProvider'

const initialState: LogState = {}

interface Props {
    blockId: string
    setNumber: number
    restTimeStr: string | null
    existingLog?: { weight_kg: number | null; reps_done: number | null; rpe: number | null }
    autoTimerEnabled?: boolean
}

export function LogSetForm({ blockId, setNumber, restTimeStr, existingLog, autoTimerEnabled = true }: Props) {
    const [state, formAction] = useActionState(logSetAction, initialState)
    const isLogged = !!existingLog || state.success
    const { startRest } = useWorkoutTimer()

    // Uncontrolled form refs to preserve user input while typing
    const formRef = useRef<HTMLFormElement>(null)

    // Trigger rest timer when successfully logged
    useEffect(() => {
        if (state.success && autoTimerEnabled) {
            startRest(restTimeStr)
        }
    }, [state.success, restTimeStr, startRest, autoTimerEnabled])

    return (
        <form key={existingLog ? `log-${existingLog.weight_kg}-${existingLog.reps_done}` : 'new'} ref={formRef} action={formAction}
            className={`grid grid-cols-[auto_3.5rem_3.5rem_auto] md:grid-cols-[auto_1fr_1fr_auto] gap-2 items-center px-1.5 md:px-2 py-1.5 rounded-xl transition-all
            ${isLogged ? 'bg-emerald-500/10' : 'hover:bg-secondary/50'}`}>

            <input type="hidden" name="block_id" value={blockId} />
            <input type="hidden" name="set_number" value={setNumber} />

            <div className={`w-4 md:w-5 text-center text-xs md:text-sm font-medium ${isLogged ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {setNumber}
            </div>

            <input
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
                name="reps_done"
                type="number"
                min="0"
                inputMode="numeric"
                defaultValue={existingLog?.reps_done ?? ''}
                placeholder="-"
                className={`h-9 md:h-9 px-1 md:px-2 text-center text-xs md:text-sm font-semibold rounded-lg bg-background border transition-colors focus:outline-none focus:ring-1
                ${isLogged ? 'text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500' : 'text-foreground border-border focus:border-violet-500 focus:ring-violet-500'}`}
            />

            {/* rpe is not editable by the student, we only log weight and reps */}
            {/* keep any existing value hidden so the backend can record it if supplied */}
            {existingLog?.rpe != null && (
                <input type="hidden" name="rpe" value={existingLog.rpe} />
            )}

            <div className="w-8 flex justify-center">
                <button type="submit"
                    className={`w-10 h-10 md:w-7 md:h-7 rounded-md flex items-center justify-center transition-all shadow-sm
                    ${isLogged
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-secondary text-muted-foreground hover:bg-violet-600 hover:text-white'}`}>
                    <Check className="w-5 h-5 md:w-4 md:h-4" />
                </button>
            </div>
            {state.error && <p className="col-span-full text-xs text-red-400 px-2 mt-1">{state.error}</p>}
        </form>
    )
}
