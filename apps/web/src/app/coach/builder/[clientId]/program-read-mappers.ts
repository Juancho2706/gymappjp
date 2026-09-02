// Mappers PUROS del camino de LECTURA del builder (DB row -> estado del builder), extraídos
// VERBATIM de WeeklyPlanBuilder.tsx (Fase 2 — split de god-file, behavior-preserving). Sin red/DB,
// sin estado. NO unificar parseProgramPhases con el duplicado más laxo de profileProgramUtils.ts
// (otro return type + clamping distinto).

import type { Tables } from '@/lib/database.types'
import { effectiveExerciseType } from '@/lib/workout-exercise-type'
import type { BuilderBlock, DayState, ProgramPhase } from './types'

type Exercise = Tables<'exercises'>

export function parseProgramPhases(raw: unknown): ProgramPhase[] {
    if (raw == null) return []
    try {
        const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : []
        if (!Array.isArray(arr)) return []
        return arr.map((p: any, i: number) => ({
            name: String(p?.name || `Fase ${i + 1}`).slice(0, 80),
            weeks: Math.min(52, Math.max(1, Number(p?.weeks) || 1)),
            color: typeof p?.color === 'string' && p.color.startsWith('#') ? p.color : '#6366F1',
        }))
    } catch {
        return []
    }
}

export type EmbeddedExercise = {
    name?: string | null
    muscle_group?: string | null
    gif_url?: string | null
    video_url?: string | null
    thumbnail_url?: string | null
    exercise_type?: string | null
    /** Modalidad de cardio del catálogo (Fase C) — el editor la usa para el objetivo rep-based. */
    cardio_modality?: string | null
}

/** PostgREST puede devolver la FK `exercises` como objeto o como array de un elemento. */
export function embeddedExerciseRow(raw: unknown): EmbeddedExercise | null {
    if (raw == null) return null
    if (Array.isArray(raw)) {
        const first = raw[0]
        if (first && typeof first === 'object') return first as EmbeddedExercise
        return null
    }
    if (typeof raw === 'object') return raw as EmbeddedExercise
    return null
}

export function mapDbBlockToBuilderBlock(
    b: any,
    exerciseById: Map<string, Exercise>,
    uid: string,
    dayId: number,
): BuilderBlock {
    const exRel = embeddedExerciseRow(b.exercises)
    const cat = b.exercise_id ? exerciseById.get(b.exercise_id) : undefined
    return {
        uid,
        exercise_id: b.exercise_id,
        exercise_name: exRel?.name || cat?.name || 'Unknown',
        muscle_group: exRel?.muscle_group || cat?.muscle_group || 'Unknown',
        gif_url: (exRel?.gif_url || cat?.gif_url) || undefined,
        video_url: (exRel?.video_url || cat?.video_url) || undefined,
        thumbnail_url: (exRel?.thumbnail_url || cat?.thumbnail_url) || undefined,
        sets: b.sets,
        reps: b.reps,
        target_weight_kg: b.target_weight_kg?.toString() || '',
        tempo: b.tempo || '',
        rir: b.rir || '',
        rest_time: b.rest_time || '',
        warmup_rest_time: b.warmup_rest_time || '',
        notes: b.notes || '',
        superset_group: b.superset_group || null,
        progression_type: b.progression_type || null,
        progression_value: b.progression_value ?? null,
        progression_mode: b.progression_mode ?? null,
        section: b.section === 'warmup' || b.section === 'cooldown' ? b.section : 'main',
        section_template_id: b.section_template_id ?? null,
        is_override: !!b.is_override,
        // Polimórfico (specs/movida-entrenamiento): round-trip de los campos tipados.
        // Filas legacy: todo NULL ⇒ el bloque queda byte-identical al mapeo de siempre.
        exercise_type: ((exRel?.exercise_type ?? cat?.exercise_type) || null) as BuilderBlock['exercise_type'],
        // Solo-memoria (Fase C): NO es columna de workout_blocks; el sheet la usa para saber si el
        // ejercicio se prescribe por conteo (saltos/pisos/reps). El save la ignora (whitelist).
        cardio_modality:
            (exRel?.cardio_modality ?? (cat as { cardio_modality?: string | null } | undefined)?.cardio_modality) ?? null,
        exercise_type_override: (b.exercise_type_override ?? null) as BuilderBlock['exercise_type_override'],
        side_mode: b.side_mode ?? null,
        reps_value: b.reps_value ?? null,
        reps_unit: b.reps_unit ?? null,
        load_type: b.load_type ?? null,
        load_value: b.load_value != null ? String(b.load_value) : '',
        load_unit: b.load_unit ?? null,
        distance_value: b.distance_value != null ? String(b.distance_value) : '',
        distance_unit: b.distance_unit ?? null,
        duration_sec: b.duration_sec ?? null,
        target_pace_sec_per_km: b.target_pace_sec_per_km ?? null,
        hr_zone: b.hr_zone ?? null,
        instructions: b.instructions || '',
        interval_config: b.interval_config ?? null,
        is_unilateral: b.is_unilateral ?? null,
        extra_targets: b.extra_targets ?? null,
        dayId,
    }
}

