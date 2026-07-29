import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type {
    DayVariant,
    ExchangeFoodEquivalence,
    ExchangeGroup,
    MealExchangeTarget,
    NutritionPlanMode,
} from '@/domain/nutrition/exchange.types'
import { assertModule, getCoachEnabledModules, getTeamEnabledModules } from '@/services/entitlements.service'
import { logTeamClientAccess } from '@/services/team/team.service'
import {
    deleteDayVariant,
    findDayVariantPlanId,
    findDayVariantsByPlan,
    findExchangeFoodsByGroupIds,
    findExchangeGroupsByIdsForTenant,
    findExchangeGroupsForScope,
    findMealExchangeTargetsByMealIds,
    findMealPlanId,
    findMealVariantAssignments,
    findPlanModuleContext,
    insertDayVariant,
    insertExchangeGroup,
    renameDayVariant,
    replaceMealExchangeTargets,
    setMealDayVariant,
    setPlanLastEditedBy,
    setPlanMode,
    softDeleteExchangeGroup,
    updateExchangeGroup,
    type ExchangeGroupWriteValues,
} from '@/infrastructure/db/exchanges.repository'
import { toExchangeGroupSlug } from '@eva/schemas/nutrition-exchanges'

/**
 * Servicio de aplicación del módulo `nutrition_exchanges`.
 * Orquesta: gating server-side (`assertModule` por contexto del RECURSO — pool manda),
 * coerción de payloads client-controlled, awareness (`last_edited_by_coach_id`) y
 * bitácora `pdf_generate` (SOLO coach en contexto team, AC7).
 * Sin imports de Next.js (regla Clean Architecture); recibe los clientes DB del caller.
 */

type DB = SupabaseClient<Database>

export const NUTRITION_EXCHANGES_MODULE = 'nutrition_exchanges' as const

export type PlanModuleContext = {
    planId: string
    coachId: string | null
    clientId: string | null
    planMode: NutritionPlanMode
    clientTeamId: string | null
    clientOrgId: string | null
}

/**
 * Contexto de gating por RECURSO (regla LOCKED del SPEC AC2): alumno de pool ⇒ decide
 * `teams.enabled_modules`; si no ⇒ `coaches.enabled_modules` del coach dueño del plan.
 */
export function moduleCtxForPlan(ctx: Pick<PlanModuleContext, 'clientTeamId' | 'clientOrgId' | 'coachId'>): {
    teamId?: string | null
    coachId?: string | null
} {
    if (ctx.clientTeamId && !ctx.clientOrgId) return { teamId: ctx.clientTeamId }
    return { coachId: ctx.coachId }
}

/** Carga el contexto del plan y lanza si el módulo no está habilitado para ese contexto. */
export async function assertExchangesModuleForPlan(db: DB, planId: string): Promise<PlanModuleContext> {
    const ctx = await findPlanModuleContext(db, planId)
    if (!ctx) throw new Error('Plan no encontrado.')
    await assertModule(db, NUTRITION_EXCHANGES_MODULE, moduleCtxForPlan(ctx))
    return ctx
}

/** ¿Módulo habilitado para el contexto del alumno? (vista del alumno, fail-closed). */
export async function hasExchangesModuleForClientContext(
    db: DB,
    ctx: { clientTeamId: string | null; clientOrgId: string | null; planCoachId: string | null }
): Promise<boolean> {
    if (ctx.clientTeamId && !ctx.clientOrgId) {
        return (await getTeamEnabledModules(db, ctx.clientTeamId))[NUTRITION_EXCHANGES_MODULE] === true
    }
    if (ctx.planCoachId) {
        return (await getCoachEnabledModules(db, ctx.planCoachId))[NUTRITION_EXCHANGES_MODULE] === true
    }
    return false
}

/** Catálogo de grupos por scope 3-vías del coach (system + propios + team activo). */
export async function getExchangeGroupsForCoach(
    db: DB,
    coachId: string,
    scope: { orgId: string | null; activeTeamId: string | null }
): Promise<ExchangeGroup[]> {
    return findExchangeGroupsForScope(db, coachId, scope)
}

