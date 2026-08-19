import { cache } from 'react'
import { headers } from 'next/headers'
import { decodeBrandHeaderValue } from '@/lib/brand-header-codec'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import { isStudentMovementEnabled } from '@/services/assessment/movement-assessment.service'
import { isStudentBodyCompositionEnabled } from '@/services/bodycomp/body-composition.service'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import {
    getCoachEnabledModules,
    getTeamEnabledModules,
    type EnabledModules,
    type StudentModulePrefetch,
    type StudentModuleScope,
} from '@/services/entitlements.service'

/**
 * Contexto de pool/team detectable en Server Components: el proxy /t/[team_slug] reescribe a
 * /c/[coach_slug] y reenvía la marca del TEAM en headers (x-workspace-brand-source==='organization'
 * + x-client-base-path=/t/...). Sirve para no filtrar la marca/contacto PERSONAL del coach al
 * alumno de pool (la gestiona el dueño del team, no el coach asignado). Standalone => false.
 */
async function getTeamBrandContext() {
    const h = await headers()
    const basePath = h.get('x-client-base-path') ?? ''
    const isOrgSource = h.get('x-workspace-brand-source') === 'organization'
    const isTeam = isOrgSource || basePath.startsWith('/t')
    return { isTeam, teamBrandName: isTeam ? decodeBrandHeaderValue(h.get('x-coach-brand-name')) : null }
}

export const getClientRootUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
    const supabase = await createClient()
    // getClaims(): verificación LOCAL del JWT (llaves asimétricas ES256 + JWKS cacheado), sin
    // round-trip a GoTrue /user. Raíz de auth de LECTURA para el nav/guards del alumno; getUser se
    // mantiene en mutaciones (check-in, etc.). El proxy ya validó/refrescó la sesión antes del render.
    const { data } = await supabase.auth.getClaims()
    const c = data?.claims
    if (!c?.sub) return null
    return { id: c.sub, email: typeof c.email === 'string' ? c.email : null }
})

/**
 * Fila de scope del PROPIO alumno, leida UNA sola vez por request.
 *
 * Antes cada gate del nav leia `clients` por su cuenta: `findClientScopeRow` (movimiento) +
 * `isOrgScopedClient` (movimiento) + los dos espejos de bodycomp + el select del gate de
 * nutricion = 5 SELECT identicos a la MISMA fila. React.cache dedupea de verdad porque este
 * helper NO recibe argumentos: crea su propio cliente USER-scoped adentro (`createClient()`,
 * RLS = techo, `clients.id = auth.uid()`) — un cache() keyed por el cliente no dedupearia nada.
 *
 * Contrato de errores preservado: `null` == no hay fila O la lectura fallo, que es exactamente
 * lo que cada consumidor ya trataba como "cerrar el gate" (movimiento/bodycomp) o "usar los
 * defaults vacios" (nutricion, fail-OPEN). Nunca service-role: el scope del alumno se lee
 * siempre con SU sesion (B8).
 */
export const getStudentScopeRow = cache(async (): Promise<StudentModuleScope | null> => {
    const user = await getClientRootUser()
    if (!user) return null
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, coach_id, team_id, org_id')
        .eq('id', user.id)
        .maybeSingle()
    if (error || !data) return null
    return data as StudentModuleScope
})

/**
 * Mapa de modulos habilitados para el contexto del alumno, memoizado por request y keyed por
 * PRIMITIVOS (teamId/coachId) — mismo criterio que `getEnabledModulesForRender`, pero con
 * service-role porque el alumno NO puede SELECT en teams/coaches por RLS. El cliente se crea
 * ADENTRO a proposito: cada gate creaba el suyo y un cache() keyed por el cliente jamas
 * dedupearia (React.cache compara argumentos por identidad).
 *
 * Regla de resolucion IDENTICA a `hasModule` (LOCKED): con `team_id` manda el pool
 * (`teams.enabled_modules`); si no, los flags del coach. Nunca una union. Sin ninguno => `{}`.
 */
const getStudentNavEnabledModules = cache(
    async (teamId: string | null, coachId: string | null): Promise<EnabledModules> => {
        if (!teamId && !coachId) return {}
        const admin = createServiceRoleClient()
        if (teamId) return getTeamEnabledModules(admin, teamId)
        return getCoachEnabledModules(admin, coachId!)
    },
)

/** Cliente service-role unico por request para los gates del nav (evita instanciar uno por gate). */
const getNavEntitlementsDb = cache(() => createServiceRoleClient())