export function enrichDaysWithExerciseMedia(days: DayState[], exerciseById: Map<string, Exercise>): DayState[] {
    return days.map(d => ({
        ...d,
        blocks: d.blocks.map(blk => {
            const cat = exerciseById.get(blk.exercise_id)
            if (!cat) return blk
            return {
                ...blk,
                gif_url: blk.gif_url || (cat.gif_url || undefined),
                video_url: blk.video_url || (cat.video_url || undefined),
                thumbnail_url: blk.thumbnail_url || (cat.thumbnail_url || undefined),
            }
        }),
    }))
}

/**
 * Reconcilia los bloques YA colocados en los días contra la versión fresca de UN ejercicio del
 * catálogo (E1). El bloque COPIA nombre/media al crearse (`createDefaultBlock`,
 * `mapDbBlockToBuilderBlock`), así que tras editar el ejercicio desde el builder el día seguía
 * mostrando el nombre y el GIF viejos hasta recargar la página.
 *
 * Diferencia con `enrichDaysWithExerciseMedia`, que solo RELLENA huecos: acá la media del catálogo
 * PISA la del bloque, incluso a vacío. Si el coach le sacó el GIF al ejercicio, el bloque tiene que
 * quedarse sin GIF; si no, seguiría mostrando un archivo que el coach ya quitó.
 *
 * Lo que NO se toca: la prescripción del coach (series, reps, descansos, notas, superserie, área) y
 * `exercise_type_override`, que es una decisión explícita a nivel bloque y manda sobre el tipo del
 * catálogo. Eliminar un ejercicio tampoco saca bloques del plan: el borrado es soft, la fila sigue
 * ahí y el bloque conserva su nombre (misma promesa que el diálogo de borrado del catálogo).
 *
 * Devuelve el MISMO array si ningún bloque referencia al ejercicio, para no disparar un re-render
 * (ni una entrada de historial) por una edición que no toca este plan.
 */
export function reconcileDaysWithExercise(days: DayState[], exercise: Exercise): DayState[] {
    let touched = false
    const next = days.map(d => {
        let dayTouched = false
        const blocks = d.blocks.map(blk => {
            if (blk.exercise_id !== exercise.id) return blk
            dayTouched = true
            return {
                ...blk,
                exercise_name: exercise.name,
                muscle_group: exercise.muscle_group,
                gif_url: exercise.gif_url ?? undefined,
                video_url: exercise.video_url ?? undefined,
                thumbnail_url: exercise.thumbnail_url ?? undefined,
                exercise_type: ((exercise as { exercise_type?: string | null }).exercise_type ?? null) as BuilderBlock['exercise_type'],
                cardio_modality: (exercise as { cardio_modality?: string | null }).cardio_modality ?? null,
            }
        })
        if (!dayTouched) return d
        touched = true
        return { ...d, blocks }
    })
    return touched ? next : days
}

export function createDefaultBlock(exercise: Exercise): BuilderBlock {
    const exerciseType = effectiveExerciseType(null, { exercise_type: (exercise as { exercise_type?: string | null }).exercise_type })
    const base: BuilderBlock = {
        uid: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        muscle_group: exercise.muscle_group,
        gif_url: exercise.gif_url ?? undefined,
        video_url: exercise.video_url ?? undefined,
        thumbnail_url: exercise.thumbnail_url ?? undefined,
        sets: 3,
        reps: '8-12',
        target_weight_kg: '',
        tempo: '',
        rir: '',
        rest_time: '90s',
        notes: '',
        section: 'main',
        section_template_id: null,
        is_override: false,
        exercise_type: exerciseType,
        // Fase C: viaja con el bloque para que el sheet ofrezca el objetivo en la unidad propia.
        cardio_modality: (exercise as { cardio_modality?: string | null }).cardio_modality ?? null,
    }
    // Defaults por tipo (ejercicios strength: EXACTAMENTE el default de siempre — AC3)
    if (exerciseType === 'cardio') {
        return { ...base, sets: 1, reps: '10min', duration_sec: 600, rest_time: '' }
    }
    if (exerciseType === 'mobility') {
        return { ...base, sets: 3, reps: '30s', duration_sec: 30, rest_time: '' }
    }
    if (exerciseType === 'roller') {
        return { ...base, sets: 1, reps: '10 pasadas', reps_value: 10, reps_unit: 'passes', rest_time: '' }
    }
    return base
}
