import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Json } from '@/lib/database.types'
import { WorkoutProgramSchema, type WorkoutBlockInput, type WorkoutDayInput, type WorkoutProgramInput } from '@eva/schemas'
import { LIBRARY_PROGRAM_LIST_SELECT } from '@/lib/supabase/queries/workout-programs-library'
import type { ProgramListModel } from '@/app/coach/workout-programs/libraryStats'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildProgramAssignedEmail } from '@/lib/email/transactional-templates'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { currentUserHasTeamAccessToClient } from '@/services/auth/team.service'

// Re-export types for backward compatibility
export type { WorkoutBlockInput, WorkoutDayInput, WorkoutProgramInput } from '@eva/schemas'

export type ProgramState = {
    error?: string
    programId?: string
    /** E (awareness): el programa cambió en el server desde que el coach lo abrió. No se guardó nada. */
    conflict?: { editedBy: string | null; at: string }
}

/** E (awareness): chequeo optimista no destructivo — el caller decide recargar o forzar. */
export type SaveProgramOptions = {
    /** updated_at que el builder tenía al cargar; si difiere del actual ⇒ conflict (salvo force). */
    expectedUpdatedAt?: string | null
    force?: boolean
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
    /** Si se define, sustituye el flag de la plantilla al crear el programa del alumno. */
    startDateFlexible?: boolean
}

// --- ACTIONS ---

type CoachWorkoutScope =
    | { ok: true; orgId: string | null; activeTeamId: string | null }
    | { ok: false; error: string }

async function getCoachWorkoutScope(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<CoachWorkoutScope> {
    const workspace = await resolvePreferredWorkspace(supabase, userId)
    if (!workspace || workspace.type === 'coach_standalone') return { ok: true, orgId: null, activeTeamId: null }
    if (workspace.type === 'coach_team') return { ok: true, orgId: null, activeTeamId: workspace.teamId }
    if (workspace.type === 'enterprise_coach') return { ok: true, orgId: workspace.orgId, activeTeamId: null }
    return { ok: false, error: 'Workspace invalido para gestionar entrenamientos.' }
}

function applyOrgScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
    query: T,
    orgId: string | null
): T {
    return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
}

// Areas (workout_section_templates) — expand-contract: cada bloque persiste section legacy + section_template_id.
// Mapea la seccion legacy al area system; preserva un section_template_id explicito si ya viene del payload/origen.
const LEGACY_SECTION_TEMPLATE_ID: Record<'warmup' | 'main' | 'cooldown', string> = {
    warmup: '0000a5ec-0000-0000-0000-000000000001',
    main: '0000a5ec-0000-0000-0000-000000000010',
    cooldown: '0000a5ec-0000-0000-0000-000000000020',
}
function sectionTemplateIdFor(section: string | null | undefined, existing?: string | null): string {
    if (existing) return existing
    const s = section === 'warmup' || section === 'cooldown' ? section : 'main'
    return LEGACY_SECTION_TEMPLATE_ID[s]
}

/**
 * Hardening F4: el payload del builder es client-controlled y workout_blocks no valida la
 * tenencia del FK section_template_id (ninguna policy mira el target del FK).
 * Coerce: un section_template_id que NO este entre las areas visibles del usuario (RLS-scoped
 * via su propio client) se descarta → cae al mapeo legacy por section. Evita persistir
 * referencias a areas de otro coach/team (stale o forjadas).
 */
async function resolveAllowedAreaIds(
    db: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
    const { data } = await db
        .from('workout_section_templates')
        .select('id')
        .is('deleted_at', null)
    return new Set((data ?? []).map(r => r.id))
}

function scopedSectionTemplateIdFor(
    section: string | null | undefined,
    explicit: string | null | undefined,
    allowedIds: Set<string>,
): string {
    const safe = explicit && allowedIds.has(explicit) ? explicit : null
    return sectionTemplateIdFor(section, safe)
}

/**
 * Columnas polimórficas de workout_blocks (specs/movida-entrenamiento, M2).
 * Acepta tanto el payload Zod del builder como filas crudas de DB (duplicate/assign/sync):
 * los nombres de campo coinciden 1:1. Bloques legacy ⇒ todo null (byte-identical, AC3).
 */
