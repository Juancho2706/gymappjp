import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCoach } from '@/lib/coach/get-coach'
import { getCoachActiveTeamIds, isCurrentUserTeamManager } from '@/services/auth/team.service'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'

export type ModulesScope = 'team' | 'standalone'

export interface ModulesContext {
    scope: ModulesScope
    teamId: string | null
    teamName: string | null
    canEdit: boolean
    modules: Record<ModuleKey, boolean>
}

function normalizeModules(value: unknown): Record<ModuleKey, boolean> {
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
    return Object.fromEntries(MODULE_KEYS.map((k) => [k, obj[k] === true])) as Record<ModuleKey, boolean>
}

/**
 * Contexto de modulos para la pagina Settings > Modulos.
 * Regla (LOCKED): en TEAM manda teams.enabled_modules (lo edita owner/co-gestor; miembro = read-only).
 * Standalone -> coaches.enabled_modules (propio). Cliente user-scoped: RLS es el techo.
 */
export const getModulesContext = cache(async (): Promise<{ coachId: string | null; orgManaged: boolean; ctx: ModulesContext | null }> => {
    const supabase = await createClient()
    const coach = await getCoach()
    if (!coach) return { coachId: null, orgManaged: false, ctx: null }

    const orgManaged = coach.subscription_status === 'org_managed'
    const teamIds = await getCoachActiveTeamIds(supabase, coach.id)

    if (teamIds.length > 0) {
        // v1: se edita el team primario (primero). Caso multi-team (coach en 2+ pools) = selector futuro;
        // la pagina muestra el nombre del team y el action re-resuelve + gatea por gestor server-side.
        const teamId = teamIds[0]
        const [{ data: team }, canEdit] = await Promise.all([
            supabase.from('teams').select('name, enabled_modules').eq('id', teamId).maybeSingle(),
            isCurrentUserTeamManager(supabase, teamId),
        ])
        return {
            coachId: coach.id,
            orgManaged,
            ctx: { scope: 'team', teamId, teamName: team?.name ?? 'Equipo', canEdit, modules: normalizeModules(team?.enabled_modules) },
        }
    }

    const { data: own } = await supabase.from('coaches').select('enabled_modules').eq('id', coach.id).maybeSingle()
    return {
        coachId: coach.id,
        orgManaged,
        ctx: { scope: 'standalone', teamId: null, teamName: null, canEdit: true, modules: normalizeModules(own?.enabled_modules) },
    }
})
