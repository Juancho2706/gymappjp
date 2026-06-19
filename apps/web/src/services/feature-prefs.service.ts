import { cache } from 'react'
import {
    DOMAIN_ENABLED_KEY,
    FEATURE_DOMAINS,
    resolveDomainEnabled,
    resolveSections,
    type FeatureDomain,
    type ModuleKey,
    type NutritionSectionKey,
    type Preset,
    type SectionPrefs,
} from '@eva/feature-prefs'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { hasModule } from '@/services/entitlements.service'
import {
    hasExchangesModuleForClientContext,
} from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { findPlanModuleContext } from '@/infrastructure/db/exchanges.repository'

/**
 * Resolver server-side del modelo `visible = ENTITLED (billing, fail-closed) AND ENABLED
 * (preferencia coach/team/cliente)`. Es el CHOKE POINT unico (plan §4.4): ningun componente
 * lee `sections` jsonb directo — todos pasan por aca.
 *
 * Generaliza el patron `getNutritionProEnabledForClient` (fail-closed + React.cache) a
 * cualquier dominio/seccion. NO reimplementa entitlement: reusa verbatim
 * `hasExchangesModuleForClientContext` / `findPlanModuleContext` (modulo `nutrition_exchanges`)
 * y `hasModule` (`body_composition`) — con eso vienen GRATIS el pool-wins (team gana sobre el
 * coach del plan) y el kill-switch de operador `EVA_DISABLED_MODULES`.
 *
 * La PREFERENCIA SOLO ACHICA (invariante de oro): si una seccion no esta entitled, ningun
 * toggle la prende. El resolver puro `@eva/feature-prefs#resolveSections` lo garantiza.
 *
 * Flag `FEATURE_PREFS_ENABLED` (Edge Config, fail-OPEN): ausente/false/Edge caido =>
 * comportamiento de HOY = mostrar TODO lo entitled (las preferencias se ignoran por completo).
 * Esto es el grandfathering transicional (plan §5.2): nadie pierde una superficie por el solo
 * hecho de no tener fila de prefs todavia.
 */

type DB = ReturnType<typeof createServiceRoleClient>

/** Modulos que gatean alguna seccion del dominio `nutrition` (derivado del catalogo puro). */
const NUTRITION_GATING_MODULES = (() => {
    const set = new Set<ModuleKey>()
    for (const section of FEATURE_DOMAINS.nutrition) {
        if (section.requiresModule) set.add(section.requiresModule)
    }
    return [...set]
})()

export interface ResolveFeaturePrefsInput {
    domain: 'nutrition'
    coachId: string
    /** Alumno cuya vista se resuelve (override mas especifico). */
    clientId?: string | null
    /** Plan en contexto: si esta, su contexto (coach/team/org) gana para entitlement (pool-wins). */
    planId?: string | null
    /** Team del alumno (si pertenece a un pool): ramifica a `team_feature_prefs` (base = team). */
    clientTeamId?: string | null
    /** Org del alumno (si enterprise): NO ramifica a team-base. */
    clientOrgId?: string | null
}

/** Lee el flag `FEATURE_PREFS_ENABLED` de Edge Config. Fail-CLOSED a `false` (=> bypass prefs). */
async function getFeaturePrefsEnabled(): Promise<boolean> {
    if (!process.env.EDGE_CONFIG) return false
    try {
        const { get } = await import('@vercel/edge-config')
        return (await get<boolean>('FEATURE_PREFS_ENABLED')) === true
    } catch {
        // fail-OPEN del FEATURE: el caller interpreta `false` como "mostrar todo lo entitled".
        return false
    }
}

/** Lee la fila de prefs del coach para el dominio. */
async function readCoachPrefs(
    db: DB,
    coachId: string,
    domain: FeatureDomain,
): Promise<{ preset: string | null; sections: SectionPrefs | null }> {
    const { data } = await db
        .from('coach_feature_prefs')
        .select('preset, sections')
        .eq('coach_id', coachId)
        .eq('domain', domain)
        .maybeSingle()
    return {
        preset: data?.preset ?? null,
        sections: (data?.sections ?? null) as SectionPrefs | null,
    }
}

