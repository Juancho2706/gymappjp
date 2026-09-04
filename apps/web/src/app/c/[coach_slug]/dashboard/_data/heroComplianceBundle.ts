import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import {
    getActiveProgram,
    getCheckInHistory30Days,
    getClientWorkoutPlans,
    getNutritionAdherenceInputs30d,
    getNutritionLogDays30,
    getRecentWorkoutLogs,
    getWorkoutPlanBlocksForHero,
} from './dashboard.queries'
import {
    getNutritionDayOfWeekFromIsoYmdInSantiago,
    getSantiagoIsoYmdForUtcInstant,
    getTodayInSantiago,
} from '@/lib/date-utils'
import {
    computeNutritionAdherence,
    normalizeMealForMacros,
    type AdherenceMeal,
    type MacroTarget,
    type MealLogRow,
} from '@eva/nutrition-engine'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import {
    buildCycleCompletions,
    programDayLabel,
    resolveCycleCursor,
    type CycleCompletion,
    type CycleCursorMode,
    type CycleCursorPlan,
    type CycleProgramState,
    type CycleSlotState,
    type CycleTodayState,
    type DayCompletionBlock,
} from '@eva/workout-engine'
import type { HeroBlock } from '../_components/hero/WorkoutHeroCard'
import type { AdherenceProgramRow } from '@/lib/workout/workoutAdherence30d'
import { computeWorkoutScore30d } from '@/lib/workout/workoutAdherence30d'

/** Un día del programa con su estado y sus etiquetas YA resueltas (nadie vuelve a formatear). */
export type HeroCycleSlot = {
    planId: string
    /** ISODOW 1..7 en `weekly`; índice del ciclo 1..14 en `cycle` (misma columna, dos semánticas). */
    cycleIndex: number
    state: CycleSlotState
    /** Sólo en `done`: día Santiago en que se cerró. */
    doneDateIso: string | null
    title: string | null
    /** `Lun` / `Día 1`. */
    shortLabel: string
    /** `Lunes` / `Día 1 de 3`. */
    longLabel: string
    /** `Lun` / `D1` — chip de 34 px. */
    chipLabel: string
}

/**
 * Salida del cursor (`resolveCycleCursor`) YA resuelta y etiquetada, para que el hero (W2.11) y las
 * day-cards (W2.12) no vuelvan a derivar "hoy toca" ni a formatear el día. En `weekly` es la
 * identidad de la resolución por ISODOW que la web ya hacía.
 */
export type HeroCycleView = {
    mode: CycleCursorMode
    /** Programa activo que alimenta el cursor; lo usa «Empezar hoy» (W2.11). `null` sin programa. */
    programId: string | null
    /** `not_started` ⟺ inicio flexible sin fecha (R30). El hero NO lo re-deriva de `start_date`. */
    programState: CycleProgramState
    todayState: CycleTodayState
    todayPlanId: string | null
    todayCycleIndex: number | null
    /** `Jueves` / `Día 3 de 3`. `null` si hoy no hay día resuelto. */
    todayLabel: string | null
    todayChipLabel: string | null
    nextPlanId: string | null
    nextCycleIndex: number | null
    nextLabel: string | null
    nextChipLabel: string | null
    lastCompleted: { planId: string; cycleIndex: number; dateIso: string } | null
    /** Largo del ciclo (`null` en weekly). */
    cycleLength: number | null
    slots: HeroCycleSlot[]
}

