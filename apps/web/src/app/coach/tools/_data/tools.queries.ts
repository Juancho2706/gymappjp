import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import {
    applyOperatorKillSwitch,
    getCoachEnabledModules,
    getTeamEnabledModules,
    type EnabledModules,
} from '@/services/entitlements.service'
import { listCardioClients } from '@/services/cardio-zones.service'

export type ToolsHubClient = { id: string; full_name: string | null }

export type ToolsHubData =
    | { status: 'unauthenticated' }
    | { status: 'ok'; managed: boolean; modules: EnabledModules; clients: ToolsHubClient[] }

/**
 * Datos del hub /coach/tools ("Herramientas", kit coach-modules-hub). MISMO gate/loader que
 * las páginas de módulo y el sidebar: enabled_modules del contexto ACTIVO (team manda;
 * standalone usa los flags del coach; enterprise v1 ⇒ ninguno) + kill-switch de operador.
 * El hub es espejo visual; el techo real sigue siendo assertModule dentro de cada módulo.
 */
export const getToolsHubData = cache(async (): Promise<ToolsHubData> => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { status: 'unauthenticated' }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    // Enterprise v1: módulos OFF (paridad con cardio/movement) — catálogo bloqueado gestionado.
    if (workspace?.type === 'enterprise_coach') {
        return { status: 'ok', managed: true, modules: {}, clients: [] }
    }
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    const raw = activeTeamId
        ? await getTeamEnabledModules(supabase, activeTeamId)
        : await getCoachEnabledModules(supabase, user.id)
    const modules = applyOperatorKillSwitch(raw)

    // Alumnos del workspace activo para el picker de Composición (reusa el listado scoped
    // del módulo cardio — mismo scope 3-vías; el hub solo necesita id + nombre).
    const clients =
        modules.body_composition === true
            ? (await listCardioClients(supabase, { coachId: user.id, activeTeamId })).map((c) => ({
                  id: c.id,
                  full_name: c.full_name,
              }))
            : []

    return { status: 'ok', managed: activeTeamId != null, modules, clients }
})