// ─── Grupos PROPIOS del coach (porciones propias, P-A) ──────────────────────────
//
// Gating: las porciones NO son Pro ni exigen módulo nuevo (decisión vigente del SPEC de
// porciones) ⇒ acá NO se llama `assertModule`. El techo de autorización lo pone el CALLER
// (server action: `authorizeCoach` = sesión + rate limit + rollout V2 + workspace activo;
// API mobile: `gateExchanges`) y, debajo de todo, la RLS `xg_insert/update/delete`.
//
// F1: el grupo se crea SIEMPRE coach-scoped (`coach_id = actor`, `team_id NULL`). Los grupos
// de POOL quedan fuera de alcance porque `xg_insert` los restringe a gestores del team
// (`current_user_managed_team_ids()`) y un coach miembro recibiría un 42501 opaco.

export const MAX_CUSTOM_EXCHANGE_GROUPS = 30

/** Scope de workspace con el que se resuelve el catálogo visible (system + propios + team). */
export type ExchangeGroupScope = { orgId: string | null; activeTeamId: string | null }

export type ExchangeGroupInput = {
    name: string
    code: string
    /** Opcional: si falta se deriva del nombre (`toExchangeGroupSlug`). */
    slug?: string | null
    refCalories: number
    refProteinG: number
    refCarbsG: number
    refFatsG: number
    color?: string | null
}

export type ExchangeGroupConflict = 'code' | 'slug' | null

/**
 * Unicidad CASE-INSENSITIVE de `code` y `slug` contra TODO el catálogo visible (los 9
 * system + los propios + los del team activo). Es una decisión PURA para poder testearla
 * sin DB. Los índices únicos de la tabla son solo por `(coach_id, slug)`: NO impiden que un
 * coach cree su propia "C" y confunda al alumno, por eso el chequeo del código vive acá.
 * `excludeId` deja fuera el grupo que se está editando (renombrarlo a sí mismo no colisiona).
 */
export function findExchangeGroupConflict(
    catalog: Pick<ExchangeGroup, 'id' | 'code' | 'slug'>[],
    candidate: { code: string; slug: string },
    excludeId?: string | null
): ExchangeGroupConflict {
    const code = candidate.code.trim().toLowerCase()
    const slug = candidate.slug.trim().toLowerCase()
    for (const group of catalog) {
        if (excludeId && group.id === excludeId) continue
        if (group.code.trim().toLowerCase() === code) return 'code'
    }
    for (const group of catalog) {
        if (excludeId && group.id === excludeId) continue
        if (group.slug.trim().toLowerCase() === slug) return 'slug'
    }
    return null
}

export function exchangeGroupConflictMessage(conflict: Exclude<ExchangeGroupConflict, null>, code: string): string {
    return conflict === 'code'
        ? `Ya existe un grupo con el código «${code}». Elige otro.`
        : 'Ya tienes un grupo con ese nombre. Elige otro.'
}

/** Normaliza el payload validado a las columnas de la tabla (slug derivado, código en mayúsculas). */
function toWriteValues(input: ExchangeGroupInput): ExchangeGroupWriteValues {
    const name = input.name.trim()
    const slug = (input.slug ?? '').trim().toLowerCase() || toExchangeGroupSlug(name)
    return {
        slug,
        code: input.code.trim().toUpperCase(),
        name,
        refCalories: input.refCalories,
        refProteinG: input.refProteinG,
        refCarbsG: input.refCarbsG,
        refFatsG: input.refFatsG,
        color: input.color ?? null,
    }
}

export type ExchangeGroupWriteResult =
    | { success: true; group: ExchangeGroup }
    | { success: false; error: string }

