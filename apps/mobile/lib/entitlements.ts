import { supabase } from './supabase'
import { getAppConfig } from './app-config'
import { getActiveScope } from './workspaces'

/**
 * Entitlements de módulos de pago (mobile) — espejo de show/hide de la web
 * (apps/web/src/services/entitlements.service.ts). El gate REAL de datos sigue
 * server-side (RLS + el service); esto solo decide qué mostrar en la app.
 *
 * Resolución (espejo de hasModule(db,key,{coachId,teamId}) de la web — el POOL gana,
 * NO es union): se resuelve por el WORKSPACE activo (lib/workspaces.getActiveScope):
 *  - coach_team (teamId set) → teams.enabled_modules del team activo.
 *  - standalone / enterprise_coach → coaches.enabled_modules (comportamiento de hoy).
 *
 * Kill-switch de operador (EVA_DISABLED_MODULES): es una env SERVER-ONLY que RN no ve.
 * Se obtiene via `GET /api/mobile/config` (lib/app-config.ts, cacheado) y se RESTA del
 * entitlement en `hasModule` → un modulo killeado devuelve false aunque
 * `coaches.enabled_modules` lo tenga true. Espejo de `applyOperatorKillSwitch` /
 * `isModuleKilledByOperator` en la web (entitlements.service.ts). Fail-OPEN: si el config
 * no carga, NO se killea nada (config = `{ disabledModules: [] }`).
 */

export const MODULE_KEYS = ['cardio', 'movement_assessment', 'body_composition', 'nutrition_exchanges'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]
export type EnabledModules = Partial<Record<ModuleKey, boolean>>

function asModules(value: unknown): EnabledModules {
  return value && typeof value === 'object' ? (value as EnabledModules) : {}
}

/** enabled_modules del coach actual (objeto {key:true}); {} por defecto / error. */
export async function getCoachEnabledModules(): Promise<EnabledModules> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const id = auth.user?.id
    if (!id) return {}
    const { data } = await supabase.from('coaches').select('enabled_modules').eq('id', id).maybeSingle()
    return asModules((data as any)?.enabled_modules)
  } catch {
    return {}
  }
}

/** enabled_modules del team (pool) activo (objeto {key:true}); {} por defecto / error. */
async function getTeamEnabledModules(teamId: string): Promise<EnabledModules> {
  try {
    const { data } = await supabase.from('teams').select('enabled_modules').eq('id', teamId).maybeSingle()
    return asModules((data as any)?.enabled_modules)
  } catch {
    return {}
  }
}

/**
 * Resuelve los enabled_modules del WORKSPACE activo (espejo de la web):
 *  - coach_team → teams.enabled_modules del team activo (el POOL gana).
 *  - standalone / enterprise_coach → coaches.enabled_modules (comportamiento de hoy).
 * Fail-safe: ante cualquier error en el scope, cae a coaches (caso comun standalone).
 */
async function getActiveWorkspaceEnabledModules(): Promise<EnabledModules> {
  let scope: Awaited<ReturnType<typeof getActiveScope>> | null = null
  try {
    scope = await getActiveScope()
  } catch {
    scope = null
  }
  if (scope?.type === 'coach_team' && scope.teamId) {
    return getTeamEnabledModules(scope.teamId)
  }
  return getCoachEnabledModules()
}

/**
 * ¿El WORKSPACE activo (team pool o coach standalone) tiene el módulo `key` habilitado
 * Y NO killeado por el operador?
 *
 * `visible = enabled_modules[key] === true AND key NO esta en disabledModules` (kill-switch).
 * En contexto team los enabled_modules salen de teams.enabled_modules (el pool gana); en
 * standalone/enterprise salen de coaches.enabled_modules (comportamiento de hoy).
 * Fail-OPEN: si el config no carga, `disabledModules` queda `[]` => solo manda el entitlement
 * (comportamiento de hoy). El config se lee cacheado (no fetchea en cada llamada).
 */
export async function hasModule(key: ModuleKey): Promise<boolean> {
  const [modules, config] = await Promise.all([getActiveWorkspaceEnabledModules(), getAppConfig()])
  if (config.disabledModules.includes(key)) return false
  return modules[key] === true
}
