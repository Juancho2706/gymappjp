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
    clientId: z.string().uuid().nullable().optional(),
    programName: z.string().min(2, 'El nombre del programa es requerido').max(100),
    weeksToRepeat: z.coerce.number().int().min(1).max(52),
    startDate: z.string().nullable().optional(),
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

    let startDateToUse = startDate

    if (clientId) {
        if (!startDateToUse) {
            if (programId) {
                // Si es un programa existente para un cliente, mantenemos su fecha o usamos hoy
                const { data: existing } = await supabase
                    .from('workout_programs')
                    .select('start_date')
                    .eq('id', programId)
                    .maybeSingle()
                startDateToUse = existing?.start_date || new Date().toISOString().split('T')[0]
            } else {
                startDateToUse = new Date().toISOString().split('T')[0]
            }
        }
    } else {
        startDateToUse = null // Plantillas no tienen fecha de inicio
    }

    // Verificar que el alumno pertenezca al coach (si se proporcionó clientId)
    if (clientId) {
        const { data: client } = await supabase
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .eq('coach_id', user.id)
            .maybeSingle()

        if (!client) return { error: 'Alumno no encontrado.' }
    }

    const adminDb = await createRawAdminClient()

    // Calcular end_date si hay startDate
    let endDate = null
    if (startDateToUse) {
        const start = new Date(startDateToUse)
        const end = new Date(start)
        end.setDate(start.getDate() + (weeksToRepeat * 7) - 1)
        endDate = end.toISOString().split('T')[0]
    }

    try {
        let finalProgramId = programId

        if (finalProgramId) {
            // Obtener estado actual del programa para validaciones
            const { data: currentProgram } = await adminDb
                .from('workout_programs')
                .select('name, client_id')
                .eq('id', finalProgramId)
                .single()

            if (currentProgram) {
                // 1. Validar que no se cambie el nombre si ya está asignado
                if (currentProgram.client_id && currentProgram.name !== programName) {
                    return { error: 'No se puede cambiar el nombre de un programa ya asignado a un alumno.' }
                }

                // 2. Validar unicidad de nombre si es una plantilla (ahora o antes)
                if (!clientId) {
                    const { data: existingName } = await adminDb
                        .from('workout_programs')
                        .select('id')
                        .eq('coach_id', user.id)
                        .eq('name', programName)
                        .is('client_id', null)
                        .neq('id', finalProgramId)
                        .maybeSingle()

                    if (existingName) {
                        return { error: `Ya tienes una plantilla guardada con el nombre "${programName}".` }
                    }
                }
            }

            // Actualizar programa existente
            const { error: updateError } = await adminDb
                .from('workout_programs')
                .update({
                    name: programName,
                    weeks_to_repeat: weeksToRepeat,
                    start_date: startDateToUse,
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
            // Validar unicidad de nombre si es una nueva plantilla
            if (!clientId) {
                const { data: existingName } = await adminDb
                    .from('workout_programs')
                    .select('id')
                    .eq('coach_id', user.id)
                    .eq('name', programName)
                    .is('client_id', null)
                    .maybeSingle()

                if (existingName) {
                    return { error: `Ya tienes una plantilla guardada con el nombre "${programName}".` }
                }
            }

            // Insertar nuevo programa
            const { data: program, error: programError } = await adminDb
                .from('workout_programs')
                .insert({
                    client_id: clientId || null,
                    coach_id: user.id,
                    name: programName,
                    weeks_to_repeat: weeksToRepeat,
                    start_date: startDateToUse,
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
                    client_id: clientId || null,
                    coach_id: user.id,
                    program_id: finalProgramId,
                    day_of_week: day.day_of_week,
                    title: `${programName} - Día ${day.day_of_week}`,
                    group_name: 'Programa de Entrenamiento',
                    assigned_date: startDateToUse,
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

        if (clientId) {
            revalidatePath(`/coach/clients/${clientId}`)
        }
        revalidatePath('/coach/workout-programs')
        
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

    if (clientId) {
        revalidatePath(`/coach/clients/${clientId}`)
    }
    revalidatePath('/coach/workout-programs')
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

    if (clientId) {
        revalidatePath(`/coach/clients/${clientId}`)
    }
    revalidatePath('/coach/workout-programs')
    return {}
}

/**
 * Duplica un programa de entrenamiento existente (sea plantilla o asignado).
 * El nuevo programa será una plantilla (sin client_id) por defecto.
 */
export async function duplicateWorkoutProgramAction(programId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()

    try {
        // 1. Obtener el programa original
        const { data: original, error: originalError } = await adminDb
            .from('workout_programs')
            .select(`
                *,
                workout_plans (
                    *,
                    workout_blocks (*)
                )
            `)
            .eq('id', programId)
            .eq('coach_id', user.id)
            .single()

        if (originalError || !original) throw new Error('Programa no encontrado.')

        // 2. Insertar nuevo programa como plantilla
        const { data: newProgram, error: newProgramError } = await adminDb
            .from('workout_programs')
            .insert({
                coach_id: user.id,
                client_id: null, // Siempre como plantilla al duplicar manualmente
                name: `${original.name} (Copia)`,
                weeks_to_repeat: original.weeks_to_repeat,
                start_date: null,
                end_date: null,
            })
            .select('id')
            .single()

        if (newProgramError || !newProgram) throw new Error('Error al crear copia del programa.')

        // 3. Duplicar planes y bloques
        for (const plan of (original.workout_plans || [])) {
            const { data: newPlan, error: newPlanError } = await adminDb
                .from('workout_plans')
                .insert({
                    coach_id: user.id,
                    program_id: newProgram.id,
                    client_id: null,
                    day_of_week: plan.day_of_week,
                    title: plan.title,
                    group_name: plan.group_name,
                    assigned_date: null,
                })
                .select('id')
                .single()

            if (newPlanError || !newPlan) throw new Error('Error al copiar plan.')

            const blocksToInsert = (plan.workout_blocks || []).map((block: any) => ({
                plan_id: newPlan.id,
                exercise_id: block.exercise_id,
                order_index: block.order_index,
                sets: block.sets,
                reps: block.reps,
                target_weight_kg: block.target_weight_kg,
                tempo: block.tempo,
                rir: block.rir,
                rest_time: block.rest_time,
                notes: block.notes,
            }))

            if (blocksToInsert.length > 0) {
                const { error: blocksError } = await adminDb
                    .from('workout_blocks')
                    .insert(blocksToInsert)
                if (blocksError) throw new Error(blocksError.message)
            }
        }

        revalidatePath('/coach/workout-programs')
        return {}
    } catch (error: any) {
        console.error('Error en duplicateWorkoutProgramAction:', error)
        return { error: error.message }
    }
}

/**
 * Duplica una plantilla de programa y la asigna a varios clientes.
 */
export async function assignProgramToClientsAction(templateId: string, clientIds: string[], startDate?: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    if (!clientIds.length) return { error: 'Selecciona al menos un alumno.' }

    const adminDb = await createRawAdminClient()

    const dateToUse = startDate || new Date().toISOString().split('T')[0]

    try {
        // 1. Obtener plantilla
        const { data: template, error: templateError } = await adminDb
            .from('workout_programs')
            .select(`
                *,
                workout_plans (
                    *,
                    workout_blocks (*)
                )
            `)
            .eq('id', templateId)
            .eq('coach_id', user.id)
            .single()

        if (templateError || !template) throw new Error('Plantilla no encontrada.')

        const start = new Date(dateToUse)
        const end = new Date(start)
        end.setDate(start.getDate() + (template.weeks_to_repeat * 7) - 1)
        const endDate = end.toISOString().split('T')[0]

        // Iterar por cada cliente
        for (const clientId of clientIds) {
            // 2.a Eliminar programas anteriores del cliente para que solo tenga uno activo
            const { error: deleteOldError } = await adminDb
                .from('workout_programs')
                .delete()
                .eq('client_id', clientId)
                
            if (deleteOldError) {
                console.error(`Error eliminando programas antiguos para el cliente ${clientId}:`, deleteOldError)
                // Continuamos de todas formas, pero logueamos el error
            }

            // 2. Duplicar programa para el cliente
            const { data: newProgram, error: newProgramError } = await adminDb
                .from('workout_programs')
                .insert({
                    client_id: clientId,
                    coach_id: user.id,
                    name: template.name,
                    weeks_to_repeat: template.weeks_to_repeat,
                    start_date: dateToUse,
                    end_date: endDate,
                })
                .select('id')
                .single()

            if (newProgramError || !newProgram) throw new Error(`Error al asignar programa al cliente ${clientId}.`)

            // 3. Duplicar planes y bloques
            for (const plan of (template.workout_plans || [])) {
                const { data: newPlan, error: newPlanError } = await adminDb
                    .from('workout_plans')
                    .insert({
                        client_id: clientId,
                        coach_id: user.id,
                        program_id: newProgram.id,
                        day_of_week: plan.day_of_week,
                        title: plan.title,
                        group_name: plan.group_name,
                        assigned_date: dateToUse,
                    })
                    .select('id')
                    .single()

                if (newPlanError || !newPlan) throw new Error('Error al duplicar plan.')

                const blocksToInsert = (plan.workout_blocks || []).map((block: any) => ({
                    plan_id: newPlan.id,
                    exercise_id: block.exercise_id,
                    order_index: block.order_index,
                    sets: block.sets,
                    reps: block.reps,
                    target_weight_kg: block.target_weight_kg,
                    tempo: block.tempo,
                    rir: block.rir,
                    rest_time: block.rest_time,
                    notes: block.notes,
                }))

                if (blocksToInsert.length > 0) {
                    const { error: blocksError } = await adminDb
                        .from('workout_blocks')
                        .insert(blocksToInsert)
                    if (blocksError) throw new Error(blocksError.message)
                }
            }
            
            revalidatePath(`/coach/clients/${clientId}`)
        }

        revalidatePath('/coach/workout-programs')
        return {}
    } catch (error: any) {
        console.error('Error en assignProgramToClientsAction:', error)
        return { error: error.message }
    }
}