/**
 * Scope + mapa de modulos ya resueltos, para que movimiento y bodycomp compartan las lecturas
 * en vez de repetirlas. El kill-switch de operador NO viaja aca: cada gate lo evalua por su
 * cuenta (es lo primero que hace cada `isStudent*Enabled`).
 */
const getStudentModulePrefetch = cache(async (): Promise<StudentModulePrefetch> => {
    const scope = await getStudentScopeRow()
    if (!scope) return { scope: null, modules: {} }
    const modules = await getStudentNavEnabledModules(scope.team_id, scope.coach_id)
    return { scope, modules }
})

/**
 * Espejo del modulo movement_assessment para el nav del alumno (pool => su team;
 * standalone => su coach). Service-role SOLO para leer enabled_modules (RLS no
 * deja al alumno leer teams/coaches); el gate real es la page de movimiento.
 */
export const getStudentMovementNavEnabled = cache(async () => {
    const user = await getClientRootUser()
    if (!user) return false
    const supabase = await createClient()
    try {
        const prefetch = await getStudentModulePrefetch()
        return await isStudentMovementEnabled(supabase, getNavEntitlementsDb(), user.id, prefetch)
    } catch {
        return false
    }
})

/**
 * Espejo del modulo body_composition para el nav del alumno (pool => su team; standalone => su
 * coach). Service-role SOLO para leer enabled_modules (RLS no deja al alumno leer teams/coaches);
 * el gate real es la page de bodycomp.
 */
export const getStudentBodyCompositionNavEnabled = cache(async () => {
    const user = await getClientRootUser()
    if (!user) return false
    const supabase = await createClient()
    try {
        const prefetch = await getStudentModulePrefetch()
        return await isStudentBodyCompositionEnabled(supabase, getNavEntitlementsDb(), user.id, prefetch)
    } catch {
        return false
    }
})

/**
 * Master switch del dominio Nutricion para el NAV del alumno (tab "Plan Alimenticio"). Espejo
 * exacto de `getDashboardNutritionDomainEnabled`: resuelve el scope (coach/team/org) desde la
 * fila `clients` del PROPIO alumno (RLS techo: `clients.id = auth.uid()`), no del coach del plan
 * — asi cubre el caso "sin plan todavia" (el dominio puede estar apagado sin que exista plan).
 *
 * Cuando el coach apaga la nutricion para este alumno, el tab del nav se OCULTA (render-only; la
 * page tambien gatea con `resolveNutritionDomainEnabled` => `NutritionDomainOff`). React.cache +
 * fail-OPEN del flag `FEATURE_PREFS_ENABLED` (flag OFF => `true`, nada se oculta) heredado del
 * resolver. Fail-CLOSED a `true` ante error: nunca esconder el tab por un fallo de lectura.
 */
export const getStudentNutritionNavEnabled = cache(async (): Promise<boolean> => {
    const user = await getClientRootUser()
    if (!user) return true
    try {
        // Misma fila `clients` que los gates de modulos (getStudentScopeRow, cache por request):
        // antes este gate hacia su PROPIO select. `null` == fila ausente o lectura fallida, que es
        // exactamente el caso que este bloque ya cubria con `data?.x ?? defecto`.
        const scope = await getStudentScopeRow()
        return await resolveNutritionDomainEnabled({
            coachId: scope?.coach_id ?? '',
            clientId: user.id,
            clientTeamId: scope?.team_id ?? null,
            clientOrgId: scope?.org_id ?? null,
        })
    } catch {
        return true
    }
})

export const getSuspendedCoachData = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    // Reuse the shared auth root (cache()-deduped) instead of a second getUser() round-trip.
    const user = await getClientRootUser()
    if (!user) return { user: null, coach: null, isTeam: false }

    // Pool/team: la suspensión la gestiona el DUEÑO del team, no el coach asignado. Nunca
    // exponer brand_name/WhatsApp PERSONAL del coach al alumno de pool — usar la marca del team
    // (header del proxy) y sin contacto personal (los teams no tienen canal de soporte por columna).
    const { isTeam, teamBrandName } = await getTeamBrandContext()
    if (isTeam) {
        return {
            user,
            coach: { brand_name: teamBrandName || 'tu equipo', whatsapp: null } as { brand_name: string; whatsapp: string | null },
            isTeam: true,
        }
    }

    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, whatsapp')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return { user, coach: coach as { brand_name: string; whatsapp: string | null } | null, isTeam: false }
})
