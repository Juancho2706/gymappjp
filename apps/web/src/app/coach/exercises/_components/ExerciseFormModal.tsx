'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    CARDIO_MODALITY_OPTIONS,
    EQUIPMENT_OPTIONS,
    EXERCISE_TYPE_OPTIONS,
    MUSCLE_GROUP_REGIONS,
    cardioAxisLabels,
    cardioModalityLabel,
    catalogMuscleGroup,
    equipmentOption,
} from '@eva/workout-engine'
import {
    createExerciseAction,
    updateExerciseAction,
    type ExerciseActionState,
} from '../_actions/exercises.actions'
import type { ExerciseCatalogRow } from '../_data/exercises.queries'
import { createClient } from '@/lib/supabase/client'
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

/** Sentinela del Select para la opción "Genérica" (el Select no admite `value=""`). */
const GENERIC_MODALITY = '__generic__'

// EQUIPMENT_OPTIONS ya no se declara acá: la lista (y el mapa de sinónimos que reconoce los
// valores en inglés del catálogo de sistema) vive en @eva/workout-engine, compartida con RN.

const DIFFICULTY_OPTIONS = [
    { value: 'beginner', label: 'Principiante' },
    { value: 'intermediate', label: 'Intermedio' },
    { value: 'advanced', label: 'Avanzado' },
]

interface Props {
    open: boolean
    onClose: () => void
    exercise?: ExerciseCatalogRow
    /**
     * Nombre precargado al CREAR (se ignora al editar). Lo usan los CTA «Crear "{término}"»
     * de los empty states de búsqueda: el coach ya escribió el nombre, no lo escribe dos veces.
     * Debe ser estable mientras el modal esté abierto (congelar el término al abrir).
     */
    initialName?: string
    /**
     * Tras crear, entrega la fila recién insertada para que el llamador la ponga donde estaba
     * el coach (el día del builder, el catálogo en curso). Solo se dispara en modo crear.
     */
    onCreated?: (exercise: ExerciseCatalogRow) => void
    /**
     * Tras guardar en modo EDITAR (`exercise` presente): el llamador refresca su lista
     * (`router.refresh()` en el catálogo). Solo se dispara en modo editar, una vez por guardado.
     */
    onSaved?: () => void
}

const initialState: ExerciseActionState = {}

function initialMedia(exercise: ExerciseCatalogRow | undefined): MediaValue {
    if (!exercise) return { kind: 'youtube', value: '' }
    if ((exercise as Record<string, unknown>).gif_url) return { kind: 'gif', value: (exercise as Record<string, unknown>).gif_url as string }
    if ((exercise as Record<string, unknown>).image_url) return { kind: 'image', value: (exercise as Record<string, unknown>).image_url as string }
    if (exercise.video_url) return { kind: 'youtube', value: exercise.video_url }
    return { kind: 'youtube', value: '' }
}

/** Bloque visual del formulario: título + apoyo + campos. Agrupa para no leerlo como una lista plana. */
function FormSection({
    title,
    description,
    children,
}: {
    title: string
    description?: string
    children: React.ReactNode
}) {
    return (
        <section className="space-y-3 rounded-card border border-subtle bg-surface-sunken/50 p-4">
            <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-strong">{title}</h3>
                {description && <p className="text-xs text-muted">{description}</p>}
            </div>
            {children}
        </section>
    )
}

/** Campo con label + control + ayuda/error (los `Input` traen el suyo; esto cubre `Select`). */
function Field({
    label,
    hint,
    error,
    children,
}: {
    label: string
    hint?: string
    error?: string
    children: React.ReactNode
}) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[13px] font-semibold text-strong">{label}</label>
            {children}
            {error ? (
                <p className="text-xs text-[var(--danger-600)]" role="alert">{error}</p>
            ) : hint ? (
                <p className="text-xs text-muted">{hint}</p>
            ) : null}
        </div>
    )
}