function polymorphicBlockColumns(block: Record<string, unknown>) {
    return {
        is_unilateral: (block.is_unilateral ?? null) as boolean | null,
        side_mode: (block.side_mode ?? null) as string | null,
        reps_value: (block.reps_value ?? null) as number | null,
        reps_unit: (block.reps_unit ?? null) as string | null,
        load_type: (block.load_type ?? null) as string | null,
        load_value: (block.load_value ?? null) as number | null,
        load_unit: (block.load_unit ?? null) as string | null,
        distance_value: (block.distance_value ?? null) as number | null,
        distance_unit: (block.distance_unit ?? null) as string | null,
        duration_sec: (block.duration_sec ?? null) as number | null,
        target_pace_sec_per_km: (block.target_pace_sec_per_km ?? null) as number | null,
        hr_zone: (block.hr_zone ?? null) as number | null,
        instructions: (block.instructions ?? null) as string | null,
        exercise_type_override: (block.exercise_type_override ?? null) as string | null,
        interval_config: (block.interval_config ?? null) as Json,
        extra_targets: (block.extra_targets ?? null) as Json,
    }
}

/**
 * Resuelve si el coach puede gestionar (full-access) un cliente SEGÚN EL WORKSPACE ACTIVO
 * (separación estricta de contextos): team activo ⇒ SOLO alumnos de ESE pool (colaborativo,
 * sin filtro coach_id; RLS techo); enterprise ⇒ coach_id+org; standalone ⇒ propios NO-pool.
 * Mutar un alumno de pool exige estar EN el contexto de ese team (no cualquier membresía).
 * Devuelve viaTeam para que el caller distinga el origen del acceso. Todas las mutaciones de
 * este servicio usan el cliente user-scoped: RLS aplica siempre (defensa en profundidad).
 */
async function resolveCoachClientAccess(
    db: Awaited<ReturnType<typeof createClient>>,
    coachId: string,
    clientId: string,
    orgId: string | null,
    activeTeamId: string | null = null
): Promise<{ ok: boolean; viaTeam: boolean }> {
    if (activeTeamId) {
        const { data: poolClient } = await db
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .eq('team_id', activeTeamId)
            .is('org_id', null)
            .maybeSingle()
        if (poolClient && (await currentUserHasTeamAccessToClient(db, clientId))) {
            return { ok: true, viaTeam: true }
        }
        return { ok: false, viaTeam: false }
    }

    let clientQuery = db
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachId)
    clientQuery = applyOrgScope(clientQuery, orgId)
    if (!orgId) clientQuery = clientQuery.is('team_id', null)
    const { data: client, error } = await clientQuery.maybeSingle()
    if (error || !client) return { ok: false, viaTeam: false }
    return { ok: true, viaTeam: false }
}

async function assertCoachCanManageWorkoutClient(
    db: Awaited<ReturnType<typeof createClient>>,
    coachId: string,
    clientId: string,
    orgId: string | null,
    activeTeamId: string | null = null
) {
    const { ok } = await resolveCoachClientAccess(db, coachId, clientId, orgId, activeTeamId)
    if (!ok) throw new Error('Alumno no encontrado.')
}

async function deactivateActiveProgramsForClient(
    db: Awaited<ReturnType<typeof createClient>>,
    clientId: string,
    orgId: string | null
) {
    let query = db
        .from('workout_programs')
        .update({ is_active: false })
        .eq('client_id', clientId)
        .eq('is_active', true)
    query = applyOrgScope(query, orgId)
    return query
}

/**
 * Guarda o actualiza un programa de entrenamiento completo, incluyendo sus planes y bloques.
 */
