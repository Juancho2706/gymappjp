import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { hasEffectiveAccess, isManagedSubscription } from '@/lib/coach-subscription-gate'

type DB = SupabaseClient<Database>

/**
 * Module entitlements (feature toggles) for the new powerful modules.
 *
 * Resolution rule (LOCKED): resolve by the RESOURCE CONTEXT.
 *   - Pool/team context  -> teams.enabled_modules  (the POOL wins; not a union)
 *   - Standalone coach   -> coaches.enabled_modules (own dashboard)
 * The team modules do NOT leak to a coach's personal standalone clients.
 *
 * Gating must be enforced SERVER-SIDE (this service) before running a module
 * action/RSC; never trust enabled_modules sent from the client. The UI mirrors
 * this only for show/hide. Defaults OFF (`{}`).
 */

// Fuente canónica movida a lib/module-keys (módulo hoja) para romper el ciclo
// entitlements → coach-subscription-gate → constants → entitlements que reventaba
// el build de producción. Se re-exporta para no tocar a los consumidores.
export { MODULE_KEYS } from '@/lib/module-keys'
export type { ModuleKey, EnabledModules } from '@/lib/module-keys'
import { MODULE_KEYS } from '@/lib/module-keys'
import type { ModuleKey, EnabledModules } from '@/lib/module-keys'

/**
 * Kill-switch de PLATAFORMA (flag de operador, por encima del entitlement del tenant):
 * EVA_DISABLED_MODULES="cardio,body_composition" apaga el modulo para TODOS aunque el
 * team/coach lo tenga ON. Requiere redeploy (decision v1 del Director §2.1). El toggle
 * de Settings>Modulos NO se oculta: el gate real es server-side via hasModule/assertModule.
 */
export function isModuleKilledByOperator(key: ModuleKey): boolean {
    const raw = process.env.EVA_DISABLED_MODULES ?? ''
    if (!raw) return false
    return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(key)
}

/** Aplica el kill-switch de operador sobre un mapa de modulos (para UI/nav). */
export function applyOperatorKillSwitch(modules: EnabledModules): EnabledModules {
    const out: EnabledModules = {}
    for (const key of MODULE_KEYS) {
        out[key] = modules[key] === true && !isModuleKilledByOperator(key)
    }
    return out
}

function asModules(value: unknown): EnabledModules {
    return (value && typeof value === 'object' ? (value as EnabledModules) : {})
}

/** Los 4 módulos en ON (mapa completo). Base de la derivación "acceso vigente ⇒ todos incluidos". */
const ALL_MODULES_ON: EnabledModules = {
    cardio: true,
    movement_assessment: true,
    body_composition: true,
    nutrition_exchanges: true,
}

/**
 * CRITERIO ÚNICO de módulos: coach con ACCESO VIGENTE ⇒ los 4 módulos incluidos. No hay ninguna
 * distinción por tipo de suscripción; lo único que se cobra es el CUPO de alumnos.
 * Señal de "acceso vigente":
 *   - managed (org/team): la suscripción la administra el pool/org ⇒ acceso siempre
 *     (`isManagedSubscription`).
 *   - standalone: `hasEffectiveAccess(status, current_period_end)` (respeta gracia por cancel/
 *     trial/dunning hasta el corte; bloquea pending_payment/expired).
 * INACTIVO / expirado / bloqueado ⇒ false (sin derivación; sus cortesías `admin_grant` siguen
 * valiendo porque no se tocan las filas crudas).
 * El kill-switch de operador (`isModuleKilledByOperator`) NO se evalúa acá: se aplica por encima,
 * en `hasModule` / `hasModuleFromMap`.
 * `subscriptionTier` queda en la firma por compatibilidad de los call sites, pero no influye.
 * Renombrada en W4.4 (antes decía "Paid" en el nombre; Pricing v2 P3, 2026-08-17,
 * `docs/specs/pricing-v2/SPEC.md`).
 */
export function hasActiveModuleAccess(access: {
    subscriptionStatus?: string | null
    currentPeriodEnd?: string | null
    /** No gatea nada: se conserva para no romper a los llamadores que arman el snapshot. */
    subscriptionTier?: string | null
}): boolean {
    if (isManagedSubscription(access.subscriptionStatus)) return true
    return hasEffectiveAccess(access.subscriptionStatus, access.currentPeriodEnd)
}

