import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { WorkspaceSummary } from '@/domain/auth/types'
import { listUserWorkspaces, resolvePreferredWorkspace } from './workspace.service'

/**
 * Variantes RSC-ONLY de la resolución de workspace, memoizadas por request con React.cache
 * y keyed ESTRICTAMENTE por `userId`. En un render de /coach/*, layout + page + _data resuelven
 * el workspace de forma independiente (2-4 veces, cada una = 2 round-trips DB); estas dedupean
 * a UNA ejecución por request.
 *
 * Seguridad (por qué keyear por userId no filtra entre tenants):
 *  - React.cache vive UN solo request server-side; no persiste entre requests ni entre workers.
 *    En un request hay un único usuario -> no hay forma de servir el workspace de A a B.
 *  - Crea su PROPIO cliente RSC (sesión via cookies del request) -> nunca recibe un cliente ajeno.
 *
 * PROHIBIDO usar esto en:
 *  - proxy.ts (Edge middleware, no es árbol RSC; además este archivo importa `server-only`
 *    transitivamente vía createClient).
 *  - /api/mobile/* (autentica por Bearer/service-role, NO por cookies -> createClient() no
 *    tendría sesión). Esos llaman resolvePreferredWorkspace/listUserWorkspaces directo.
 *  - server actions tras un boundary de mutación (cada invocación es su propio cache; sin dedup).
 */

export const getPreferredWorkspaceForRender = cache(
    async (userId: string): Promise<WorkspaceSummary | null> => {
        const supabase = await createClient()
        return resolvePreferredWorkspace(supabase, userId)
    }
)

export const listUserWorkspacesForRender = cache(
    async (userId: string): Promise<WorkspaceSummary[]> => {
        const supabase = await createClient()
        return listUserWorkspaces(supabase, userId)
    }
)
