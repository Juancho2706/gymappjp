import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { EnabledModules, ModuleKey } from '@/lib/module-keys'
import {
    getCoachEnabledModules,
    getTeamEnabledModules,
    isModuleKilledByOperator,
} from './entitlements.service'

/**
 * Variante RSC-ONLY del mapa de módulos habilitados, memoizada por request con React.cache
 * y keyed ESTRICTAMENTE por primitivos (`teamId`, `coachId`) — un objeto de contexto como key
 * NO dedupea (React.cache compara argumentos por identidad).
 *
 * Por qué existe: cada `hasModule(db, key, ctx)` hace su PROPIO SELECT. La ficha del alumno
 * preguntaba por 3 módulos (standalone) o 4 (panel del master-detail) => 3-4 SELECT IDÉNTICOS
 * a `coaches`/`teams` por render. Acá se lee el mapa UNA vez y los flags se derivan en memoria
 * con `hasModuleFromMap`.
 *
 * Regla de resolución (idéntica a `hasModule`, LOCKED): el contexto del RECURSO manda —
 * `teamId` presente => `teams.enabled_modules` (el pool gana, no es unión); si no, los flags
 * del coach. Sin ninguno => `{}` (todo OFF).
 *
 * Seguridad (por qué keyear por ids no filtra entre tenants):
 *  - React.cache vive UN solo request server-side; no persiste entre requests ni workers.
 *  - Crea su PROPIO cliente RSC (sesión vía cookies del request) => nunca recibe un cliente ajeno.
 *  - El gate REAL sigue siendo server-side (`hasModule`/`assertModule` en la página/acción del
 *    módulo). Esto es el espejo de lectura para mostrar/ocultar, igual que antes.
 *
 * PROHIBIDO usar esto en `/api/mobile/*` (autentica por Bearer/service-role, no por cookies)
 * ni en `proxy.ts` (no es árbol RSC): esos siguen llamando `hasModule` con su propio cliente.
 */
export const getEnabledModulesForRender = cache(
    async (teamId: string | null, coachId: string | null): Promise<EnabledModules> => {
        if (!teamId && !coachId) return {}
        const supabase = await createClient()
        if (teamId) return getTeamEnabledModules(supabase, teamId)
        return getCoachEnabledModules(supabase, coachId!)
    }
)

/**
 * Espejo en memoria de `hasModule` sobre un mapa ya resuelto. Aplica el kill-switch de
 * PLATAFORMA (`EVA_DISABLED_MODULES`), que en `hasModule` corta antes de tocar la DB.
 */
export function hasModuleFromMap(modules: EnabledModules, key: ModuleKey): boolean {
    if (isModuleKilledByOperator(key)) return false
    return modules[key] === true
}
