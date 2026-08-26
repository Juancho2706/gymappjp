import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTodayInSantiago, getSantiagoUtcBoundsForDay, getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import { resolveActiveWeekVariantForDisplay, programWeekIndex1Based } from '@/lib/workout/programWeekVariant'
import { classicSlugForAreaId, validateTargetDate } from '@eva/workout-engine'
import type { IntervalConfig, WorkoutArea } from '@/domain/workout/types'
import type { HrZoneRange } from '@eva/cardio'
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
    /**
     * Modalidad de cardio del catálogo (run|bike|row|elliptical|jump_rope|hiit_reps|stairs).
     * Decide los EJES de captura de la ronda (Fase C · `cardio-modality.ts`): la elíptica no pide
     * distancia, la cuerda pide saltos, la escaladora pisos, el HIIT reps. null/desconocida ⇒ ejes
     * genéricos (Min · Distancia · FC), byte-idéntico al comportamiento previo.
     */
    cardio_modality?: string | null
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
    /** Descanso de las series de aproximación (Fase M — 8b); null ⇒ un solo descanso (rest_time). */
    warmup_rest_time: string | null
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

/**
 * `targetDate` = editar un día PASADO (mueve la ventana de logs a esa fecha, modo solo-UPDATE).
 * `repeatDate` = repetir HOY un día hecho en OTRA fecha: NO mueve ninguna ventana (todo lo de hoy
 * sigue siendo de hoy), solo agrega `seedLogs` con lo registrado ese día para PRECARGAR las series.
 */
