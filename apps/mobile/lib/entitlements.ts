import { supabase } from './supabase'

/**
 * Entitlements de módulos de pago (mobile) — espejo de show/hide de la web
 * (apps/web/src/services/entitlements.service.ts). El gate REAL de datos sigue
 * server-side (RLS + el service); esto solo decide qué mostrar en la app.
 *
 * Resolución: standalone coach → coaches.enabled_modules (objeto {key:boolean}).
 * El contexto team (pool) no se resuelve acá (mobile coach standalone v1).
 * El kill-switch de operador (EVA_DISABLED_MODULES) es server-only — no se lee acá.
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

/** ¿El coach actual tiene el módulo `key` habilitado? */
export async function hasModule(key: ModuleKey): Promise<boolean> {
  const modules = await getCoachEnabledModules()
  return modules[key] === true
}
