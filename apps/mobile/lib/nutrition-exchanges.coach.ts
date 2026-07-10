import { supabase } from './supabase'
import { apiFetch } from './api'
import type {
  ComposedGroupPart,
  DayVariant,
  ExchangeFoodEquivalence,
  ExchangeGroup,
  NutritionPlanMode,
} from '@eva/nutrition-engine'

/**
 * Capa de datos del modo intercambios ("Nutrición Pro" por-alumno, módulo
 * `nutrition_exchanges`) para el BUILDER DEL COACH (mobile).
 *
 * MONEY-SAFETY (regla innegociable): toda MUTACIÓN va por los endpoints
 * `/api/mobile/nutrition/exchanges/*`, que corren `assertModule` server-side ANTES de
 * escribir (evasión de cobro cerrada — la RLS de las tablas de módulo NO chequea
 * `enabled_modules`). Las LECTURAS son del propio catálogo/plan del coach vía PostgREST
 * (RLS coach-scoped: `xg_select` / `met_coach_all` / `npdv_coach_all`), mismo patrón que
 * `nutrition-builder.ts`. El fetch SOLO ocurre con el módulo ON (gate `hasModule` en la UI):
 * sin módulo ⇒ CERO fetch, CERO render.
 *
 * El cálculo derivado (macros por comida, totales, chips) NO se duplica: usa el motor puro
 * compartido `@eva/nutrition-engine` (exchange-calc), la misma fuente de verdad que el
 * builder web y el endpoint del alumno.
 */

export type { ExchangeGroup, DayVariant, ExchangeFoodEquivalence, NutritionPlanMode }

/** Target de porciones prescrito para un grupo en una comida (draft de UI). */
export interface ExchangeTargetDraft {
  exchangeGroupId: string
  portions: number
}

export interface PlanExchangeEditorData {
  planMode: NutritionPlanMode
  targetsByMealId: Record<string, ExchangeTargetDraft[]>
  variants: DayVariant[]
  variantByMealId: Record<string, string | null>
}

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function parseComposedOf(raw: unknown): ComposedGroupPart[] | null {
  if (!Array.isArray(raw)) return null
  const parts: ComposedGroupPart[] = []
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof (item as { code?: unknown }).code === 'string' &&
      typeof (item as { portions?: unknown }).portions === 'number'
    ) {
      parts.push({ code: (item as { code: string }).code, portions: (item as { portions: number }).portions })
    }
  }
  return parts.length > 0 ? parts : null
}

function mapGroupRow(r: any): ExchangeGroup {
  return {
    id: r.id,
    slug: r.slug,
    code: r.code,
    name: r.name,
    coachId: r.coach_id ?? null,
    teamId: r.team_id ?? null,
    isSystem: !!r.is_system,
    refCalories: Number(r.ref_calories) || 0,
    refProteinG: Number(r.ref_protein_g) || 0,
    refCarbsG: Number(r.ref_carbs_g) || 0,
    refFatsG: Number(r.ref_fats_g) || 0,
    color: r.color ?? null,
    sortOrder: Number(r.sort_order) || 0,
    composedOf: parseComposedOf(r.composed_of),
    macrosConfirmed: !!r.macros_confirmed,
  }
}

const GROUP_COLUMNS =
  'id, slug, code, name, coach_id, team_id, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, color, sort_order, composed_of, macros_confirmed'

/**
 * Catálogo de grupos visible para el coach (standalone v1): system + propios. Espejo de
 * `findExchangeGroupsForScope` con `teamId null` (mismo scope que el gate de los endpoints).
 */
export async function fetchCoachExchangeGroups(): Promise<ExchangeGroup[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  const { data } = await supabase
    .from('exchange_groups')
    .select(GROUP_COLUMNS)
    .or(`is_system.eq.true,coach_id.eq.${coachId}`)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })
  return ((data as any[]) ?? []).map(mapGroupRow)
}

/**
 * Datos del editor de intercambios de un plan: modo, targets por comida, variantes y la
 * variante asignada a cada comida. Espejo de `getPlanExchangeEditorData` (web).
 */