export async function createCoachExchangeGroup(
    db: DB,
    input: { actorCoachId: string; scope: ExchangeGroupScope; values: ExchangeGroupInput }
): Promise<ExchangeGroupWriteResult> {
    const values = toWriteValues(input.values)
    if (!values.slug) return { success: false, error: 'El nombre debe tener al menos una letra o número.' }

    const catalog = await findExchangeGroupsForScope(db, input.actorCoachId, input.scope)
    const own = catalog.filter((g) => !g.isSystem)
    if (own.length >= MAX_CUSTOM_EXCHANGE_GROUPS) {
        return { success: false, error: `Alcanzaste el máximo de ${MAX_CUSTOM_EXCHANGE_GROUPS} grupos propios.` }
    }
    const conflict = findExchangeGroupConflict(catalog, values)
    if (conflict) return { success: false, error: exchangeGroupConflictMessage(conflict, values.code) }

    // Los custom van SIEMPRE después de los system en el picker (sortGroupsForPicker ordena
    // por isSystem primero); el sort_order solo estabiliza el orden entre propios.
    const { group, error } = await insertExchangeGroup(
        db,
        { coachId: input.actorCoachId, teamId: null },
        values,
        100 + own.length
    )
    if (error || !group) return { success: false, error: error ?? 'No se pudo crear el grupo.' }
    return { success: true, group }
}

export async function updateCoachExchangeGroup(
    db: DB,
    input: { actorCoachId: string; scope: ExchangeGroupScope; groupId: string; values: ExchangeGroupInput }
): Promise<ExchangeGroupWriteResult> {
    const values = toWriteValues(input.values)
    if (!values.slug) return { success: false, error: 'El nombre debe tener al menos una letra o número.' }

    const catalog = await findExchangeGroupsForScope(db, input.actorCoachId, input.scope)
    const target = catalog.find((g) => g.id === input.groupId)
    if (!target) return { success: false, error: 'Ese grupo ya no está disponible.' }
    if (target.isSystem) return { success: false, error: 'Los grupos del sistema no se pueden editar.' }
    if (target.composedOf) return { success: false, error: 'Los grupos compuestos todavía no se pueden editar.' }

    const conflict = findExchangeGroupConflict(catalog, values, input.groupId)
    if (conflict) return { success: false, error: exchangeGroupConflictMessage(conflict, values.code) }

    const { group, error } = await updateExchangeGroup(db, input.groupId, values)
    if (error || !group) return { success: false, error: error ?? 'No se pudo editar el grupo.' }
    return { success: true, group }
}

/**
 * Soft-delete del grupo propio. Lo YA publicado no cambia (snapshots congelados); lo que sí
 * rompe es un BORRADOR que siga apuntando al grupo: `resolveExchangeGroupsForDraft` falla
 * cerrado con `EXCHANGE_GROUP_NOT_FOUND` al publicar. Por eso la UI quita el grupo de las
 * franjas en edición al borrarlo y el aviso lo dice explícito.
 */
export async function deleteCoachExchangeGroup(
    db: DB,
    input: { actorCoachId: string; scope: ExchangeGroupScope; groupId: string }
): Promise<{ success: boolean; error?: string }> {
    const catalog = await findExchangeGroupsForScope(db, input.actorCoachId, input.scope)
    const target = catalog.find((g) => g.id === input.groupId)
    if (!target) return { success: false, error: 'Ese grupo ya no está disponible.' }
    if (target.isSystem) return { success: false, error: 'Los grupos del sistema no se pueden eliminar.' }

    const { error } = await softDeleteExchangeGroup(db, input.groupId)
    if (error) return { success: false, error }
    return { success: true }
}

/**
 * Coerción server-side del payload client-controlled (gotcha F4 de movida-areas):
 * todo `exchangeGroupId` debe resolver contra los grupos VISIBLES para el actor
 * (RLS `xg_select` es el techo del SELECT con el cliente user-scoped). El FK de
 * `meal_exchange_targets` NO valida visibilidad — esta verificación sí.
 */
export async function verifyGroupsVisibleToActor(
    db: DB,
    groupIds: string[]
): Promise<{ ok: boolean; missing: string[] }> {
    const unique = [...new Set(groupIds)]
    if (unique.length === 0) return { ok: true, missing: [] }
    const { data } = await db
        .from('exchange_groups')
        .select('id')
        .in('id', unique)
        .is('deleted_at', null)
    const visible = new Set((data ?? []).map((g) => g.id as string))
    const missing = unique.filter((id) => !visible.has(id))
    return { ok: missing.length === 0, missing }
}

