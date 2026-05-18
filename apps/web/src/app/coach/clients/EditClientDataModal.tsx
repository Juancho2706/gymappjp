'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import {
    getClientIntakeAction,
    updateClientDataAction,
    type UpdateClientDataState,
    type ClientIntakeData,
} from './actions'

const initialState: UpdateClientDataState = {}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="flex flex-1 h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-sm font-bold text-white transition-all hover:shadow-lg hover:shadow-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {pending ? 'Guardando...' : 'Guardar cambios'}
        </button>
    )
}

interface Props {
    clientId: string
    clientName: string
    open: boolean
    onClose: () => void
}

export function EditClientDataModal({ clientId, clientName, open, onClose }: Props) {
    const [state, formAction] = useActionState(updateClientDataAction, initialState)
    const [loading, setLoading] = useState(false)
    const [intake, setIntake] = useState<ClientIntakeData | null>(null)
    const [fetchError, setFetchError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setLoading(true)
        setFetchError(null)
        getClientIntakeAction(clientId).then(({ data, error }) => {
            if (error) setFetchError(error)
            else setIntake(data ?? null)
            setLoading(false)
        })
    }, [open, clientId])

    useEffect(() => {
        if (state.success) onClose()
    }, [state.success, onClose])

    const selectClass =
        'flex h-10 w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary'

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="bg-card border border-border text-foreground max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-extrabold text-foreground">
                        Editar datos — {clientName}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                        Modifica el nombre, teléfono y datos de onboarding del alumno.
                    </p>
                </DialogHeader>

                {loading && (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                )}

                {fetchError && (
                    <p className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                        {fetchError}
                    </p>
                )}

                {!loading && !fetchError && intake && (
                    <form action={formAction} className="space-y-4 mt-2">
                        <input type="hidden" name="client_id" value={clientId} />

                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="edit_full_name" className="text-sm font-semibold">
                                    Nombre completo
                                </Label>
                                <Input
                                    id="edit_full_name"
                                    name="full_name"
                                    defaultValue={intake.full_name}
                                    required
                                    className="h-10 bg-secondary border-border rounded-xl"
                                />
                                {state.fieldErrors?.full_name && (
                                    <p className="text-xs text-destructive">{state.fieldErrors.full_name[0]}</p>
                                )}
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="edit_phone" className="text-sm font-semibold">
                                    Teléfono (WhatsApp)
                                </Label>
                                <Input
                                    id="edit_phone"
                                    name="phone"
                                    type="tel"
                                    defaultValue={intake.phone ?? ''}
                                    placeholder="+56xxxxxxxxx"
                                    className="h-10 bg-secondary border-border rounded-xl"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="edit_weight" className="text-sm font-semibold">
                                    Peso (kg)
                                </Label>
                                <Input
                                    id="edit_weight"
                                    name="weight_kg"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    defaultValue={intake.weight_kg ?? ''}
                                    placeholder="75.5"
                                    className="h-10 bg-secondary border-border rounded-xl"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="edit_height" className="text-sm font-semibold">
                                    Estatura (cm)
                                </Label>
                                <Input
                                    id="edit_height"
                                    name="height_cm"
                                    type="number"
                                    min="0"
                                    defaultValue={intake.height_cm ?? ''}
                                    placeholder="178"
                                    className="h-10 bg-secondary border-border rounded-xl"
                                />
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="edit_goals" className="text-sm font-semibold">
                                    Objetivo principal
                                </Label>
                                <select
                                    id="edit_goals"
                                    name="goals"
                                    defaultValue={intake.goals ?? ''}
                                    className={selectClass}
                                >
                                    <option value="">Sin especificar</option>
                                    <option value="Perder grasa">Perder grasa / Definición</option>
                                    <option value="Aumentar masa muscular">Aumentar masa muscular / Volumen</option>
                                    <option value="Recomposición corporal">Recomposición corporal</option>
                                    <option value="Mantenimiento general">Mantenimiento general / Salud</option>
                                    <option value="Rendimiento deportivo">Mejorar rendimiento deportivo</option>
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="edit_exp" className="text-sm font-semibold">
                                    Experiencia
                                </Label>
                                <select
                                    id="edit_exp"
                                    name="experience_level"
                                    defaultValue={intake.experience_level ?? ''}
                                    className={selectClass}
                                >
                                    <option value="">Sin especificar</option>
                                    <option value="Principiante">Principiante</option>
                                    <option value="Intermedio">Intermedio</option>
                                    <option value="Avanzado">Avanzado</option>
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="edit_avail" className="text-sm font-semibold">
                                    Días/semana
                                </Label>
                                <select
                                    id="edit_avail"
                                    name="availability"
                                    defaultValue={intake.availability ?? ''}
                                    className={selectClass}
                                >
                                    <option value="">Sin especificar</option>
                                    <option value="2 días">2 días</option>
                                    <option value="3 días">3 días</option>
                                    <option value="4 días">4 días</option>
                                    <option value="5 días">5 días</option>
                                    <option value="6+ días">6+ días</option>
                                </select>
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="edit_injuries" className="text-sm font-semibold">
                                    Lesiones / Limitaciones
                                </Label>
                                <textarea
                                    id="edit_injuries"
                                    name="injuries"
                                    defaultValue={intake.injuries ?? ''}
                                    placeholder="Ninguna"
                                    rows={2}
                                    className="flex w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                />
                            </div>

                            <div className="col-span-2 space-y-1.5">
                                <Label htmlFor="edit_medical" className="text-sm font-semibold">
                                    Condiciones médicas
                                </Label>
                                <textarea
                                    id="edit_medical"
                                    name="medical_conditions"
                                    defaultValue={intake.medical_conditions ?? ''}
                                    placeholder="Ninguna"
                                    rows={2}
                                    className="flex w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                />
                            </div>
                        </div>

                        {state.error && (
                            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                                {state.error}
                            </div>
                        )}

                        <div className="flex gap-3 pt-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 h-10 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                                Cancelar
                            </button>
                            <SubmitButton />
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
