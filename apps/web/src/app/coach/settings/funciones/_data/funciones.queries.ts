import { cache } from 'react'
import {
    FEATURE_DOMAINS,
    normalizePreset,
    type FeatureDomain,
    type FeatureSection,
    type ModuleKey,
    type NutritionSectionKey,
    type Preset,
    type SectionPrefs,
} from '@eva/feature-prefs'
import { Apple } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
 *
 * ── Estructura POR DOMINIO ──────────────────────────────────────────────────────
 * El editor se organiza en AREAS, una por dominio de `FEATURE_DOMAINS` (Nutricion hoy; Ejercicios,
 * Planes, etc. a futuro). Para CADA dominio se lee su fila `*_feature_prefs` propia (PK
 * `(scope, domain)`, las write-actions ya persisten por dominio) y se computa su `entitledByModule`
 * acotado a los modulos que gatean ESE dominio. Agregar un dominio a `FEATURE_DOMAINS` (+ su
 * `DOMAIN_META`) lo hace aparecer automaticamente sin tocar este loader.
 */

/** Metadata de presentacion por dominio (label + icono). Extensible: una entrada por FeatureDomain. */
export interface DomainMeta {
    label: string
    icon: LucideIcon
}

export const DOMAIN_META: Record<FeatureDomain, DomainMeta> = {
    nutrition: { label: 'Nutricion', icon: Apple },
}

/** Lista canonica de dominios soportados (orden de presentacion). */
const DOMAIN_KEYS = Object.keys(FEATURE_DOMAINS) as FeatureDomain[]

/** Modulos que gatean alguna seccion de un dominio dado (derivado del catalogo puro). */
function gatingModulesFor(sections: readonly FeatureSection[]): ModuleKey[] {
    const set = new Set<ModuleKey>()
    for (const section of sections) {
        if (section.requiresModule) set.add(section.requiresModule)
    }
    return [...set]
}

export type FuncionesScope = 'coach' | 'team'

/** Estado crudo del editor para UN dominio (una "area" del panel). */
export interface DomainFuncionesConfig {
    domain: FeatureDomain
    label: string
    sections: readonly FeatureSection[]
    /** Preset guardado de ese dominio (coercionado a un Preset valido). Default `'basico'`. */
    preset: Preset
    /** Mapa crudo de secciones guardado de ese dominio (incluye el master switch `_enabled`). */
    sectionPrefs: SectionPrefs
    /** Entitlement por modulo de ese dominio (fail-closed). `true` => la seccion Pro esta desbloqueada. */
    entitledByModule: Partial<Record<ModuleKey, boolean>>
}

export interface FuncionesContext {
    scope: FuncionesScope
    /** Presente solo en scope team — lo consume `setTeamFeaturePrefs`. */
    teamId: string | null
    teamName: string | null
    /** Una entrada por dominio de `FEATURE_DOMAINS` (Nutricion hoy; extensible). */
    domains: DomainFuncionesConfig[]
}

function asSections(value: unknown): SectionPrefs {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as SectionPrefs)
        : {}
}

type DB = ReturnType<typeof createServiceRoleClient>

/** Fila cruda de prefs guardada para un dominio (las columnas que el editor hidrata). */
type PrefsRow = { preset: unknown; sections: unknown } | null

/**
 * Resuelve el array de dominios (areas del editor) para un contexto de recurso dado.
 * Por CADA dominio lee su fila de prefs (service-role, espejo de la escritura) y computa su
 * entitlement acotado a los modulos que ese dominio gatea. Una query de prefs + un set de
 * entitlement por dominio, todo en paralelo.
 *
 * El `fetchPrefs` se inyecta tipado por tabla (coach vs team) en el call site — pasar el nombre de
 * tabla a un helper generico colapsa la union de columnas de PostgREST (coach_id/team_id) y rompe
 * el `.eq`. El callback evita ese narrowing.
 */
async function resolveDomains(
    serviceDb: DB,
    entitlementCtx: { teamId?: string | null; coachId?: string | null },
    fetchPrefs: (domain: FeatureDomain) => Promise<PrefsRow>,
): Promise<DomainFuncionesConfig[]> {
    return Promise.all(
        DOMAIN_KEYS.map(async (domain) => {
            const sections = FEATURE_DOMAINS[domain]
            const [prefs, entitledByModule] = await Promise.all([
                fetchPrefs(domain),
                resolveEntitlement(serviceDb, gatingModulesFor(sections), entitlementCtx),
            ])
            return {
                domain,
                label: DOMAIN_META[domain].label,
                sections,
                preset: normalizePreset(prefs?.preset),
                sectionPrefs: asSections(prefs?.sections),
                entitledByModule,
            }
        }),
    )
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
            const [{ data: team }, isManager, domains] = await Promise.all([
                userDb.from('teams').select('name').eq('id', teamId).maybeSingle(),
                isCurrentUserTeamManager(userDb, teamId),
                resolveDomains(serviceDb, { teamId }, async (domain) => {
                    const { data } = await serviceDb
                        .from('team_feature_prefs')
                        .select('preset, sections')
                        .eq('team_id', teamId)
                        .eq('domain', domain)
                        .maybeSingle()
                    return data
                }),
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
                    domains,
                },
            }
        }

        // ── Standalone ────────────────────────────────────────────────────────
        const domains = await resolveDomains(serviceDb, { coachId: coach.id }, async (domain) => {
            const { data } = await serviceDb
                .from('coach_feature_prefs')
                .select('preset, sections')
                .eq('coach_id', coach.id)
                .eq('domain', domain)
                .maybeSingle()
            return data
        })

        return {
            coachId: coach.id,
            orgManaged: false,
            ctx: {
                scope: 'coach',
                teamId: null,
                teamName: null,
                domains,
            },
        }
    },
)

/** Computa el entitlement de los modulos dados para el contexto del recurso. */
async function resolveEntitlement(
    db: DB,
    modules: ModuleKey[],
    ctx: { teamId?: string | null; coachId?: string | null },
): Promise<Partial<Record<ModuleKey, boolean>>> {
    const out: Partial<Record<ModuleKey, boolean>> = {}
    await Promise.all(
        modules.map(async (key) => {
            out[key] = await hasModule(db, key, ctx)
        }),
    )
    return out
}

/** Re-export tipado para el panel (evita re-importar del paquete en el client component). */
export type { NutritionSectionKey }
