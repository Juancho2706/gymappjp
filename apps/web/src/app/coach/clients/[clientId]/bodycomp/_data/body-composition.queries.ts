import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { assertModule } from '@/services/entitlements.service'
import {
    assertBodyCompositionEnabled,
    assertCoachClientWriteAccess,
    listClientMeasurements,
} from '@/services/bodycomp/body-composition.service'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'

export type BodyCompositionData = {
    clientId: string
    bia: BodyCompositionRow[]
    isak: BodyCompositionRow[]
}

/**
 * RSC data loader del modulo composicion corporal. Data flow obligatorio (Clean Arch):
 *   _data -> service -> repository -> Supabase. NO se llama a Supabase directo para los datos.
 *
 * Gating server-side al tope (no solo ocultar UI):
 *   - write/read-access del cliente bajo el workspace activo (scope 3-vias)
 *   - assertModule('body_composition', ctx) — falla si el modulo no esta habilitado para el tenant
 *   - AC6 (lectura): en contexto team, consentimiento de salud activo obligatorio para LEER +
 *     bitacora 'view' en team_access_logs (ambos viven en listClientMeasurements del service)
 * Devuelve null si el coach no tiene acceso, el modulo esta apagado o falta el consentimiento
 * (el page renderiza notFound: la lectura falla server-side, no se exponen datos).
 */
export const getClientBodyComposition = cache(
    async (clientId: string): Promise<BodyCompositionData | null> => {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return null

        try {
            // Kill-switch de plataforma ANTES del entitlement (SPEC AC5b: action/RSC falla server-side).
            await assertBodyCompositionEnabled()
            const access = await assertCoachClientWriteAccess(supabase, user.id, clientId)
            const ctx = access.viaTeam ? { teamId: access.teamId } : { coachId: user.id }
            await assertModule(supabase, 'body_composition', ctx)
            // AC6: consentimiento (team) + bitacora 'view' — el service falla sin consentimiento.
            const { bia, isak } = await listClientMeasurements(supabase, user.id, access, clientId)
            return { clientId, bia, isak }
        } catch {
            return null
        }
    }
)