export async function saveWorkoutProgramAction(payload: WorkoutProgramInput, saveOptions?: SaveProgramOptions): Promise<ProgramState> {
    const parsed = WorkoutProgramSchema.safeParse(payload)

    if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? 'Datos inválidos'
        const friendly =
            /NaN|Invalid input/i.test(msg)
                ? 'Hay un valor numérico inválido (revisa peso objetivo en kg, progresión automática y series).'
                : msg
        return { error: friendly }
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
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    // Areas visibles para ESTE usuario (RLS via su client) — coerce de ids ajenos en el payload
    const allowedAreaIds = await resolveAllowedAreaIds(supabase)

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

    // Verificar que el coach pueda gestionar el alumno (propio o del pool del team)
    if (clientId) {
        const access = await resolveCoachClientAccess(supabase, user.id, clientId, scope.orgId, scope.activeTeamId)
        if (!access.ok) return { error: 'Alumno no encontrado.' }
    }

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
            // Obtener estado actual del programa para validaciones.
            // Programas de cliente: acotar por client_id (un miembro del pool puede editar
            // el programa de un alumno del pool, no solo el creador). Plantillas: por coach.
                let currentProgramQuery = supabase
                    .from('workout_programs')
                    .select('name, client_id')
                    .eq('id', finalProgramId)
                currentProgramQuery = clientId
                    ? currentProgramQuery.eq('client_id', clientId)
                    : currentProgramQuery.eq('coach_id', user.id)
                currentProgramQuery = applyOrgScope(currentProgramQuery, scope.orgId)
                const { data: currentProgram } = await currentProgramQuery.maybeSingle()

            // No continuar (ni borrar planes) sobre un programa que no podemos gestionar.
            if (!currentProgram) {
                return { error: 'Programa no encontrado.' }
            }

            if (currentProgram) {
                // 1. Validar que no se cambie el nombre si ya está asignado
                if (currentProgram.client_id && currentProgram.name !== programName) {
                    return { error: 'No se puede cambiar el nombre de un programa ya asignado a un alumno.' }
                }

                // 2. Validar unicidad de nombre si es una plantilla (ahora o antes)
                if (!clientId) {
                    let existingNameQuery = supabase
                        .from('workout_programs')
                        .select('id')
                        .eq('coach_id', user.id)
                        .eq('name', programName)
                        .is('client_id', null)
                        .neq('id', finalProgramId)
                    existingNameQuery = applyOrgScope(existingNameQuery, scope.orgId)
                    const { data: existingName } = await existingNameQuery.maybeSingle()

                    if (existingName) {
                        return { error: `Ya tienes una plantilla guardada con el nombre "${programName}".` }
                    }
                }
            }

            // E (awareness): conflicto no destructivo — si otro coach (pool) guardó desde que
            // este builder cargó, NO pisar su trabajo: devolver conflict y que el coach decida.
            if (saveOptions?.expectedUpdatedAt && !saveOptions.force) {
                const { data: currentRow } = await supabase
                    .from('workout_programs')
                    .select('updated_at, last_edited_by_coach_id')
                    .eq('id', finalProgramId)
                    .maybeSingle()
                if (currentRow && currentRow.updated_at !== saveOptions.expectedUpdatedAt) {
                    let editedBy: string | null = null
                    if (currentRow.last_edited_by_coach_id && currentRow.last_edited_by_coach_id !== user.id) {
                        const { data: editor } = await supabase
                            .from('coaches')
                            .select('full_name, brand_name')
                            .eq('id', currentRow.last_edited_by_coach_id)
                            .maybeSingle()
                        editedBy = editor?.full_name || editor?.brand_name || null
                    }
                    return { conflict: { editedBy, at: currentRow.updated_at } }
                }
            }

            // Actualizar programa existente
            let updateProgramQuery = supabase
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
                    last_edited_by_coach_id: user.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', finalProgramId)
            updateProgramQuery = clientId
                ? updateProgramQuery.eq('client_id', clientId)
                : updateProgramQuery.eq('coach_id', user.id)
            updateProgramQuery = applyOrgScope(updateProgramQuery, scope.orgId)
            const { error: updateError } = await updateProgramQuery

            if (updateError) throw new Error('Error al actualizar el programa.')

            // Borrar planes antiguos asociados al programa (CASCADE borrará los bloques)
            const { error: deleteError } = await supabase
                .from('workout_plans')
                .delete()
                .eq('program_id', finalProgramId)

            if (deleteError) throw new Error('Error al limpiar planes antiguos.')
        } else {
            if (clientId) {
                const { error: deactivateError } = await deactivateActiveProgramsForClient(supabase, clientId, scope.orgId)
                if (deactivateError) {
                    throw new Error('No se pudo desactivar el programa activo actual del alumno.')
                }
            }

            // Validar unicidad de nombre si es una nueva plantilla
            if (!clientId) {
                let existingNameQuery = supabase
                    .from('workout_programs')
                    .select('id')
                    .eq('coach_id', user.id)
                    .eq('name', programName)
                    .is('client_id', null)
                existingNameQuery = applyOrgScope(existingNameQuery, scope.orgId)
                const { data: existingName } = await existingNameQuery.maybeSingle()

                if (existingName) {
                    return { error: `Ya tienes una plantilla guardada con el nombre "${programName}".` }
                }
            }

            // Insertar nuevo programa
            const { data: program, error: programError } = await supabase
                .from('workout_programs')
                .insert({
                    client_id: clientId || null,
                    coach_id: user.id,
                    org_id: scope.orgId,
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
                    last_edited_by_coach_id: user.id,
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
            const { data: plan, error: planError } = await supabase
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
                section_template_id: scopedSectionTemplateIdFor(block.section, (block as { section_template_id?: string | null }).section_template_id, allowedAreaIds),
                is_override: block.is_override ?? false,
                ...polymorphicBlockColumns(block as Record<string, unknown>),
            }))

            const { error: blocksError } = await supabase
                .from('workout_blocks')
                .insert(blocksToInsert)

            if (blocksError) throw new Error(blocksError.message)
        }

        if (clientId) {
            revalidatePath(`/coach/clients/${clientId}`)
        }
        revalidatePath('/coach/workout-programs')
        revalidatePath('/c', 'layout')
        
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
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    // Validar gestion del alumno (propio o del pool) antes de borrar su programa.
    if (clientId) {
        const access = await resolveCoachClientAccess(supabase, user.id, clientId, scope.orgId, scope.activeTeamId)
        if (!access.ok) return { error: 'Alumno no encontrado.' }
    }

    let deleteQuery = supabase
        .from('workout_programs')
        .delete()
        .eq('id', programId)
    deleteQuery = clientId
        ? deleteQuery.eq('client_id', clientId)
        : deleteQuery.eq('coach_id', user.id)
    deleteQuery = applyOrgScope(deleteQuery, scope.orgId)
    const { error } = await deleteQuery

    if (error) return { error: error.message }

    if (clientId) {
        revalidatePath(`/coach/clients/${clientId}`)
    }
    revalidatePath('/coach/workout-programs')
    revalidatePath('/c', 'layout')
    return {}
}