export const getWorkoutExecutionData = cache(async (planId: string, targetDate?: string, repeatDate?: string) => {
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
                id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, warmup_rest_time, notes, section, section_template_id, superset_group, progression_type, progression_value, progression_mode, is_override,
                exercise_type_override, side_mode, reps_value, reps_unit, load_value, load_unit,
                distance_value, distance_unit, duration_sec, target_pace_sec_per_km, hr_zone,
                instructions, interval_config,
                exercises ( id, name, muscle_group, video_url, video_start_time, video_end_time, gif_url, instructions, exercise_type, cardio_modality )
            )
        `)
        .eq('id', planId)
        .eq('client_id', user.id)
        .maybeSingle()

    if (!rawPlan) return { user, plan: null }

    const plan = rawPlan as unknown as PlanType
    // La MISMA fila de `workout_programs` sirve de guarda (is_active) y de dato del programa: antes
    // eran dos round-trips en serie (uno pedía `id` con is_active, el otro las columnas sin él) y el
    // segundo sólo se alcanzaba si el primero había probado que la fila estaba activa. Select
    // idéntico al de entonces ⇒ mismo resultado, un viaje menos en el camino crítico.
    let program: ProgramType | null = null
    if (plan.program_id) {
        const { data: activeProgram } = await supabase
            .from('workout_programs')
            .select('id, name, program_phases, program_structure_type, cycle_length, ab_mode, start_date, weeks_to_repeat')
            .eq('id', plan.program_id)
            .eq('client_id', user.id)
            .eq('is_active', true)
            .maybeSingle()
        if (!activeProgram) return { user, plan: null }
        program = activeProgram as unknown as ProgramType
    }

    const activeWeekVariant = program?.ab_mode
        ? resolveActiveWeekVariantForDisplay(program)
        : null

    // Semana 1-based del programa (misma fórmula que compliance/variante A/B). Alimenta el motor
    // de sobrecarga progresiva (peso objetivo efectivo del día). null si falta start_date.
    const currentWeek = programWeekIndex1Based(program)

    // Ventana efectiva del día editable (Ola 1, edición de día pasado). Sin `targetDate` = HOY
    // Santiago (comportamiento previo). Con `targetDate` válido (formato estricto, pasado u hoy) =
    // esa fecha; un `targetDate` inválido/futuro se IGNORA aquí (la query es solo-lectura; la barrera
    // contra farmear adherencia vive en la action de escritura). Estos límites se reusan por: logs
    // del día, historial previo ("sesión anterior"), última sesión (doble progresión) y máximos
    // históricos (PRs). El historial "previo" queda SIEMPRE en `< windowStartUtc` → editar un día
    // pasado nunca lo autocompara consigo mismo.
    const { iso: todayStr } = getTodayInSantiago()
    let windowDateStr = todayStr
    if (targetDate !== undefined) {
        const validated = validateTargetDate(targetDate, todayStr)
        if (validated.ok) windowDateStr = validated.iso
    }
    const { startIso: windowStartUtc, endIso: windowEndUtc } = getSantiagoUtcBoundsForDay(windowDateStr)

    const blockIds = plan.workout_blocks.map(b => b.id)

    const exerciseIds = plan.workout_blocks
        .map(b => Array.isArray(b.exercises) ? b.exercises[0]?.id : b.exercises?.id)
        .filter(Boolean) as string[]

    // "Repetir hoy" (`?repetir=YYYY-MM-DD`): registros de ESE día, para SEMBRAR los valores de las
    // series de hoy (peso/reps/esfuerzo precargados y editables). No son `logs`: entran por la misma
    // cadena de `defaultValue` que el peso sugerido, así que la serie NO queda marcada como
    // registrada. La ventana de `logs` (y la de historial/máximos) sigue siendo HOY — lo de hoy es
    // una instancia NUEVA y el día original no se toca. Se descarta si la fecha es inválida, futura
    // o es hoy mismo (repetir hoy sobre hoy pisaría la misma fila por el índice único diario).
    const seedDateStr = repeatDate !== undefined && repeatDate !== todayStr && validateTargetDate(repeatDate, todayStr).ok
        ? repeatDate
        : null
    const seedBounds = seedDateStr ? getSantiagoUtcBoundsForDay(seedDateStr) : null

    // Doble progresión (mode='double'): sólo se consulta si algún bloque usa ese modo (la mayoría no).
    const needsLastSession = plan.workout_blocks.some((b) => b.progression_mode === 'double')

    // F5: ids de área que ESTE plan referencia (los clásicos no se resuelven contra la tabla).
    const areaIds = [...new Set(
        plan.workout_blocks
            .map(b => b.section_template_id)
            .filter((id): id is string => !!id && !classicSlugForAreaId(id))
    )]

    const planHasCardioFields = plan.workout_blocks.some(
        (b) => b.hr_zone != null || (b.duration_sec ?? 0) > 0 || b.interval_config != null
    )

    let logs: Array<{
        block_id: string
        set_number: number
        weight_kg: number | null
        reps_done: number | null
        rpe: number | null
        rir: number | null
        note: string | null
        actual_duration_sec: number | null
        actual_distance_m: number | null
        actual_hold_sec: number | null
        actual_avg_hr: number | null
        // Sustitución de máquina ocupada (Fase L · C): rehidratan `substitutionByBlock` tras reload.
        substituted_exercise_id: string | null
        substituted_exercise_name: string | null
        substitution_reason: string | null
        // Hold POR LADO (E0.5/E3.2): metadata jsonb {left_sec, right_sec} — rehidrata la fila per_side
        // (dos campos) tras reload; el resto de tipos lo ignora (null). Select aditivo trivial.
        metadata: { left_sec?: number | null; right_sec?: number | null } | null
    }> = []
    let seedLogs: typeof logs = []

    // ── Una sola ola ──
    // Todo lo de abajo depende SÓLO del plan ya resuelto (blockIds / exerciseIds / areaIds) y de la
    // ventana del día: son independientes entre sí. Hasta el 25-08 corrían en fila india (~7
    // round-trips seriales contra Supabase) y se comían el presupuesto de 3,3 s que tiene el
    // "Despegue" del alumno para pintar el Inicio antes de que gane el fallback de 4,6 s
    // (Sentry EVA-NEXTJS-1C: ~1 de cada 10 lanzamientos web). Cada guarda se conserva como una
    // promesa YA resuelta para no disparar queries que antes no se disparaban.
    const [logsRes, seedLogsRes, historyRes, priorLogsRes, clientRowRes, maxRes, cardioRes] = await Promise.all([
        blockIds.length > 0
            ? supabase
                .from('workout_logs')
                .select('block_id, set_number, weight_kg, reps_done, rpe, rir, note, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr, substituted_exercise_id, substituted_exercise_name, substitution_reason, metadata')
                .in('block_id', blockIds)
                .gte('logged_at', windowStartUtc)
                .lt('logged_at', windowEndUtc)
            : Promise.resolve({ data: null }),

        seedBounds && blockIds.length > 0
            ? supabase
                .from('workout_logs')
                .select('block_id, set_number, weight_kg, reps_done, rpe, rir, note, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr, substituted_exercise_id, substituted_exercise_name, substitution_reason, metadata')
                .in('block_id', blockIds)
                .gte('logged_at', seedBounds.startIso)
                .lt('logged_at', seedBounds.endIso)
            : Promise.resolve({ data: null }),

        exerciseIds.length > 0
            ? supabase
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
                .lt('logged_at', windowStartUtc)
                .order('logged_at', { ascending: false })
                .limit(500)
            : Promise.resolve({ data: null }),

        // Doble progresión (mode='double'): última sesión registrada por bloque (peso + reps por
        // serie), de días PREVIOS a hoy.
        needsLastSession && blockIds.length > 0
            ? supabase
                .from('workout_logs')
                .select('block_id, set_number, weight_kg, reps_done, logged_at')
                .in('block_id', blockIds)
                .lt('logged_at', windowStartUtc)
                .order('logged_at', { ascending: false })
                .limit(800)
            : Promise.resolve({ data: null }),

        // Tenant del alumno: sólo alimenta el filtro de áreas de más abajo (segunda ola).
        areaIds.length > 0
            ? supabase
                .from('clients')
                .select('team_id')
                .eq('id', user.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),

        // Máximo histórico por ejercicio (para detectar PRs): mejor peso de días PREVIOS a hoy, de
        // CUALQUIER bloque INCLUIDO el propio plan. Antes excluía los bloques del plan actual → en
        // programas semanales reusados el máx salía vacío y marcaba "PR" falso casi cada sesión. Cap 5000.
        exerciseIds.length > 0
            ? supabase
                .from('workout_logs')
                .select('weight_kg, exercise_id, logged_at')
                .eq('client_id', user.id)
                .not('weight_kg', 'is', null)
                // P1-3: match por el snapshot exercise_id del log → el máx histórico sobrevive al borrado
                // del bloque (block_id NULL). Equivalente hoy (trigger + backfill pueblan exercise_id).
                .in('exercise_id', exerciseIds)
                .lt('logged_at', windowStartUtc)
                .limit(5000)
            : Promise.resolve({ data: null }),

        // Módulo cardio (chips de zona "Z4 · 150–168 bpm"): el perfil sale del propio row del
        // alumno (RLS own-row), pero teams/coaches.enabled_modules NO es legible por el alumno
        // — el flag se lee con el SERVICE ROLE puro (mismo patrón y justificación que las áreas
        // de abajo: lectura mínima de una fila por id, cero datos de terceros). El try/catch va
        // DENTRO de la ola para que un fallo del módulo no tumbe el resto del `Promise.all`
        // (incluye el throw síncrono de `createServiceRoleClient()` sin env).
        planHasCardioFields
            ? (async () => {
                try {
                    return await getClientZonesForContext(supabase, user.id, createServiceRoleClient())
                } catch {
                    return null
                }
            })()
            : Promise.resolve(null),
    ])

    logs = (logsRes.data || []) as typeof logs
    seedLogs = (seedLogsRes.data || []) as typeof logs

    const previousHistory: Record<string, { weight_kg: number | null, reps_done: number | null, date: string }[]> = {}

    historyRes.data?.forEach((log: any) => {
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

    const lastSessionByBlock: Record<string, { date: string; sets: Array<{ weight_kg: number | null; reps_done: number | null }> }> = {}
    // priorLogs viene desc por fecha → la 1ª aparición de cada bloque marca su día más reciente.
    const grouped: Record<string, { day: string; rows: Array<{ set_number: number; weight_kg: number | null; reps_done: number | null }> }> = {}
    priorLogsRes.data?.forEach((log: { block_id: string; set_number: number; weight_kg: number | null; reps_done: number | null; logged_at: string }) => {
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

    // F5: nombres de las areas que ESTE plan referencia. RLS wst_select no deja al alumno
    // ver areas custom del coach/team, asi que se resuelven con el SERVICE ROLE client puro
    // (createServiceRoleClient, sin cookies: createRawAdminClient hereda la sesion del request
    // y correria como el alumno — bypass falso). Doble acotamiento (data minimization):
    // SOLO ids ya presentes en el plan + SOLO areas del tenant del plan (system, coach del
    // plan, o team del alumno) — un id cross-context copiado por assign/duplicate NO se
    // resuelve y cae al bucket legacy. Soft-deleted fuera (fallback). Clasicos no se resuelven.
    // Segunda (y última) ola: es la única query que NO puede entrar en la de arriba porque su
    // filtro de tenant depende del `team_id` que trae `clientRowRes`.
    let areas: WorkoutArea[] = []
    if (areaIds.length > 0) {
        const tenantFilters = ['is_system.eq.true']
        if (plan.coach_id) tenantFilters.push(`coach_id.eq.${plan.coach_id}`)
        if (clientRowRes.data?.team_id) tenantFilters.push(`team_id.eq.${clientRowRes.data.team_id}`)

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

    maxRes.data?.forEach((log: { weight_kg: number | null; exercise_id: string | null; logged_at?: string }) => {
        const exId = log.exercise_id
        if (!exId || log.weight_kg == null) return
        if (exerciseMaxes[exId] == null || log.weight_kg > exerciseMaxes[exId]) {
            exerciseMaxes[exId] = log.weight_kg
            if (log.logged_at) exerciseMaxDates[exId] = log.logged_at
        }
    })

    const cardio: ClientCardioView = cardioRes
        ? { enabled: cardioRes.enabled, zones: cardioRes.zones?.zones ?? null }
        : { enabled: false, zones: null }

    return { user, plan, program, logs, seedLogs, previousHistory, exerciseMaxes, exerciseMaxDates, activeWeekVariant, currentWeek, lastSessionByBlock, areas, cardio }
})