/** Lee la fila de prefs del team para el dominio. */
async function readTeamPrefs(
    db: DB,
    teamId: string,
    domain: FeatureDomain,
): Promise<{ preset: string | null; sections: SectionPrefs | null }> {
    const { data } = await db
        .from('team_feature_prefs')
        .select('preset, sections')
        .eq('team_id', teamId)
        .eq('domain', domain)
        .maybeSingle()
    return {
        preset: data?.preset ?? null,
        sections: (data?.sections ?? null) as SectionPrefs | null,
    }
}

/** Lee el override por-alumno para el dominio. */
async function readClientPrefs(
    db: DB,
    clientId: string,
    domain: FeatureDomain,
): Promise<SectionPrefs | null> {
    const { data } = await db
        .from('client_feature_prefs')
        .select('sections')
        .eq('client_id', clientId)
        .eq('domain', domain)
        .maybeSingle()
    return (data?.sections ?? null) as SectionPrefs | null
}

/**
 * Computa el entitlement por modulo para el dominio `nutrition`, context-aware y fail-closed.
 * Reusa los helpers de entitlement (pool-wins + kill-switch vienen gratis). NO reimplementa.
 */
async function entitledByModuleForNutrition(
    db: DB,
    ctx: {
        coachId: string
        planId?: string | null
        clientTeamId?: string | null
        clientOrgId?: string | null
    },
): Promise<Partial<Record<ModuleKey, boolean>>> {
    // El contexto del recurso (pool manda): si hay plan, su contexto gana sobre los hints
    // del input (espejo de como `sections.queries` resuelve entitlement via plan).
    let planCoachId: string | null = ctx.coachId
    let clientTeamId: string | null = ctx.clientTeamId ?? null
    let clientOrgId: string | null = ctx.clientOrgId ?? null

    if (ctx.planId) {
        const planCtx = await findPlanModuleContext(db, ctx.planId)
        if (planCtx) {
            planCoachId = planCtx.coachId
            clientTeamId = planCtx.clientTeamId
            clientOrgId = planCtx.clientOrgId
        }
    }

    const out: Partial<Record<ModuleKey, boolean>> = {}
    await Promise.all(
        NUTRITION_GATING_MODULES.map(async (key) => {
            if (key === 'nutrition_exchanges') {
                out[key] = await hasExchangesModuleForClientContext(db, {
                    clientTeamId,
                    clientOrgId,
                    planCoachId,
                })
                return
            }
            // body_composition (y cualquier otro): pool-wins via hasModule con ctx del recurso.
            const moduleCtx =
                clientTeamId && !clientOrgId
                    ? { teamId: clientTeamId }
                    : { coachId: planCoachId }
            out[key] = await hasModule(db, key, moduleCtx)
        }),
    )
    return out
}

/**
 * Resuelve la visibilidad efectiva de cada seccion del dominio para el contexto dado.
 * React.cache => dedup por request (mismo patron que `getNutritionProEnabledForClient`).
 *
 * @returns `Record<NutritionSectionKey, boolean>` — `true` = la seccion es visible.
 */
export const resolveFeaturePrefs = cache(
    async (
        input: ResolveFeaturePrefsInput,
    ): Promise<Record<NutritionSectionKey, boolean>> => {
        const domain = input.domain
        // Lectura request-scoped (RLS techo) para el catalogo de prefs del actor; el entitlement
        // usa service-role (espejo de getStudentExchangeData) para leer flags del tenant.
        const userDb = await createClient()
        const serviceDb = createServiceRoleClient()

        const useTeamBase = !!input.clientTeamId && !input.clientOrgId

        const [enabled, entitledByModule] = await Promise.all([
            getFeaturePrefsEnabled(),
            entitledByModuleForNutrition(serviceDb, {
                coachId: input.coachId,
                planId: input.planId,
                clientTeamId: input.clientTeamId,
                clientOrgId: input.clientOrgId,
            }),
        ])

        // FLAG OFF / ausente / Edge caido => fail-OPEN: mostrar TODO lo entitled (bypass prefs).
        // Es el comportamiento de HOY: las secciones core van ON, y las gateadas dependen solo
        // del entitlement; nada se oculta por preferencia.
        if (!enabled) {
            const result = {} as Record<NutritionSectionKey, boolean>
            for (const section of FEATURE_DOMAINS[domain]) {
                if (section.core) {
                    result[section.key] = true
                    continue
                }
                const entitled = section.requiresModule
                    ? entitledByModule[section.requiresModule] === true
                    : true
                result[section.key] = entitled
            }
            return result
        }

        // FLAG ON => modelo completo: entitled AND wants (preferencia solo achica).
        const [coachOrTeam, clientSections] = await Promise.all([
            useTeamBase
                ? readTeamPrefs(serviceDb, input.clientTeamId!, domain)
                : readCoachPrefs(serviceDb, input.coachId, domain),
            input.clientId ? readClientPrefs(userDb, input.clientId, domain) : Promise.resolve(null),
        ])

        const resolved = resolveSections({
            domain,
            entitledByModule,
            preset: coachOrTeam.preset as Preset | string | null,
            useTeamBase,
            coachSections: useTeamBase ? null : coachOrTeam.sections,
            teamSections: useTeamBase ? coachOrTeam.sections : null,
            clientSections,
        })

        return resolved as Record<NutritionSectionKey, boolean>
    },
)

