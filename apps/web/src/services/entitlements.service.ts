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

/** Los 4 módulos en ON (mapa completo). Base de la derivación "pago ⇒ todos incluidos". */
const ALL_MODULES_ON: EnabledModules = {
    cardio: true,
    movement_assessment: true,
    body_composition: true,
    nutrition_exchanges: true,
}

/**
 * Decisión CEO (2026-07-17, definitiva): los 4 módulos quedan INCLUIDOS para todo coach con
 * suscripción PAGA activa. Señal de "pago activo":
 *   - managed (org/team): el pool/org paga ⇒ acceso siempre (isManagedSubscription).
 *   - standalone: `hasEffectiveAccess(status, current_period_end)` (respeta gracia por cancel/
 *     trial/dunning hasta el corte; bloquea pending_payment/expired) Y tier != 'free'.
 * FREE / expirado / bloqueado ⇒ false (sin derivación; sus cortesías `admin_grant` siguen valiendo
 * porque no se tocan las filas crudas).
 */
export function hasPaidModuleAccess(access: {
    subscriptionStatus?: string | null
    currentPeriodEnd?: string | null
    subscriptionTier?: string | null
}): boolean {
    if (isManagedSubscription(access.subscriptionStatus)) return true
    if (!hasEffectiveAccess(access.subscriptionStatus, access.currentPeriodEnd)) return false
    return (access.subscriptionTier ?? 'free') !== 'free'
}

/**
 * Deriva el mapa de módulos efectivo para un STANDALONE a partir de sus flags crudos + su acceso
 * de suscripción. UNION con las filas crudas (cortesías `admin_grant` ya presentes = no-op, ya que
 * quedan todos en true para pago; para FREE se respeta el raw tal cual, incluida una cortesía puntual).
 * Derivar SOLO en LECTURA: jamás escribe `coach_addons` ni `coaches.enabled_modules` (billing intacto).
 */
export function deriveModulesForPaidAccess(
    raw: EnabledModules,
    access: {
        subscriptionStatus?: string | null
        currentPeriodEnd?: string | null
        subscriptionTier?: string | null
    }
): EnabledModules {
    if (!hasPaidModuleAccess(access)) return raw
    return { ...raw, ...ALL_MODULES_ON }
}

export async function getTeamEnabledModules(db: DB, teamId: string): Promise<EnabledModules> {
    const { data } = await db.from('teams').select('enabled_modules').eq('id', teamId).maybeSingle()
    if (!data) return {}
    // Un team es un pool PAGO por diseño (coaches del pool = `team_managed`, acceso siempre):
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
    return deriveModulesForPaidAccess(asModules(data.enabled_modules), {
        subscriptionStatus: data.subscription_status,
        currentPeriodEnd: data.current_period_end,
        subscriptionTier: data.subscription_tier,
    })
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
