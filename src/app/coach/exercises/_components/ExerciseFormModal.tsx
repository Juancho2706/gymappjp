'use client'

import { useActionState, useTransition, useState } from 'react'
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
import { createExerciseAction, updateExerciseAction, type ExerciseActionState } from '../_actions/exercise.actions'
import { getYoutubeThumbnailUrl, normalizeYoutubeEmbedUrl } from '@/lib/youtube'
import type { ExerciseCatalogRow } from '../_data/exercises.queries'

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

export function ExerciseFormModal({ open, onClose, exercise }: Props) {
    const [isPending, startTransition] = useTransition()
    const [videoUrlInput, setVideoUrlInput] = useState(exercise?.video_url ?? '')

    const action = exercise
        ? updateExerciseAction.bind(null, exercise.id)
        : createExerciseAction

    const [state, formAction] = useActionState(action, initialState)

    const thumbnailUrl = getYoutubeThumbnailUrl(videoUrlInput)
    const embedUrl = normalizeYoutubeEmbedUrl(videoUrlInput)

    const handleSubmit = (formData: FormData) => {
        startTransition(() => {
            formAction(formData)
        })
    }

    if (state.success) {
        onClose()
    }

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

                    {/* URL YouTube */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Video YouTube (unlisted)</label>
                        <Input
                            name="video_url"
                            value={videoUrlInput}
                            onChange={(e) => setVideoUrlInput(e.target.value)}
                            placeholder="https://youtu.be/..."
                            type="url"
                        />
                        <p className="text-xs text-muted-foreground">
                            Pegá el link del video. Asegurate que sea Unlisted o Público en YouTube.
                        </p>
                        {state.fieldErrors?.video_url && (
                            <p className="text-xs text-destructive">{state.fieldErrors.video_url[0]}</p>
                        )}
                        {/* Live preview */}
                        {embedUrl && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-border aspect-video">
                                <iframe
                                    src={embedUrl}
                                    className="w-full h-full"
                                    sandbox="allow-scripts allow-same-origin allow-presentation"
                                    loading="lazy"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    allow="encrypted-media; picture-in-picture"
                                    title="Preview del video"
                                />
                            </div>
                        )}
                        {!embedUrl && thumbnailUrl && (
                            <p className="text-xs text-amber-500">URL parcial — completá el link para ver el preview.</p>
                        )}
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