/**
 * Conveniencia que generaliza/reemplaza `getNutritionProEnabledForClient`: ¿esta visible la
 * seccion de micros avanzados (modulo `nutrition_exchanges`) para este alumno? Mantiene el
 * mismo contrato fail-closed + React.cache, ahora pasando por el resolver unico.
 */
export const getNutritionProEnabledForClient = cache(
    async (input: {
        coachId: string
        clientId?: string | null
        planId?: string | null
        clientTeamId?: string | null
        clientOrgId?: string | null
    }): Promise<boolean> => {
        const prefs = await resolveFeaturePrefs({ domain: 'nutrition', ...input })
        return prefs.micros_advanced === true
    },
)

/**
 * ¿Esta PRENDIDO el dominio Nutricion completo para este contexto? (master switch `_enabled`,
 * plan §4.8). Distinto de las secciones: si devuelve `false`, el coach apago el dominio entero
 * → el menu de Nutricion y todo su contenido se ocultan.
 *
 * Mismo contrato que el resto del servicio: React.cache (dedup por request) + flag
 * `FEATURE_PREFS_ENABLED` fail-OPEN. Flag OFF / ausente / Edge caido => `true` (el dominio NO
 * se oculta por preferencia — comportamiento de HOY), igual que `resolveFeaturePrefs` ignora
 * las prefs con el flag apagado. No mira entitlement: el master switch es pura preferencia.
 */
export const resolveNutritionDomainEnabled = cache(
    async (input: {
        coachId: string
        clientId?: string | null
        clientTeamId?: string | null
        clientOrgId?: string | null
    }): Promise<boolean> => {
        const domain: FeatureDomain = 'nutrition'
        const enabled = await getFeaturePrefsEnabled()
        // FLAG OFF / ausente / Edge caido => fail-OPEN: dominio prendido (no se oculta por pref).
        if (!enabled) return true

        const userDb = await createClient()
        const serviceDb = createServiceRoleClient()
        const useTeamBase = !!input.clientTeamId && !input.clientOrgId

        const [coachOrTeam, clientSections] = await Promise.all([
            useTeamBase
                ? readTeamPrefs(serviceDb, input.clientTeamId!, domain)
                : readCoachPrefs(serviceDb, input.coachId, domain),
            input.clientId ? readClientPrefs(userDb, input.clientId, domain) : Promise.resolve(null),
        ])

        return resolveDomainEnabled({
            // Solo importan las capas de preferencia + useTeamBase; el resto es no-op aca.
            domain,
            entitledByModule: {},
            preset: coachOrTeam.preset as Preset | string | null,
            useTeamBase,
            coachSections: useTeamBase ? null : coachOrTeam.sections,
            teamSections: useTeamBase ? coachOrTeam.sections : null,
            clientSections,
        })
    },
)

/**
 * Contexto para la UI de OVERRIDE por-alumno (`client_feature_prefs`) — el panel que el coach
 * usa en la ficha del alumno para forzar mostrar/ocultar una seccion encima de la base
 * coach/team. NO es el mismo contrato que `resolveFeaturePrefs` (que devuelve el resultado
 * EFECTIVO con el override ya aplicado): aca el panel necesita las TRES piezas para pintar el
 * tri-state "heredar / mostrar / ocultar" y bloquear las secciones Pro sin entitlement.
 *
 * Devuelve:
 * - `baseEffective`: el resultado del resolver SIN la capa del alumno (lo que el alumno veria
 *   "heredando" de la base coach/team). Es lo que muestra el estado "heredar".
 * - `override`: la fila cruda `client_feature_prefs.sections` (parcial) — solo las keys que el
 *   coach ya forzo para ESTE alumno. `undefined`/ausente en una key => "heredar".
 * - `entitledByModule`: para LOCKear las secciones Pro sin entitlement (la pref solo achica).
 * - `domainEnabledBase` / `domainEnabledOverride`: master switch del dominio (base vs override
 *   crudo del alumno) para el toggle "Mostrar Nutricion".
 *
 * React.cache (dedupe por request). El override se lee request-scoped (RLS = techo: coach owner
 * / managers de pool); la base + entitlement usan service-role (espejo del resto del servicio).
 */
