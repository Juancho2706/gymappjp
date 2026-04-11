'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { LIBRARY_PROGRAM_LIST_SELECT } from '@/lib/supabase/queries/workout-programs-library'
import type { ProgramListModel } from '../../workout-programs/libraryStats'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildProgramAssignedEmail } from '@/lib/email/transactional-templates'

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
    section: z.enum(['warmup', 'main', 'cooldown']).optional(),
    is_override: z.boolean().optional(),
})

const programPhaseSchema = z.object({
    name: z.string().min(1).max(80),
    weeks: z.coerce.number().int().min(1).max(52),
    color: z.string().max(32).optional(),
})

const workoutDaySchema = z.object({
    day_of_week: z.number().int().min(1).max(28),
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
    program_structure_type: z.enum(['weekly', 'cycle']).optional(),
    cycle_length: z.coerce.number().int().min(1).max(28).optional(),
    start_date_flexible: z.boolean().optional(),
    program_notes: z.string().max(2000).nullable().optional(),
    ab_mode: z.boolean().optional(),
    program_phases: z.array(programPhaseSchema).max(24).optional(),
    source_template_id: z.string().uuid().nullable().optional(),
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

export type AssignProgramResult = {
    success?: boolean
    error?: string
    assignedCount?: number
    failedClients?: { clientId: string; reason: string }[]
}

export type AssignProgramOptions = {
    startDate?: string
    durationWeeks?: number
    selectedDays?: number[]
}

// --- ACTIONS ---

async function deactivateActiveProgramsForClient(adminDb: any, clientId: string) {
    return adminDb
        .from('workout_programs')
        .update({ is_active: false })
        .eq('client_id', clientId)
        .eq('is_active', true)
}

/**
 * Guarda o actualiza un programa de entrenamiento completo, incluyendo sus planes y bloques.
 */
export async function saveWorkoutProgramAction(payload: WorkoutProgramInput): Promise<ProgramState> {
    const parsed = workoutProgramSchema.safeParse(payload)

    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const {
        programId, clientId, programName, weeksToRepeat, startDate, duration_type, duration_days,
        program_structure_type, cycle_length, start_date_flexible, program_notes, ab_mode,
        program_phases, source_template_id, days,
    } = parsed.data

    const phasesForDb = (program_phases ?? []).map(p => ({
        name: p.name,
        weeks: p.weeks,
        color: (p.color && p.color.trim()) || '#6366F1',
    }))
    const sourceTplId = clientId ? (source_template_id ?? null) : null

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
                    program_structure_type: program_structure_type || 'weekly',
                    cycle_length: program_structure_type === 'cycle' ? (cycle_length || null) : null,
                    start_date_flexible: start_date_flexible ?? true,
                    program_notes: program_notes || null,
                    ab_mode: ab_mode ?? false,
                    program_phases: phasesForDb,
                    source_template_id: sourceTplId,
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
            if (clientId) {
                const { error: deactivateError } = await deactivateActiveProgramsForClient(adminDb, clientId)
                if (deactivateError) {
                    throw new Error('No se pudo desactivar el programa activo actual del alumno.')
                }
            }

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
                    program_structure_type: program_structure_type || 'weekly',
                    cycle_length: program_structure_type === 'cycle' ? (cycle_length || null) : null,
                    start_date_flexible: start_date_flexible ?? true,
                    program_notes: program_notes || null,
                    ab_mode: ab_mode ?? false,
                    program_phases: phasesForDb,
                    source_template_id: sourceTplId,
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
                section: block.section && ['warmup', 'main', 'cooldown'].includes(block.section) ? block.section : 'main',
                is_override: block.is_override ?? false,
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
export async function duplicateWorkoutProgramAction(programId: string): Promise<{
    error?: string
    programId?: string
    program?: ProgramListModel
}> {
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
                duration_type: (original as any).duration_type || 'weeks',
                duration_days: (original as any).duration_days ?? null,
                program_structure_type: (original as any).program_structure_type || 'weekly',
                cycle_length: (original as any).cycle_length ?? null,
                start_date_flexible: (original as any).start_date_flexible ?? true,
                program_notes: (original as any).program_notes ?? null,
                ab_mode: (original as any).ab_mode ?? false,
                program_phases: (original as any).program_phases ?? [],
                source_template_id: null,
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
                    week_variant: (plan as any).week_variant || 'A',
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
                superset_group: block.superset_group ?? null,
                progression_type: block.progression_type ?? null,
                progression_value: block.progression_value ?? null,
                section: block.section && ['warmup', 'main', 'cooldown'].includes(block.section) ? block.section : 'main',
                is_override: false,
            }))

            if (blocksToInsert.length > 0) {
                const { error: blocksError } = await adminDb
                    .from('workout_blocks')
                    .insert(blocksToInsert)
                if (blocksError) throw new Error(blocksError.message)
            }
        }

        revalidatePath('/coach/workout-programs')

        const { data: libraryRow, error: librarySelectError } = await adminDb
            .from('workout_programs')
            .select(LIBRARY_PROGRAM_LIST_SELECT)
            .eq('id', newProgram.id)
            .single()

        if (librarySelectError) {
            console.warn('duplicateWorkoutProgramAction: list snapshot select failed', librarySelectError)
            return { programId: newProgram.id }
        }

        return { programId: newProgram.id, program: libraryRow as unknown as ProgramListModel }
    } catch (error: any) {
        console.error('Error en duplicateWorkoutProgramAction:', error)
        return { error: error.message }
    }
}

