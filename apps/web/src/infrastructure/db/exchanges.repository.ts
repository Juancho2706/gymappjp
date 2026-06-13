import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import type {
    ComposedGroupPart,
    DayVariant,
    ExchangeFoodEquivalence,
    ExchangeGroup,
    MealExchangeTarget,
    NutritionPlanMode,
} from '@/domain/nutrition/exchange.types'

/**
 * Repository del módulo `nutrition_exchanges` (tablas: exchange_groups,
 * meal_exchange_targets, nutrition_plan_day_variants + columnas exchange_* de foods).
 * NUEVO archivo (no toca nutrition.repository.ts). RLS es el TECHO: el cliente
 * user-scoped solo sub-filtra. `findExchangeGroupsByIdsForTenant` recibe el cliente
 * service-role YA acotado por el caller (patrón F5 de movida-areas).
 *
 * Frontera con `food_swap_groups` (PLAN §Frontera): swap_group = equivalencia VISUAL del
 * modo gramos (food_ids[]); exchange_group = unidad de PORCIÓN con macros de referencia.
 * Sin FK entre ambas; NO consolidar acá (fase contract futura).
 */

type DB = SupabaseClient<Database>
type Tables = Database['public']['Tables']

export type ExchangeGroupRow = Tables['exchange_groups']['Row']
export type MealExchangeTargetRow = Tables['meal_exchange_targets']['Row']
export type DayVariantRow = Tables['nutrition_plan_day_variants']['Row']

const GROUP_COLUMNS =
    'id, slug, code, name, coach_id, team_id, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, color, sort_order, composed_of, macros_confirmed'