export type HeroComplianceBundle = {
    hero: {
        hasWorkout: boolean
        planId: string | null
        planTitle: string | null
        blocks: HeroBlock[]
        isAlreadyLogged: boolean
        totalSetsTarget: number
        totalSetsLogged: number
        baseLoggedPerBlock: Record<string, number>
        nextWorkoutTitle: string | null
        nextWorkoutDayLabel: string | null
    }
    /** Cursor del programa (W2.7): el hero y las day-cards consumen ESTO, no `day_of_week` crudo. */
    cycle: HeroCycleView
    scores: {
        /**
         * Adherencia de entrenos 30 d. `null` en `cycle` (y en un programa que no empezó): no hay
         * meta semanal que sirva de denominador, así que no se inventa un porcentaje (R12).
         */
        workoutScore: number | null
        /**
         * ENGAGEMENT de registro: días con `daily_nutrition_log` / 30 * 100.
         * NO es cumplimiento de comidas — mide cuántos días el alumno registró algo.
         */
        nutritionEngagementScore: number
        /**
         * CUMPLIMIENTO real de comidas (motor canónico `computeNutritionAdherence`):
         * sum(comidas completadas) / sum(comidas aplicables) en 30d. `null` cuando el
         * alumno no tiene plan activo (no se puede calcular adherencia sin plan).
         */
        nutritionComplianceScore: number | null
        checkInScore: number
        /** §10: sin `daily_nutrition_logs` en 30d → anillo gris "Sin datos". */
        nutritionHasLogs: boolean
    }
}

