'use server'

import type {
    AssignProgramOptions,
    AssignProgramResult,
    ProgramState,
    SaveProgramOptions,
} from '@/services/workout/workout.service'
import {
    assignProgramToClientsAction as assignProgramToClientsService,
    deletePlanAction as deletePlanService,
    deleteWorkoutProgramAction as deleteWorkoutProgramService,
    duplicateWorkoutProgramAction as duplicateWorkoutProgramService,
    getCoachClientsAction as getCoachClientsService,
    getExerciseHistoryAction as getExerciseHistoryService,
    getTemplatesForBuilderAction as getTemplatesForBuilderService,
    loadTemplateForBuilderAction as loadTemplateForBuilderService,
    saveWorkoutProgramAction as saveWorkoutProgramService,
    syncProgramFromTemplateAction as syncProgramFromTemplateService,
} from '@/services/workout/workout.service'
import type { ProgramListModel } from '@/app/coach/workout-programs/libraryStats'
import type { WorkoutProgramInput } from '@eva/schemas'

export type { WorkoutBlockInput, WorkoutDayInput, WorkoutProgramInput } from '@eva/schemas'
export type { AssignProgramOptions, AssignProgramResult, ProgramState, SaveProgramOptions } from '@/services/workout/workout.service'

export async function saveWorkoutProgramAction(payload: WorkoutProgramInput, saveOptions?: SaveProgramOptions): Promise<ProgramState> {
    return saveWorkoutProgramService(payload, saveOptions)
}

export async function deleteWorkoutProgramAction(programId: string, clientId: string): Promise<{ error?: string }> {
    return deleteWorkoutProgramService(programId, clientId)
}

export async function deletePlanAction(planId: string, clientId: string): Promise<{ error?: string }> {
    return deletePlanService(planId, clientId)
}

export async function duplicateWorkoutProgramAction(
    programId: string,
    newName: string,
): Promise<{
    error?: string
    programId?: string
    program?: ProgramListModel
}> {
    return duplicateWorkoutProgramService(programId, newName)
}

export async function assignProgramToClientsAction(
    templateId: string,
    clientIds: string[],
    options?: string | AssignProgramOptions
): Promise<AssignProgramResult> {
    return assignProgramToClientsService(templateId, clientIds, options)
}

export async function getExerciseHistoryAction(clientId: string, exerciseId: string) {
    return getExerciseHistoryService(clientId, exerciseId)
}

export async function getTemplatesForBuilderAction() {
    return getTemplatesForBuilderService()
}

export async function loadTemplateForBuilderAction(templateId: string) {
    return loadTemplateForBuilderService(templateId)
}

export async function syncProgramFromTemplateAction(programId: string): Promise<ProgramState> {
    return syncProgramFromTemplateService(programId)
}

export async function getCoachClientsAction(): Promise<{
    data?: { id: string; full_name: string | null; avatar_url: string | null }[]
    error?: string
}> {
    return getCoachClientsService()
}
