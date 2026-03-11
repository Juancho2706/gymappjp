'use client'

import { useActionState } from 'react'
import { submitIntakeForm } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
    coachSlug: string
}

export function OnboardingForm({ coachSlug }: Props) {
    const bindedSubmit = submitIntakeForm.bind(null, coachSlug)
    const [state, action, isPending] = useActionState(bindedSubmit, {})

    return (
        <form action={action} className="space-y-6">
            {state.error && (
                <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-md">
                    {state.error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="weight" className="text-muted-foreground">Peso actual (kg)*</Label>
                    <Input 
                        id="weight" 
                        name="weight" 
                        type="number" 
                        step="0.1" 
                        placeholder="Ej. 75.5" 
                        required 
                        className="bg-background/50 border-border text-foreground focus:border-[var(--theme-primary)]"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="height" className="text-muted-foreground">Estatura (cm)*</Label>
                    <Input 
                        id="height" 
                        name="height" 
                        type="number" 
                        placeholder="Ej. 178" 
                        required 
                        className="bg-background/50 border-border text-foreground focus:border-[var(--theme-primary)]"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="goals" className="text-muted-foreground">¿Cuál es tu objetivo principal?*</Label>
                <select 
                    id="goals" 
                    name="goals" 
                    required
                    className="flex h-10 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)]"
                >
                    <option value="">Selecciona tu meta</option>
                    <option value="Perder grasa">Perder grasa / Definición</option>
                    <option value="Aumentar masa muscular">Aumentar masa muscular / Volumen</option>
                    <option value="Recomposición corporal">Recomposición corporal</option>
                    <option value="Mantenimiento general">Mantenimiento general / Salud</option>
                    <option value="Rendimiento deportivo">Mejorar rendimiento deportivo</option>
                </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="experience_level" className="text-muted-foreground">Nivel de experiencia*</Label>
                    <select 
                        id="experience_level" 
                        name="experience_level" 
                        required
                        className="flex h-10 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)]"
                    >
                        <option value="">Nivel</option>
                        <option value="Principiante">Principiante (0-6 meses)</option>
                        <option value="Intermedio">Intermedio (6m-2 años)</option>
                        <option value="Avanzado">Avanzado (+2 años)</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="availability" className="text-muted-foreground">Días a la semana*</Label>
                    <select 
                        id="availability" 
                        name="availability" 
                        required
                        className="flex h-10 w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)]"
                    >
                        <option value="">Disponibilidad</option>
                        <option value="2 días">2 días</option>
                        <option value="3 días">3 días</option>
                        <option value="4 días">4 días</option>
                        <option value="5 días">5 días</option>
                        <option value="6+ días">6+ días</option>
                    </select>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="injuries" className="text-muted-foreground">¿Tienes lesiones o limitaciones musculares?</Label>
                <textarea 
                    id="injuries" 
                    name="injuries" 
                    rows={2}
                    placeholder="Ej. Dolor en rodilla derecha al correr, hernia discal leve..." 
                    className="flex w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)] placeholder:text-muted-foreground"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="medical_conditions" className="text-muted-foreground">¿Tienes alguna condición médica o enfermedad?</Label>
                <textarea 
                    id="medical_conditions" 
                    name="medical_conditions" 
                    rows={2}
                    placeholder="Ej. Hipertensión, asma, diabetes..." 
                    className="flex w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--theme-primary)] placeholder:text-muted-foreground"
                />
            </div>

            <Button 
                type="submit" 
                disabled={isPending}
                className="w-full font-bold h-12 text-white bg-[var(--theme-primary)] hover:opacity-90"
            >
                {isPending ? 'Guardando...' : 'Comenzar mi entrenamiento'}
            </Button>
        </form>
    )
}
