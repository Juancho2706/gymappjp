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
import type { PortionSystem } from '@eva/nutrition-v2'

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
    'id, slug, code, name, coach_id, team_id, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, color, sort_order, composed_of, macros_confirmed, portion_system'

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

/** `portion_system` crudo -> tipo del paquete. Cualquier otra cosa (columna ausente, valor
 *  desconocido) es `null`: el set se resuelve despues, nunca se adivina. */
function toPortionSystem(value: unknown): PortionSystem | null {
    return value === 'smae' || value === 'cl' ? value : null
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
        // El campo es OPCIONAL (R15): una fila sin la columna —o con un valor que no
        // conocemos— sale `undefined`, y `systemOf` la resuelve por código o por el set del
        // coach. Nunca se inventa `'smae'`: eso marcaría legado a un grupo chileno.
        portionSystem: toPortionSystem((r as { portion_system?: unknown }).portion_system) ?? undefined,
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

// ─── Sets de porciones EN USO por el coach (W1.3, DATA §7.1) ────────────────────
//
// El insumo `usedSystems` de `visibleExchangeGroupsForCoach`: sin el, el bloque «Legado»
// del picker no se apagaria nunca. Vive ACA y no dentro de `findExchangeGroupsForScope`
// (R13/T-01): ese catalogo es el de AUTORIZACION y no se toca.
//
// FORMA JOIN, no `exists` (evidencia W0.6 del 09-09: la forma `exists` sobre
// `exchange_groups` costo 11,6 ms en frio y la join 0,3 ms). Con PostgREST no hay join SQL
// libre, asi que la join se expresa con embeds `!inner` sobre las FK reales y los filtros se
// escriben con la ruta del embed. Dos detalles obligados por PostgREST:
//
//   1. `nutrition_slot_exchange_targets_v2` NO tiene FK a `nutrition_plan_versions_v2` por
//      `version_id` sola (la FK declarada es compuesta `(meal_slot_id, version_id)` contra
//      `nutrition_meal_slots_v2`), asi que no hay embed que suba de targets a versiones. La
//      ventana de versiones se resuelve en su propia consulta —que SI puede embeber
//      `nutrition_plans_v2!inner` por `plan_id`— y se aplica a los targets con un `in`.
//   2. La condicion `v.id = p.current_published_version_id or v.status <> 'published'` compara
//      columnas de DOS tablas: PostgREST no la puede expresar y se evalua en TypeScript, con
//      las dos columnas ya traidas. La ventana queda identica a la del SQL de DATA §7.1:
//      version publicada VIGENTE o borrador abierto, sobre plan no archivado. Las versiones
//      publicadas VIEJAS quedan fuera a proposito: si contaran, convertir jamas apagaria el
//      legado (S1).
//
// El `limit 2` del SDD acompana al `select distinct` de SQL; PostgREST no tiene `distinct`,
// asi que el corte a lo sumo dos elementos se hace al deduplicar en memoria.
//
// ERRORES: estas funciones LANZAN (no devuelven `[]`). La diferencia es la que sostiene el
// fail-open de R14: `[]` significa «se leyo y el coach no usa nada» y esconde el set legado,
// mientras que una lectura fallida tiene que llegar al borde como «no se» (`usedSystems:
// undefined`) para que se muestre todo sin marcar legado.

type EmbeddedPlanWindow = { current_published_version_id: string | null }
type VersionWindowRow = {
    id: string
    status: string
    nutrition_plans_v2: EmbeddedPlanWindow | EmbeddedPlanWindow[] | null
}
type EmbeddedGroupSystem = { portion_system: string | null; is_system?: unknown }
type TargetGroupRow = { exchange_groups: EmbeddedGroupSystem | EmbeddedGroupSystem[] | null }

/** supabase-js tipa un embed to-one como objeto y uno to-many como arreglo segun la FK; se
 *  normaliza para no depender de esa inferencia. */
function firstEmbed<T>(value: T | T[] | null): T | null {
    if (value == null) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * SOLO cuentan los grupos del SISTEMA (E1). Un grupo PROPIO del coach jamas es «Legado»,
 * por mas que su fila traiga `portion_system = 'smae'`: los propios nacen con ese valor por
 * el default de la columna que puso W0.1, no porque el coach este usando el set mexicano.
 * Contarlos encenderia el bloque «Legado» del picker —y el banner de conversion— para un
 * coach que solo tiene grupos suyos, y el sheet de conversion abriria sin una sola fila.
 * `is_system` viaja en el embed justamente para poder descartarlos aca.
 */
function collectSystems(rows: TargetGroupRow[]): PortionSystem[] {
    const out: PortionSystem[] = []
    for (const row of rows) {
        const group = firstEmbed(row.exchange_groups)
        if (group?.is_system !== true) continue
        const system = toPortionSystem(group.portion_system)
        if (system && !out.includes(system)) out.push(system)
        if (out.length === 2) break
    }
    return out
}

/**
 * Techo EXPLICITO de la ventana de versiones. PostgREST ya corta en `max_rows = 1000`
 * (`supabase/config.toml:18`), asi que esto no cambia el resultado: lo deja escrito para que el
 * dia que la ventana crezca el corte sea una decision y no una sorpresa del servidor. En LIVE
 * (09-09) el coach con mas versiones vivas tiene 40, y los ids viajan por URL en el `.in(...)`
 * de la consulta de targets: si alguna vez se acerca al techo, se pagina antes de que la URL
 * reviente, no despues.
 */
const USED_SYSTEMS_VERSION_WINDOW_LIMIT = 1000

/** Rama V2: targets de la version publicada vigente o de un borrador abierto. */
async function findUsedPortionSystemsV2(db: DB, coachId: string): Promise<PortionSystem[]> {
    const { data: versions, error: versionsError } = await db
        .from('nutrition_plan_versions_v2')
        .select('id, status, nutrition_plans_v2!inner(current_published_version_id)')
        .eq('nutrition_plans_v2.coach_id', coachId)
        .neq('nutrition_plans_v2.lifecycle_status', 'archived')
        .limit(USED_SYSTEMS_VERSION_WINDOW_LIMIT)
    if (versionsError) throw new Error(versionsError.message)

    const versionIds: string[] = []
    for (const row of (versions ?? []) as unknown as VersionWindowRow[]) {
        const plan = firstEmbed(row.nutrition_plans_v2)
        const isCurrentPublished = plan != null && plan.current_published_version_id === row.id
        if (isCurrentPublished || row.status !== 'published') versionIds.push(row.id)
    }
    if (versionIds.length === 0) return []

    const { data, error } = await db
        .from('nutrition_slot_exchange_targets_v2')
        .select('exchange_groups!inner(portion_system, is_system)')
        .in('version_id', versionIds)
    if (error) throw new Error(error.message)
    return collectSystems((data ?? []) as unknown as TargetGroupRow[])
}

/** Rama V1 (S-04): el builder legado sigue vivo en produccion y sus targets cuentan igual. */
async function findUsedPortionSystemsV1(db: DB, coachId: string): Promise<PortionSystem[]> {
    const { data, error } = await db
        .from('meal_exchange_targets')
        .select(
            'exchange_groups!inner(portion_system, is_system), nutrition_meals!inner(nutrition_plans!inner(coach_id))'
        )
        .eq('nutrition_meals.nutrition_plans.coach_id', coachId)
    if (error) throw new Error(error.message)
    return collectSystems((data ?? []) as unknown as TargetGroupRow[])
}

/**
 * Sets de porciones que el coach TIENE EN USO HOY (DATA §7.1). A lo sumo dos elementos.
 * Union de las dos ramas —V2 y V1— deduplicada en TypeScript.
 *
 * «En uso» = grupos del SISTEMA prescritos en planes (E1). Los grupos propios del coach no
 * entran nunca, ni siquiera con `portion_system = 'smae'` en su fila: ver `collectSystems`.
 */
export async function findUsedPortionSystemsForCoach(db: DB, coachId: string): Promise<PortionSystem[]> {
    const [v2, v1] = await Promise.all([findUsedPortionSystemsV2(db, coachId), findUsedPortionSystemsV1(db, coachId)])
    const out: PortionSystem[] = []
    for (const system of [...v2, ...v1]) if (!out.includes(system)) out.push(system)
    return out
}

/**
 * Set de porciones del coach (`coaches.portion_system`). `null` = no se pudo leer o el coach
 * no existe; el borde lo trata como fail-open (muestra los dos sets, sin marcar legado) y la
 * funcion pura cae a `'cl'`, que es el default de la columna.
 */
export async function findCoachPortionSystem(db: DB, coachId: string): Promise<PortionSystem | null> {
    const { data, error } = await db.from('coaches').select('portion_system').eq('id', coachId).maybeSingle()
    if (error || data == null) return null
    return toPortionSystem((data as { portion_system?: unknown }).portion_system)
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

// ─── Escritura de grupos PROPIOS del coach (porciones propias, P-A) ─────────────
//
// RLS es el TECHO real: `xg_insert` / `xg_update` / `xg_delete`
// (20260611093001_nutrition_exchanges.sql) solo dejan pasar filas `NOT is_system` cuyo
// `coach_id = auth.uid()` (o un team gestionado). Estas funciones NUNCA reciben el cliente
// service-role: siempre el cliente user-scoped del coach. Patrón calcado de
// `insertDayVariant` (insert -> select de las columnas del mapper -> map).
//
// `macros_confirmed` se fuerza a false: los grupos propios son SIEMPRE referenciales
// (badge "Valores referenciales"); confirmar macros es una operación de catálogo, no del coach.
// `is_system`, `composed_of`, `coach_id` y `team_id` no se tocan en el UPDATE — la identidad
// y el ownership del grupo son inmutables desde la app.

export type ExchangeGroupWriteValues = {
    slug: string
    code: string
    name: string
    refCalories: number
    refProteinG: number
    refCarbsG: number
    refFatsG: number
    color: string | null
}

/** Un grupo por id, VIVO y visible para el actor (RLS `xg_select`). */
export async function findExchangeGroupById(db: DB, id: string): Promise<ExchangeGroup | null> {
    const { data } = await db
        .from('exchange_groups')
        .select(GROUP_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
    return data ? mapExchangeGroupRow(data) : null
}

export async function insertExchangeGroup(
    db: DB,
    owner: { coachId: string | null; teamId: string | null },
    values: ExchangeGroupWriteValues,
    sortOrder: number
): Promise<{ group?: ExchangeGroup; error?: string }> {
    const { data, error } = await db
        .from('exchange_groups')
        .insert({
            slug: values.slug,
            code: values.code,
            name: values.name,
            coach_id: owner.coachId,
            team_id: owner.teamId,
            is_system: false,
            ref_calories: values.refCalories,
            ref_protein_g: values.refProteinG,
            ref_carbs_g: values.refCarbsG,
            ref_fats_g: values.refFatsG,
            color: values.color,
            sort_order: sortOrder,
            macros_confirmed: false,
        })
        .select(GROUP_COLUMNS)
        .single()
    if (error || !data) return { error: error?.message ?? 'No se pudo crear el grupo.' }
    return { group: mapExchangeGroupRow(data) }
}

/**
 * UPDATE acotado por id + `deleted_at IS NULL`. 0 filas ⇒ la RLS negó (grupo ajeno o del
 * sistema) o ya estaba borrado: se devuelve error, jamás un éxito silencioso.
 */
export async function updateExchangeGroup(
    db: DB,
    groupId: string,
    values: ExchangeGroupWriteValues
): Promise<{ group?: ExchangeGroup; error?: string }> {
    const { data, error } = await db
        .from('exchange_groups')
        .update({
            slug: values.slug,
            code: values.code,
            name: values.name,
            ref_calories: values.refCalories,
            ref_protein_g: values.refProteinG,
            ref_carbs_g: values.refCarbsG,
            ref_fats_g: values.refFatsG,
            color: values.color,
            macros_confirmed: false,
        })
        .eq('id', groupId)
        .is('deleted_at', null)
        .select(GROUP_COLUMNS)
        .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: 'No se pudo editar el grupo.' }
    return { group: mapExchangeGroupRow(data) }
}

/**
 * Soft-delete (`deleted_at`): el índice único parcial libera el slug y el grupo desaparece
 * del catálogo vivo. Los planes YA publicados no se tocan — sus targets llevan el snapshot
 * congelado (`snapshot_group_code` / `snapshot_ref_*` de 20260718140000).
 */
export async function softDeleteExchangeGroup(db: DB, groupId: string): Promise<{ error?: string }> {
    const { data, error } = await db
        .from('exchange_groups')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', groupId)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: 'No se pudo eliminar el grupo.' }
    return {}
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
