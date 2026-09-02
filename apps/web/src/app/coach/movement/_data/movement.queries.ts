import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { assertModule } from '@/services/entitlements.service'
import { resolveMovementDomainEnabled } from '@/services/feature-prefs.service'
import {
    getClientMovementDetail,
    getMovementHubData,
    getMovementPrintData,
    getMovementWizardData,
    type MovementClientDetail,
    type MovementHubData,
    type MovementPrintData,
    type MovementWizardData,
} from '@/services/assessment/movement-assessment.service'

// _data del modulo movement_assessment: SIEMPRE via service -> repository (jamas
// Supabase directo). Gating server-side (assertModule + scope 3-vias) vive en el
// service; aca un fallo de gate/acceso se traduce a un status discriminado.

export type MovementHubResult =
    | { status: 'unauthenticated' }
    | { status: 'module_off' }
    | { status: 'domain_off' }
    | { status: 'ok'; data: MovementHubData }

/**
 * Hub del modulo: distingue module_off (aviso amable, plan 05 F5.7) de no-sesion. El gate
 * server-side (assertModule por workspace activo) sigue siendo el techo: si el modulo esta
 * apagado la page muestra ModuleOffNotice, no datos.
 *
 * Ola de orden W1.4b: la PREFERENCIA del coach (dominio `movement` apagado en Opciones › Mi
 * panel) se evalua ANTES que el modulo — el aviso correcto para quien lo apago el mismo es
 * «prendelo de nuevo», no «compra el modulo». El assertModule sigue debajo como kill-switch de
 * operador / entitlement: la preferencia solo achica, nunca autoriza.
 */
export const getMovementHub = cache(async (): Promise<MovementHubResult> => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { status: 'unauthenticated' }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    // Enterprise v1: modulo OFF (paridad con cardio). Team manda; standalone usa flags del coach.
    if (workspace?.type === 'enterprise_coach') return { status: 'module_off' }
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    // Preferencia del coach (dominio) ANTES del modulo. `clientOrgId: null`: el caso enterprise ya
    // salio arriba; el resolver es fail-OPEN, solo un `false` explicito apaga.
    if (
        !(await resolveMovementDomainEnabled({
            coachId: user.id,
            clientTeamId: activeTeamId,
            clientOrgId: null,
        }))
    ) {
        return { status: 'domain_off' }
    }

    try {
        await assertModule(supabase, 'movement_assessment', {
            teamId: activeTeamId,
            coachId: activeTeamId ? null : user.id,
        })
    } catch {
        return { status: 'module_off' }
    }

    try {
        const data = await getMovementHubData(supabase, user.id)
        return { status: 'ok', data }
    } catch {
        // Fallo de scope/acceso tras pasar el gate del modulo => no exponemos datos.
        return { status: 'module_off' }
    }
})

/**
 * Resultado de las SUBRUTAS por alumno (reporte, wizard, print). Antes devolvían `data | null` y
 * las pages hacían `notFound()`: con el dominio apagado el coach se topaba con un 404 seco en vez
 * del aviso «prendé Movimiento» — la puerta quedaba cerrada sin decir quién la cerró (OB9).
 *
 * `not_found` conserva EXACTAMENTE la semántica del `null` anterior (sin sesión, sin acceso, sin
 * módulo, enterprise, alumno inexistente): esto es visibilidad, nunca autorización.
 */
export type MovementClientResult<T> =
    | { status: 'domain_off' }
    | { status: 'not_found' }
    | { status: 'ok'; data: T }

/**
 * ¿El coach apagó el dominio `movement` en Opciones › Mi panel? Mismo orden y mismo contexto que
 * el hub (`clientOrgId: null`; el resolver es fail-OPEN: solo un `false` explícito apaga).
 *
 * Enterprise v1 sale ANTES sin leer preferencias: el módulo directamente no se ofrece ahí y el
 * service lo rechaza igual, así que el resultado correcto sigue siendo `not_found`, no `domain_off`.
 *
 * El ctx es el del WORKSPACE ACTIVO, no el del alumno (espejo de `cardio/[clientId]`): la
 * preferencia que se está evaluando es la del panel del coach, y el override por-alumno NO apaga
 * superficies — es la puerta para volver a prenderlas.
 */
async function isMovementDomainOff(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
): Promise<boolean> {
    const workspace = await resolvePreferredWorkspace(supabase, userId)
    if (workspace?.type === 'enterprise_coach') return false
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
    return !(await resolveMovementDomainEnabled({
        coachId: userId,
        clientTeamId: activeTeamId,
        clientOrgId: null,
    }))
}

export const getMovementClientReport = cache(
    async (clientId: string): Promise<MovementClientResult<MovementClientDetail>> => {
        const supabase = await createClient()
        // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
        const { data: __cl } = await supabase.auth.getClaims()
        const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
        if (!user) return { status: 'not_found' }

        // Preferencia del coach ANTES de tocar los datos del alumno (mismo orden que el hub).
        if (await isMovementDomainOff(supabase, user.id)) return { status: 'domain_off' }

        try {
            return { status: 'ok', data: await getClientMovementDetail(supabase, user.id, clientId) }
        } catch {
            return { status: 'not_found' }
        }
    },
)

export const getMovementWizard = cache(
    async (clientId: string): Promise<MovementClientResult<MovementWizardData & { currentUserId: string }>> => {
        const supabase = await createClient()
        // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
        const { data: __cl } = await supabase.auth.getClaims()
        const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
        if (!user) return { status: 'not_found' }

        if (await isMovementDomainOff(supabase, user.id)) return { status: 'domain_off' }

        try {
            const data = await getMovementWizardData(supabase, user.id, clientId)
            return { status: 'ok', data: { ...data, currentUserId: user.id } }
        } catch {
            return { status: 'not_found' }
        }
    },
)

export const getMovementPrint = cache(
    async (clientId: string, assessmentId: string): Promise<MovementClientResult<MovementPrintData>> => {
        const supabase = await createClient()
        // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
        const { data: __cl } = await supabase.auth.getClaims()
        const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
        if (!user) return { status: 'not_found' }

        if (await isMovementDomainOff(supabase, user.id)) return { status: 'domain_off' }

        try {
            const data = await getMovementPrintData(supabase, user.id, clientId, assessmentId)
            return { status: 'ok', data }
        } catch {
            return { status: 'not_found' }
        }
    },
)
