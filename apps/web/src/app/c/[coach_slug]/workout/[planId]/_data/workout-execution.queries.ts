import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTodayInSantiago, getSantiagoUtcBoundsForDay } from '@/lib/date-utils'
import { resolveActiveWeekVariantForDisplay } from '@/lib/workout/programWeekVariant'
import { classicSlugForAreaId } from '@/lib/workout-areas'
import type { IntervalConfig, WorkoutArea } from '@/domain/workout/types'
import type { HrZoneRange } from '@/domain/cardio/types'
import { getClientZonesForContext } from '@/services/cardio-zones.service'

export interface ExerciseType {
    id: string
    name: string
    muscle_group: string
    video_url: string | null
    gif_url: string | null
    instructions: string[] | null
    /** Tipo del catálogo (strength|cardio|mobility|roller); null en snapshots legacy. */
    exercise_type?: string | null
}

export interface BlockType {
    id: string
    order_index: number
    sets: number
    reps: string
    target_weight_kg: number | null
    tempo: string | null
    rir: string | null
    rest_time: string | null
    notes: string | null
    section: 'warmup' | 'main' | 'cooldown' | null
    section_template_id: string | null
    superset_group: string | null
    progression_type: 'weight' | 'reps' | null
    progression_value: number | null
    is_override: boolean
    // ── Prescripción polimórfica (M2) — null en planes legacy ──
    exercise_type_override?: string | null
    side_mode?: string | null
    reps_value?: number | null
    reps_unit?: string | null
    load_value?: number | null
    load_unit?: string | null
    distance_value?: number | null
    distance_unit?: string | null
    duration_sec?: number | null
    target_pace_sec_per_km?: number | null
    hr_zone?: number | null
    instructions?: string | null
    interval_config?: IntervalConfig | null
    exercises: ExerciseType | ExerciseType[]
}

/** Contexto cardio del alumno resuelto server-side (módulo ON + zonas personalizadas). */
export interface ClientCardioView {
    enabled: boolean
    zones: HrZoneRange[] | null
}

export interface PlanType {
    id: string
    title: string
    assigned_date: string
    day_of_week: number | null
    week_variant: 'A' | 'B' | null
    program_id: string | null
    coach_id: string | null
    workout_blocks: BlockType[]
}

export interface ProgramType {
    id: string
    name: string
    program_phases: { name: string; weeks: number; color?: string }[] | null
    program_structure_type: 'weekly' | 'cycle' | null
    cycle_length: number | null
    ab_mode: boolean | null
    start_date: string | null
    weeks_to_repeat: number
}

