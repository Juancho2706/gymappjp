'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import {
    AssignMealVariantSchema,
    CreateDayVariantSchema,
    DeleteDayVariantSchema,
    LogNutritionPdfGeneratedSchema,
    RenameDayVariantSchema,
    SaveMealExchangeTargetsSchema,
    SetPlanModeSchema,
    type AssignMealVariantInput,
    type CreateDayVariantInput,
    type DeleteDayVariantInput,
    type LogNutritionPdfGeneratedInput,
    type RenameDayVariantInput,
    type SaveMealExchangeTargetsInput,
    type SetPlanModeInput,
} from '@eva/schemas/nutrition-exchanges'
import {
    assignMealDayVariant,
    createPlanDayVariant,
    deletePlanDayVariant,
    logExchangePdfGenerated,
    renamePlanDayVariant,
    saveMealExchangeTargets,
    setNutritionPlanMode,
} from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { findMealPlanId, findPlanModuleContext } from '@/infrastructure/db/exchanges.repository'
import type { DayVariant } from '@/domain/nutrition/exchange.types'

/**
 * Server actions del módulo `nutrition_exchanges` (builder del COACH).
 * Todas: Zod v4 + gating server-side (`assertModule` vía service, por contexto del
 * RECURSO) + revalidatePath. El flujo del ALUMNO (`app/c/`) NO importa este archivo
 * (AC7: su descarga de PDF no genera bitácora — cero import cross-route).
 */

type ActionResult = { success: boolean; error?: string }

const MODULE_TAG = '[module:nutrition_exchanges]'

async function requireCoachContext(): Promise<
    | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; coachId: string; activeTeamId: string | null; orgId: string | null }
    | { ok: false; error: string }
> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'No autorizado.' }
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    return { ok: true, supabase, coachId: user.id, activeTeamId, orgId }
}

function errorMessage(e: unknown, fallback: string): string {
    return e instanceof Error ? e.message : fallback
}

async function revalidateExchangePaths(
    supabase: Awaited<ReturnType<typeof createClient>>,
    planId: string
) {
    revalidatePath('/coach/nutrition-plans')
    const ctx = await findPlanModuleContext(supabase, planId)
    if (ctx?.clientId) {
        revalidatePath(`/coach/nutrition-plans/client/${ctx.clientId}`)
        revalidatePath(`/coach/clients/${ctx.clientId}`)
    }
    if (ctx?.coachId) {
        const { data: coach } = await supabase
            .from('coaches')
            .select('slug')
            .eq('id', ctx.coachId)
            .maybeSingle()
        if (coach?.slug) revalidatePath(`/c/${coach.slug}/nutrition`)
    }
}

/** Cambia el modo del plan (switch NO destructivo: conserva food_items y targets). */
export async function setPlanModeAction(input: SetPlanModeInput): Promise<ActionResult> {
    const ctx = await requireCoachContext()
    if (!ctx.ok) return { success: false, error: ctx.error }
    const parsed = SetPlanModeSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join('. ') }
    try {
        const res = await setNutritionPlanMode(ctx.supabase, {
            actorCoachId: ctx.coachId,
            planId: parsed.data.planId,
            mode: parsed.data.mode,
        })
        if (res.success) await revalidateExchangePaths(ctx.supabase, parsed.data.planId)
        return res
    } catch (e) {
        console.error(`${MODULE_TAG} setPlanModeAction`, e)
        return { success: false, error: errorMessage(e, 'No se pudo cambiar el modo del plan.') }
    }
}

/** Upsert de porciones por grupo de UNA comida (delete de los removidos incluido). */
export async function saveMealExchangeTargetsAction(
    input: SaveMealExchangeTargetsInput
): Promise<ActionResult> {
    const ctx = await requireCoachContext()
    if (!ctx.ok) return { success: false, error: ctx.error }
    const parsed = SaveMealExchangeTargetsSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join('. ') }
    try {
        const res = await saveMealExchangeTargets(ctx.supabase, {
            actorCoachId: ctx.coachId,
            mealId: parsed.data.mealId,
            targets: parsed.data.targets,
        })
        if (res.success) {
            const planId = await findMealPlanId(ctx.supabase, parsed.data.mealId)
            if (planId) await revalidateExchangePaths(ctx.supabase, planId)
        }
        return res
    } catch (e) {
        console.error(`${MODULE_TAG} saveMealExchangeTargetsAction`, e)
        return { success: false, error: errorMessage(e, 'No se pudieron guardar las porciones.') }
    }
}