export function ExerciseFormModal({ open, onClose, exercise, initialName, onCreated, onSaved }: Props) {
    const [isPending, startTransition] = useTransition()
    const [media, setMedia] = useState<MediaValue>(() => initialMedia(exercise))
    const [name, setName] = useState(exercise?.name ?? initialName ?? '')
    const [secondaryMuscles, setSecondaryMuscles] = useState(exercise?.secondary_muscles?.join(', ') ?? '')
    const [instructions, setInstructions] = useState(exercise?.instructions?.join('\n') ?? '')
    const [videoStart, setVideoStart] = useState(secondsToMmss((exercise as Record<string, unknown>)?.video_start_time as number | null | undefined))
    const [videoEnd, setVideoEnd] = useState(secondsToMmss((exercise as Record<string, unknown>)?.video_end_time as number | null | undefined))
    // Duración real del video (la reporta el player del preview) para validar el recorte.
    const [videoDuration, setVideoDuration] = useState<number | null>(null)
    const [durationError, setDurationError] = useState<string | null>(null)
    const [exerciseType, setExerciseType] = useState((exercise as Record<string, unknown> | undefined)?.exercise_type as string ?? 'strength')
    // Modalidad de cardio (Fase C): sentinela para "Genérica"; se envía '' ⇒ la action guarda NULL.
    const [cardioModality, setCardioModality] = useState(
        ((exercise as Record<string, unknown> | undefined)?.cardio_modality as string | null) ?? ''
    )
    const [difficulty, setDifficulty] = useState(exercise?.difficulty ?? '')

    // Valores guardados vs. opciones ofrecidas. Dos casos distintos:
    //  1. El valor se RECONOCE pero no se escribe igual que la opción («espalda alta» por
    //     «Espalda Alta»; `dumbbell` por «Peso libre», que es como quedó el catálogo de
    //     sistema del import original). El Select arranca marcado en la opción equivalente —
    //     NO se inyecta un ítem extra, porque un segundo «Peso libre» en la lista se lee como
    //     un bug del desplegable. Guardar normaliza ese valor al del catálogo, que es la
    //     escritura canónica del mismo dato.
    //  2. El valor NO se reconoce («Bastón de madera»): se ofrece como opción extra CON SU
    //     VALOR ORIGINAL bajo un rótulo aparte, para que el guardado no lo pise en silencio.
    const savedMuscleGroup = exercise?.muscle_group ?? ''
    const canonicalMuscleGroup = catalogMuscleGroup(savedMuscleGroup)
    const legacyMuscleGroup = savedMuscleGroup && !canonicalMuscleGroup ? savedMuscleGroup : null
    const muscleGroupDefault = canonicalMuscleGroup ?? savedMuscleGroup

    const savedEquipment = exercise?.equipment ?? ''
    const canonicalEquipment = equipmentOption(savedEquipment)
    const legacyEquipment = savedEquipment && !canonicalEquipment ? savedEquipment : null
    const equipmentDefault = canonicalEquipment ?? savedEquipment

    useEffect(() => {
        setMedia(initialMedia(exercise))
        setName(exercise?.name ?? initialName ?? '')
        setSecondaryMuscles(exercise?.secondary_muscles?.join(', ') ?? '')
        setInstructions(exercise?.instructions?.join('\n') ?? '')
        setVideoStart(secondsToMmss((exercise as Record<string, unknown>)?.video_start_time as number | null | undefined))
        setVideoEnd(secondsToMmss((exercise as Record<string, unknown>)?.video_end_time as number | null | undefined))
        setExerciseType((exercise as Record<string, unknown> | undefined)?.exercise_type as string ?? 'strength')
        setCardioModality(((exercise as Record<string, unknown> | undefined)?.cardio_modality as string | null) ?? '')
        setDifficulty(exercise?.difficulty ?? '')
    }, [exercise, initialName])

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
        // Validación client-side: el fin no puede superar la duración real del video.
        if (endSec != null && videoDuration != null && endSec > videoDuration) {
            setDurationError(`El video dura ${secondsToMmss(Math.floor(videoDuration))}. El tiempo de fin no puede superarlo.`)
            return
        }
        setDurationError(null)
        formData.set('video_start_time', startSec != null ? String(startSec) : '')
        formData.set('video_end_time', endSec != null ? String(endSec) : '')
        startTransition(() => {
            formAction(formData)
        })
    }

    // Un solo aviso por creación: `state.success` sigue en true tras el cierre y el callback del
    // padre puede cambiar de identidad en cada render (insertaría el ejercicio dos veces).
    const createdNotified = useRef(false)
    const savedNotified = useRef(false)

    useEffect(() => {
        if (!state.success) return
        if (!exercise && state.exerciseId && onCreated && !createdNotified.current) {
            createdNotified.current = true
            // La action solo devuelve el id; la fila completa es lo que necesita el builder para
            // armar el bloque del día sin esperar un refresh del servidor.
            const supabase = createClient()
            void supabase
                .from('exercises')
                .select('*')
                .eq('id', state.exerciseId)
                .single()
                .then(({ data }) => {
                    if (data) onCreated(data)
                })
        }
        // Modo editar: un solo aviso por guardado (mismo motivo que `createdNotified`).
        if (exercise && onSaved && !savedNotified.current) {
            savedNotified.current = true
            onSaved()
        }
        onClose()
    }, [state.success, state.exerciseId, exercise, onCreated, onSaved, onClose])

    const isCardio = exerciseType === 'cardio'
    // Preview de las cajas que verá el alumno: derivado del MOTOR (cardioAxesFor), nunca de una
    // lista local — si el mapa de ejes cambia, estos chips cambian solos.
    const cardioAxisPreview = cardioAxisLabels(cardioModality || null)

    /** Salir de cardio limpia la modalidad (la action también la anula: acá solo espejamos la UI). */
    const handleTypeChange = (value: string | null) => {
        const next = value ?? 'strength'
        setExerciseType(next)
        if (next !== 'cardio') setCardioModality('')
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{exercise ? 'Editar ejercicio' : 'Crear ejercicio'}</DialogTitle>
                    <DialogDescription>
                        Lo que definas acá manda en el builder y en la app del alumno.
                    </DialogDescription>
                </DialogHeader>

                <form action={handleSubmit} className="space-y-4 mt-2">
                    {state.error && state.error !== 'upgrade_required' && (
                        <p
                            role="alert"
                            className="text-sm text-[var(--danger-600)] rounded-control border border-[var(--danger-500)]/30 bg-[var(--danger-100)] px-3 py-2"
                        >
                            {state.error}
                        </p>
                    )}

                    <FormSection
                        title="Identidad"
                        description="Cómo se llama el ejercicio y dónde queda ordenado en tu catálogo."
                    >
                        <Input
                            name="name"
                            label="Nombre *"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Press banca inclinado"
                            required
                            error={state.fieldErrors?.name?.[0]}
                        />

                        <Field
                            label="Grupo muscular *"
                            hint="Define en qué grupo lo encuentras al armar el plan."
                            error={state.fieldErrors?.muscle_group?.[0]}
                        >
                            <Select name="muscle_group" defaultValue={muscleGroupDefault} required>
                                <SelectTrigger className="w-full" aria-label="Grupo muscular">
                                    <SelectValue placeholder="Selecciona un grupo" />
                                </SelectTrigger>
                                {/* Agrupado por región (misma taxonomía que las pestañas de la
                                    hoja en RN): 19 valores planos obligaban a barrer la lista. */}
                                <SelectContent>
                                    {MUSCLE_GROUP_REGIONS.map((region) => (
                                        <SelectGroup key={region.id}>
                                            <SelectLabel>{region.label}</SelectLabel>
                                            {region.groups.map((mg) => (
                                                <SelectItem key={mg} value={mg}>{mg}</SelectItem>
                                            ))}
                                        </SelectGroup>
                                    ))}
                                    {legacyMuscleGroup && (
                                        <SelectGroup>
                                            <SelectLabel>Valor guardado</SelectLabel>
                                            <SelectItem value={legacyMuscleGroup}>{legacyMuscleGroup}</SelectItem>
                                        </SelectGroup>
                                    )}
                                </SelectContent>
                            </Select>
                        </Field>

                        <Input
                            name="secondary_muscles"
                            label="Músculos secundarios"
                            value={secondaryMuscles}
                            onChange={(e) => setSecondaryMuscles(e.target.value)}
                            placeholder="Tríceps, Deltoides"
                            hint="Opcional. Separa cada músculo con coma."
                        />

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Equipo">
                                <Select name="equipment" defaultValue={equipmentDefault}>
                                    <SelectTrigger className="w-full" aria-label="Equipo">
                                        <SelectValue placeholder="Selecciona equipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EQUIPMENT_OPTIONS.map((eq) => (
                                            <SelectItem key={eq} value={eq}>{eq}</SelectItem>
                                        ))}
                                        {/* Solo lo que NO se reconoce: los valores en inglés del
                                            import de sistema (dumbbell, cable…) ya arrancan
                                            marcados en su opción en español, así que inyectarlos
                                            acá pintaba DOS ítems con el mismo rótulo. */}
                                        {legacyEquipment && (
                                            <SelectGroup>
                                                <SelectLabel>Valor guardado</SelectLabel>
                                                <SelectItem value={legacyEquipment}>{legacyEquipment}</SelectItem>
                                            </SelectGroup>
                                        )}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="Dificultad">
                                <Select name="difficulty" value={difficulty} onValueChange={(v) => setDifficulty(v ?? '')}>
                                    <SelectTrigger className="w-full" aria-label="Dificultad">
                                        <SelectValue placeholder="Selecciona dificultad">
                                            {difficulty ? (DIFFICULTY_OPTIONS.find((o) => o.value === difficulty)?.label ?? difficulty) : null}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DIFFICULTY_OPTIONS.map(({ value, label }) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                    </FormSection>

                    <FormSection
                        title="Tipo de ejercicio"
                        description="Define qué campos muestra el builder y qué registra el alumno en cada serie."
                    >
                        <Field label="Tipo">
                            <Select
                                name="exercise_type"
                                value={exerciseType}
                                onValueChange={handleTypeChange}
                            >
                                <SelectTrigger className="w-full" aria-label="Tipo de ejercicio">
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
                        </Field>

                        {/* Modalidad de cardio (Fase C) — SOLO para ejercicios de tipo cardio. Decide los
                            ejes que el alumno registra por ronda. Genérica (default) = comportamiento de
                            siempre. El valor viaja como hidden input: '' ⇒ la action guarda NULL. */}
                        {isCardio && (
                            <div className="space-y-3 rounded-control border border-subtle bg-surface-card p-3">
                                <Field
                                    label="Modalidad de cardio"
                                    hint="Si cambias el tipo de ejercicio, la modalidad vuelve a Genérica."
                                    error={state.fieldErrors?.cardio_modality?.[0]}
                                >
                                    <input type="hidden" name="cardio_modality" value={cardioModality} />
                                    <Select
                                        value={cardioModality === '' ? GENERIC_MODALITY : cardioModality}
                                        onValueChange={(v) => setCardioModality(!v || v === GENERIC_MODALITY ? '' : v)}
                                    >
                                        <SelectTrigger className="w-full" aria-label="Modalidad de cardio">
                                            <SelectValue placeholder="Genérica">
                                                {cardioModalityLabel(cardioModality || null)}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CARDIO_MODALITY_OPTIONS.map(({ value, label, hint }) => (
                                                <SelectItem key={value || GENERIC_MODALITY} value={value || GENERIC_MODALITY}>
                                                    <span>{label}</span>
                                                    {/* En pantallas angostas el hint se oculta: los chips de abajo ya
                                                        muestran los ejes de la opción elegida. */}
                                                    <span className="ml-auto hidden shrink-0 text-xs text-muted sm:block">{hint}</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>

                                <div className="rounded-control border border-subtle bg-surface-sunken/60 px-3 py-2.5">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                                        El alumno registra por ronda
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        {cardioAxisPreview.map((axis) => (
                                            <span
                                                key={axis}
                                                className="rounded-pill border border-subtle bg-surface-card px-2.5 py-1 text-xs font-semibold text-strong"
                                            >
                                                {axis}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </FormSection>

                    <FormSection
                        title="Demostración visual"
                        description="Video de YouTube, GIF o imagen. Es lo primero que ve el alumno antes de ejecutar."
                    >
                        <ExerciseMediaPicker
                            value={media}
                            onChange={setMedia}
                            onDuration={setVideoDuration}
                            error={
                                state.fieldErrors?.video_url?.[0] ??
                                state.fieldErrors?.gif_url?.[0] ??
                                state.fieldErrors?.image_url?.[0]
                            }
                        />

                        {/* Recorte del video de YouTube (start/end) — loopea el tramo (salta intro) */}
                        {media.kind === 'youtube' && media.value && (
                            <div className="space-y-1.5">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Input
                                        label="Empieza en (m:ss)"
                                        value={videoStart}
                                        onChange={(e) => setVideoStart(e.target.value)}
                                        placeholder="0:20"
                                        inputMode="numeric"
                                    />
                                    <Input
                                        label="Termina en (opcional)"
                                        value={videoEnd}
                                        onChange={(e) => setVideoEnd(e.target.value)}
                                        placeholder="1:30"
                                        inputMode="numeric"
                                        error={durationError ?? state.fieldErrors?.video_end_time?.[0]}
                                    />
                                </div>
                                <p className="text-xs text-muted">
                                    El video loopea ese tramo (salta intro/charla). Vacío = video completo.
                                    {videoDuration != null && ` El video dura ${secondsToMmss(Math.floor(videoDuration))}.`}
                                </p>
                            </div>
                        )}
                    </FormSection>

                    <FormSection
                        title="Instrucciones"
                        description="Claves de técnica que el alumno lee en la ficha del ejercicio."
                    >
                        <Textarea
                            name="instructions"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder={'Espalda apoyada en el banco\nBaja controlado en 2 segundos'}
                            rows={4}
                            aria-label="Instrucciones"
                        />
                        <p className="text-xs text-muted">Una instrucción por línea.</p>
                    </FormSection>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-subtle">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="sport" disabled={isPending}>
                            {isPending ? 'Guardando...' : exercise ? 'Guardar cambios' : 'Crear ejercicio'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
