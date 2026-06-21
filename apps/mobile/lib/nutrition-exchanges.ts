import { supabase } from './supabase'

/**
 * Modulo `nutrition_exchanges` (Nutricion Pro) — lado ALUMNO (mobile).
 *
 * Espejo de:
 *  - apps/web/src/domain/nutrition/exchange.types.ts (tipos puros)
 *  - apps/web/src/services/nutrition-exchanges/exchange-calc.ts (calculo PURO)
 *  - apps/web/src/services/nutrition-exchanges/nutrition-exchanges.service.ts#getStudentExchangeBundle
 *  - apps/web/src/infrastructure/db/exchanges.repository.ts (shapes/columnas)
 *
 * ── Anti-drift ──────────────────────────────────────────────────────────────────
 * @eva/calc / services / domain NO resuelven desde mobile. La logica PURA de calculo de
 * porciones (macrosForTargets, expandComposedGroups, exchangeGroupColor, formatPortions,
 * portionsSummaryLabel) se espeja INLINE verbatim. Si cambia el calculo en la web, actualizar.
 *
 * ── Diferencia clave vs web ──────────────────────────────────────────────────────
 * La web usa service-role para leer exchange_groups (xg_select no da policy al alumno) +
 * doble-filtro de tenant. Mobile NO tiene service-role: lee con la sesion del alumno (RLS = techo).
 * Si la RLS del alumno no expone los grupos del plan, el bundle degrada a `enabled:false` (la
 * vista cae byte-identical a gramos, AC5). Es fail-closed seguro: nunca muestra de mas.
 */

// ── Tipos espejo de domain/nutrition/exchange.types.ts ───────────────────────

export interface ComposedGroupPart {
  code: string
  portions: number
}

export interface ExchangeGroup {
  id: string
  slug: string
  code: string
  name: string
  coachId: string | null
  teamId: string | null
  isSystem: boolean
  refCalories: number
  refProteinG: number
  refCarbsG: number
  refFatsG: number
  color: string | null
  sortOrder: number
  composedOf: ComposedGroupPart[] | null
  macrosConfirmed: boolean
}

export interface MealExchangeTarget {
  id?: string
  mealId: string
  exchangeGroupId: string
  portions: number
  notes?: string | null
}

export interface DayVariant {
  id: string
  planId: string
  name: string
  sortOrder: number
}

export interface ExchangeFoodEquivalence {
  foodId: string
  name: string
  exchangeGroupId: string
  portionGrams: number | null
  portionLabel: string | null
}

export interface ExchangeMacroTotals {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
}

export type NutritionPlanMode = 'grams' | 'exchanges'

export type StudentExchangeBundle = {
  enabled: boolean
  planMode: NutritionPlanMode
  groups: ExchangeGroup[]
  targetsByMealId: Record<string, MealExchangeTarget[]>
  variants: DayVariant[]
  variantByMealId: Record<string, string | null>
  equivalences: ExchangeFoodEquivalence[]
}

export const EMPTY_EXCHANGE_BUNDLE: StudentExchangeBundle = {
  enabled: false,
  planMode: 'grams',
  groups: [],
  targetsByMealId: {},
  variants: [],
  variantByMealId: {},
  equivalences: [],
}

// ── Calculo PURO (espejo verbatim de exchange-calc.ts) ───────────────────────

const ZERO: ExchangeMacroTotals = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }
const round1 = (n: number) => Math.round(n * 10) / 10

function roundTotals(t: ExchangeMacroTotals): ExchangeMacroTotals {
  return {
    calories: round1(t.calories),
    proteinG: round1(t.proteinG),
    carbsG: round1(t.carbsG),
    fatsG: round1(t.fatsG),
  }
}

function byId(groups: ExchangeGroup[]): Map<string, ExchangeGroup> {
  return new Map(groups.map((g) => [g.id, g]))
}

function findByCode(groups: ExchangeGroup[], code: string): ExchangeGroup | undefined {
  const candidates = groups.filter((g) => g.code === code)
  return candidates.find((g) => g.isSystem) ?? candidates[0]
}

