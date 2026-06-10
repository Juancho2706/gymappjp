'use server'

import { createClient } from '@/lib/supabase/server'
import { getCoach } from '@/lib/coach/get-coach'
import { isCurrentUserTeamManager } from '@/services/auth/team.service'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'
import { revalidatePath } from 'next/cache'

export type ModulesActionState = { error?: string; success?: boolean }

/**
 * Persiste los modulos habilitados. Whitelist estricto (solo MODULE_KEYS, booleans).
 * TEAM: solo owner/co-gestor (verificado + RLS team_teams_manager_update). Standalone: el propio coach.
 * Cliente user-scoped -> RLS es el gate real; el check de gestor es defensa + UX.
 */
export async function saveModulesAction(input: Partial<Record<ModuleKey, boolean>>): Promise<ModulesActionState> {
    const modules: Record<string, boolean> = {}
    for (const k of MODULE_KEYS) modules[k] = input?.[k] === true

    const supabase = await createClient()
    const coach = await getCoach()
    if (!coach) return { error: 'No autenticado.' }
    if (coach.subscription_status === 'org_managed') return { error: 'No disponible en cuentas gestionadas por una organización.' }

    // Contexto = workspace ACTIVO (igual que getModulesContext): coach_team edita el team activo;
    // cualquier otro contexto edita los módulos propios del coach.
    const workspace = await resolvePreferredWorkspace(supabase, coach.id)
    if (workspace?.type === 'enterprise_coach') return { error: 'No disponible en cuentas gestionadas por una organización.' }

    if (workspace?.type === 'coach_team') {
        const teamId = workspace.teamId
        const isMgr = await isCurrentUserTeamManager(supabase, teamId)
        if (!isMgr) return { error: 'Solo el owner o co-gestor del equipo puede cambiar los módulos.' }
        const { error } = await supabase.from('teams').update({ enabled_modules: modules }).eq('id', teamId)
        if (error) return { error: error.message }
        revalidatePath('/coach/settings/modules')
        return { success: true }
    }

    const { error } = await supabase.from('coaches').update({ enabled_modules: modules }).eq('id', coach.id)
    if (error) return { error: error.message }
    revalidatePath('/coach/settings/modules')
    return { success: true }
}
