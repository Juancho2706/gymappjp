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
    'h-12 w-full rounded-control border-[1.5px] border-default bg-surface-card px-3.5 text-sm font-semibold text-strong outline-none transition-colors focus:border-[var(--brand)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] placeholder:text-subtle'

const LABEL_CLASS = 'block text-[11px] font-bold uppercase tracking-[0.08em] text-muted'

const HINT_CLASS = 'text-[11px] text-subtle'

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] px-4 text-[15px] font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50 disabled:shadow-none"
        >
            {pending ? <Loader2 className="size-[18px] animate-spin" /> : <Save className="size-[18px]" />}
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
                    <label htmlFor="birth_date" className={LABEL_CLASS}>
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
                    <p className={HINT_CLASS}>Habilita FCmax por Tanaka y las zonas Z1–Z5.</p>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="resting_hr" className={LABEL_CLASS}>
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
                    <p className={HINT_CLASS}>Medida al despertar — habilita Karvonen.</p>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="max_hr_override" className={LABEL_CLASS}>
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
                    <p className={HINT_CLASS}>Solo si la mediste en test real — manda sobre las fórmulas.</p>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="ref_5k_time_sec" className={LABEL_CLASS}>
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
                    <p className={HINT_CLASS}>Tiempo de 5K para prescribir por pace.</p>
                </div>
            </div>

            {state.error && (
                <p className="rounded-control border border-[color:var(--danger-500)]/30 bg-[var(--danger-100)] px-3 py-2 text-xs font-semibold text-[color:var(--danger-600)]">
                    {state.error}
                </p>
            )}

            <SubmitButton />
        </form>
    )
}