type TargetLike = { exchangeGroupId: string; portions: number }

type EffectiveTarget = { group: ExchangeGroup; portions: number; sourceGroup: ExchangeGroup }

export function expandComposedGroups(targets: TargetLike[], groups: ExchangeGroup[]): EffectiveTarget[] {
  const map = byId(groups)
  const out: EffectiveTarget[] = []
  for (const t of targets) {
    const group = map.get(t.exchangeGroupId)
    if (!group || !(t.portions > 0)) continue
    const parts = (group.composedOf ?? []) as ComposedGroupPart[]
    if (parts.length === 0) {
      out.push({ group, portions: t.portions, sourceGroup: group })
      continue
    }
    const resolved = parts.map((p) => ({ part: p, base: findByCode(groups, p.code) }))
    if (resolved.some((r) => !r.base)) {
      out.push({ group, portions: t.portions, sourceGroup: group })
      continue
    }
    for (const { part, base } of resolved) {
      out.push({ group: base!, portions: round1(part.portions * t.portions), sourceGroup: group })
    }
  }
  return out
}

/** Macros derivados de una lista de targets (con expansion de compuestos). */
export function macrosForTargets(targets: TargetLike[], groups: ExchangeGroup[]): ExchangeMacroTotals {
  const expanded = expandComposedGroups(targets, groups)
  const acc = expanded.reduce<ExchangeMacroTotals>(
    (sum, { group, portions }) => ({
      calories: sum.calories + group.refCalories * portions,
      proteinG: sum.proteinG + group.refProteinG * portions,
      carbsG: sum.carbsG + group.refCarbsG * portions,
      fatsG: sum.fatsG + group.refFatsG * portions,
    }),
    { ...ZERO }
  )
  return roundTotals(acc)
}

export function formatPortions(portions: number): string {
  const r = round1(portions)
  return Number.isInteger(r) ? String(r) : String(r)
}

/** Paleta fallback para grupos sin color (deterministica por sortOrder). */
export const EXCHANGE_FALLBACK_COLORS = [
  '#F59E0B',
  '#3B82F6',
  '#EF4444',
  '#22C55E',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
] as const

export function exchangeGroupColor(group: Pick<ExchangeGroup, 'color' | 'sortOrder'>): string {
  if (group.color && /^#[0-9a-fA-F]{6}$/.test(group.color)) return group.color
  const idx = Math.abs(Math.trunc(group.sortOrder)) % EXCHANGE_FALLBACK_COLORS.length
  return EXCHANGE_FALLBACK_COLORS[idx]
}

// ── Mappers de filas DB (espejo de exchanges.repository.ts) ──────────────────

function parseComposedOf(value: unknown): ComposedGroupPart[] | null {
  if (!Array.isArray(value)) return null
  const parts: ComposedGroupPart[] = []
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof (item as any).code === 'string' &&
      typeof (item as any).portions === 'number'
    ) {
      parts.push({ code: (item as any).code, portions: (item as any).portions })
    }
  }
  return parts.length > 0 ? parts : null
}

function mapGroup(r: any): ExchangeGroup {
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
    sortOrder: r.sort_order ?? 0,
    composedOf: parseComposedOf(r.composed_of),
    macrosConfirmed: !!r.macros_confirmed,
  }
}

const GROUP_COLUMNS =
  'id, slug, code, name, coach_id, team_id, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, color, sort_order, composed_of, macros_confirmed'

/** Doble verificacion PURA del tenant (defensa en profundidad, espejo de groupMatchesTenant). */
function groupMatchesTenant(
  group: Pick<ExchangeGroup, 'isSystem' | 'coachId' | 'teamId'>,
  tenant: { planCoachId: string | null }
): boolean {
  if (group.isSystem) return true
  if (group.coachId && tenant.planCoachId && group.coachId === tenant.planCoachId) return true
  return false
}

/**
 * Bundle del ALUMNO (mobile). Lee todo con la sesion del alumno (RLS = techo). Si el plan no esta
 * en modo 'exchanges' o falla cualquier lectura, devuelve el bundle vacio (vista = gramos, AC5).
 *
 * @param nutritionProEnabled entitlement YA resuelto (resolveStudentNutritionPrefs) — fail-closed.
 */
