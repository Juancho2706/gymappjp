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
} from '../_actions/exercises.actions'
import type { ExerciseCatalogRow } from '../_data/exercises.queries'
import { ExerciseMediaPicker, type MediaValue } from './ExerciseMediaPicker'

/** Segundos → "m:ss" para los inputs de recorte de video (vacío si null). */
function secondsToMmss(sec: number | null | undefined): string {
    if (sec == null) return ''
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

/** "m:ss" o segundos sueltos → número de segundos (null si vacío/ inválido). */
function mmssToSeconds(str: string): number | null {
    const t = str.trim()
    if (!t) return null
    if (t.includes(':')) {
        const [m, s] = t.split(':')
        const mi = parseInt(m, 10)
        const se = parseInt(s, 10)
        if (isNaN(mi) || isNaN(se)) return null
        return mi * 60 + se
    }
    const n = parseInt(t, 10)
    return isNaN(n) ? null : n
}

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

/** Tipos polimórficos (specs/movida-entrenamiento): deciden los ejes del builder/alumno. */
const EXERCISE_TYPE_OPTIONS = [
    { value: 'strength', label: 'Fuerza (series × reps)' },
    { value: 'cardio', label: 'Cardio (duración / distancia / zona FC)' },
    { value: 'mobility', label: 'Movilidad (holds por lado)' },
    { value: 'roller', label: 'Foam roller (duración o pasadas)' },
]

interface Props {
    open: boolean
    onClose: () => void
    exercise?: ExerciseCatalogRow
}

const initialState: ExerciseActionState = {}

function initialMedia(exercise: ExerciseCatalogRow | undefined): MediaValue {
    if (!exercise) return { kind: 'youtube', value: '' }
    if ((exercise as Record<string, unknown>).gif_url) return { kind: 'gif', value: (exercise as Record<string, unknown>).gif_url as string }
    if ((exercise as Record<string, unknown>).image_url) return { kind: 'image', value: (exercise as Record<string, unknown>).image_url as string }
    if (exercise.video_url) return { kind: 'youtube', value: exercise.video_url }
    return { kind: 'youtube', value: '' }
}

export function ExerciseFormModal({ open, onClose, exercise }: Props) {
    const [isPending, startTransition] = useTransition()
    const [media, setMedia] = useState<MediaValue>(() => initialMedia(exercise))
    const [name, setName] = useState(exercise?.name ?? '')
    const [secondaryMuscles, setSecondaryMuscles] = useState(exercise?.secondary_muscles?.join(', ') ?? '')
    const [instructions, setInstructions] = useState(exercise?.instructions?.join('\n') ?? '')
    const [videoStart, setVideoStart] = useState(secondsToMmss((exercise as Record<string, unknown>)?.video_start_time as number | null | undefined))
    const [videoEnd, setVideoEnd] = useState(secondsToMmss((exercise as Record<string, unknown>)?.video_end_time as number | null | undefined))
    const [exerciseType, setExerciseType] = useState((exercise as Record<string, unknown> | undefined)?.exercise_type as string ?? 'strength')
    const [difficulty, setDifficulty] = useState(exercise?.difficulty ?? '')

    useEffect(() => {
        setMedia(initialMedia(exercise))
        setName(exercise?.name ?? '')
        setSecondaryMuscles(exercise?.secondary_muscles?.join(', ') ?? '')
        setInstructions(exercise?.instructions?.join('\n') ?? '')
        setVideoStart(secondsToMmss((exercise as Record<string, unknown>)?.video_start_time as number | null | undefined))
        setVideoEnd(secondsToMmss((exercise as Record<string, unknown>)?.video_end_time as number | null | undefined))
        setExerciseType((exercise as Record<string, unknown> | undefined)?.exercise_type as string ?? 'strength')
        setDifficulty(exercise?.difficulty ?? '')
    }, [exercise])

    const action = exercise
        ? updateExerciseAction.bind(null, exercise.id)
        : createExerciseAction

    const [state, formAction] = useActionState(action, initialState)

    const handleSubmit = (formData: FormData) => {
        formData.set('media_kind', media.value ? media.kind : 'none')
        formData.set('video_url', media.kind === 'youtube' ? media.value : '')
        formData.set('gif_url', media.kind === 'gif' ? media.value : '')
        formData.set('image_url', media.kind === 'image' ? media.value : '')
        const isYt = media.kind === 'youtube' && !!media.value
        const startSec = isYt ? mmssToSeconds(videoStart) : null
        const endSec = isYt ? mmssToSeconds(videoEnd) : null
        formData.set('video_start_time', startSec != null ? String(startSec) : '')
        formData.set('video_end_time', endSec != null ? String(endSec) : '')
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
                        <label className="text-sm font-medium text-foreground">Nombre *</label>
                        <Input
                            name="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Press banca inclinado"
                            required
                        />
                        {state.fieldErrors?.name && (
                            <p className="text-xs text-destructive">{state.fieldErrors.name[0]}</p>
                        )}
                    </div>

                    {/* Grupo muscular */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Grupo muscular *</label>
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

                    {/* Tipo de ejercicio (polimórfico) */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Tipo de ejercicio</label>
                        <Select
                            name="exercise_type"
                            value={exerciseType}
                            onValueChange={(v) => setExerciseType(v ?? 'strength')}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Fuerza (series × reps)">
                                    {EXERCISE_TYPE_OPTIONS.find((o) => o.value === exerciseType)?.label ?? exerciseType}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {EXERCISE_TYPE_OPTIONS.map(({ value, label }) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Define qué campos muestra el builder y la app del alumno.
                        </p>
                    </div>

                    {/* Equipo + Dificultad */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-foreground">Equipo</label>
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
                            <label className="text-sm font-medium text-foreground">Dificultad</label>
                            <Select name="difficulty" value={difficulty} onValueChange={(v) => setDifficulty(v ?? '')}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccioná dificultad">
                                        {difficulty ? (DIFFICULTY_OPTIONS.find((o) => o.value === difficulty)?.label ?? difficulty) : null}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {DIFFICULTY_OPTIONS.map(({ value, label }) => (
                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Media picker */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Demostración visual</label>
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

                    {/* Recorte del video de YouTube (start/end) — loopea el tramo (salta intro) */}
                    {media.kind === 'youtube' && media.value && (
                        <div className="space-y-1.5">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-foreground">Empieza en (m:ss)</label>
                                    <Input
                                        value={videoStart}
                                        onChange={(e) => setVideoStart(e.target.value)}
                                        placeholder="0:20"
                                        inputMode="numeric"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-foreground">Termina en (opcional)</label>
                                    <Input
                                        value={videoEnd}
                                        onChange={(e) => setVideoEnd(e.target.value)}
                                        placeholder="1:30"
                                        inputMode="numeric"
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                El video loopea ese tramo (salta intro/charla). Vacío = video completo.
                            </p>
                            {state.fieldErrors?.video_end_time && (
                                <p className="text-xs text-destructive">{state.fieldErrors.video_end_time[0]}</p>
                            )}
                        </div>
                    )}

                    {/* Músculos secundarios */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Músculos secundarios</label>
                        <Input
                            name="secondary_muscles"
                            value={secondaryMuscles}
                            onChange={(e) => setSecondaryMuscles(e.target.value)}
                            placeholder="Ej: Tríceps, Deltoides (separados por coma)"
                        />
                    </div>

                    {/* Instrucciones */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Instrucciones</label>
                        <Textarea
                            name="instructions"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
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
