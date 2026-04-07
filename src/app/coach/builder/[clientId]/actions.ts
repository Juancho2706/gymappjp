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
    superset_group: z.string().max(10).nullable().optional(),
    progression_type: z.enum(['weight', 'reps']).nullable().optional(),
    progression_value: z.coerce.number().min(0).max(1000).nullable().optional(),
})

const workoutDaySchema = z.object({
    day_of_week: z.number().int().min(1).max(7),
    title: z.string().max(100).optional(),
    week_variant: z.enum(['A', 'B']).optional().default('A'),
    blocks: z.array(blockSchema).min(1, 'Agrega al menos un ejercicio'),
})

const workoutProgramSchema = z.object({
    programId: z.string().uuid().optional(),
    clientId: z.string().uuid().nullable().optional(),
    programName: z.string().min(2, 'El nombre del programa es requerido').max(100),
    weeksToRepeat: z.coerce.number().int().min(1).max(52),
    startDate: z.string().nullable().optional(),
    duration_type: z.enum(['weeks', 'async', 'calendar_days']).optional(),
    duration_days: z.coerce.number().int().min(1).max(365).nullable().optional(),
    start_date_flexible: z.boolean().optional(),
    program_notes: z.string().max(2000).nullable().optional(),
    ab_mode: z.boolean().optional(),
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

    const { programId, clientId, programName, weeksToRepeat, startDate, duration_type, duration_days, start_date_flexible, program_notes, ab_mode, days } = parsed.data

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
                    duration_type: duration_type || 'weeks',
                    duration_days: duration_days || null,
                    start_date_flexible: start_date_flexible ?? true,
                    program_notes: program_notes || null,
                    ab_mode: ab_mode ?? false,
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
                    duration_type: duration_type || 'weeks',
                    duration_days: duration_days || null,
                    start_date_flexible: start_date_flexible ?? true,
                    program_notes: program_notes || null,
                    ab_mode: ab_mode ?? false,
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
                    title: day.title || `${programName} - Día ${day.day_of_week}`,
                    group_name: 'Programa de Entrenamiento',
                    assigned_date: startDateToUse,
                    week_variant: day.week_variant || 'A',
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
                superset_group: block.superset_group ?? null,
                progression_type: block.progression_type ?? null,
                progression_value: block.progression_value ?? null,
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
export async function duplicateWorkoutProgramAction(programId: string): Promise<{ error?: string, programId?: string }> {
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
                client:clients (full_name),
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
        const isOriginalAssigned = !!original.client_id
        const newName = isOriginalAssigned && original.client?.full_name 
            ? `Copia de ${original.client.full_name}`
            : `${original.name} (Copia)`

        const { data: newProgram, error: newProgramError } = await adminDb
            .from('workout_programs')
            .insert({
                coach_id: user.id,
                client_id: null, // Siempre como plantilla al duplicar manualmente
                name: newName,
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
        return { programId: newProgram.id }
    } catch (error: any) {
        console.error('Error en duplicateWorkoutProgramAction:', error)
        return { error: error.message }
    }
}

/**
 * Duplica una plantilla de programa y la asigna a varios clientes.
 */
export async function assignProgramToClientsAction(templateId: string, clientIds: string[], startDate?: string): Promise<{ error?: string, success?: boolean }> {
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
            // 2.a Desactivar programas anteriores del cliente sin borrar el historial.
            // Usamos is_active = false para preservar workout_logs (no CASCADE DELETE).
            const { error: deactivateError } = await adminDb
                .from('workout_programs')
                .update({ is_active: false })
                .eq('client_id', clientId)
                .eq('is_active', true)

            if (deactivateError) {
                console.error(`Error desactivando programas anteriores para el cliente ${clientId}:`, deactivateError)
                // Continuamos — no es bloqueante, el nuevo programa se crea igualmente
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
        return { success: true }
    } catch (error: any) {
        console.error('Error en assignProgramToClientsAction:', error)
        return { error: error.message }
    }
}

/**
 * Obtiene el historial de un ejercicio específico para un cliente.
 * Devuelve la sesión más reciente con peso y reps registrados.
 */
export async function getExerciseHistoryAction(clientId: string, exerciseId: string): Promise<{
    data?: { logged_at: string; weight_kg: number | null; reps_done: number | null; set_number: number }[]
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()

    // Buscar el último logged_at para este cliente + ejercicio
    const { data: lastLog, error: lastLogError } = await adminDb
        .from('workout_logs')
        .select('logged_at, weight_kg, reps_done, set_number, workout_blocks!inner(exercise_id)')
        .eq('client_id', clientId)
        .eq('workout_blocks.exercise_id', exerciseId)
        .order('logged_at', { ascending: false })
        .limit(1)
        .single()

    if (lastLogError || !lastLog) return { data: [] }

    // Traer todos los sets de esa misma sesión (mismo logged_at redondeado al minuto)
    const sessionDate = (lastLog.logged_at as string).slice(0, 16) // YYYY-MM-DDTHH:MM

    const { data: sessionSets, error: sessionError } = await adminDb
        .from('workout_logs')
        .select('logged_at, weight_kg, reps_done, set_number, workout_blocks!inner(exercise_id)')
        .eq('client_id', clientId)
        .eq('workout_blocks.exercise_id', exerciseId)
        .gte('logged_at', `${sessionDate}:00`)
        .lte('logged_at', `${sessionDate}:59`)
        .order('set_number', { ascending: true })

    if (sessionError) return { data: [] }

    return {
        data: (sessionSets || []).map((s: any) => ({
            logged_at: s.logged_at,
            weight_kg: s.weight_kg,
            reps_done: s.reps_done,
            set_number: s.set_number,
        }))
    }
}

/**
 * Devuelve lista ligera de templates del coach (client_id = null).
 */
export async function getTemplatesForBuilderAction(): Promise<{
    data?: { id: string; name: string; weeks_to_repeat: number; duration_type: string | null; plan_count: number }[]
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { data, error } = await adminDb
        .from('workout_programs')
        .select('id, name, weeks_to_repeat, duration_type, workout_plans(count)')
        .eq('coach_id', user.id)
        .is('client_id', null)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

    if (error) return { error: error.message }

    return {
        data: (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            weeks_to_repeat: p.weeks_to_repeat,
            duration_type: p.duration_type,
            plan_count: p.workout_plans?.[0]?.count ?? 0,
        }))
    }
}

/**
 * Carga un template completo (con planes y bloques) para aplicarlo al builder.
 */
export async function loadTemplateForBuilderAction(templateId: string): Promise<{
    data?: any
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { data, error } = await adminDb
        .from('workout_programs')
        .select(`
            id, name, weeks_to_repeat, duration_type, duration_days,
            start_date_flexible, program_notes,
            workout_plans (
                day_of_week, title,
                workout_blocks (
                    exercise_id, sets, reps, target_weight_kg,
                    tempo, rir, rest_time, notes, order_index, superset_group,
                    exercises ( name, muscle_group, gif_url, video_url )
                )
            )
        `)
        .eq('id', templateId)
        .eq('coach_id', user.id)
        .single()

    if (error || !data) return { error: 'Plantilla no encontrada.' }
    return { data }
}

/**
 * Devuelve los clientes del coach para asignación masiva.
 */
export async function getCoachClientsAction(): Promise<{
    data?: { id: string; full_name: string | null; avatar_url: string | null }[]
    error?: string
}> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { data, error } = await adminDb
        .from('clients')
        .select('id, full_name, avatar_url')
        .eq('coach_id', user.id)
        .order('full_name', { ascending: true })

    if (error) return { error: error.message }
    return { data: data || [] }
}
