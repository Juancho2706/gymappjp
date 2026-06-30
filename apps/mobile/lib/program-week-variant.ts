// Port 1:1 de la web (lib/workout/programWeekVariant + profileProgramStructureUtils.filterPlansForStructureView).
// A-F2: el detalle del alumno (PlanTab) debe resolver la variante AB/cíclica activa,
// no renderizar workout_plans crudo (mostraba días duplicados/incorrectos en programas A/B).

export type WeekVariantLetter = 'A' | 'B'

export function programWeekIndex1Based(
  program: { start_date?: string | null; weeks_to_repeat?: number | null } | null | undefined,
  now: Date = new Date()
): number | null {
  if (!program?.start_date) return null
  const start = new Date(program.start_date)
  const totalWeeks = Math.max(1, Number(program.weeks_to_repeat) || 1)
  const diffMs = now.getTime() - start.getTime()
  // Programa aún no empieza (start futuro): semana 1, sin progresión (paridad con web).
  if (diffMs < 0) return 1
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  let currentWeek = Math.min(totalWeeks, Math.ceil(diffDays / 7))
  if (currentWeek < 1) currentWeek = 1
  return currentWeek
}

export function weekIndexToVariantLetter(weekIndex1Based: number): WeekVariantLetter {
  return weekIndex1Based % 2 === 1 ? 'A' : 'B'
}

export function resolveActiveWeekVariantForDisplay(
  program: { ab_mode?: boolean | null; start_date?: string | null; weeks_to_repeat?: number | null } | null | undefined,
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
 * variante no tiene NINGÚN plan y la otra sí, cae a la otra. Corrige el dead-end de un programa A/B
 * mal armado (ab_mode=true pero una sola semana cargada → "Programa sin días" en semanas "B").
 * Port 1:1 de la web (programWeekVariant.effectiveWeekVariantFromPlans).
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

/** Filtra+ordena los planes a mostrar según estructura (weekly recorta a días 1–7). */
export function filterPlansForStructureView<T extends { week_variant?: string | null; day_of_week?: number | null }>(
  plans: T[] | null | undefined,
  structureType: 'weekly' | 'cycle' | null | undefined,
  ctx?: { abMode?: boolean; activeVariant?: WeekVariantLetter }
): T[] {
  const raw = plans || []
  const ab = ctx?.abMode ?? false
  // Variante EFECTIVA: cae a la que tenga planes si la del ciclo está vacía (A/B mal armado).
  const v = effectiveWeekVariantFromPlans(raw, ctx?.activeVariant ?? 'A', ab)
  const filtered = raw.filter((p) => workoutPlanMatchesVariant(p, v, ab))
  const sorted = [...filtered].sort((a, b) => (Number(a?.day_of_week) || 0) - (Number(b?.day_of_week) || 0))
  if (structureType === 'cycle') return sorted
  return sorted.filter((p) => {
    const d = Number(p?.day_of_week)
    return d >= 1 && d <= 7
  })
}
