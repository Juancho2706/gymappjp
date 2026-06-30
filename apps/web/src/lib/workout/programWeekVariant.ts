export type WeekVariantLetter = 'A' | 'B'

/**
 * Índice de semana dentro del programa (1-based), misma fórmula que `getClientProfileData` / compliance.
 * Requiere `start_date`; si falta, devuelve null.
 */
export function programWeekIndex1Based(
    program: { start_date?: string | null; weeks_to_repeat?: number | null } | null | undefined,
    now: Date = new Date()
): number | null {
    if (!program?.start_date) return null
    const today = now
    const start = new Date(program.start_date)
    const totalWeeks = Math.max(1, Number(program.weeks_to_repeat) || 1)
    const diffMs = today.getTime() - start.getTime()
    // Programa aún no empieza (start futuro): semana 1, sin progresión. Antes Math.abs contaba los
    // días HASTA el inicio como semanas transcurridas → inflaba el peso objetivo antes de arrancar.
    if (diffMs < 0) return 1
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    let currentWeek = Math.min(totalWeeks, Math.ceil(diffDays / 7))
    if (currentWeek < 1) currentWeek = 1
    return currentWeek
}

/** Semana 1,3,5… → A; 2,4,6… → B. */
export function weekIndexToVariantLetter(weekIndex1Based: number): WeekVariantLetter {
    return weekIndex1Based % 2 === 1 ? 'A' : 'B'
}

/**
 * Variante de microciclo que toca “ahora” en programas A/B.
 * Prioriza `planCurrentWeek` del compliance (perfil coach) para alinear con métricas; si no, calcula desde `start_date`.
 */
export function resolveActiveWeekVariantForDisplay(
    program:
        | { ab_mode?: boolean | null; start_date?: string | null; weeks_to_repeat?: number | null }
        | null
        | undefined,
    planCurrentWeekFromCompliance?: number | null,
    now: Date = new Date()
): WeekVariantLetter {
    if (!program?.ab_mode) return 'A'
    const wk =
        planCurrentWeekFromCompliance != null && planCurrentWeekFromCompliance > 0
            ? Math.max(1, Math.floor(planCurrentWeekFromCompliance))
            : programWeekIndex1Based(program, now)
    if (wk == null) return 'A'
    return weekIndexToVariantLetter(wk)
}

/**
 * - Sin A/B: solo planes con variante A (o sin variante), para no mezclar plantillas B sueltas.
 * - Con A/B: solo la variante activa del ciclo.
 */
export function workoutPlanMatchesVariant(
    plan: { week_variant?: string | null } | null | undefined,
    activeVariant: WeekVariantLetter,
    abMode: boolean
): boolean {
    const pVar = String(plan?.week_variant || 'A') as WeekVariantLetter
    if (!abMode) return pVar === 'A'
    return pVar === activeVariant
}

/**
 * Dada la variante que toca por CICLO, devuelve la EFECTIVA contra los planes existentes: si esa
 * variante no tiene NINGÚN plan y la otra sí, cae a la otra. Es el corazón del fix del dead-end de
 * A/B mal armado (programa con `ab_mode=true` pero una sola semana cargada). Sin A/B → la del ciclo.
 * Si ninguna variante tiene planes, devuelve la del ciclo (empty legítimo: el coach no cargó nada).
 */
export function effectiveWeekVariantFromPlans(
    plans: ReadonlyArray<{ week_variant?: string | null }>,
    cycleVariant: WeekVariantLetter,
    abMode: boolean
): WeekVariantLetter {
    if (!abMode) return cycleVariant
    if (plans.some((p) => workoutPlanMatchesVariant(p, cycleVariant, true))) return cycleVariant
    const other: WeekVariantLetter = cycleVariant === 'A' ? 'B' : 'A'
    return plans.some((p) => workoutPlanMatchesVariant(p, other, true)) ? other : cycleVariant
}

/**
 * Variante EFECTIVA a renderizar para el alumno. Igual a `resolveActiveWeekVariantForDisplay`
 * SALVO el caso degenerado de un programa A/B mal armado: si la variante que toca por ciclo no
 * tiene NINGÚN plan y la otra sí, cae a la que tiene planes. Así un programa con `ab_mode=true`
 * pero una sola semana cargada (solo A) no deja al alumno con el programa vacío en las semanas "B"
 * (era un dead-end silencioso: el dashboard no mostraba ninguna card y no había cómo llegar al
 * entreno).
 *
 * `plans` deben ser los planes del programa activo (los del `program_id` en cuestión). Para A/B
 * BIEN armado (ambas variantes presentes) devuelve EXACTAMENTE la variante del ciclo → cero cambio
 * de comportamiento; solo corrige el caso vacío.
 */
export function resolveEffectiveWeekVariant(
    program:
        | { ab_mode?: boolean | null; start_date?: string | null; weeks_to_repeat?: number | null }
        | null
        | undefined,
    plans: ReadonlyArray<{ week_variant?: string | null }>,
    planCurrentWeekFromCompliance?: number | null,
    now: Date = new Date()
): WeekVariantLetter {
    const active = resolveActiveWeekVariantForDisplay(program, planCurrentWeekFromCompliance, now)
    if (!program?.ab_mode) return active
    return effectiveWeekVariantFromPlans(plans, active, true)
}