export const getHeroComplianceBundle = cache(async (userId: string, _coachSlug: string): Promise<HeroComplianceBundle> => {
    const [program, allPlans, logs, checkInHistory, nutritionDays, nutritionAdherenceInputs] = await Promise.all([
        getActiveProgram(userId),
        getClientWorkoutPlans(userId),
        getRecentWorkoutLogs(userId),
        getCheckInHistory30Days(userId),
        getNutritionLogDays30(userId),
        getNutritionAdherenceInputs30d(userId),
    ])
    const activePlans = allPlans.filter((p) => !p.program_id || p.program_id === program?.id)

    const todayCtx = getTodayInSantiago()
    const { date: userLocalDate, iso: today, dayOfWeek: todayDow } = todayCtx
    const abMode = !!program?.ab_mode
    const weekIdx = program ? programWeekIndex1Based(program, userLocalDate) : null
    // Variante EFECTIVA: si la del ciclo no tiene planes (A/B mal armado) cae a la que sí tiene,
    // para que el hero "hoy / próximo entreno" no quede vacío en semanas "B" de una sola semana cargada.
    const activeVariant = resolveEffectiveWeekVariant(
        program,
        program ? activePlans.filter((p) => p.program_id === program.id) : [],
        weekIdx,
        userLocalDate
    )

    // ---- Cursor del programa (spec `ciclo-real-y-por-lado`, W2.7) --------------------------------
    // "Hoy toca" deja de resolverse acá: lo resuelve `resolveCycleCursor`, único dueño de las DOS
    // semánticas de `day_of_week` (ISODOW en weekly, índice del ciclo en cycle). En weekly su salida
    // es la IDENTIDAD de lo que este archivo hacía (mismo `todayPlan`, mismo "próximo" sin wrap).
    const structure = program?.program_structure_type ?? null
    const isCycle = structure === 'cycle'
    const cycleLength = program?.cycle_length ?? null

    // Planes del PROGRAMA que participan, EN EL ORDEN DE LA QUERY: el motor no reordena ni re-filtra,
    // así que el primero con el índice de hoy es el mismo que devolvía el `.find()` anterior.
    const programPlans = program
        ? activePlans.filter(
              (p) => p.program_id === program.id && workoutPlanMatchesVariant(p, activeVariant, abMode)
          )
        : []
    const cursorPlans: CycleCursorPlan[] = programPlans.map((p) => ({
        id: p.id,
        day_of_week: p.day_of_week,
        title: p.title,
    }))

    // Denominador por plan (`sets`): mandan los bloques ANIDADOS del programa activo; los planes
    // sueltos aportan los suyos desde el select ampliado de `getClientWorkoutPlans`.
    const blocksByPlan: Record<string, readonly DayCompletionBlock[]> = {}
    if (isCycle) {
        for (const p of activePlans) if (p.workout_blocks != null) blocksByPlan[p.id] = p.workout_blocks
        for (const p of program?.workout_plans ?? []) if (p.workout_blocks != null) blocksByPlan[p.id] = p.workout_blocks
    }

    // En weekly el cursor NO mira las completitudes (los estados de la semana los siguen derivando las
    // grillas con su atribución greedy), así que ni se calculan: son 200 logs × derivación por día.
    const { completions, inProgress } = isCycle
        ? buildCycleCompletions({ plans: cursorPlans, blocksByPlan, logs, todayIso: today })
        : { completions: [] as CycleCompletion[], inProgress: undefined }

    const cursor = resolveCycleCursor({
        program: {
            program_structure_type: structure,
            cycle_length: cycleLength,
            start_date: program?.start_date ?? null,
            start_date_flexible: program?.start_date_flexible ?? null,
        },
        plans: cursorPlans,
        completions,
        inProgress,
        todayIso: today,
    })

    // Atajo por fecha SOLO para planes sueltos: los de programa mandan por el cursor. El builder
    // estampaba `assigned_date = start_date` en todos los días del programa y el hero de la semana del
    // start_date mostraba un plan arbitrario ("HOY ENTRENAS <otro día> 0/19", incidente 2026-08-25).
    let todayPlan = activePlans.find((p) => p.program_id == null && p.assigned_date === today) ?? null
    if (!todayPlan && program && cursor.todayPlanId) {
        todayPlan = activePlans.find((p) => p.id === cursor.todayPlanId) ?? null
    }

    const nestedPlan = program?.workout_plans?.find((p) => p.id === todayPlan?.id)
    let blocksRaw = nestedPlan?.workout_blocks ?? []
    if (todayPlan?.id && blocksRaw.length === 0) {
        const fullPlan = await getWorkoutPlanBlocksForHero(userId, todayPlan.id)
        const wb = (fullPlan as { workout_blocks?: typeof blocksRaw } | null)?.workout_blocks
        if (Array.isArray(wb) && wb.length > 0) {
            blocksRaw = wb
        }
    }
    const blocks: HeroBlock[] = blocksRaw.map((b) => ({
        id: b.id,
        sets: b.sets,
        reps: b.reps,
        exercise: { name: b.exercises?.name ?? 'Ejercicio' },
    }))

    const blockIdsToday = new Set(blocks.map((b) => b.id))
    const blockById = new Map(blocks.map((b) => [b.id, b]))
    const logsForPlanToday =
        todayPlan && blockIdsToday.size > 0
            ? logs.filter(
                  (l) =>
                      l.workout_blocks?.plan_id === todayPlan!.id &&
                      getSantiagoIsoYmdForUtcInstant(l.logged_at) === today &&
                      blockIdsToday.has(l.block_id)
              )
            : []
    const seenSetKeys = new Set<string>()
    const setsPerBlock: Record<string, number> = {}
    for (const l of logsForPlanToday) {
        const b = blockById.get(l.block_id)
        if (!b) continue
        if (l.set_number < 1 || l.set_number > b.sets) continue
        const key = `${l.block_id}:${l.set_number}`
        if (seenSetKeys.has(key)) continue
        seenSetKeys.add(key)
        setsPerBlock[l.block_id] = (setsPerBlock[l.block_id] ?? 0) + 1
    }
    const totalSetsTarget = blocks.reduce((s, b) => s + b.sets, 0)
    const totalSetsLogged = Object.values(setsPerBlock).reduce((a, b) => a + b, 0)
    const isAlreadyLogged = totalSetsTarget > 0 && totalSetsLogged >= totalSetsTarget

    // "Próximo entreno" sólo cuando hoy no toca nada (mismo criterio de siempre). El plan sale del
    // cursor (`nextPlanId`) y la etiqueta de `programDayLabel`: en weekly es el nombre largo del día
    // —con "Mañana" cuando es el ISODOW siguiente—; en ciclo, "Día N de M" (no hay "mañana": el día
    // siguiente del ciclo se desbloquea al cerrar el actual, no por calendario).
    let nextTitle: string | null = null
    let nextLabel: string | null = null
    if (!todayPlan && program && cursor.nextPlanId) {
        const next = activePlans.find((p) => p.id === cursor.nextPlanId) ?? null
        if (next) {
            nextTitle = next.title
            nextLabel =
                !isCycle && cursor.nextCycleIndex === todayDow + 1
                    ? 'Mañana'
                    : programDayLabel(cursor.nextCycleIndex, structure, cycleLength, { form: 'long' })
        }
    }

    const planTitleById = new Map(activePlans.map((p) => [p.id, p.title]))
    const cycleView: HeroCycleView = {
        mode: cursor.mode,
        programId: program?.id ?? null,
        programState: cursor.programState,
        todayState: cursor.todayState,
        todayPlanId: cursor.todayPlanId,
        todayCycleIndex: cursor.todayCycleIndex,
        todayLabel: programDayLabel(cursor.todayCycleIndex, structure, cycleLength, { form: 'long' }) || null,
        todayChipLabel: programDayLabel(cursor.todayCycleIndex, structure, cycleLength, { form: 'chip' }) || null,
        nextPlanId: cursor.nextPlanId,
        nextCycleIndex: cursor.nextCycleIndex,
        nextLabel: programDayLabel(cursor.nextCycleIndex, structure, cycleLength, { form: 'long' }) || null,
        nextChipLabel: programDayLabel(cursor.nextCycleIndex, structure, cycleLength, { form: 'chip' }) || null,
        lastCompleted: cursor.lastCompleted ?? null,
        cycleLength: isCycle ? cycleLength : null,
        slots: cursor.slots.map((s) => ({
            planId: s.planId,
            cycleIndex: s.cycleIndex,
            state: s.state,
            doneDateIso: s.doneDateIso ?? null,
            title: planTitleById.get(s.planId) ?? null,
            shortLabel: programDayLabel(s.cycleIndex, structure, cycleLength, { form: 'short' }),
            longLabel: programDayLabel(s.cycleIndex, structure, cycleLength, { form: 'long' }),
            chipLabel: programDayLabel(s.cycleIndex, structure, cycleLength, { form: 'chip' }),
        })),
    }

    const { score: workoutScore } = computeWorkoutScore30d({
        todaySantiagoIso: today,
        activePlans,
        program: program as AdherenceProgramRow | null,
        logs,
    })

    const checkInsLast30 = checkInHistory.length
    const checkInScore = Math.min(100, Math.round((checkInsLast30 / 4) * 100))

    const nutritionHasLogs = nutritionDays > 0
    // ENGAGEMENT de registro (días con log / 30) — NO es cumplimiento de comidas.
    const nutritionEngagementScore = nutritionHasLogs
        ? Math.min(100, Math.round((nutritionDays / 30) * 100))
        : 0

    // CUMPLIMIENTO real de comidas vía el motor canónico (sum done / sum aplicables).
    const nutritionComplianceScore = computeNutritionComplianceScore(nutritionAdherenceInputs)

    return {
        hero: {
            hasWorkout: !!todayPlan,
            planId: todayPlan?.id ?? null,
            planTitle: todayPlan?.title ?? null,
            blocks,
            isAlreadyLogged,
            totalSetsTarget,
            totalSetsLogged,
            baseLoggedPerBlock: setsPerBlock,
            nextWorkoutTitle: nextTitle,
            nextWorkoutDayLabel: nextLabel,
        },
        cycle: cycleView,
        scores: {
            workoutScore,
            nutritionEngagementScore,
            nutritionComplianceScore,
            checkInScore,
            nutritionHasLogs,
        },
    }
})

