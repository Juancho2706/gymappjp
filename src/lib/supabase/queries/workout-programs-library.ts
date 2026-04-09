/**
 * Shared Supabase select string for the coach program library list.
 * Used by both page.tsx (server fetch) and duplicateWorkoutProgramAction (snapshot after duplicate).
 * Keep in sync with ProgramListModel in libraryStats.ts.
 */
export const LIBRARY_PROGRAM_LIST_SELECT = `
    *,
    client:clients(id, full_name),
    workout_plans (
        id,
        day_of_week,
        title,
        workout_blocks (
            id,
            order_index,
            exercise:exercises(name),
            sets,
            reps,
            section,
            tempo,
            rir,
            rest_time,
            notes,
            superset_group
        )
    )
` as const