export async function saveMealExchangeTargets(
    db: DB,
    input: {
        actorCoachId: string
        mealId: string
        targets: { exchangeGroupId: string; portions: number; notes?: string | null }[]
    }
): Promise<{ success: boolean; error?: string }> {
    const planId = await findMealPlanId(db, input.mealId)
    if (!planId) return { success: false, error: 'Comida no encontrada.' }
    const ctx = await assertExchangesModuleForPlan(db, planId)

    const visibility = await verifyGroupsVisibleToActor(
        db,
        input.targets.map((t) => t.exchangeGroupId)
    )
    if (!visibility.ok) return { success: false, error: 'Grupo de intercambio no disponible en este contexto.' }

    const { error } = await replaceMealExchangeTargets(db, input.mealId, input.targets)
    if (error) return { success: false, error }
    await setPlanLastEditedBy(db, ctx.planId, input.actorCoachId)
    return { success: true }
}

export async function setNutritionPlanMode(
    db: DB,
    input: { actorCoachId: string; planId: string; mode: NutritionPlanMode }
): Promise<{ success: boolean; error?: string }> {
    // El switch a 'exchanges' exige módulo ON; volver a 'grams' también se valida por
    // contexto (módulo apagado a posteriori ⇒ la pauta degrada en UI, no por action).
    await assertExchangesModuleForPlan(db, input.planId)
    const { error } = await setPlanMode(db, input.planId, input.mode)
    if (error) return { success: false, error }
    await setPlanLastEditedBy(db, input.planId, input.actorCoachId)
    return { success: true }
}

export async function getPlanExchangeEditorData(
    db: DB,
    planId: string
): Promise<{
    planMode: NutritionPlanMode
    targetsByMealId: Record<string, MealExchangeTarget[]>
    variants: DayVariant[]
    variantByMealId: Record<string, string | null>
}> {
    const ctx = await findPlanModuleContext(db, planId)
    const assignments = await findMealVariantAssignments(db, planId)
    const mealIds = assignments.map((a) => a.mealId)
    const [targets, variants] = await Promise.all([
        findMealExchangeTargetsByMealIds(db, mealIds),
        findDayVariantsByPlan(db, planId),
    ])
    const targetsByMealId: Record<string, MealExchangeTarget[]> = {}
    for (const t of targets) {
        ;(targetsByMealId[t.mealId] ??= []).push(t)
    }
    const variantByMealId: Record<string, string | null> = {}
    for (const a of assignments) variantByMealId[a.mealId] = a.dayVariantId
    return {
        planMode: ctx?.planMode ?? 'grams',
        targetsByMealId,
        variants,
        variantByMealId,
    }
}

export async function getExchangeEquivalences(
    db: DB,
    groupIds: string[]
): Promise<ExchangeFoodEquivalence[]> {
    return findExchangeFoodsByGroupIds(db, groupIds)
}

// ─── Variantes de día ───────────────────────────────────────────────────────────

export async function createPlanDayVariant(
    db: DB,
    input: { actorCoachId: string; planId: string; name: string }
): Promise<{ success: boolean; variant?: DayVariant; error?: string }> {
    await assertExchangesModuleForPlan(db, input.planId)
    const existing = await findDayVariantsByPlan(db, input.planId)
    if (existing.length >= 6) return { success: false, error: 'Máximo 6 variantes por pauta.' }
    if (existing.some((v) => v.name.toLowerCase() === input.name.toLowerCase())) {
        return { success: false, error: 'Ya existe una variante con ese nombre.' }
    }
    const { variant, error } = await insertDayVariant(db, input.planId, input.name, existing.length)
    if (error || !variant) return { success: false, error: error ?? 'No se pudo crear la variante.' }
    await setPlanLastEditedBy(db, input.planId, input.actorCoachId)
    return { success: true, variant }
}

