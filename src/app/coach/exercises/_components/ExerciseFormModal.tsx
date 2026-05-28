'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { MUSCLE_GROUPS } from '@/lib/constants'
import {
    createExerciseAction,
    updateExerciseAction,
    type ExerciseActionState,
} from '../_actions/exercise.actions'
import type { ExerciseCatalogRow } from '../_data/exercises.queries'
import { ExerciseMediaPicker, type MediaValue } from './ExerciseMediaPicker'

const EQUIPMENT_OPTIONS = [
    'Peso libre',
    'Máquina',
    'Poleas',
    'Banda',
    'Corporal',
    'Kettlebell',
    'Otro',
]

const DIFFICULTY_OPTIONS = [
    { value: 'beginner', label: 'Principiante' },
    { value: 'intermediate', label: 'Intermedio' },
    { value: 'advanced', label: 'Avanzado' },
]

interface Props {
    open: boolean
    onClose: () => void
    exercise?: ExerciseCatalogRow
}

const initialState: ExerciseActionState = {}

function initialMedia(exercise: ExerciseCatalogRow | undefined): MediaValue {
    if (!exercise) return { kind: 'youtube', value: '' }
    if (exercise.gif_url) return { kind: 'gif', value: exercise.gif_url }
    if (exercise.image_url) return { kind: 'image', value: exercise.image_url }
    if (exercise.video_url) return { kind: 'youtube', value: exercise.video_url }
    return { kind: 'youtube', value: '' }
}

export function ExerciseFormModal({ open, onClose, exercise }: Props) {
    const [isPending, startTransition] = useTransition()
    const [media, setMedia] = useState<MediaValue>(() => initialMedia(exercise))

    useEffect(() => {
        setMedia(initialMedia(exercise))
    }, [exercise])

    const action = exercise
        ? updateExerciseAction.bind(null, exercise.id)
        : createExerciseAction

    const [state, formAction] = useActionState(action, initialState)

    const handleSubmit = (formData: FormData) => {
        // Inyectar media en el formData según el tipo elegido
        formData.set('media_kind', media.value ? media.kind : 'none')
        formData.set('video_url', media.kind === 'youtube' ? media.value : '')
        formData.set('gif_url', media.kind === 'gif' ? media.value : '')
        formData.set('image_url', media.kind === 'image' ? media.value : '')
        startTransition(() => {
            formAction(formData)
        })
    }

    useEffect(() => {
        if (state.success) {
            onClose()
        }
    }, [state.success, onClose])

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{exercise ? 'Editar ejercicio' : 'Crear ejercicio'}</DialogTitle>
                </DialogHeader>

                <form action={handleSubmit} className="space-y-4 mt-2">
                    {state.error && state.error !== 'upgrade_required' && (
                        <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                            {state.error}
                        </p>
                    )}

                    {/* Nombre */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Nombre *</label>
                        <Input
                            name="name"
                            defaultValue={exercise?.name ?? ''}
                            placeholder="Ej: Press banca inclinado"
                            required
                        />
                        {state.fieldErrors?.name && (
                            <p className="text-xs text-destructive">{state.fieldErrors.name[0]}</p>
                        )}
                    </div>

                    {/* Grupo muscular */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Grupo muscular *</label>
                        <Select name="muscle_group" defaultValue={exercise?.muscle_group ?? ''} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccioná un grupo" />
                            </SelectTrigger>
                            <SelectContent>
                                {MUSCLE_GROUPS.map((mg) => (
                                    <SelectItem key={mg} value={mg}>{mg}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {state.fieldErrors?.muscle_group && (
                            <p className="text-xs text-destructive">{state.fieldErrors.muscle_group[0]}</p>
                        )}
                    </div>

                    {/* Equipo + Dificultad */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Equipo</label>
                            <Select name="equipment" defaultValue={exercise?.equipment ?? ''}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccioná equipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    {EQUIPMENT_OPTIONS.map((eq) => (
                                        <SelectItem key={eq} value={eq}>{eq}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Dificultad</label>
                            <Select name="difficulty" defaultValue={exercise?.difficulty ?? ''}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccioná dificultad" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DIFFICULTY_OPTIONS.map(({ value, label }) => (
                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Media picker (YouTube / GIF / Imagen) */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Demostración visual</label>
                        <ExerciseMediaPicker
                            value={media}
                            onChange={setMedia}
                            error={
                                state.fieldErrors?.video_url?.[0] ??
                                state.fieldErrors?.gif_url?.[0] ??
                                state.fieldErrors?.image_url?.[0]
                            }
                        />
                    </div>

                    {/* Músculos secundarios */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Músculos secundarios</label>
                        <Input
                            name="secondary_muscles"
                            defaultValue={exercise?.secondary_muscles?.join(', ') ?? ''}
                            placeholder="Ej: Tríceps, Deltoides (separados por coma)"
                        />
                    </div>

                    {/* Instrucciones */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Instrucciones</label>
                        <Textarea
                            name="instructions"
                            defaultValue={exercise?.instructions?.join('\n') ?? ''}
                            placeholder="Una instrucción por línea..."
                            rows={4}
                        />
                        <p className="text-xs text-muted-foreground">Una instrucción por línea.</p>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            {isPending ? 'Guardando...' : exercise ? 'Guardar cambios' : 'Crear ejercicio'}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
