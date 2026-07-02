import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTodayInSantiago, getSantiagoUtcBoundsForDay, getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import { resolveActiveWeekVariantForDisplay, programWeekIndex1Based } from '@/lib/workout/programWeekVariant'
import { classicSlugForAreaId } from '@/lib/workout-areas'
import type { IntervalConfig, WorkoutArea } from '@/domain/workout/types'
import type { HrZoneRange } from '@/domain/cardio/types'
import { getClientZonesForContext } from '@/services/cardio-zones.service'

export interface ExerciseType {
    id: string
    name: string
    muscle_group: string
    video_url: string | null
    video_start_time: number | null
    video_end_time: number | null
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
    progression_mode: 'weekly_linear' | 'double' | 'session_linear' | 'adaptive' | null
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
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, plan: null }

    const { data: rawPlan } = await supabase
        .from('workout_plans')
        .select(`
            id, title, assigned_date, day_of_week, week_variant, program_id, coach_id,
            workout_blocks (
                id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, notes, section, section_template_id, superset_group, progression_type, progression_value, progression_mode, is_override,
                exercise_type_override, side_mode, reps_value, reps_unit, load_value, load_unit,
                distance_value, distance_unit, duration_sec, target_pace_sec_per_km, hr_zone,
                instructions, interval_config,
                exercises ( id, name, muscle_group, video_url, video_start_time, video_end_time, gif_url, instructions, exercise_type )
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

    // Semana 1-based del programa (misma fórmula que compliance/variante A/B). Alimenta el motor
    // de sobrecarga progresiva (peso objetivo efectivo del día). null si falta start_date.
    const currentWeek = programWeekIndex1Based(program)

    // Límites del día de HOY en Santiago — reusados por: logs de hoy, historial previo ("sesión
    // anterior"), última sesión (doble progresión) y máximos históricos (PRs).
    const { iso: todayStr } = getTodayInSantiago()
    const { startIso: todayStartUtc, endIso: todayEndUtc } = getSantiagoUtcBoundsForDay(todayStr)

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
            .select('weight_kg, reps_done, logged_at, set_number, exercise_id')
            .eq('client_id', user.id)
            // P1-3: match por el snapshot exercise_id del log (no por el bloque via JOIN). Sobrevive
            // al hard-delete del bloque (block_id NULL) → la "sesión anterior" no desaparece. El
            // trigger + backfill garantizan exercise_id en todo log, así que hoy es equivalente.
            .in('exercise_id', exerciseIds)
            // Sesiones PREVIAS a hoy de estos ejercicios (cualquier bloque, INCLUIDO el propio del
            // plan). Antes excluía los bloques del plan actual (.not block_id in) → en programas
            // semanales reusados la "sesión anterior" NUNCA aparecía (todo su historial vive en
            // esos mismos bloques). Ahora se filtra por fecha, no por bloque.
            .lt('logged_at', todayStartUtc)
            .order('logged_at', { ascending: false })
            .limit(500)

        historyData?.forEach((log: any) => {
            const exId = log.exercise_id
            if (!exId) return
            if (!previousHistory[exId]) previousHistory[exId] = []
            const logDate = getSantiagoIsoYmdForUtcInstant(log.logged_at)
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

    // Doble progresión (mode='double'): última sesión registrada por bloque (peso + reps por serie),
    // de días PREVIOS a hoy. Solo se consulta si algún bloque usa ese modo (la mayoría no lo usa).
    const lastSessionByBlock: Record<string, { date: string; sets: Array<{ weight_kg: number | null; reps_done: number | null }> }> = {}
    const needsLastSession = plan.workout_blocks.some((b) => b.progression_mode === 'double')
    if (needsLastSession && blockIds.length > 0) {
        const { data: priorLogs } = await supabase
            .from('workout_logs')
            .select('block_id, set_number, weight_kg, reps_done, logged_at')
            .in('block_id', blockIds)
            .lt('logged_at', todayStartUtc)
            .order('logged_at', { ascending: false })
            .limit(800)
        // priorLogs viene desc por fecha → la 1ª aparición de cada bloque marca su día más reciente.
        const grouped: Record<string, { day: string; rows: Array<{ set_number: number; weight_kg: number | null; reps_done: number | null }> }> = {}
        priorLogs?.forEach((log: { block_id: string; set_number: number; weight_kg: number | null; reps_done: number | null; logged_at: string }) => {
            const day = getSantiagoIsoYmdForUtcInstant(log.logged_at)
            if (!grouped[log.block_id]) grouped[log.block_id] = { day, rows: [] }
            if (grouped[log.block_id].day === day) {
                grouped[log.block_id].rows.push({ set_number: log.set_number, weight_kg: log.weight_kg, reps_done: log.reps_done })
            }
        })
        for (const [bid, g] of Object.entries(grouped)) {
            const sets = [...g.rows]
                .sort((a, b) => a.set_number - b.set_number)
                .map((r) => ({ weight_kg: r.weight_kg, reps_done: r.reps_done }))
            lastSessionByBlock[bid] = { date: g.day, sets }
        }
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

    const exerciseMaxes: Record<string, number> = {}
    // Fecha del máximo histórico por ejercicio → el overlay post-entreno puede decir "superaste
    // tus 80 kg del 12 jun". Paralelo a `exerciseMaxes` (misma pasada), ISO del log del máx.
    const exerciseMaxDates: Record<string, string> = {}

    // Máximo histórico por ejercicio (para detectar PRs): mejor peso de días PREVIOS a hoy, de
    // CUALQUIER bloque INCLUIDO el propio plan. Antes excluía los bloques del plan actual → en
    // programas semanales reusados el máx salía vacío y marcaba "PR" falso casi cada sesión. Cap 5000.
    const { data: maxData } = exerciseIds.length === 0 ? { data: [] } : await supabase
        .from('workout_logs')
        .select('weight_kg, exercise_id, logged_at')
        .eq('client_id', user.id)
        .not('weight_kg', 'is', null)
        // P1-3: match por el snapshot exercise_id del log → el máx histórico sobrevive al borrado
        // del bloque (block_id NULL). Equivalente hoy (trigger + backfill pueblan exercise_id).
        .in('exercise_id', exerciseIds)
        .lt('logged_at', todayStartUtc)
        .limit(5000)

    maxData?.forEach((log: { weight_kg: number | null; exercise_id: string | null; logged_at?: string }) => {
        const exId = log.exercise_id
        if (!exId || log.weight_kg == null) return
        if (exerciseMaxes[exId] == null || log.weight_kg > exerciseMaxes[exId]) {
            exerciseMaxes[exId] = log.weight_kg
            if (log.logged_at) exerciseMaxDates[exId] = log.logged_at
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

    return { user, plan, program, logs, previousHistory, exerciseMaxes, exerciseMaxDates, activeWeekVariant, currentWeek, lastSessionByBlock, areas, cardio }
})
