import { cache } from 'react'
import {
    NUTRITION_SECTIONS,
    normalizePreset,
    type ModuleKey,
    type NutritionSectionKey,
    type Preset,
    type SectionPrefs,
} from '@eva/feature-prefs'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getCoach } from '@/lib/coach/get-coach'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { isCurrentUserTeamManager } from '@/services/auth/team.service'
import { hasModule } from '@/services/entitlements.service'

/**
 * Datos de la zona "Funciones" (plan §4 / §9 Fase C) para el editor del coach/owner.
 *
 * A diferencia de `resolveFeaturePrefs` (que devuelve la VISIBILIDAD efectiva resuelta para
 * RENDER de una superficie), este loader devuelve el ESTADO CRUDO del editor: el preset y el
 * mapa `sections` guardados + el entitlement por modulo. El panel necesita lo crudo para hidratar
 * el valor exacto de cada toggle (un toggle apagado debe verse apagado, no "resuelto a default").
 *
 * El editor lee/escribe la capa de PREFERENCIA (no toca billing). El entitlement se computa
 * server-side via `hasModule` (fail-closed, kill-switch de operador incluido) — es el unico gate
 * que decide si una seccion Pro se muestra DESBLOQUEADA o con CTA de compra.
 */

/** Modulos que gatean alguna seccion de nutricion (derivado del catalogo puro). */
const NUTRITION_GATING_MODULES = (() => {
    const set = new Set<ModuleKey>()
    for (const section of NUTRITION_SECTIONS) {
        if (section.requiresModule) set.add(section.requiresModule)
    }
    return [...set]
})()

export type FuncionesScope = 'coach' | 'team'

export interface FuncionesContext {
    scope: FuncionesScope
    /** Presente solo en scope team — lo consume `setTeamFeaturePrefs`. */
    teamId: string | null
    teamName: string | null
    /** Preset guardado (coercionado a un Preset valido). Default `'basico'`. */
    preset: Preset
    /** Mapa crudo de secciones guardado (incluye el master switch `_enabled`). */
    sections: SectionPrefs
    /** Entitlement por modulo (fail-closed). `true` => la seccion Pro esta desbloqueada. */
    entitledByModule: Partial<Record<ModuleKey, boolean>>
}

function asSections(value: unknown): SectionPrefs {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as SectionPrefs)
        : {}
}

/**
 * Resuelve el contexto del editor segun el WORKSPACE ACTIVO (separacion de flujos, espejo de
 * `getModulesContext`):
 *  - coach_team   -> edita `team_feature_prefs` del team activo (solo gestores; la RLS es el gate real).
 *  - standalone   -> edita `coach_feature_prefs` propio.
 *  - enterprise   -> orgManaged=true; la pagina redirige (no hay zona Funciones en enterprise v1).
 *
 * El entitlement se computa por el contexto del recurso (pool-wins: team gana sobre el coach).
 */
export const getFuncionesContext = cache(
    async (): Promise<{ coachId: string | null; orgManaged: boolean; ctx: FuncionesContext | null }> => {
        const userDb = await createClient()
        const serviceDb = createServiceRoleClient()
        const coach = await getCoach()
        if (!coach) return { coachId: null, orgManaged: false, ctx: null }

        const workspace = await resolvePreferredWorkspace(userDb, coach.id)
        const orgManaged =
            coach.subscription_status === 'org_managed' || workspace?.type === 'enterprise_coach'
        if (orgManaged) return { coachId: coach.id, orgManaged: true, ctx: null }

        // ── Team ──────────────────────────────────────────────────────────────
        if (workspace?.type === 'coach_team') {
            const teamId = workspace.teamId
            const [{ data: team }, isManager, { data: prefs }, entitledByModule] = await Promise.all([
                userDb.from('teams').select('name').eq('id', teamId).maybeSingle(),
                isCurrentUserTeamManager(userDb, teamId),
                serviceDb
                    .from('team_feature_prefs')
                    .select('preset, sections')
                    .eq('team_id', teamId)
                    .eq('domain', 'nutrition')
                    .maybeSingle(),
                resolveEntitlement(serviceDb, { teamId }),
            ])

            // Solo gestores editan el team; un miembro comun no debe ver el editor (la RLS lo
            // bloquearia igual al escribir, pero ocultar el editor evita un falso affordance).
            if (!isManager) return { coachId: coach.id, orgManaged: false, ctx: null }

            return {
                coachId: coach.id,
                orgManaged: false,
                ctx: {
                    scope: 'team',
                    teamId,
                    teamName: team?.name ?? 'Equipo',
                    preset: normalizePreset(prefs?.preset),
                    sections: asSections(prefs?.sections),
                    entitledByModule,
                },
            }
        }

        // ── Standalone ────────────────────────────────────────────────────────
        const [{ data: prefs }, entitledByModule] = await Promise.all([
            serviceDb
                .from('coach_feature_prefs')
                .select('preset, sections')
                .eq('coach_id', coach.id)
                .eq('domain', 'nutrition')
                .maybeSingle(),
            resolveEntitlement(serviceDb, { coachId: coach.id }),
        ])

        return {
            coachId: coach.id,
            orgManaged: false,
            ctx: {
                scope: 'coach',
                teamId: null,
                teamName: null,
                preset: normalizePreset(prefs?.preset),
                sections: asSections(prefs?.sections),
                entitledByModule,
            },
        }
    },
)

type DB = ReturnType<typeof createServiceRoleClient>

/** Computa el entitlement de los modulos que gatean nutricion para el contexto del recurso. */
async function resolveEntitlement(
    db: DB,
    ctx: { teamId?: string | null; coachId?: string | null },
): Promise<Partial<Record<ModuleKey, boolean>>> {
    const out: Partial<Record<ModuleKey, boolean>> = {}
    await Promise.all(
        NUTRITION_GATING_MODULES.map(async (key) => {
            out[key] = await hasModule(db, key, ctx)
        }),
    )
    return out
}

/** Re-export tipado para el panel (evita re-importar del paquete en el client component). */
export type { NutritionSectionKey }
