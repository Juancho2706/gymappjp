import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import {
    getStudentExchangeBundle,
    type StudentExchangeBundle,
} from '@/services/nutrition-exchanges/nutrition-exchanges.service'

/**
 * Bundle del modo intercambios para la app del ALUMNO.
 * - Cliente request-scoped (RLS techo: met_client_select / npdv_client_select) para
 *   targets, variantes y equivalencias.
 * - `createServiceRoleClient()` SOLO para el catálogo de grupos referenciados por SU plan
 *   (xg_select no da policy al alumno) + flags de módulo del tenant — acotado a los ids
 *   del plan + filtro de tenant (patrón F5 de movida-areas; gotcha: createRawAdminClient
 *   NO bypasea RLS con cookies).
 * Módulo OFF o plan en modo gramos ⇒ bundle vacío (la vista degrada sin chips, AC5).
 */
export const getStudentExchangeData = cache(
    async (input: {
        clientId: string
        planId: string
        planCoachId: string | null
        planMode: string | null | undefined
    }): Promise<StudentExchangeBundle> => {
        const supabase = await createClient()
        const serviceDb = createServiceRoleClient()
        return getStudentExchangeBundle(supabase, serviceDb, input)
    }
)
