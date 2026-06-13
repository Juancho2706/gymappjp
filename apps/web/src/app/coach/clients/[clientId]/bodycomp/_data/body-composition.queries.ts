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
 * Resultado discriminado para distinguir el módulo APAGADO (aviso amable hacia el catálogo,
 * plan 05 F5.7) del cliente inexistente / sin acceso / sin consentimiento (notFound seco).
 */
export type BodyCompositionResult =
    | { status: 'ok'; data: BodyCompositionData }
    | { status: 'module_off' }
    | { status: 'not_found' }

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
    async (clientId: string): Promise<BodyCompositionResult> => {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user) return { status: 'not_found' }

        // Kill-switch de plataforma + entitlement ANTES del acceso (SPEC AC5b: falla server-side).
        // Un fallo acá = módulo APAGADO para el tenant => aviso amable (plan 05 F5.7).
        try {
            await assertBodyCompositionEnabled()
        } catch {
            return { status: 'module_off' }
        }

        // Acceso al alumno bajo el workspace activo (scope 3-vías). Un fallo acá NO es módulo
        // apagado (es alumno inexistente / sin acceso) => notFound seco, sin pista del catálogo.
        let access: Awaited<ReturnType<typeof assertCoachClientWriteAccess>>
        try {
            access = await assertCoachClientWriteAccess(supabase, user.id, clientId)
        } catch {
            return { status: 'not_found' }
        }

        const ctx = access.viaTeam ? { teamId: access.teamId } : { coachId: user.id }
        try {
            await assertModule(supabase, 'body_composition', ctx)
        } catch {
            return { status: 'module_off' }
        }

        try {
            // AC6: consentimiento (team) + bitacora 'view' — el service falla sin consentimiento.
            const { bia, isak } = await listClientMeasurements(supabase, user.id, access, clientId)
            return { status: 'ok', data: { clientId, bia, isak } }
        } catch {
            return { status: 'not_found' }
        }
    }
)