export const getWorkoutExecutionData = cache(async (planId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, plan: null }

    const { data: rawPlan } = await supabase
        .from('workout_plans')
        .select(`
            id, title, assigned_date, day_of_week, week_variant, program_id, coach_id,
            workout_blocks (
                id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, notes, section, section_template_id, superset_group, progression_type, progression_value, is_override,
                exercise_type_override, side_mode, reps_value, reps_unit, load_value, load_unit,
                distance_value, distance_unit, duration_sec, target_pace_sec_per_km, hr_zone,
                instructions, interval_config,
                exercises ( id, name, muscle_group, video_url, gif_url, instructions, exercise_type )
            )
        `)
        .eq('id', planId)
        .eq('client_id', user.id)
        .maybeSingle()

    if (!rawPlan) return { user, plan: null }

    const plan = rawPlan as unknown as PlanType
    if (plan.program_id) {
        const { data: activeProgramForUser } = await supabase
            .from('workout_programs')
            .select('id')
            .eq('client_id', user.id)
            .eq('id', plan.program_id)
            .eq('is_active', true)
            .maybeSingle()
        if (!activeProgramForUser) return { user, plan: null }
    }

    let program: ProgramType | null = null
    if (plan.program_id) {
        const { data: rawProgram } = await supabase
            .from('workout_programs')
            .select('id, name, program_phases, program_structure_type, cycle_length, ab_mode, start_date, weeks_to_repeat')
            .eq('id', plan.program_id)
            .eq('client_id', user.id)
            .maybeSingle()
        program = (rawProgram as ProgramType | null) ?? null
    }

    const activeWeekVariant = program?.ab_mode
        ? resolveActiveWeekVariantForDisplay(program)
        : null

    const blockIds = plan.workout_blocks.map(b => b.id)
    let logs: Array<{
        block_id: string
        set_number: number
        weight_kg: number | null
        reps_done: number | null
        rpe: number | null
        rir: number | null
        actual_duration_sec: number | null
        actual_distance_m: number | null
        actual_hold_sec: number | null
        actual_avg_hr: number | null
    }> = []

    if (blockIds.length > 0) {
        const { iso: todayStr } = getTodayInSantiago()
        const { startIso: todayStartUtc, endIso: todayEndUtc } = getSantiagoUtcBoundsForDay(todayStr)
        const { data: rawLogs } = await supabase
            .from('workout_logs')
            .select('block_id, set_number, weight_kg, reps_done, rpe, rir, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr')
            .in('block_id', blockIds)
            .gte('logged_at', todayStartUtc)
            .lt('logged_at', todayEndUtc)

        logs = (rawLogs || []) as typeof logs
    }

    const exerciseIds = plan.workout_blocks
        .map(b => Array.isArray(b.exercises) ? b.exercises[0]?.id : b.exercises?.id)
        .filter(Boolean) as string[]

    const previousHistory: Record<string, { weight_kg: number | null, reps_done: number | null, date: string }[]> = {}

    if (exerciseIds.length > 0) {
        const { data: historyData } = await supabase
            .from('workout_logs')
            .select(`
                weight_kg, reps_done, logged_at, set_number,
                workout_blocks!inner(exercise_id)
            `)
            .eq('client_id', user.id)
            .in('workout_blocks.exercise_id', exerciseIds)
            .not('block_id', 'in', `(${blockIds.join(',')})`)
            .order('logged_at', { ascending: false })
            .limit(200)

        historyData?.forEach((log: any) => {
            const exId = log.workout_blocks?.exercise_id
            if (!exId) return
            if (!previousHistory[exId]) previousHistory[exId] = []
            const logDate = log.logged_at.split('T')[0]
            const existingDates = previousHistory[exId].map(h => h.date)

            if (existingDates.length === 0 || existingDates.includes(logDate)) {
                previousHistory[exId].push({
                    weight_kg: log.weight_kg,
                    reps_done: log.reps_done,
                    date: logDate,
                })
            }
        })
    }

    // F5: nombres de las areas que ESTE plan referencia. RLS wst_select no deja al alumno
    // ver areas custom del coach/team, asi que se resuelven con el SERVICE ROLE client puro
    // (createServiceRoleClient, sin cookies: createRawAdminClient hereda la sesion del request
    // y correria como el alumno — bypass falso). Doble acotamiento (data minimization):
    // SOLO ids ya presentes en el plan + SOLO areas del tenant del plan (system, coach del
    // plan, o team del alumno) — un id cross-context copiado por assign/duplicate NO se
    // resuelve y cae al bucket legacy. Soft-deleted fuera (fallback). Clasicos no se resuelven.
    let areas: WorkoutArea[] = []
    const areaIds = [...new Set(
        plan.workout_blocks
            .map(b => b.section_template_id)
            .filter((id): id is string => !!id && !classicSlugForAreaId(id))
    )]
    if (areaIds.length > 0) {
        const { data: clientRow } = await supabase
            .from('clients')
            .select('team_id')
            .eq('id', user.id)
            .maybeSingle()
        const tenantFilters = ['is_system.eq.true']
        if (plan.coach_id) tenantFilters.push(`coach_id.eq.${plan.coach_id}`)
        if (clientRow?.team_id) tenantFilters.push(`team_id.eq.${clientRow.team_id}`)

        const serviceDb = createServiceRoleClient()
        const { data: areaRows } = await serviceDb
            .from('workout_section_templates')
            .select('id, name, slug, sort_order, is_system, coach_id, team_id')
            .in('id', areaIds)
            .or(tenantFilters.join(','))
            .is('deleted_at', null)
        areas = (areaRows ?? []) as WorkoutArea[]
    }

    const blockIdsSet = new Set(plan.workout_blocks.map((b) => b.id))
    const exerciseMaxes: Record<string, number> = {}

    const { data: maxData } = await supabase
        .from('workout_logs')
        .select('block_id, weight_kg, workout_blocks!inner(exercise_id)')
        .eq('client_id', user.id)
        .not('weight_kg', 'is', null)

    maxData?.forEach((log: { block_id: string; weight_kg: number | null; workout_blocks: { exercise_id: string } | null }) => {
        if (blockIdsSet.has(log.block_id)) return
        const exId = log.workout_blocks?.exercise_id
        if (!exId || log.weight_kg == null) return
        if (exerciseMaxes[exId] == null || log.weight_kg > exerciseMaxes[exId]) {
            exerciseMaxes[exId] = log.weight_kg
        }
    })

    // Módulo cardio (chips de zona "Z4 · 150–168 bpm"): el perfil sale del propio row del
    // alumno (RLS own-row), pero teams/coaches.enabled_modules NO es legible por el alumno
    // — el flag se lee con el SERVICE ROLE puro (mismo patrón y justificación que las áreas
    // de arriba: lectura mínima de una fila por id, cero datos de terceros).
    let cardio: ClientCardioView = { enabled: false, zones: null }
    const planHasCardioFields = plan.workout_blocks.some(
        (b) => b.hr_zone != null || (b.duration_sec ?? 0) > 0 || b.interval_config != null
    )
    if (planHasCardioFields) {
        try {
            const result = await getClientZonesForContext(supabase, user.id, createServiceRoleClient())
            cardio = { enabled: result.enabled, zones: result.zones?.zones ?? null }
        } catch {
            cardio = { enabled: false, zones: null }
        }
    }

    return { user, plan, program, logs, previousHistory, exerciseMaxes, activeWeekVariant, areas, cardio }
})
