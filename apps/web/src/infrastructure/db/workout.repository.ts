import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>
type Tables = Database['public']['Tables']

export type WorkoutProgramRow = Tables['workout_programs']['Row']
export type WorkoutPlanRow = Tables['workout_plans']['Row']
export type WorkoutBlockRow = Tables['workout_blocks']['Row']
export type WorkoutLogRow = Tables['workout_logs']['Row']
export type WorkoutSectionTemplateRow = Tables['workout_section_templates']['Row']

/**
 * Areas disponibles segun el workspace ACTIVO (separacion estricta de contextos):
 * team ⇒ system + las del team; standalone ⇒ system + propias; sin scope ⇒ solo system.
 * RLS (wst_select) es el techo; estos filtros son defensa en profundidad.
 */
export async function findAvailableSectionTemplates(
    db: DB,
    scope: { coachId: string | null; teamId: string | null }
): Promise<WorkoutSectionTemplateRow[]> {
    let query = db
        .from('workout_section_templates')
        .select('id, name, slug, coach_id, team_id, sort_order, is_system, created_at, deleted_at')
        .is('deleted_at', null)

    if (scope.teamId) {
        query = query.or(`is_system.eq.true,team_id.eq.${scope.teamId}`)
    } else if (scope.coachId) {
        query = query.or(`is_system.eq.true,and(coach_id.eq.${scope.coachId},team_id.is.null)`)
    } else {
        query = query.eq('is_system', true)
    }

    const { data } = await query
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

    return (data ?? []) as WorkoutSectionTemplateRow[]
}

const SECTION_TEMPLATE_COLUMNS = 'id, name, slug, coach_id, team_id, sort_order, is_system, created_at, deleted_at'

/** Alta de area custom (coach XOR team — el CHECK ownership_chk y RLS wst_insert son el techo). */
export async function insertSectionTemplate(
    db: DB,
    values: { name: string; slug: string; sort_order: number; coach_id: string | null; team_id: string | null }
): Promise<{ row: WorkoutSectionTemplateRow | null; error: string | null }> {
    const { data, error } = await db
        .from('workout_section_templates')
        .insert({ ...values, is_system: false })
        .select(SECTION_TEMPLATE_COLUMNS)
        .single()
    return { row: (data as WorkoutSectionTemplateRow) ?? null, error: error?.message ?? null }
}

/** Update de area custom (nombre y/u orden). `is_system = false` como defensa extra ante RLS. */
export async function updateSectionTemplate(
    db: DB,
    id: string,
    values: { name?: string; sort_order?: number }
): Promise<{ row: WorkoutSectionTemplateRow | null; error: string | null }> {
    const { data, error } = await db
        .from('workout_section_templates')
        .update(values)
        .eq('id', id)
        .eq('is_system', false)
        .is('deleted_at', null)
        .select(SECTION_TEMPLATE_COLUMNS)
        .maybeSingle()
    return { row: (data as WorkoutSectionTemplateRow) ?? null, error: error?.message ?? null }
}

/** Soft-delete de area custom. Los bloques que la referencian conservan el id (FK intacta);
 *  el builder/ejecucion caen al bucket legacy via effectiveAreaKey. */
export async function softDeleteSectionTemplate(
    db: DB,
    id: string
): Promise<{ done: boolean; error: string | null }> {
    const { data, error } = await db
        .from('workout_section_templates')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('is_system', false)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle()
    return { done: !!data, error: error?.message ?? null }
}

export async function findWorkoutProgramById(
    db: DB,
    programId: string,
    coachId?: string
): Promise<WorkoutProgramRow | null> {
    let query = db
        .from('workout_programs')
        .select('id, coach_id, client_id, name, program_notes, duration_days, duration_type, weeks_to_repeat, is_active, program_structure_type, cycle_length, ab_mode, start_date, start_date_flexible, end_date, program_phases, source_template_id, created_by_coach_id, org_id, created_at, updated_at')
        .eq('id', programId)

    if (coachId) query = query.eq('coach_id', coachId)

    const { data } = await query.maybeSingle()
    return data as WorkoutProgramRow | null
}

export async function findWorkoutPlansByProgram(db: DB, programId: string): Promise<WorkoutPlanRow[]> {
    const { data } = await db
        .from('workout_plans')
        .select('id, coach_id, client_id, program_id, title, group_name, assigned_date, day_of_week, week_variant, created_at, updated_at')
        .eq('program_id', programId)
        .order('day_of_week', { ascending: true })
        .order('created_at', { ascending: true })

    return (data ?? []) as WorkoutPlanRow[]
}

export async function findWorkoutBlocksByPlan(db: DB, planId: string): Promise<WorkoutBlockRow[]> {
    const { data } = await db
        .from('workout_blocks')
        .select('id, plan_id, exercise_id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, notes, section, superset_group, progression_type, progression_value, is_override, created_at')
        .eq('plan_id', planId)
        .order('order_index', { ascending: true })

    return (data ?? []) as WorkoutBlockRow[]
}

export async function findWorkoutLogsByClient(
    db: DB,
    clientId: string,
    limit = 200
): Promise<WorkoutLogRow[]> {
    const { data } = await db
        .from('workout_logs')
        .select('id, client_id, block_id, set_number, weight_kg, reps_done, rpe, rir, logged_at, exercise_name_at_log, plan_name_at_log, target_reps_at_log, target_weight_at_log')
        .eq('client_id', clientId)
        .order('logged_at', { ascending: false })
        .limit(limit)

    return (data ?? []) as WorkoutLogRow[]
}

export async function upsertWorkoutProgram(
    db: DB,
    program: Partial<WorkoutProgramRow>
): Promise<WorkoutProgramRow | null> {
    const { data } = await db
        .from('workout_programs')
        .upsert(program as never)
        .select('id, coach_id, client_id, name, program_notes, duration_days, duration_type, weeks_to_repeat, is_active, program_structure_type, cycle_length, ab_mode, start_date, start_date_flexible, end_date, program_phases, source_template_id, created_by_coach_id, org_id, created_at, updated_at')
        .maybeSingle()

    return data as WorkoutProgramRow | null
}
