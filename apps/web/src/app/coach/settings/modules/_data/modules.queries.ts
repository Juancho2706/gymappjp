import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCoach } from '@/lib/coach/get-coach'
import { hasEffectiveAccess, isManagedSubscription } from '@/lib/coach-subscription-gate'
import { isCurrentUserTeamManager } from '@/services/auth/team.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import {
    MODULE_KEYS,
    isModuleKilledByOperator,
    type ModuleKey,
} from '@/services/entitlements.service'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import type { SubscriptionTier } from '@/lib/constants'

export type ModulesScope = 'team' | 'standalone'

export interface ModulesContext {
    scope: ModulesScope
    teamId: string | null
    teamName: string | null
    /**
     * Solo discrimina la guía del catálogo read-only (miembro de team sin gestión ->
     * "Pídelo al owner"). El catálogo ya NO habilita edición: el único escritor es el
     * override admin (service-role).
     */
    isTeamManager: boolean
    /** Tier del coach — decide el copy "Incluido en tu plan" vs upsell de upgrade. */
    tier: SubscriptionTier
    /**
     * ¿El coach tiene un plan PAGO con acceso efectivo? (decisión CEO 2026-07-17:
     * los 4 módulos vienen incluidos con cualquier suscripción paga; free no los tiene).
     * Team/enterprise = managed => pago por diseño (el pool/la org paga).
     */
    hasPaidPlan: boolean
    modules: Record<ModuleKey, boolean>
    /** Módulos apagados por el kill-switch de operador (entitlement ON pero en mantenimiento). */
    killedByOperator: Record<ModuleKey, boolean>
    /**
     * ¿Está VISIBLE el dominio Nutrición (master switch de Funciones)? Solo aplica a
     * `nutrition_exchanges` (único módulo con capa de visibilidad de Funciones). `false` =>
     * el coach lo tiene activo pero oculto => cross-link "Mostrar" hacia Funciones.
     */
    nutritionVisible: boolean
}

function normalizeModules(value: unknown): Record<ModuleKey, boolean> {
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    return Object.fromEntries(MODULE_KEYS.map((k) => [k, obj[k] === true])) as Record<ModuleKey, boolean>
}

function operatorKillMap(): Record<ModuleKey, boolean> {
    return Object.fromEntries(MODULE_KEYS.map((k) => [k, isModuleKilledByOperator(k)])) as Record<ModuleKey, boolean>
}

/**
 * Contexto de modulos para Settings > Modulos (catálogo read-only — compra-only, plan 03),
 * derivado del WORKSPACE ACTIVO (separación de flujos):
 * coach_team -> teams.enabled_modules del team ACTIVO (isTeamManager solo cambia el CTA).
 * standalone -> coaches.enabled_modules (propio). enterprise -> no aplica (orgManaged=true, la página redirige).
 * Cliente user-scoped: RLS es el techo; la escritura quedó SOLO en service-role (override admin).
 */
export const getModulesContext = cache(async (): Promise<{ coachId: string | null; orgManaged: boolean; ctx: ModulesContext | null }> => {
    const supabase = await createClient()
    const coach = await getCoach()
    if (!coach) return { coachId: null, orgManaged: false, ctx: null }

    const workspace = await resolvePreferredWorkspace(supabase, coach.id)
    const orgManaged = coach.subscription_status === 'org_managed' || workspace?.type === 'enterprise_coach'
    const tier = coach.subscription_tier as SubscriptionTier
    const killedByOperator = operatorKillMap()

    if (workspace?.type === 'coach_team') {
        const teamId = workspace.teamId
        const [{ data: team }, isTeamManager, nutritionVisible] = await Promise.all([
            supabase.from('teams').select('name, enabled_modules').eq('id', teamId).maybeSingle(),
            isCurrentUserTeamManager(supabase, teamId),
            resolveNutritionDomainEnabled({ coachId: coach.id, clientTeamId: teamId }),
        ])
        return {
            coachId: coach.id,
            orgManaged,
            ctx: {
                scope: 'team',
                teamId,
                teamName: team?.name ?? 'Equipo',
                isTeamManager,
                tier,
                // Team = pool de pago por diseño (el acceso del coach es team_managed).
                hasPaidPlan: true,
                modules: normalizeModules(team?.enabled_modules),
                killedByOperator,
                nutritionVisible,
            },
        }
    }

    const [{ data: own }, nutritionVisible] = await Promise.all([
        supabase
            .from('coaches')
            .select('enabled_modules, current_period_end')
            .eq('id', coach.id)
            .maybeSingle(),
        resolveNutritionDomainEnabled({ coachId: coach.id }),
    ])
    const hasPaidPlan =
        isManagedSubscription(coach.subscription_status) ||
        (tier !== 'free' && hasEffectiveAccess(coach.subscription_status, own?.current_period_end ?? null))
    return {
        coachId: coach.id,
        orgManaged,
        ctx: {
            scope: 'standalone',
            teamId: null,
            teamName: null,
            isTeamManager: false,
            tier,
            hasPaidPlan,
            modules: normalizeModules(own?.enabled_modules),
            killedByOperator,
            nutritionVisible,
        },
    }
})
