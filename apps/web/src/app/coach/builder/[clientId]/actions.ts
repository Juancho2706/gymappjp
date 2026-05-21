'use server'

import {
    assignProgramToClientsAction as assignProgramToClientsActionImpl,
    deletePlanAction as deletePlanActionImpl,
    deleteWorkoutProgramAction as deleteWorkoutProgramActionImpl,
    duplicateWorkoutProgramAction as duplicateWorkoutProgramActionImpl,
    getCoachClientsAction as getCoachClientsActionImpl,
    getExerciseHistoryAction as getExerciseHistoryActionImpl,
    getTemplatesForBuilderAction as getTemplatesForBuilderActionImpl,
    loadTemplateForBuilderAction as loadTemplateForBuilderActionImpl,
    saveWorkoutProgramAction as saveWorkoutProgramActionImpl,
    syncProgramFromTemplateAction as syncProgramFromTemplateActionImpl,
} from './_actions/builder.actions'

export type { WorkoutBlockInput, WorkoutDayInput, WorkoutProgramInput } from '@eva/schemas'
export type { AssignProgramOptions, AssignProgramResult, ProgramState } from './_actions/builder.actions'

export async function saveWorkoutProgramAction(...args: Parameters<typeof saveWorkoutProgramActionImpl>) {
    return saveWorkoutProgramActionImpl(...args)
}

export async function deleteWorkoutProgramAction(...args: Parameters<typeof deleteWorkoutProgramActionImpl>) {
    return deleteWorkoutProgramActionImpl(...args)
}

export async function deletePlanAction(...args: Parameters<typeof deletePlanActionImpl>) {
    return deletePlanActionImpl(...args)
}

export async function duplicateWorkoutProgramAction(...args: Parameters<typeof duplicateWorkoutProgramActionImpl>) {
    return duplicateWorkoutProgramActionImpl(...args)
}

export async function assignProgramToClientsAction(...args: Parameters<typeof assignProgramToClientsActionImpl>) {
    return assignProgramToClientsActionImpl(...args)
}

export async function getExerciseHistoryAction(...args: Parameters<typeof getExerciseHistoryActionImpl>) {
    return getExerciseHistoryActionImpl(...args)
}

export async function getTemplatesForBuilderAction(...args: Parameters<typeof getTemplatesForBuilderActionImpl>) {
    return getTemplatesForBuilderActionImpl(...args)
}

export async function loadTemplateForBuilderAction(...args: Parameters<typeof loadTemplateForBuilderActionImpl>) {
    return loadTemplateForBuilderActionImpl(...args)
}

export async function syncProgramFromTemplateAction(...args: Parameters<typeof syncProgramFromTemplateActionImpl>) {
    return syncProgramFromTemplateActionImpl(...args)
}

export async function getCoachClientsAction(...args: Parameters<typeof getCoachClientsActionImpl>) {
    return getCoachClientsActionImpl(...args)
}