/**
 * Elimina un plan individual (si no pertenece a un programa o para limpieza manual).
 */
export async function deletePlanAction(planId: string, clientId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    // Validar gestion del alumno (propio o del pool) antes de borrar su plan.
    if (clientId) {
        const access = await resolveCoachClientAccess(supabase, user.id, clientId, scope.orgId, scope.activeTeamId)
        if (!access.ok) return { error: 'Alumno no encontrado.' }
    }

    let planLookup = supabase
        .from('workout_plans')
        .select('id, program_id, workout_programs(org_id)')
        .eq('id', planId)
    planLookup = clientId ? planLookup.eq('client_id', clientId) : planLookup.eq('coach_id', user.id)
    const { data: plan } = await planLookup.maybeSingle()

    const planProgram = plan?.workout_programs as { org_id?: string | null } | null
    if (!plan || (planProgram?.org_id ?? null) !== scope.orgId) {
        return { error: 'Plan no encontrado.' }
    }

    let planDelete = supabase
        .from('workout_plans')
        .delete()
        .eq('id', planId)
    planDelete = clientId ? planDelete.eq('client_id', clientId) : planDelete.eq('coach_id', user.id)
    const { error } = await planDelete

    if (error) return { error: error.message }

    if (clientId) {
        revalidatePath(`/coach/clients/${clientId}`)
    }
    revalidatePath('/coach/workout-programs')
    return {}
}

const duplicateProgramNameSchema = z
    .string()
    .trim()
    .min(2, 'El nombre del programa es requerido')
    .max(100)

/**
 * Duplica un programa de entrenamiento existente (sea plantilla o asignado).
 * El nuevo programa será una plantilla (sin client_id) por defecto.
 */