export interface ClientFeaturePrefsOverrideContext {
    /** Resultado del resolver SIN la capa del alumno (lo que se "hereda"). */
    baseEffective: Record<NutritionSectionKey, boolean>
    /** Fila cruda `client_feature_prefs.sections` (parcial). Key ausente => heredar. */
    override: SectionPrefs
    /** Entitlement por modulo (fail-closed) para LOCKear secciones Pro. */
    entitledByModule: Partial<Record<ModuleKey, boolean>>
    /** Master switch del dominio que resulta de la base coach/team (sin override). */
    domainEnabledBase: boolean
    /** Override crudo del master switch del dominio para ESTE alumno (`undefined` => heredar). */
    domainEnabledOverride: boolean | undefined
    /** `true` si la base es el team (pool); informa el copy "default del equipo" vs "tuyo". */
    useTeamBase: boolean
    /** `true` si el flag `FEATURE_PREFS_ENABLED` esta ON (si no, las prefs se ignoran). */
    prefsEnabled: boolean
}

export const resolveClientFeaturePrefsOverrideContext = cache(
    async (input: {
        domain: 'nutrition'
        coachId: string
        clientId: string
        planId?: string | null
        clientTeamId?: string | null
        clientOrgId?: string | null
    }): Promise<ClientFeaturePrefsOverrideContext> => {
        const domain = input.domain
        const userDb = await createClient()
        const serviceDb = createServiceRoleClient()
        const useTeamBase = !!input.clientTeamId && !input.clientOrgId

        const [prefsEnabled, entitledByModule, base, override] = await Promise.all([
            getFeaturePrefsEnabled(),
            entitledByModuleForNutrition(serviceDb, {
                coachId: input.coachId,
                planId: input.planId,
                clientTeamId: input.clientTeamId,
                clientOrgId: input.clientOrgId,
            }),
            useTeamBase
                ? readTeamPrefs(serviceDb, input.clientTeamId!, domain)
                : readCoachPrefs(serviceDb, input.coachId, domain),
            readClientPrefs(userDb, input.clientId, domain),
        ])

        // `baseEffective` = resolver SIN la capa del alumno (clientSections null). Esto es lo
        // que el alumno "hereda" de la base coach/team. Si el flag esta OFF, fail-OPEN:
        // mostrar todo lo entitled (espejo del bypass de `resolveFeaturePrefs`).
        let baseEffective: Record<NutritionSectionKey, boolean>
        if (!prefsEnabled) {
            baseEffective = {} as Record<NutritionSectionKey, boolean>
            for (const section of FEATURE_DOMAINS[domain]) {
                if (section.core) {
                    baseEffective[section.key] = true
                    continue
                }
                baseEffective[section.key] = section.requiresModule
                    ? entitledByModule[section.requiresModule] === true
                    : true
            }
        } else {
            baseEffective = resolveSections({
                domain,
                entitledByModule,
                preset: base.preset as Preset | string | null,
                useTeamBase,
                coachSections: useTeamBase ? null : base.sections,
                teamSections: useTeamBase ? base.sections : null,
                clientSections: null,
            }) as Record<NutritionSectionKey, boolean>
        }

        const domainEnabledBase = resolveDomainEnabled({
            domain,
            entitledByModule: {},
            preset: base.preset as Preset | string | null,
            useTeamBase,
            coachSections: useTeamBase ? null : base.sections,
            teamSections: useTeamBase ? base.sections : null,
            clientSections: null,
        })

        const overrideObj = (override ?? {}) as SectionPrefs

        return {
            baseEffective,
            override: overrideObj,
            entitledByModule,
            domainEnabledBase,
            domainEnabledOverride: overrideObj[DOMAIN_ENABLED_KEY],
            useTeamBase,
            prefsEnabled,
        }
    },
)
