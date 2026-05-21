'use server'

import { cloneExerciseAction as cloneExerciseActionImpl } from './_actions/exercises.actions'

export async function cloneExerciseAction(...args: Parameters<typeof cloneExerciseActionImpl>) {
    return cloneExerciseActionImpl(...args)
}
