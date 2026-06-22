import { supabase } from './supabase'
import { getAppConfig } from './app-config'

/**
 * Entitlements de módulos de pago (mobile) — espejo de show/hide de la web
 * (apps/web/src/services/entitlements.service.ts). El gate REAL de datos sigue
 * server-side (RLS + el service); esto solo decide qué mostrar en la app.
 *
 * Resolución: standalone coach → coaches.enabled_modules (objeto {key:boolean}).
 * El contexto team (pool) no se resuelve acá (mobile coach standalone v1).
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

/**
 * ¿El coach actual tiene el módulo `key` habilitado Y NO killeado por el operador?
 *
 * `visible = enabled_modules[key] === true AND key NO esta en disabledModules` (kill-switch).
 * Fail-OPEN: si el config no carga, `disabledModules` queda `[]` => solo manda el entitlement
 * (comportamiento de hoy). El config se lee cacheado (no fetchea en cada llamada).
 */
export async function hasModule(key: ModuleKey): Promise<boolean> {
  const [modules, config] = await Promise.all([getCoachEnabledModules(), getAppConfig()])
  if (config.disabledModules.includes(key)) return false
  return modules[key] === true
}