export async function renamePlanDayVariant(
    db: DB,
    input: { actorCoachId: string; variantId: string; name: string }
): Promise<{ success: boolean; error?: string }> {
    const planId = await findDayVariantPlanId(db, input.variantId)
    if (!planId) return { success: false, error: 'Variante no encontrada.' }
    await assertExchangesModuleForPlan(db, planId)
    const { error } = await renameDayVariant(db, input.variantId, input.name)
    if (error) return { success: false, error }
    await setPlanLastEditedBy(db, planId, input.actorCoachId)
    return { success: true }
}

export async function deletePlanDayVariant(
    db: DB,
    input: { actorCoachId: string; variantId: string }
): Promise<{ success: boolean; error?: string }> {
    const planId = await findDayVariantPlanId(db, input.variantId)
    if (!planId) return { success: false, error: 'Variante no encontrada.' }
    await assertExchangesModuleForPlan(db, planId)
    const { error } = await deleteDayVariant(db, input.variantId)
    if (error) return { success: false, error }
    await setPlanLastEditedBy(db, planId, input.actorCoachId)
    return { success: true }
}

export async function assignMealDayVariant(
    db: DB,
    input: { actorCoachId: string; mealId: string; variantId: string | null }
): Promise<{ success: boolean; error?: string }> {
    const planId = await findMealPlanId(db, input.mealId)
    if (!planId) return { success: false, error: 'Comida no encontrada.' }
    await assertExchangesModuleForPlan(db, planId)
    if (input.variantId) {
        const variantPlanId = await findDayVariantPlanId(db, input.variantId)
        if (variantPlanId !== planId) return { success: false, error: 'La variante no pertenece a este plan.' }
    }
    const { error } = await setMealDayVariant(db, input.mealId, input.variantId)
    if (error) return { success: false, error }
    await setPlanLastEditedBy(db, planId, input.actorCoachId)
    return { success: true }
}

// ─── Bitácora PDF (AC7: SOLO coach en contexto team) ────────────────────────────

/**
 * Decisión pura de bitácora: se registra ÚNICAMENTE cuando el actor es un coach con
 * workspace ACTIVO de team y el alumno del plan pertenece a ESE pool. El alumno
 * descargando su propia pauta NO genera bitácora (titular de la data, AC7).
 */
export function shouldLogExchangePdf(input: {
    activeTeamId: string | null
    clientTeamId: string | null
    clientOrgId: string | null
}): boolean {
    return (
        !!input.activeTeamId &&
        !input.clientOrgId &&
        input.clientTeamId === input.activeTeamId
    )
}

export async function logExchangePdfGenerated(
    db: DB,
    input: {
        actorCoachId: string
        activeTeamId: string | null
        planId: string
        format: 'compact' | 'equivalences' | 'full'
    }
): Promise<void> {
    try {
        // R2/AC2: gating server-side TAMBIÉN en la bitácora — con el módulo OFF (o un
        // kill-switch futuro) `assertModule` lanza y el catch degrada a no-op: un coach
        // de team no puede seguir insertando filas `pdf_generate` en `team_access_logs`
        // falseando la bitácora Ley 21.719 (AC7).
        const ctx = await assertExchangesModuleForPlan(db, input.planId)
        if (!shouldLogExchangePdf({
            activeTeamId: input.activeTeamId,
            clientTeamId: ctx.clientTeamId,
            clientOrgId: ctx.clientOrgId,
        })) {
            return // standalone / enterprise ⇒ no-op (no hay bitácora team que falsear)
        }
        await logTeamClientAccess(db, {
            teamId: input.activeTeamId!,
            actorCoachId: input.actorCoachId,
            clientId: ctx.clientId,
            resource: 'nutrition_plan',
            action: 'pdf_generate',
            metadata: { format: input.format, plan_id: input.planId },
        })
    } catch (e) {
        // Best-effort (fire-and-forget): la bitácora no debe romper la descarga.
        console.error('[module:nutrition_exchanges] logExchangePdfGenerated', e)
    }
}

// ─── Vista del alumno (tenant filter, patrón F5 de movida-areas) ────────────────

