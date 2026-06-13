import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

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

export const MODULE_KEYS = [
    'cardio',
    'movement_assessment',
    'body_composition',
    'nutrition_exchanges',
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

export type EnabledModules = Partial<Record<ModuleKey, boolean>>

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

export async function getTeamEnabledModules(db: DB, teamId: string): Promise<EnabledModules> {
    const { data } = await db.from('teams').select('enabled_modules').eq('id', teamId).maybeSingle()
    return asModules(data?.enabled_modules)
}

export async function getCoachEnabledModules(db: DB, coachId: string): Promise<EnabledModules> {
    const { data } = await db.from('coaches').select('enabled_modules').eq('id', coachId).maybeSingle()
    return asModules(data?.enabled_modules)
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
