'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// --- SCHEMAS ---

const blockSchema = z.object({
    exercise_id: z.string().uuid(),
    sets: z.coerce.number().int().min(1).max(20),
    reps: z.string().min(1).max(20),
    target_weight_kg: z.coerce.number().min(0).nullable().optional(),
    tempo: z.string().max(20).nullable().optional(),
    rir: z.string().max(10).nullable().optional(),
    rest_time: z.string().max(20).nullable().optional(),
    notes: z.string().max(200).nullable().optional(),
})

const workoutDaySchema = z.object({
    day_of_week: z.number().int().min(1).max(7),
    blocks: z.array(blockSchema).min(1, 'Agrega al menos un ejercicio'),
})

const workoutProgramSchema = z.object({
    programId: z.string().uuid().optional(),
    clientId: z.string().uuid(),
    programName: z.string().min(2, 'El nombre del programa es requerido').max(100),
    weeksToRepeat: z.coerce.number().int().min(1).max(52),
    startDate: z.string().min(10, 'La fecha de inicio es requerida'),
    days: z.array(workoutDaySchema).min(1, 'Agrega al menos un día de entrenamiento'),
})

// --- TYPES ---

export type WorkoutBlockInput = z.infer<typeof blockSchema>
export type WorkoutDayInput = z.infer<typeof workoutDaySchema>
export type WorkoutProgramInput = z.infer<typeof workoutProgramSchema>

export type ProgramState = {
    error?: string
    programId?: string
}

// --- ACTIONS ---

/**
 * Guarda o actualiza un programa de entrenamiento completo, incluyendo sus planes y bloques.
 */
export async function saveWorkoutProgramAction(payload: WorkoutProgramInput): Promise<ProgramState> {
    const parsed = workoutProgramSchema.safeParse(payload)

    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const { programId, clientId, programName, weeksToRepeat, startDate, days } = parsed.data

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Verificar que el alumno pertenezca al coach
    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', user.id)
        .maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    const adminDb = await createRawAdminClient()

    // Calcular end_date (startDate + weeksToRepeat * 7 días)
    const start = new Date(startDate)
    const end = new Date(start)
    end.setDate(start.getDate() + (weeksToRepeat * 7) - 1)
    const endDate = end.toISOString().split('T')[0]

    try {
        let finalProgramId = programId

        if (finalProgramId) {
            // Actualizar programa existente
            const { error: updateError } = await adminDb
                .from('workout_programs')
                .update({
                    name: programName,
                    weeks_to_repeat: weeksToRepeat,
                    start_date: startDate,
                    end_date: endDate,
                    updated_at: new Date().toISOString()
                })
                .eq('id', finalProgramId)
                .eq('coach_id', user.id)

            if (updateError) throw new Error('Error al actualizar el programa.')

            // Borrar planes antiguos asociados al programa (CASCADE borrará los bloques)
            const { error: deleteError } = await adminDb
                .from('workout_plans')
                .delete()
                .eq('program_id', finalProgramId)

            if (deleteError) throw new Error('Error al limpiar planes antiguos.')
        } else {
            // Insertar nuevo programa
            const { data: program, error: programError } = await adminDb
                .from('workout_programs')
                .insert({
                    client_id: clientId,
                    coach_id: user.id,
                    name: programName,
                    weeks_to_repeat: weeksToRepeat,
                    start_date: startDate,
                    end_date: endDate,
                })
                .select('id')
                .single()

            if (programError || !program) {
                throw new Error(programError?.message ?? 'Error al crear el programa.')
            }
            finalProgramId = program.id
        }

        if (!finalProgramId) throw new Error('No se pudo determinar el ID del programa.')

        // Insertar los nuevos planes vinculados al programa
        for (const day of days) {
            const { data: plan, error: planError } = await adminDb
                .from('workout_plans')
                .insert({
                    client_id: clientId,
                    coach_id: user.id,
                    program_id: finalProgramId,
                    day_of_week: day.day_of_week,
                    title: `${programName} - Día ${day.day_of_week}`,
                    group_name: 'Programa de Entrenamiento',
                    assigned_date: startDate,
                })
                .select('id')
                .single()

            if (planError || !plan) {
                throw new Error(planError?.message ?? `Error al crear plan para el día ${day.day_of_week}`)
            }

            // Insertar los bloques (ejercicios) para este plan
            const blocksToInsert = day.blocks.map((block, index) => ({
                plan_id: plan.id,
                exercise_id: block.exercise_id,
                order_index: index,
                sets: block.sets,
                reps: block.reps,
                target_weight_kg: block.target_weight_kg ?? null,
                tempo: block.tempo ?? null,
                rir: block.rir ?? null,
                rest_time: block.rest_time ?? null,
                notes: block.notes ?? null,
            }))

            const { error: blocksError } = await adminDb
                .from('workout_blocks')
                .insert(blocksToInsert)

            if (blocksError) throw new Error(blocksError.message)
        }

        revalidatePath(`/coach/clients/${clientId}`)
        return { programId: finalProgramId }
    } catch (error: any) {
        console.error('Error en saveWorkoutProgramAction:', error)
        return { error: error.message || 'Error inesperado al guardar el programa.' }
    }
}

/**
 * Elimina un programa de entrenamiento y todos sus datos asociados (vía CASCADE).
 */
export async function deleteWorkoutProgramAction(programId: string, clientId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { error } = await adminDb
        .from('workout_programs')
        .delete()
        .eq('id', programId)
        .eq('coach_id', user.id)

    if (error) return { error: error.message }

    revalidatePath(`/coach/clients/${clientId}`)
    return {}
}

/**
 * Elimina un plan individual (si no pertenece a un programa o para limpieza manual).
 */
export async function deletePlanAction(planId: string, clientId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { error } = await adminDb
        .from('workout_plans')
        .delete()
        .eq('id', planId)
        .eq('coach_id', user.id)

    if (error) return { error: error.message }

    revalidatePath(`/coach/clients/${clientId}`)
    return {}
}