/**
 * Cumplimiento real de comidas en 30d con el motor canónico `computeNutritionAdherence`.
 * Devuelve `null` si el alumno no tiene plan activo (sin plan no hay adherencia que medir).
 */
function computeNutritionComplianceScore(
    inputs: Awaited<ReturnType<typeof getNutritionAdherenceInputs30d>>
): number | null {
    if (!inputs) return null
    const { plan, logs, startIso, endIso } = inputs

    const meals: AdherenceMeal[] = (plan.nutrition_meals ?? []).map((m) => ({
        ...normalizeMealForMacros(m),
        day_of_week: m.day_of_week,
    }))

    const logsByDate = new Map<string, MealLogRow[]>()
    for (const day of logs) {
        // `meal_id` nullable en LIVE: sin comida asociada no hay match posible contra el plan.
        const rows: MealLogRow[] = (day.nutrition_meal_logs ?? []).flatMap((r) =>
            r.meal_id == null
                ? []
                : [{ meal_id: r.meal_id, is_completed: !!r.is_completed, consumed_quantity: r.consumed_quantity }]
        )
        logsByDate.set(day.log_date, rows)
    }

    const liveTarget: MacroTarget = {
        calories: plan.daily_calories ?? 0,
        protein: plan.protein_g ?? 0,
        carbs: plan.carbs_g ?? 0,
        fats: plan.fats_g ?? 0,
    }

    const targetByDate = new Map<string, MacroTarget>()
    for (const day of logs) {
        if (day.target_calories_at_log != null) {
            targetByDate.set(day.log_date, {
                calories: day.target_calories_at_log ?? 0,
                protein: day.target_protein_at_log ?? 0,
                carbs: day.target_carbs_at_log ?? 0,
                fats: day.target_fats_at_log ?? 0,
            })
        }
    }

    const { summary } = computeNutritionAdherence({
        meals,
        logsByDate,
        targetByDate,
        liveTarget,
        range: { startIso, endIso },
        dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmdInSantiago,
    })

    return Math.min(100, Math.round(summary.compliancePct))
}