export async function duplicateWorkoutProgramAction(
    programId: string,
    newName: string,
): Promise<{
    error?: string
    programId?: string
    program?: ProgramListModel
}> {
    const nameParsed = duplicateProgramNameSchema.safeParse(newName)
    if (!nameParsed.success) {
        return { error: nameParsed.error.issues[0]?.message ?? 'Nombre no válido.' }
    }
    const finalName = nameParsed.data

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    // Coercion de areas (misma regla que el save): ids fuera de las areas visibles del coach
    // (p.ej. de un team que abandono) caen al mapeo legacy al copiar.
    const allowedAreaIds = await resolveAllowedAreaIds(supabase)

    try {
        // 1. Obtener el programa original
        let originalQuery = supabase
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
        originalQuery = applyOrgScope(originalQuery, scope.orgId)
        const { data: original, error: originalError } = await originalQuery.single()

        if (originalError || !original) throw new Error('Programa no encontrado.')

        let existingNameQuery = supabase
            .from('workout_programs')
            .select('id')
            .eq('coach_id', user.id)
            .eq('name', finalName)
            .is('client_id', null)
        existingNameQuery = applyOrgScope(existingNameQuery, scope.orgId)
        const { data: existingName } = await existingNameQuery.maybeSingle()

        if (existingName) {
            return { error: `Ya tienes una plantilla guardada con el nombre "${finalName}".` }
        }

        // 2. Insertar nuevo programa como plantilla
        const { data: newProgram, error: newProgramError } = await supabase
            .from('workout_programs')
            .insert({
                coach_id: user.id,
                client_id: null, // Siempre como plantilla al duplicar manualmente
                org_id: scope.orgId,
                name: finalName,
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
                last_edited_by_coach_id: user.id,
            })
            .select('id')
            .single()

        if (newProgramError || !newProgram) throw new Error('Error al crear copia del programa.')

        // 3. Duplicar planes y bloques
        for (const plan of (original.workout_plans || [])) {
            const { data: newPlan, error: newPlanError } = await supabase
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
                section_template_id: scopedSectionTemplateIdFor(block.section, (block as { section_template_id?: string | null }).section_template_id, allowedAreaIds),
                is_override: false,
                ...polymorphicBlockColumns(block as Record<string, unknown>),
            }))

            if (blocksToInsert.length > 0) {
                const { error: blocksError } = await supabase
                    .from('workout_blocks')
                    .insert(blocksToInsert)
                if (blocksError) throw new Error(blocksError.message)
            }
        }

        revalidatePath('/coach/workout-programs')

        const { data: libraryRow, error: librarySelectError } = await supabase
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
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    if (!clientIds.length) return { error: 'Selecciona al menos un alumno.' }

    // Coercion de areas (misma regla que el save) al copiar plantilla -> alumnos.
    const allowedAreaIds = await resolveAllowedAreaIds(supabase)

    const normalizedOptions: AssignProgramOptions = typeof options === 'string'
        ? { startDate: options }
        : (options || {})

    const dateToUse = normalizedOptions.startDate || new Date().toISOString().split('T')[0]

    try {
        // 1. Obtener plantilla
        let templateQuery = supabase
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
            .is('client_id', null)
        templateQuery = applyOrgScope(templateQuery, scope.orgId)
        const { data: template, error: templateError } = await templateQuery.single()

        if (templateError || !template) throw new Error('Plantilla no encontrada.')

        // Destinos válidos según el workspace ACTIVO (3-vías, sin cruce de contextos):
        // team = alumnos de ESE pool; enterprise = propios de la org; standalone = propios NO-pool.
        let ownedClientsQuery = supabase
            .from('clients')
            .select('id, full_name, email')
            .in('id', clientIds)
        if (scope.activeTeamId) {
            ownedClientsQuery = ownedClientsQuery.eq('team_id', scope.activeTeamId).is('org_id', null)
        } else {
            ownedClientsQuery = ownedClientsQuery.eq('coach_id', user.id)
            ownedClientsQuery = applyOrgScope(ownedClientsQuery, scope.orgId)
            if (!scope.orgId) ownedClientsQuery = ownedClientsQuery.is('team_id', null)
        }
        const { data: ownedClients, error: ownedClientsError } = await ownedClientsQuery

        if (ownedClientsError) throw new Error('No se pudo validar los alumnos seleccionados.')

        const accessibleClientMap = new Map((ownedClients || []).map((c) => [c.id, c]))
        const ownedClientMap = accessibleClientMap
        const ownedClientIdSet = new Set(accessibleClientMap.keys())
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
        const allTemplatePlans = (template.workout_plans || []) as any[]
        const templatePlans = allTemplatePlans.filter((plan: any) => {
            if (!selectedDaysSet.size) return true
            return selectedDaysSet.has(plan.day_of_week)
        })

        if (!allTemplatePlans.length) {
            return { error: 'Esta plantilla no tiene días de entrenamiento para copiar.' }
        }
        if (!templatePlans.length) {
            return {
                error: 'Los días seleccionados no coinciden con ningún día de esta plantilla. Quita la selección de días o elige otros.',
            }
        }

        const startDateFlexible =
            typeof normalizedOptions.startDateFlexible === 'boolean'
                ? normalizedOptions.startDateFlexible
                : ((template as { start_date_flexible?: boolean | null }).start_date_flexible ?? true)

        const weeksToRepeat = Math.max(1, Math.min(52, normalizedOptions.durationWeeks || template.weeks_to_repeat))
        const start = new Date(dateToUse)
        const end = new Date(start)
        end.setDate(start.getDate() + (weeksToRepeat * 7) - 1)
        const endDate = end.toISOString().split('T')[0]

        let assignedCount = 0
        const coachBrand = await supabase
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
                const { error: deactivateError } = await deactivateActiveProgramsForClient(supabase, clientId, scope.orgId)
                if (deactivateError) throw new Error('No se pudo desactivar el plan activo previo.')

                // 2.b Duplicar programa para el cliente
                const { data: newProgram, error: newProgramError } = await supabase
                    .from('workout_programs')
                    .insert({
                        client_id: clientId,
                        coach_id: user.id,
                        org_id: scope.orgId,
                        name: template.name,
                        weeks_to_repeat: weeksToRepeat,
                        start_date: dateToUse,
                        end_date: endDate,
                        duration_type: (template as any).duration_type || 'weeks',
                        duration_days: (template as any).duration_days ?? null,
                        program_structure_type: (template as any).program_structure_type || 'weekly',
                        cycle_length: (template as any).cycle_length ?? null,
                        start_date_flexible: startDateFlexible,
                        program_notes: (template as any).program_notes ?? null,
                        ab_mode: (template as any).ab_mode ?? false,
                        program_phases: (template as any).program_phases ?? [],
                        source_template_id: templateId,
                        last_edited_by_coach_id: user.id,
                    })
                    .select('id')
                    .single()

                if (newProgramError || !newProgram) throw new Error('No se pudo crear el nuevo programa.')

                // 3. Duplicar planes y bloques
                for (const plan of templatePlans) {
                    const { data: newPlan, error: newPlanError } = await supabase
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
                        section_template_id: scopedSectionTemplateIdFor(block.section, (block as { section_template_id?: string | null }).section_template_id, allowedAreaIds),
                        is_override: false,
                        ...polymorphicBlockColumns(block as Record<string, unknown>),
                    }))

                    if (blocksToInsert.length > 0) {
                        const { error: blocksError } = await supabase
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
        revalidatePath('/c', 'layout')
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
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    try {
        await assertCoachCanManageWorkoutClient(supabase, user.id, clientId, scope.orgId, scope.activeTeamId)
    } catch {
        return { data: [] }
    }

    // Buscar el último logged_at para este cliente + ejercicio
    const { data: lastLog, error: lastLogError } = await supabase
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

    const { data: sessionSets, error: sessionError } = await supabase
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
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    let templatesQuery = supabase
        .from('workout_programs')
        .select('id, name, weeks_to_repeat, duration_type, workout_plans(count)')
        .eq('coach_id', user.id)
        .is('client_id', null)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
    templatesQuery = applyOrgScope(templatesQuery, scope.orgId)
    const { data, error } = await templatesQuery

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
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    let templateQuery = supabase
        .from('workout_programs')
        .select(`
            id, name, weeks_to_repeat, duration_type, duration_days,
            start_date_flexible, program_notes, program_phases,
            workout_plans (
                day_of_week, title, week_variant,
                workout_blocks (
                    exercise_id, sets, reps, target_weight_kg,
                    tempo, rir, rest_time, notes, order_index, superset_group,
                    progression_type, progression_value, section, section_template_id, is_override,
                    is_unilateral, side_mode, reps_value, reps_unit, load_type, load_value, load_unit,
                    distance_value, distance_unit, duration_sec, target_pace_sec_per_km, hr_zone,
                    instructions, exercise_type_override, interval_config, extra_targets,
                    exercises ( name, muscle_group, gif_url, video_url, thumbnail_url, exercise_type )
                )
            )
        `)
        .eq('id', templateId)
        .eq('coach_id', user.id)
        .is('client_id', null)
    templateQuery = applyOrgScope(templateQuery, scope.orgId)
    const { data, error } = await templateQuery.single()

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
        section_template_id: sectionTemplateIdFor(b.section, (b as { section_template_id?: string | null }).section_template_id),
        is_override: !!b.is_override,
        // Polimórfico: el sync re-pasa por saveWorkoutProgramAction — sin esto, sincronizar
        // con plantilla borraría la prescripción tipada (regresión silenciosa).
        is_unilateral: b.is_unilateral ?? null,
        side_mode: b.side_mode ?? null,
        reps_value: b.reps_value ?? null,
        reps_unit: b.reps_unit ?? null,
        load_type: b.load_type ?? null,
        load_value: b.load_value ?? null,
        load_unit: b.load_unit ?? null,
        distance_value: b.distance_value ?? null,
        distance_unit: b.distance_unit ?? null,
        duration_sec: b.duration_sec ?? null,
        target_pace_sec_per_km: b.target_pace_sec_per_km ?? null,
        hr_zone: b.hr_zone ?? null,
        instructions: b.instructions ?? null,
        exercise_type_override: b.exercise_type_override ?? null,
        interval_config: b.interval_config ?? null,
        extra_targets: b.extra_targets ?? null,
    }
}