/**
 * Duplica una plantilla de programa y la asigna a varios clientes.
 */
export async function assignProgramToClientsAction(
    templateId: string,
    clientIds: string[],
    options?: string | AssignProgramOptions
): Promise<AssignProgramResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    if (!clientIds.length) return { error: 'Selecciona al menos un alumno.' }

    const adminDb = await createRawAdminClient()

    const normalizedOptions: AssignProgramOptions = typeof options === 'string'
        ? { startDate: options }
        : (options || {})

    const dateToUse = normalizedOptions.startDate || new Date().toISOString().split('T')[0]

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

        const { data: ownedClients, error: ownedClientsError } = await adminDb
            .from('clients')
            .select('id, full_name, email')
            .eq('coach_id', user.id)
            .in('id', clientIds)

        if (ownedClientsError) throw new Error('No se pudo validar los alumnos seleccionados.')

        const ownedClientMap = new Map((ownedClients || []).map((c) => [c.id, c]))
        const ownedClientIdSet = new Set((ownedClients || []).map((c) => c.id))
        const failedClients: { clientId: string; reason: string }[] = []
        const validClientIds = clientIds.filter(id => {
            const allowed = ownedClientIdSet.has(id)
            if (!allowed) {
                failedClients.push({ clientId: id, reason: 'El alumno no pertenece a este coach.' })
            }
            return allowed
        })

        if (!validClientIds.length) {
            return { error: 'Ningún alumno seleccionado es válido para este coach.' }
        }

        const selectedDaysSet = new Set((normalizedOptions.selectedDays || []).filter(d => d >= 1 && d <= 28))
        const templatePlans = (template.workout_plans || []).filter((plan: any) => {
            if (!selectedDaysSet.size) return true
            return selectedDaysSet.has(plan.day_of_week)
        })

        const weeksToRepeat = Math.max(1, Math.min(52, normalizedOptions.durationWeeks || template.weeks_to_repeat))
        const start = new Date(dateToUse)
        const end = new Date(start)
        end.setDate(start.getDate() + (weeksToRepeat * 7) - 1)
        const endDate = end.toISOString().split('T')[0]

        let assignedCount = 0
        const coachBrand = await adminDb
            .from('coaches')
            .select('brand_name, slug')
            .eq('id', user.id)
            .maybeSingle()
        const brandName = coachBrand.data?.brand_name || 'Tu Coach'
        const coachSlug = coachBrand.data?.slug || 'coach'
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL

        // Iterar por cada cliente
        for (const clientId of validClientIds) {
            try {
                // 2.a Desactivar programas anteriores del cliente sin borrar historial.
                const { error: deactivateError } = await deactivateActiveProgramsForClient(adminDb, clientId)
                if (deactivateError) throw new Error('No se pudo desactivar el plan activo previo.')

                // 2.b Duplicar programa para el cliente
                const { data: newProgram, error: newProgramError } = await adminDb
                    .from('workout_programs')
                    .insert({
                        client_id: clientId,
                        coach_id: user.id,
                        name: template.name,
                        weeks_to_repeat: weeksToRepeat,
                        start_date: dateToUse,
                        end_date: endDate,
                        duration_type: (template as any).duration_type || 'weeks',
                        duration_days: (template as any).duration_days ?? null,
                        program_structure_type: (template as any).program_structure_type || 'weekly',
                        cycle_length: (template as any).cycle_length ?? null,
                        start_date_flexible: (template as any).start_date_flexible ?? true,
                        program_notes: (template as any).program_notes ?? null,
                        ab_mode: (template as any).ab_mode ?? false,
                        program_phases: (template as any).program_phases ?? [],
                        source_template_id: templateId,
                    })
                    .select('id')
                    .single()

                if (newProgramError || !newProgram) throw new Error('No se pudo crear el nuevo programa.')

                // 3. Duplicar planes y bloques
                for (const plan of templatePlans) {
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
                            week_variant: (plan as any).week_variant || 'A',
                        })
                        .select('id')
                        .single()

                    if (newPlanError || !newPlan) throw new Error('No se pudo duplicar un día del programa.')

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
                        superset_group: block.superset_group ?? null,
                        progression_type: block.progression_type ?? null,
                        progression_value: block.progression_value ?? null,
                        section: block.section && ['warmup', 'main', 'cooldown'].includes(block.section) ? block.section : 'main',
                        is_override: false,
                    }))

                    if (blocksToInsert.length > 0) {
                        const { error: blocksError } = await adminDb
                            .from('workout_blocks')
                            .insert(blocksToInsert)
                        if (blocksError) throw new Error(blocksError.message)
                    }
                }

                assignedCount += 1

                const clientInfo = ownedClientMap.get(clientId)
                if (clientInfo?.email) {
                    const dashboardUrl = appUrl
                        ? `${appUrl}/c/${coachSlug}/dashboard`
                        : `https://app.tu-dominio.com/c/${coachSlug}/dashboard`
                    const assignedEmail = buildProgramAssignedEmail({
                        brandName,
                        clientName: clientInfo.full_name,
                        programName: template.name,
                        startDate: dateToUse,
                        dashboardUrl,
                    })
                    const emailResult = await sendTransactionalEmail({
                        to: clientInfo.email,
                        subject: assignedEmail.subject,
                        html: assignedEmail.html,
                    })
                    if (!emailResult.ok) {
                        console.error(`Program assigned email error for ${clientId}:`, emailResult.error)
                    }
                }
                revalidatePath(`/coach/clients/${clientId}`)
            } catch (clientError: any) {
                failedClients.push({
                    clientId,
                    reason: clientError?.message || 'Error inesperado durante la asignación.',
                })
            }
        }

        revalidatePath('/coach/workout-programs')
        if (assignedCount === 0) {
            return {
                error: 'No se pudo asignar el programa a ningún alumno.',
                failedClients,
            }
        }
        return {
            success: true,
            assignedCount,
            failedClients,
        }
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
            start_date_flexible, program_notes, program_phases,
            workout_plans (
                day_of_week, title, week_variant,
                workout_blocks (
                    exercise_id, sets, reps, target_weight_kg,
                    tempo, rir, rest_time, notes, order_index, superset_group,
                    progression_type, progression_value, section, is_override,
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

function sortWorkoutPlans(plans: any[]): any[] {
    return [...(plans || [])].sort((a, b) => {
        const da = a.day_of_week ?? 0
        const db = b.day_of_week ?? 0
        if (da !== db) return da - db
        return String(a.week_variant || 'A').localeCompare(String(b.week_variant || 'A'))
    })
}

function mergeBlocksForSync(clientBlocks: any[] | null | undefined, templateBlocks: any[] | null | undefined): any[] {
    const C = [...(clientBlocks || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    const T = [...(templateBlocks || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    const maxL = Math.max(C.length, T.length)
    const out: any[] = []
    for (let j = 0; j < maxL; j++) {
        const c = C[j]
        const t = T[j]
        if (c?.is_override) out.push(c)
        else if (t) out.push({ ...t, is_override: false })
        else if (c) out.push(c)
    }
    return out
}

function mapDbBlockToWorkoutInput(b: any): WorkoutBlockInput {
    const progType = b.progression_type === 'reps' || b.progression_type === 'weight' ? b.progression_type : null
    return {
        exercise_id: b.exercise_id,
        sets: b.sets,
        reps: b.reps,
        target_weight_kg: b.target_weight_kg ?? null,
        tempo: b.tempo ?? null,
        rir: b.rir ?? null,
        rest_time: b.rest_time ?? null,
        notes: b.notes ?? null,
        superset_group: b.superset_group ?? null,
        progression_type: progType,
        progression_value: b.progression_value ?? null,
        section: b.section && ['warmup', 'main', 'cooldown'].includes(b.section) ? b.section : 'main',
        is_override: !!b.is_override,
    }
}

/**
 * Actualiza bloques no marcados como override desde la plantilla vinculada (source_template_id).
 */
export async function syncProgramFromTemplateAction(programId: string): Promise<ProgramState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { data: program, error: pErr } = await adminDb
        .from('workout_programs')
        .select('*, workout_plans ( *, workout_blocks ( * ) )')
        .eq('id', programId)
        .eq('coach_id', user.id)
        .single()

    if (pErr || !program) return { error: 'Programa no encontrado.' }
    if (!program.client_id) return { error: 'Solo programas de cliente pueden sincronizarse con una plantilla.' }

    const templateId = program.source_template_id
    if (!templateId) return { error: 'Este programa no tiene plantilla base vinculada.' }

    const { data: template, error: tErr } = await adminDb
        .from('workout_programs')
        .select('*, workout_plans ( *, workout_blocks ( * ) )')
        .eq('id', templateId)
        .eq('coach_id', user.id)
        .is('client_id', null)
        .maybeSingle()

    if (tErr || !template) return { error: 'La plantilla base no existe o ya no está disponible.' }

    const mergedDays: WorkoutDayInput[] = []
    for (const cp of sortWorkoutPlans(program.workout_plans || [])) {
        const tp = (template.workout_plans || []).find(
            (p: any) => p.day_of_week === cp.day_of_week && String(p.week_variant || 'A') === String(cp.week_variant || 'A')
        )
        const raw = mergeBlocksForSync(cp.workout_blocks, tp?.workout_blocks)
        const blocks = raw.map(mapDbBlockToWorkoutInput)
        if (blocks.length === 0) continue
        mergedDays.push({
            day_of_week: cp.day_of_week as number,
            title: (cp.title as string) || '',
            week_variant: (cp.week_variant || 'A') as 'A' | 'B',
            blocks,
        })
    }

    if (mergedDays.length === 0) return { error: 'No hay días con ejercicios para sincronizar.' }

    let phasesSafe: { name: string; weeks: number; color?: string }[] = []
    try {
        const raw = program.program_phases
        const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : []
        phasesSafe = (arr as any[]).map((p: any) => ({
            name: String(p?.name || 'Fase').slice(0, 80),
            weeks: Math.min(52, Math.max(1, Number(p?.weeks) || 1)),
            color: typeof p?.color === 'string' ? p.color.slice(0, 32) : '#6366F1',
        }))
    } catch {
        phasesSafe = []
    }

    return saveWorkoutProgramAction({
        programId: program.id,
        clientId: program.client_id,
        programName: program.name,
        weeksToRepeat: program.weeks_to_repeat,
        startDate: program.start_date ? String(program.start_date).split('T')[0] : null,
        duration_type: (program.duration_type as 'weeks' | 'async' | 'calendar_days') || 'weeks',
        duration_days: program.duration_days,
        program_structure_type: (program.program_structure_type as 'weekly' | 'cycle') || 'weekly',
        cycle_length: program.cycle_length ?? undefined,
        start_date_flexible: program.start_date_flexible ?? true,
        program_notes: program.program_notes,
        ab_mode: program.ab_mode ?? false,
        program_phases: phasesSafe,
        source_template_id: templateId,
        days: mergedDays,
    })
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
        .select('id, full_name')
        .eq('coach_id', user.id)
        .order('full_name', { ascending: true })

    if (error) return { error: error.message }
    return {
        data: (data || []).map((client) => ({
            id: client.id,
            full_name: client.full_name,
            avatar_url: null,
        })),
    }
}
