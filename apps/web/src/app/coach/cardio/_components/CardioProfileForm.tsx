'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { updateCardioProfileAction, type CardioProfileState } from '../_actions/cardio.actions'

const initialState: CardioProfileState = {}

export interface CardioProfileFormValues {
    id: string
    full_name: string | null
    birth_date: string | null
    resting_hr: number | null
    max_hr_override: number | null
    ref_5k_time_sec: number | null
}

const INPUT_CLASS =
    'h-12 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground focus:border-primary focus:outline-none placeholder:text-muted-foreground/50'

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
        >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {pending ? 'Guardando…' : 'Guardar perfil cardio'}
        </button>
    )
}

/**
 * Perfil cardio del alumno (M4 — AC9): datos personales/salud, visibles solo por el
 * scope existente de clients. Zod en cliente vía atributos + Zod completo en el server action.
 */
export function CardioProfileForm({ client }: { client: CardioProfileFormValues }) {
    const [state, formAction] = useActionState(updateCardioProfileAction, initialState)

    useEffect(() => {
        if (state.success) toast.success('Perfil cardio guardado')
    }, [state])

    return (
        <form action={formAction} className="space-y-5">
            <input type="hidden" name="client_id" value={client.id} />

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label htmlFor="birth_date" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Fecha de nacimiento
                    </label>
                    <input
                        id="birth_date"
                        name="birth_date"
                        type="date"
                        defaultValue={client.birth_date ?? ''}
                        min="1920-01-01"
                        max={new Date().toISOString().slice(0, 10)}
                        className={INPUT_CLASS}
                    />
                    <p className="text-[10px] text-muted-foreground/60">Habilita FCmax por Tanaka y las zonas Z1–Z5.</p>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="resting_hr" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        FC en reposo (bpm)
                    </label>
                    <input
                        id="resting_hr"
                        name="resting_hr"
                        type="number"
                        min={25}
                        max={120}
                        inputMode="numeric"
                        defaultValue={client.resting_hr ?? ''}
                        placeholder="Ej. 60"
                        className={INPUT_CLASS}
                    />
                    <p className="text-[10px] text-muted-foreground/60">Medida al despertar — habilita Karvonen.</p>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="max_hr_override" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        FCmax medida (bpm, opcional)
                    </label>
                    <input
                        id="max_hr_override"
                        name="max_hr_override"
                        type="number"
                        min={120}
                        max={230}
                        inputMode="numeric"
                        defaultValue={client.max_hr_override ?? ''}
                        placeholder="Ej. 192"
                        className={INPUT_CLASS}
                    />
                    <p className="text-[10px] text-muted-foreground/60">Solo si la mediste en test real — manda sobre las fórmulas.</p>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="ref_5k_time_sec" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Referencia 5K (segundos, opcional)
                    </label>
                    <input
                        id="ref_5k_time_sec"
                        name="ref_5k_time_sec"
                        type="number"
                        min={600}
                        max={7200}
                        inputMode="numeric"
                        defaultValue={client.ref_5k_time_sec ?? ''}
                        placeholder="Ej. 1500 (= 25:00)"
                        className={INPUT_CLASS}
                    />
                    <p className="text-[10px] text-muted-foreground/60">Tiempo de 5K para prescribir por pace.</p>
                </div>
            </div>

            {state.error && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
                    {state.error}
                </p>
            )}

            <SubmitButton />
        </form>
    )
}
