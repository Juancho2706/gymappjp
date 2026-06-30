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