/**
 * Actualiza bloques no marcados como override desde la plantilla vinculada (source_template_id).
 */
export async function syncProgramFromTemplateAction(programId: string): Promise<ProgramState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    let programQuery = supabase
        .from('workout_programs')
        .select('*, workout_plans ( *, workout_blocks ( * ) )')
        .eq('id', programId)
        .eq('coach_id', user.id)
    programQuery = applyOrgScope(programQuery, scope.orgId)
    const { data: program, error: pErr } = await programQuery.single()

    if (pErr || !program) return { error: 'Programa no encontrado.' }
    if (!program.client_id) return { error: 'Solo programas de cliente pueden sincronizarse con una plantilla.' }

    const templateId = program.source_template_id
    if (!templateId) return { error: 'Este programa no tiene plantilla base vinculada.' }

    let templateQuery = supabase
        .from('workout_programs')
        .select('*, workout_plans ( *, workout_blocks ( * ) )')
        .eq('id', templateId)
        .eq('coach_id', user.id)
        .is('client_id', null)
    templateQuery = applyOrgScope(templateQuery, scope.orgId)
    const { data: template, error: tErr } = await templateQuery.maybeSingle()

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
    const scope = await getCoachWorkoutScope(supabase, user.id)
    if (!scope.ok) return { error: scope.error }

    // Picker scopeado por el workspace ACTIVO (3-vías): team = SOLO ese pool;
    // enterprise = propios de la org; standalone = propios NO-pool. Sin cruce de contextos.
    const clientsById = new Map<string, { id: string; full_name: string | null }>()
    let clientsQuery = supabase
        .from('clients')
        .select('id, full_name')
        .order('full_name', { ascending: true })
    if (scope.activeTeamId) {
        clientsQuery = clientsQuery.eq('team_id', scope.activeTeamId).is('org_id', null)
    } else {
        clientsQuery = clientsQuery.eq('coach_id', user.id)
        clientsQuery = applyOrgScope(clientsQuery, scope.orgId)
        if (!scope.orgId) clientsQuery = clientsQuery.is('team_id', null)
    }
    const { data, error } = await clientsQuery
    if (error) return { error: error.message }
    for (const c of data || []) clientsById.set(c.id, c)

    return {
        data: Array.from(clientsById.values())
            .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
            .map((client) => ({
                id: client.id,
                full_name: client.full_name,
                avatar_url: null,
            })),
    }
}