export async function fetchPlanExchangeEditorData(planId: string): Promise<PlanExchangeEditorData> {
  const { data: planRow } = await supabase
    .from('nutrition_plans')
    .select('plan_mode')
    .eq('id', planId)
    .maybeSingle()
  const planMode = (((planRow as { plan_mode?: string | null } | null)?.plan_mode ?? 'grams') === 'exchanges'
    ? 'exchanges'
    : 'grams') as NutritionPlanMode

  const { data: mealRows } = await supabase
    .from('nutrition_meals')
    .select('id, day_variant_id')
    .eq('plan_id', planId)
  const mealIds = ((mealRows as any[]) ?? []).map((m) => m.id as string)

  const [{ data: targetRows }, { data: variantRows }] = await Promise.all([
    mealIds.length
      ? supabase
          .from('meal_exchange_targets')
          .select('meal_id, exchange_group_id, portions')
          .in('meal_id', mealIds)
      : Promise.resolve({ data: [] as any[] } as any),
    supabase
      .from('nutrition_plan_day_variants')
      .select('id, plan_id, name, sort_order')
      .eq('plan_id', planId)
      .order('sort_order', { ascending: true }),
  ])

  const targetsByMealId: Record<string, ExchangeTargetDraft[]> = {}
  for (const t of ((targetRows as any[]) ?? [])) {
    const mealId = t.meal_id as string
    ;(targetsByMealId[mealId] ??= []).push({
      exchangeGroupId: t.exchange_group_id as string,
      portions: Number(t.portions) || 0,
    })
  }

  const variantByMealId: Record<string, string | null> = {}
  for (const m of ((mealRows as any[]) ?? [])) {
    variantByMealId[m.id as string] = (m.day_variant_id as string | null) ?? null
  }

  const variants: DayVariant[] = ((variantRows as any[]) ?? []).map((v) => ({
    id: v.id as string,
    planId: v.plan_id as string,
    name: v.name as string,
    sortOrder: Number(v.sort_order) || 0,
  }))

  return { planMode, targetsByMealId, variants, variantByMealId }
}

/** Equivalencias alimento→porción de un conjunto de grupos (para el PDF de equivalencias). */
export async function fetchExchangeEquivalences(groupIds: string[]): Promise<ExchangeFoodEquivalence[]> {
  const ids = [...new Set(groupIds)].filter(Boolean)
  if (ids.length === 0) return []
  const { data } = await supabase
    .from('foods')
    .select('id, name, exchange_group_id, exchange_portion_grams, exchange_portion_label')
    .in('exchange_group_id', ids)
    .order('name', { ascending: true })
  return ((data as any[]) ?? [])
    .filter((f) => f.exchange_group_id != null)
    .map((f) => ({
      foodId: f.id as string,
      name: (f.name as string) ?? 'Alimento',
      exchangeGroupId: f.exchange_group_id as string,
      portionGrams: f.exchange_portion_grams != null ? Number(f.exchange_portion_grams) : null,
      portionLabel: (f.exchange_portion_label as string | null) ?? null,
    }))
}

// ─── Mutaciones (SIEMPRE por endpoint — assertModule server-side) ───────────────

type MutResult = { ok: boolean; error?: string }

async function post<T = unknown>(path: string, body: unknown, method: 'POST' | 'DELETE' = 'POST'): Promise<MutResult & { data?: T }> {
  try {
    const data = await apiFetch<T>(path, { method, authenticated: true, body })
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo completar la solicitud.' }
  }
}

/** Cambia el modo del plan (gramos ↔ porciones). */
export function setPlanExchangeMode(planId: string, mode: NutritionPlanMode): Promise<MutResult> {
  return post('/api/mobile/nutrition/exchanges/set-mode', { planId, mode })
}

/** Reemplaza (delete + insert) los targets de porciones de UNA comida. */
export function saveMealExchangeTargets(mealId: string, targets: ExchangeTargetDraft[]): Promise<MutResult> {
  const live = targets.filter((t) => t.portions > 0).map((t) => ({ exchangeGroupId: t.exchangeGroupId, portions: t.portions }))
  return post('/api/mobile/nutrition/exchanges/targets', { mealId, targets: live })
}

/** Crea una variante de día (máx 6, sin repetir nombre — validado server-side). */
export async function createPlanDayVariant(planId: string, name: string): Promise<MutResult & { variant?: DayVariant }> {
  const res = await post<{ ok: boolean; variant?: DayVariant }>('/api/mobile/nutrition/exchanges/variants', { planId, name })
  return { ok: res.ok, error: res.error, variant: res.data?.variant }
}

/** Elimina una variante (las comidas asignadas quedan day_variant_id NULL). */
export function deletePlanDayVariant(variantId: string): Promise<MutResult> {
  return post('/api/mobile/nutrition/exchanges/variants', { variantId }, 'DELETE')
}

/** Asigna (o limpia con null) la variante de día de una comida. */
export function assignMealDayVariant(mealId: string, variantId: string | null): Promise<MutResult> {
  return post('/api/mobile/nutrition/exchanges/meal-variant', { mealId, variantId })
}