/** Doble verificación PURA del tenant (defensa en profundidad sobre el filtro SQL). */
export function groupMatchesTenant(
    group: Pick<ExchangeGroup, 'isSystem' | 'coachId' | 'teamId'>,
    tenant: { planCoachId: string | null; clientTeamId: string | null }
): boolean {
    if (group.isSystem) return true
    if (group.coachId && tenant.planCoachId && group.coachId === tenant.planCoachId) return true
    if (group.teamId && tenant.clientTeamId && group.teamId === tenant.clientTeamId) return true
    return false
}

export type StudentExchangeBundle = {
    enabled: boolean
    planMode: NutritionPlanMode
    groups: ExchangeGroup[]
    targetsByMealId: Record<string, MealExchangeTarget[]>
    variants: DayVariant[]
    variantByMealId: Record<string, string | null>
    equivalences: ExchangeFoodEquivalence[]
}

const EMPTY_BUNDLE: StudentExchangeBundle = {
    enabled: false,
    planMode: 'grams',
    groups: [],
    targetsByMealId: {},
    variants: [],
    variantByMealId: {},
    equivalences: [],
}

/**
 * Bundle del ALUMNO. `db` = cliente request-scoped del alumno (RLS techo:
 * met_client_select / npdv_client_select); `serviceDb` = service-role SOLO para
 * resolver el catálogo de grupos referenciados (xg_select no da policy al alumno)
 * y los flags de módulo del tenant — acotado a ids del plan + filtro de tenant.
 */
export async function getStudentExchangeBundle(
    db: DB,
    serviceDb: DB,
    input: {
        planId: string
        planCoachId: string | null
        planMode: string | null | undefined
        clientId: string
    }
): Promise<StudentExchangeBundle> {
    if (input.planMode !== 'exchanges') return EMPTY_BUNDLE

    // Tenant del alumno: su propia fila (RLS permite leerla).
    const { data: clientRow } = await db
        .from('clients')
        .select('id, team_id, org_id')
        .eq('id', input.clientId)
        .maybeSingle()
    const clientTeamId = clientRow?.team_id ?? null
    const clientOrgId = clientRow?.org_id ?? null

    // Gating por contexto del recurso (pool manda) — fail-closed.
    const enabled = await hasExchangesModuleForClientContext(serviceDb, {
        clientTeamId,
        clientOrgId,
        planCoachId: input.planCoachId,
    })
    if (!enabled) return EMPTY_BUNDLE

    const assignments = await findMealVariantAssignments(db, input.planId)
    const mealIds = assignments.map((a) => a.mealId)
    const [targets, variants] = await Promise.all([
        findMealExchangeTargetsByMealIds(db, mealIds),
        findDayVariantsByPlan(db, input.planId),
    ])

    const groupIds = [...new Set(targets.map((t) => t.exchangeGroupId))]
    const tenant = { planCoachId: input.planCoachId, clientTeamId }
    const groupsRaw = await findExchangeGroupsByIdsForTenant(serviceDb, groupIds, tenant)
    // Defensa en profundidad: un id cross-tenant copiado jamás resuelve (unit-tested).
    const groups = groupsRaw.filter((g) => groupMatchesTenant(g, tenant))
    const allowedGroupIds = new Set(groups.map((g) => g.id))

    const targetsByMealId: Record<string, MealExchangeTarget[]> = {}
    for (const t of targets) {
        if (!allowedGroupIds.has(t.exchangeGroupId)) continue
        ;(targetsByMealId[t.mealId] ??= []).push(t)
    }
    const variantByMealId: Record<string, string | null> = {}
    for (const a of assignments) variantByMealId[a.mealId] = a.dayVariantId

    // Equivalencias con el cliente del ALUMNO (RLS de foods es el techo; los alimentos
    // de su plan/system ya son visibles para él).
    const equivalences = await findExchangeFoodsByGroupIds(db, [...allowedGroupIds])

    return {
        enabled: true,
        planMode: 'exchanges',
        groups,
        targetsByMealId,
        variants,
        variantByMealId,
        equivalences,
    }
}