function parseComposedOf(value: Json | null): ComposedGroupPart[] | null {
    if (!Array.isArray(value)) return null
    const parts: ComposedGroupPart[] = []
    for (const item of value) {
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

export function mapExchangeGroupRow(row: Pick<ExchangeGroupRow, never> & Record<string, unknown>): ExchangeGroup {
    const r = row as ExchangeGroupRow
    return {
        id: r.id,
        slug: r.slug,
        code: r.code,
        name: r.name,
        coachId: r.coach_id,
        teamId: r.team_id,
        isSystem: r.is_system,
        refCalories: Number(r.ref_calories) || 0,
        refProteinG: Number(r.ref_protein_g) || 0,
        refCarbsG: Number(r.ref_carbs_g) || 0,
        refFatsG: Number(r.ref_fats_g) || 0,
        color: r.color,
        sortOrder: r.sort_order,
        composedOf: parseComposedOf(r.composed_of),
        macrosConfirmed: r.macros_confirmed,
    }
}

export function mapTargetRow(r: MealExchangeTargetRow): MealExchangeTarget {
    return {
        id: r.id,
        mealId: r.meal_id,
        exchangeGroupId: r.exchange_group_id,
        portions: Number(r.portions) || 0,
        notes: r.notes,
    }
}

export function mapDayVariantRow(r: DayVariantRow): DayVariant {
    return { id: r.id, planId: r.plan_id, name: r.name, sortOrder: r.sort_order }
}

/**
 * Catálogo visible para el COACH según scope 3-vías: system + propios (+ team activo).
 * RLS (xg_select) ya impone el techo; el or() elige el workspace.
 */
export async function findExchangeGroupsForScope(
    db: DB,
    coachId: string,
    scope: { orgId: string | null; activeTeamId: string | null }
): Promise<ExchangeGroup[]> {
    const filters = ['is_system.eq.true', `coach_id.eq.${coachId}`]
    if (scope.activeTeamId) filters.push(`team_id.eq.${scope.activeTeamId}`)
    const { data } = await db
        .from('exchange_groups')
        .select(GROUP_COLUMNS)
        .or(filters.join(','))
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('code', { ascending: true })
    return (data ?? []).map(mapExchangeGroupRow)
}

/**
 * Grupos REFERENCIADOS por el plan del alumno, con `serviceDb` (service-role) y DOBLE
 * acotamiento (data minimization, patrón F5 áreas): SOLO los ids ya presentes en el plan
 * + SOLO grupos del tenant del plan (system / coach del plan / team del alumno).
 */
export async function findExchangeGroupsByIdsForTenant(
    serviceDb: DB,
    ids: string[],
    tenant: { planCoachId: string | null; clientTeamId: string | null }
): Promise<ExchangeGroup[]> {
    if (ids.length === 0) return []
    const filters = ['is_system.eq.true']
    if (tenant.planCoachId) filters.push(`coach_id.eq.${tenant.planCoachId}`)
    if (tenant.clientTeamId) filters.push(`team_id.eq.${tenant.clientTeamId}`)
    const { data } = await serviceDb
        .from('exchange_groups')
        .select(GROUP_COLUMNS)
        .in('id', ids)
        .or(filters.join(','))
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
    return (data ?? []).map(mapExchangeGroupRow)
}

export async function findMealExchangeTargetsByMealIds(
    db: DB,
    mealIds: string[]
): Promise<MealExchangeTarget[]> {
    if (mealIds.length === 0) return []
    const { data } = await db
        .from('meal_exchange_targets')
        .select('id, meal_id, exchange_group_id, portions, notes')
        .in('meal_id', mealIds)
    return ((data ?? []) as MealExchangeTargetRow[]).map(mapTargetRow)
}

/**
 * Reemplaza los targets de UNA comida (delete + insert; sin filas dependientes).
 * RLS (met_coach_all / team_met_member_all) es el techo de escritura.
 */
export async function replaceMealExchangeTargets(
    db: DB,
    mealId: string,
    targets: { exchangeGroupId: string; portions: number; notes?: string | null }[]
): Promise<{ error?: string }> {
    const { error: delError } = await db.from('meal_exchange_targets').delete().eq('meal_id', mealId)
    if (delError) return { error: delError.message }
    if (targets.length === 0) return {}
    const { error: insError } = await db.from('meal_exchange_targets').insert(
        targets.map((t) => ({
            meal_id: mealId,
            exchange_group_id: t.exchangeGroupId,
            portions: t.portions,
            notes: t.notes ?? null,
        }))
    )
    return insError ? { error: insError.message } : {}
}

export async function setPlanMode(
    db: DB,
    planId: string,
    mode: NutritionPlanMode
): Promise<{ error?: string }> {
    const { error } = await db.from('nutrition_plans').update({ plan_mode: mode }).eq('id', planId)
    return error ? { error: error.message } : {}
}

/** Awareness del pool: quién tocó la pauta por última vez (EditedByBadge). */
export async function setPlanLastEditedBy(db: DB, planId: string, coachId: string): Promise<void> {
    await db.from('nutrition_plans').update({ last_edited_by_coach_id: coachId }).eq('id', planId)
}

/** Contexto del RECURSO para gating (pool manda): plan + tenant del alumno. */
export async function findPlanModuleContext(
    db: DB,
    planId: string
): Promise<{
    planId: string
    coachId: string | null
    clientId: string | null
    planMode: NutritionPlanMode
    clientTeamId: string | null
    clientOrgId: string | null
} | null> {
    const { data } = await db
        .from('nutrition_plans')
        .select('id, coach_id, client_id, plan_mode, clients ( team_id, org_id )')
        .eq('id', planId)
        .maybeSingle()
    if (!data) return null
    const client = (data.clients ?? null) as { team_id: string | null; org_id: string | null } | null
    return {
        planId: data.id,
        coachId: data.coach_id,
        clientId: data.client_id,
        planMode: (data.plan_mode === 'exchanges' ? 'exchanges' : 'grams') as NutritionPlanMode,
        clientTeamId: client?.team_id ?? null,
        clientOrgId: client?.org_id ?? null,
    }
}

/** Plan de una comida (para resolver contexto desde mealId). */
export async function findMealPlanId(db: DB, mealId: string): Promise<string | null> {
    const { data } = await db.from('nutrition_meals').select('id, plan_id').eq('id', mealId).maybeSingle()
    return data?.plan_id ?? null
}

export async function findDayVariantsByPlan(db: DB, planId: string): Promise<DayVariant[]> {
    const { data } = await db
        .from('nutrition_plan_day_variants')
        .select('id, plan_id, name, sort_order, created_at')
        .eq('plan_id', planId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    return ((data ?? []) as DayVariantRow[]).map(mapDayVariantRow)
}

export async function insertDayVariant(
    db: DB,
    planId: string,
    name: string,
    sortOrder: number
): Promise<{ variant?: DayVariant; error?: string }> {
    const { data, error } = await db
        .from('nutrition_plan_day_variants')
        .insert({ plan_id: planId, name, sort_order: sortOrder })
        .select('id, plan_id, name, sort_order, created_at')
        .single()
    if (error || !data) return { error: error?.message ?? 'No se pudo crear la variante.' }
    return { variant: mapDayVariantRow(data as DayVariantRow) }
}

export async function renameDayVariant(db: DB, variantId: string, name: string): Promise<{ error?: string }> {
    const { error } = await db.from('nutrition_plan_day_variants').update({ name }).eq('id', variantId)
    return error ? { error: error.message } : {}
}

/** Delete ⇒ `nutrition_meals.day_variant_id` queda NULL (ON DELETE SET NULL). */
export async function deleteDayVariant(db: DB, variantId: string): Promise<{ error?: string }> {
    const { error } = await db.from('nutrition_plan_day_variants').delete().eq('id', variantId)
    return error ? { error: error.message } : {}
}

export async function findDayVariantPlanId(db: DB, variantId: string): Promise<string | null> {
    const { data } = await db
        .from('nutrition_plan_day_variants')
        .select('id, plan_id')
        .eq('id', variantId)
        .maybeSingle()
    return data?.plan_id ?? null
}

export async function setMealDayVariant(
    db: DB,
    mealId: string,
    variantId: string | null
): Promise<{ error?: string }> {
    const { error } = await db.from('nutrition_meals').update({ day_variant_id: variantId }).eq('id', mealId)
    return error ? { error: error.message } : {}
}

/** Variante asignada por comida (builder + alumno). */
export async function findMealVariantAssignments(
    db: DB,
    planId: string
): Promise<{ mealId: string; dayVariantId: string | null }[]> {
    const { data } = await db
        .from('nutrition_meals')
        .select('id, day_variant_id')
        .eq('plan_id', planId)
    return (data ?? []).map((m) => ({
        mealId: m.id as string,
        dayVariantId: (m as { day_variant_id?: string | null }).day_variant_id ?? null,
    }))
}

/** Equivalencias alimento→porción de los grupos dados (foods visibles por RLS del caller). */
export async function findExchangeFoodsByGroupIds(
    db: DB,
    groupIds: string[]
): Promise<ExchangeFoodEquivalence[]> {
    if (groupIds.length === 0) return []
    const { data } = await db
        .from('foods')
        .select('id, name, exchange_group_id, exchange_portion_grams, exchange_portion_label')
        .in('exchange_group_id', groupIds)
        .order('name', { ascending: true })
    return (data ?? [])
        .filter((f) => f.exchange_group_id != null)
        .map((f) => ({
            foodId: f.id as string,
            name: f.name as string,
            exchangeGroupId: f.exchange_group_id as string,
            portionGrams: f.exchange_portion_grams != null ? Number(f.exchange_portion_grams) : null,
            portionLabel: f.exchange_portion_label ?? null,
        }))
}
