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
    const diffTime = Math.abs(today.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
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