export async function getStudentExchangeBundle(input: {
  planId: string
  planCoachId: string | null
  planMode: string | null | undefined
  nutritionProEnabled: boolean
}): Promise<StudentExchangeBundle> {
  if (input.planMode !== 'exchanges' || !input.nutritionProEnabled) return EMPTY_EXCHANGE_BUNDLE

  try {
    // Asignaciones de variante por comida + targets.
    const { data: mealsData } = await supabase
      .from('nutrition_meals')
      .select('id, day_variant_id')
      .eq('plan_id', input.planId)
    const assignments = ((mealsData ?? []) as any[]).map((m) => ({
      mealId: m.id as string,
      dayVariantId: (m.day_variant_id ?? null) as string | null,
    }))
    const mealIds = assignments.map((a) => a.mealId)
    if (mealIds.length === 0) return EMPTY_EXCHANGE_BUNDLE

    const [targetsRes, variantsRes] = await Promise.all([
      supabase
        .from('meal_exchange_targets')
        .select('id, meal_id, exchange_group_id, portions, notes')
        .in('meal_id', mealIds),
      supabase
        .from('nutrition_plan_day_variants')
        .select('id, plan_id, name, sort_order, created_at')
        .eq('plan_id', input.planId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    const targets: MealExchangeTarget[] = ((targetsRes.data ?? []) as any[]).map((r) => ({
      id: r.id,
      mealId: r.meal_id,
      exchangeGroupId: r.exchange_group_id,
      portions: Number(r.portions) || 0,
      notes: r.notes ?? null,
    }))
    if (targets.length === 0) return EMPTY_EXCHANGE_BUNDLE

    const variants: DayVariant[] = ((variantsRes.data ?? []) as any[]).map((r) => ({
      id: r.id,
      planId: r.plan_id,
      name: r.name,
      sortOrder: r.sort_order ?? 0,
    }))

    const groupIds = [...new Set(targets.map((t) => t.exchangeGroupId))]
    const { data: groupsData } = await supabase
      .from('exchange_groups')
      .select(GROUP_COLUMNS)
      .in('id', groupIds)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })

    const tenant = { planCoachId: input.planCoachId }
    const groups = ((groupsData ?? []) as any[]).map(mapGroup).filter((g) => groupMatchesTenant(g, tenant))
    // Si la RLS del alumno no expone ningun grupo del plan, degradar a vista de gramos.
    if (groups.length === 0) return EMPTY_EXCHANGE_BUNDLE
    const allowedGroupIds = new Set(groups.map((g) => g.id))

    const targetsByMealId: Record<string, MealExchangeTarget[]> = {}
    for (const t of targets) {
      if (!allowedGroupIds.has(t.exchangeGroupId)) continue
      ;(targetsByMealId[t.mealId] ??= []).push(t)
    }
    const variantByMealId: Record<string, string | null> = {}
    for (const a of assignments) variantByMealId[a.mealId] = a.dayVariantId

    const { data: foodsData } = await supabase
      .from('foods')
      .select('id, name, exchange_group_id, exchange_portion_grams, exchange_portion_label')
      .in('exchange_group_id', [...allowedGroupIds])
      .order('name', { ascending: true })

    const equivalences: ExchangeFoodEquivalence[] = ((foodsData ?? []) as any[])
      .filter((f) => f.exchange_group_id != null)
      .map((f) => ({
        foodId: f.id,
        name: f.name,
        exchangeGroupId: f.exchange_group_id,
        portionGrams: f.exchange_portion_grams != null ? Number(f.exchange_portion_grams) : null,
        portionLabel: f.exchange_portion_label ?? null,
      }))

    return {
      enabled: true,
      planMode: 'exchanges',
      groups,
      targetsByMealId,
      variants,
      variantByMealId,
      equivalences,
    }
  } catch {
    return EMPTY_EXCHANGE_BUNDLE
  }
}
