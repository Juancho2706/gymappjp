'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { logSetAction, type LogState } from './actions'

const initialState: LogState = {}

interface Props {
    blockId: string
    setNumber: number
    existingLog?: { weight_kg: number | null; reps_done: number | null; rpe: number | null }
}

export function LogSetForm({ blockId, setNumber, existingLog }: Props) {
    const [state, formAction] = useActionState(logSetAction, initialState)
    const isLogged = !!existingLog || state.success

    // Uncontrolled form refs to preserve user input while typing
    const formRef = useRef<HTMLFormElement>(null)

    // Only auto-submit when changing focus, not on every keystroke
    function handleBlur() {
        if (formRef.current) formRef.current.requestSubmit()
    }

    return (
        <form ref={formRef} action={formAction}
            className={`grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center px-2 py-1.5 rounded-xl transition-all
            ${isLogged ? 'bg-emerald-500/10' : 'hover:bg-secondary/50'}`}>

            <input type="hidden" name="block_id" value={blockId} />
            <input type="hidden" name="set_number" value={setNumber} />

            <div className={`w-5 text-center text-sm font-medium ${isLogged ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {setNumber}
            </div>

            <input
                name="weight_kg"
                type="number"
                step="0.5"
                min="0"
                defaultValue={existingLog?.weight_kg ?? ''}
                onBlur={handleBlur}
                placeholder="-"
                className={`h-9 px-2 text-center text-sm font-semibold rounded-lg bg-background border transition-colors focus:outline-none focus:ring-1
                ${isLogged ? 'text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500' : 'text-foreground border-border focus:border-violet-500 focus:ring-violet-500'}`}
            />

            <input
                name="reps_done"
                type="number"
                min="0"
                defaultValue={existingLog?.reps_done ?? ''}
                onBlur={handleBlur}
                placeholder="-"
                className={`h-9 px-2 text-center text-sm font-semibold rounded-lg bg-background border transition-colors focus:outline-none focus:ring-1
                ${isLogged ? 'text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500' : 'text-foreground border-border focus:border-violet-500 focus:ring-violet-500'}`}
            />

            <input
                name="rpe"
                type="number"
                min="1"
                max="10"
                defaultValue={existingLog?.rpe ?? ''}
                onBlur={handleBlur}
                placeholder="-"
                className={`h-9 px-2 text-center text-sm font-semibold rounded-lg bg-background border transition-colors focus:outline-none focus:ring-1
                ${isLogged ? 'text-emerald-400 border-emerald-500/30 focus:border-emerald-500 focus:ring-emerald-500' : 'text-foreground border-border focus:border-violet-500 focus:ring-violet-500'}`}
            />

            <div className="w-8 flex justify-center">
                <button type="submit"
                    className={`w-7 h-7 rounded-md flex items-center justify-center transition-all shadow-sm
                    ${isLogged
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-secondary text-muted-foreground hover:bg-violet-600 hover:text-white'}`}>
                    <Check className="w-4 h-4" />
                </button>
            </div>
            {state.error && <p className="col-span-5 text-xs text-red-400 px-2 mt-1">{state.error}</p>}
        </form>
    )
}