/**
 * Deriva el mapa de módulos efectivo para un STANDALONE a partir de sus flags crudos + su acceso.
 * Criterio único: con acceso vigente (`hasActiveModuleAccess`) los 4 módulos quedan en ON.
 * UNION con las filas crudas (cortesías `admin_grant` ya presentes = no-op, quedan todos en true).
 * Solo el INACTIVO (expirado/bloqueado) respeta el raw tal cual, incluida una cortesía puntual.
 * El kill-switch de operador se aplica después, en `hasModule` / `hasModuleFromMap`.
 * Derivar SOLO en LECTURA: jamás escribe `coach_addons` ni `coaches.enabled_modules` (billing intacto).
 * Renombrada en W4.4 (antes decía "Paid" en el nombre; Pricing v2 P3, 2026-08-17).
 */
export function deriveModulesForActiveAccess(
    raw: EnabledModules,
    access: {
        subscriptionStatus?: string | null
        currentPeriodEnd?: string | null
        subscriptionTier?: string | null
    }
): EnabledModules {
    if (!hasActiveModuleAccess(access)) return raw
    return { ...raw, ...ALL_MODULES_ON }
}

export async function getTeamEnabledModules(db: DB, teamId: string): Promise<EnabledModules> {
    const { data } = await db.from('teams').select('enabled_modules').eq('id', teamId).maybeSingle()
    if (!data) return {}
    // Un team es un pool con acceso siempre vigente por diseño (sus coaches son `team_managed`):
    // los 4 módulos quedan incluidos. UNION con `teams.enabled_modules` crudo (idempotente).
    return { ...asModules(data.enabled_modules), ...ALL_MODULES_ON }
}

export async function getCoachEnabledModules(db: DB, coachId: string): Promise<EnabledModules> {
    const { data } = await db
        .from('coaches')
        .select('enabled_modules, subscription_status, current_period_end, subscription_tier')
        .eq('id', coachId)
        .maybeSingle()
    if (!data) return {}
    return deriveModulesForActiveAccess(asModules(data.enabled_modules), {
        subscriptionStatus: data.subscription_status,
        currentPeriodEnd: data.current_period_end,
        subscriptionTier: data.subscription_tier,
    })
}

/**
 * Fila minima de scope del PROPIO alumno (`clients`), tal como la leen los gates de su nav.
 * Es la union de lo que hoy leen `findClientScopeRow` (id/full_name/team_id/coach_id) y el
 * `isOrgScopedClient` de cada modulo (org_id) — se expone acá para poder pasarla YA resuelta.
 */
export type StudentModuleScope = {
    id: string
    full_name: string | null
    team_id: string | null
    coach_id: string | null
    org_id: string | null
}

/**
 * Contexto del alumno YA resuelto por el arbol que llama, para deduplicar lecturas dentro de un
 * mismo render (varios gates preguntando por la MISMA fila `clients` y el MISMO mapa de modulos).
 *
 * Contrato para no mover la semantica ni un pelo:
 *  - `scope: null` significa "no hay fila / la lectura fallo" => el gate cierra igual que hoy.
 *  - `modules` debe resolverse con la MISMA regla que `hasModule` (LOCKED): si hay `team_id`
 *    manda `teams.enabled_modules`; si no, `coaches.enabled_modules`. Nunca una union.
 *  - El kill-switch de operador NO viaja acá: cada gate lo sigue evaluando por su cuenta.
 */
export type StudentModulePrefetch = {
    scope: StudentModuleScope | null
    modules: EnabledModules
}

/**
 * Is `key` enabled for the given resource context?
 * teamId present => the team decides (pool wins). Else the coach's own flags.
 */
export async function hasModule(
    db: DB,
    key: ModuleKey,
    ctx: { teamId?: string | null; coachId?: string | null }
): Promise<boolean> {
    if (isModuleKilledByOperator(key)) return false
    if (ctx.teamId) {
        return (await getTeamEnabledModules(db, ctx.teamId))[key] === true
    }
    if (ctx.coachId) {
        return (await getCoachEnabledModules(db, ctx.coachId))[key] === true
    }
    return false
}

/** Throwing guard for use at the top of a module server action / RSC. */
export async function assertModule(
    db: DB,
    key: ModuleKey,
    ctx: { teamId?: string | null; coachId?: string | null }
): Promise<void> {
    if (!(await hasModule(db, key, ctx))) {
        throw new Error(`Modulo no habilitado: ${key}`)
    }
}