export async function createDayVariantAction(
    input: CreateDayVariantInput
): Promise<ActionResult & { variant?: DayVariant }> {
    const ctx = await requireCoachContext()
    if (!ctx.ok) return { success: false, error: ctx.error }
    const parsed = CreateDayVariantSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join('. ') }
    try {
        const res = await createPlanDayVariant(ctx.supabase, {
            actorCoachId: ctx.coachId,
            planId: parsed.data.planId,
            name: parsed.data.name,
        })
        if (res.success) await revalidateExchangePaths(ctx.supabase, parsed.data.planId)
        return res
    } catch (e) {
        console.error(`${MODULE_TAG} createDayVariantAction`, e)
        return { success: false, error: errorMessage(e, 'No se pudo crear la variante.') }
    }
}

export async function renameDayVariantAction(input: RenameDayVariantInput): Promise<ActionResult> {
    const ctx = await requireCoachContext()
    if (!ctx.ok) return { success: false, error: ctx.error }
    const parsed = RenameDayVariantSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join('. ') }
    try {
        const res = await renamePlanDayVariant(ctx.supabase, {
            actorCoachId: ctx.coachId,
            variantId: parsed.data.variantId,
            name: parsed.data.name,
        })
        if (res.success) revalidatePath('/coach/nutrition-plans')
        return res
    } catch (e) {
        console.error(`${MODULE_TAG} renameDayVariantAction`, e)
        return { success: false, error: errorMessage(e, 'No se pudo renombrar la variante.') }
    }
}

/** Delete ⇒ las comidas de esa variante quedan en "todas" (ON DELETE SET NULL). */
export async function deleteDayVariantAction(input: DeleteDayVariantInput): Promise<ActionResult> {
    const ctx = await requireCoachContext()
    if (!ctx.ok) return { success: false, error: ctx.error }
    const parsed = DeleteDayVariantSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join('. ') }
    try {
        const res = await deletePlanDayVariant(ctx.supabase, {
            actorCoachId: ctx.coachId,
            variantId: parsed.data.variantId,
        })
        if (res.success) revalidatePath('/coach/nutrition-plans')
        return res
    } catch (e) {
        console.error(`${MODULE_TAG} deleteDayVariantAction`, e)
        return { success: false, error: errorMessage(e, 'No se pudo eliminar la variante.') }
    }
}

export async function assignMealVariantAction(input: AssignMealVariantInput): Promise<ActionResult> {
    const ctx = await requireCoachContext()
    if (!ctx.ok) return { success: false, error: ctx.error }
    const parsed = AssignMealVariantSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join('. ') }
    try {
        const res = await assignMealDayVariant(ctx.supabase, {
            actorCoachId: ctx.coachId,
            mealId: parsed.data.mealId,
            variantId: parsed.data.variantId,
        })
        if (res.success) {
            const planId = await findMealPlanId(ctx.supabase, parsed.data.mealId)
            if (planId) await revalidateExchangePaths(ctx.supabase, planId)
        }
        return res
    } catch (e) {
        console.error(`${MODULE_TAG} assignMealVariantAction`, e)
        return { success: false, error: errorMessage(e, 'No se pudo asignar la variante.') }
    }
}

/**
 * Bitácora `pdf_generate` — fire-and-forget, SOLO la invoca el flujo del COACH.
 * Contexto team activo ⇒ inserta en `team_access_logs` con `actor_coach_id = auth.uid()`
 * y metadata `{format, plan_id}`; standalone/enterprise ⇒ no-op (AC7).
 */
export async function logNutritionPdfGeneratedAction(
    input: LogNutritionPdfGeneratedInput
): Promise<ActionResult> {
    const ctx = await requireCoachContext()
    if (!ctx.ok) return { success: false, error: ctx.error }
    const parsed = LogNutritionPdfGeneratedSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues.map((i) => i.message).join('. ') }
    await logExchangePdfGenerated(ctx.supabase, {
        actorCoachId: ctx.coachId,
        activeTeamId: ctx.activeTeamId,
        planId: parsed.data.planId,
        format: parsed.data.format,
    })
    return { success: true }
}
