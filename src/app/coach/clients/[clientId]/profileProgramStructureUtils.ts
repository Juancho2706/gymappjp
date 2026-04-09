import {
    type WeekVariantLetter,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'

export type StructureFilterContext = {
    abMode: boolean
    activeVariant: WeekVariantLetter
}

/** Planes del microciclo que toca (A/B según semana del programa si `ab_mode`). */
export function filterPlansForStructureView(
    plans: any[] | null | undefined,
    structureType: 'weekly' | 'cycle' | null | undefined,
    ctx?: StructureFilterContext
): any[] {
    const raw = plans || []
    const ab = ctx?.abMode ?? false
    const v = ctx?.activeVariant ?? 'A'
    const filtered = raw.filter((p) => workoutPlanMatchesVariant(p, v, ab))
    const sorted = [...filtered].sort(
        (a, b) => (Number(a?.day_of_week) || 0) - (Number(b?.day_of_week) || 0)
    )
    if (structureType === 'cycle') return sorted
    return sorted.filter((p) => {
        const d = Number(p?.day_of_week)
        return d >= 1 && d <= 7
    })
}

export function uniqueMuscleGroupsFromBlocks(blocks: any[] | null | undefined): string[] {
    const set = new Set<string>()
    for (const b of blocks || []) {
        const g = b?.exercises?.muscle_group
        if (g && String(g).trim()) set.add(String(g).trim())
    }
    return [...set].sort((a, b) => a.localeCompare(b))
}

export type ExerciseLogSession = {
    planTitle: string
    assignedDate: string
    rows: { set: number; kg: number | null; reps: number | null; rpe: number | null }[]
}

/** Últimas sesiones del historial asignado que incluyen logs para este ejercicio. */
export function collectLogsForExercise(
    workoutHistory: any[] | null | undefined,
    exerciseId: string,
    maxSessions = 12
): ExerciseLogSession[] {
    if (!workoutHistory?.length || !exerciseId) return []
    const sorted = [...workoutHistory].sort(
        (a, b) =>
            new Date(b.assigned_date || 0).getTime() - new Date(a.assigned_date || 0).getTime()
    )
    const out: ExerciseLogSession[] = []
    for (const plan of sorted) {
        for (const block of plan.workout_blocks || []) {
            const bid = block.exercise_id ?? block.exercises?.id
            if (String(bid) !== String(exerciseId)) continue
            const logs = [...(block.workout_logs || [])].sort(
                (a, b) => (a.set_number ?? 0) - (b.set_number ?? 0)
            )
            if (!logs.length) continue
            out.push({
                planTitle: String(plan.title || 'Entreno'),
                assignedDate: String(plan.assigned_date || ''),
                rows: logs.map((l: any) => ({
                    set: l.set_number,
                    kg: l.weight_kg ?? null,
                    reps: l.reps_done ?? null,
                    rpe: l.rpe ?? null,
                })),
            })
            if (out.length >= maxSessions) return out
        }
    }
    return out
}