/**
 * ¿Esta PRENDIDO el dominio Nutricion para este alumno en el DASHBOARD? Espejo exacto del gate
 * de la pagina `/c/[coach_slug]/nutrition` (master switch `_enabled`, plan §4.8), que desde D9-A
 * NO se apaga por preferencia del coach: se mantiene el gate para que las superficies de
 * nutricion del dashboard (anillo + resumen diario) sigan compartiendo UN solo criterio y nunca
 * queden en esqueleto roto (NN/g pitfall) si el dominio se apagara por otra via.
 *
 * D9-A (owner): superficie de ALUMNO => `audience: 'student'`, o sea la preferencia del panel del
 * coach no participa y el resolver devuelve siempre `true`.
 *
 * SIN LECTURA A `clients` (auditoría de waterfall 2026-08-31). Acá había un
 * `SELECT coach_id, team_id, org_id FROM clients` para armar el scope, y su resultado NO se usaba:
 * `resolveNutritionDomainEnabled` arranca con `prefsApplyFor(audience)`, que para `'student'`
 * devuelve `false` en su primera línea (`feature-prefs.service.ts:102`), y la línea siguiente es
 * `if (!enabled) return true`. O sea: retornaba `true` sin mirar jamás `coachId`, `clientTeamId`
 * ni `clientOrgId`. Era una query cuyo resultado se descartaba entero, en el camino del dashboard
 * del alumno — la ruta con peor TTFB de la app.
 *
 * SI ALGÚN DÍA SE REVIERTE D9-A y `'student'` vuelve a participar de las preferencias, hay que
 * restaurar el scope ANTES de tocar nada más: sin esos tres campos el resolver no puede decidir.
 * No la reintroduzcas "por las dudas" mientras `prefsApplyFor` siga cortando en `student`.
 */
export const getDashboardNutritionDomainEnabled = cache(async (userId: string): Promise<boolean> => {
    return resolveNutritionDomainEnabled({
        coachId: '',
        clientId: userId,
        audience: 'student',
    })
})
