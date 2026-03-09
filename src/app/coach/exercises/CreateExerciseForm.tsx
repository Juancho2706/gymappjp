'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus } from 'lucide-react'
import { createExerciseAction, type ExerciseState } from './actions'
import { cn } from '@/lib/utils'

const initialState: ExerciseState = {}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button type="submit" disabled={pending}
            className={cn('w-full h-9 text-sm font-bold rounded-xl transition-all',
                'bg-gradient-to-r from-emerald-500 to-teal-600 text-white disabled:opacity-60',
                'hover:shadow-lg hover:shadow-emerald-500/25',
                'flex items-center justify-center gap-2'
            )}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {pending ? 'Guardando...' : 'Agregar'}
        </button>
    )
}

export function CreateExerciseForm({ muscleGroups, coachId }: { muscleGroups: string[], coachId: string }) {
    const [state, formAction] = useActionState(createExerciseAction, initialState)

    return (
        <form action={formAction} className="space-y-3">
            <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-semibold">Nombre</Label>
                <Input name="name" placeholder="Ej: Press inclinado con mancuernas"
                    className="h-9 text-sm bg-secondary border-border text-foreground rounded-xl placeholder:text-muted-foreground/50 focus:border-primary" />
                {state.fieldErrors?.name && <p className="text-xs text-destructive">{state.fieldErrors.name[0]}</p>}
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-semibold">Grupo muscular</Label>
                <select name="muscle_group" required
                    className="w-full h-9 px-3 text-sm rounded-xl bg-secondary border border-border text-foreground focus:border-primary focus:outline-none">
                    <option value="">Seleccionar...</option>
                    {muscleGroups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                {state.fieldErrors?.muscle_group && <p className="text-xs text-destructive">{state.fieldErrors.muscle_group[0]}</p>}
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs text-foreground font-semibold">Video URL <span className="text-muted-foreground">(opcional)</span></Label>
                <Input name="video_url" placeholder="https://youtube.com/..."
                    className="h-9 text-sm bg-secondary border-border text-foreground rounded-xl placeholder:text-muted-foreground/50 focus:border-primary" />
            </div>

            {state.error && <p className="text-xs text-destructive">{state.error}</p>}
            {state.success && <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ Ejercicio agregado.</p>}
            <SubmitButton />
        </form>
    )
}
