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
import { revalidatePath } from 'next/cache'
import type { ProgramListModel } from '@/app/coach/workout-programs/libraryStats'
import type { WorkoutProgramInput } from '@eva/schemas'

export type { WorkoutBlockInput, WorkoutDayInput, WorkoutProgramInput } from '@eva/schemas'
export type { AssignProgramOptions, AssignProgramResult, ProgramState, SaveProgramOptions } from '@/services/workout/workout.service'

export async function saveWorkoutProgramAction(payload: WorkoutProgramInput, saveOptions?: SaveProgramOptions): Promise<ProgramState> {
    const res = await saveWorkoutProgramService(payload, saveOptions)
    if (res.programId) {
        if (payload.clientId) revalidatePath(`/coach/clients/${payload.clientId}`)
        revalidatePath('/coach/workout-programs')
        revalidatePath('/c', 'layout')
    }
    return res
}

export async function deleteWorkoutProgramAction(programId: string, clientId: string): Promise<{ error?: string }> {
    const res = await deleteWorkoutProgramService(programId, clientId)
    if (!res.error) {
        if (clientId) revalidatePath(`/coach/clients/${clientId}`)
        revalidatePath('/coach/workout-programs')
        revalidatePath('/c', 'layout')
    }
    return res
}

export async function deletePlanAction(planId: string, clientId: string): Promise<{ error?: string }> {
    const res = await deletePlanService(planId, clientId)
    if (!res.error) {
        if (clientId) revalidatePath(`/coach/clients/${clientId}`)
        revalidatePath('/coach/workout-programs')
    }
    return res
}

export async function duplicateWorkoutProgramAction(
    programId: string,
    newName: string,
): Promise<{
    error?: string
    programId?: string
    program?: ProgramListModel
}> {
    const res = await duplicateWorkoutProgramService(programId, newName)
    if (!res.error) {
        revalidatePath('/coach/workout-programs')
    }
    return res
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
    const res = await syncProgramFromTemplateService(programId)
    if (res.programId) {
        if (res.clientId) revalidatePath(`/coach/clients/${res.clientId}`)
        revalidatePath('/coach/workout-programs')
        revalidatePath('/c', 'layout')
    }
    return res
}

export async function getCoachClientsAction(): Promise<{
    data?: { id: string; full_name: string | null; avatar_url: string | null }[]
    error?: string
}> {
    return getCoachClientsService()
}
