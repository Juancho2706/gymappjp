import { cache } from 'react'
import { redirect } from 'next/navigation'
import {
    DOMAIN_ENABLED_KEY,
    FEATURE_DOMAINS,
    FEATURE_DOMAIN_KEYS,
    resolveDomainEnabled,
    resolveSections,
    type FeatureDomain,
    type ModuleKey,
    type NutritionSectionKey,
    type Preset,
    type SectionPrefs,
} from '@eva/feature-prefs'
import { domainOffRedirectPath } from '@/lib/domain-off'
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
 * SIEMPRE-ON desde 2026-09-01 (Ola de orden W1.10): el flag transicional `FEATURE_PREFS_ENABLED`
 * (Edge Config) se retiro — estaba vivo en `true` en produccion, asi que el retiro no cambia
 * comportamiento. Las preferencias participan siempre en el camino del coach.
 *
 * FAIL-OPEN SIN FILA (sin cambios): un coach que nunca guardo preferencias no pierde ninguna
 * superficie — el resolver puro trata la fila ausente como "todo lo entitled visible".
 *
 * AUDIENCIA (D9-A, owner 22-08 ratificada 26-08): la preferencia gobierna SOLO el panel del
 * COACH. Todo caller de la superficie del ALUMNO (arbol `/c`, endpoints `/api/mobile/*` de
 * scope alumno) pasa `audience: 'student'` y obtiene el mismo resultado que con el flag OFF.
 *
 * JERARQUÍA DE GATES (de arriba hacia abajo; cada nivel solo puede ACHICAR al de arriba):
 *   1. Kill-switch de operador (`EVA_DISABLED_MODULES`) + entitlement de billing — fail-CLOSED.
 *   2. Master switch del dominio (`_enabled`, este archivo: `resolveDomainsEnabled`) — fail-OPEN.
 *   3. Secciones dentro del dominio (`resolveFeaturePrefs`) — fail-OPEN sin fila.
 *
 * ESTO ES VISIBILIDAD, NUNCA AUTORIZACIÓN: apagar un dominio esconde su menú y sus rutas del
 * panel del coach, pero NO le saca permisos a nadie. La autorización real sigue viviendo en RLS
 * y en los entitlements server-side — que quedan intactos aunque el dominio esté apagado.
 */

type DB = ReturnType<typeof createServiceRoleClient>

/**
 * Audiencia de la resolucion. Decision D9 opcion A del owner (22-08, ratificada 26-08): la
 * preferencia de modulos (`coach_feature_prefs` / `team_feature_prefs` / `client_feature_prefs`)
 * es SOLO del panel del COACH — reordenar su panel no debe apagarle superficies a SUS ALUMNOS.
 *
 * - `'coach'` (default): la preferencia participa siempre (prefs siempre-on desde W1.10).
 * - `'student'`: la preferencia NO participa. Fail-open: todo lo entitled visible, dominio
 *   prendido — el alumno ve sus modulos segun el plan/entitlements reales y nada mas.
 */
export type FeaturePrefsAudience = 'coach' | 'student'

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
    /** Quien mira. `'student'` (D9-A) => las prefs no participan. Default `'coach'`. */
    audience?: FeaturePrefsAudience
}

/**
 * ¿Participa la capa de PREFERENCIA en esta resolucion?
 *
 * Alumno (D9-A) => NUNCA: bypass total de prefs = mostrar todo lo entitled. Coach => SIEMPRE
 * (prefs siempre-on desde 2026-09-01, Ola de orden W1.10: ya no hay flag que consultar, por eso
 * esta funcion quedo sincrona y sin I/O).
 */
function prefsApplyFor(audience: FeaturePrefsAudience | undefined): boolean {
    return audience !== 'student'
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
        userDbOverride?: DB,
    ): Promise<Record<NutritionSectionKey, boolean>> => {
        const domain = input.domain
        // Lectura request-scoped (RLS techo) para el catalogo de prefs del actor; el entitlement
        // usa service-role (espejo de getStudentExchangeData) para leer flags del tenant.
        // `userDbOverride` (bridge movil): sin cookie, se inyecta un cliente ya scoped al alumno
        // (o service-role — `readClientPrefs` filtra por `client_id`, no hay fuga).
        const userDb = userDbOverride ?? (await createClient())
        const serviceDb = createServiceRoleClient()

        const useTeamBase = !!input.clientTeamId && !input.clientOrgId

        const enabled = prefsApplyFor(input.audience)
        const entitledByModule = await entitledByModuleForNutrition(serviceDb, {
            coachId: input.coachId,
            planId: input.planId,
            clientTeamId: input.clientTeamId,
            clientOrgId: input.clientOrgId,
        })

        // AUDIENCIA ALUMNO (D9-A) => fail-OPEN: mostrar TODO lo entitled (bypass prefs). Las
        // secciones core van ON y las gateadas dependen solo del entitlement; nada se oculta por
        // preferencia del coach.
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

        // AUDIENCIA COACH => modelo completo: entitled AND wants (la preferencia solo achica).
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
        audience?: FeaturePrefsAudience
    }): Promise<boolean> => {
        const prefs = await resolveFeaturePrefs({ domain: 'nutrition', ...input })
        return prefs.micros_advanced === true
    },
)

/**
 * Contexto de resolucion del MASTER SWITCH por dominio. Mismo shape que el input historico de
 * `resolveNutritionDomainEnabled` (los 5 wrappers lo comparten).
 */
export type DomainCtx = {
    coachId: string
    /** Alumno cuya vista se resuelve (override mas especifico). */
    clientId?: string | null
    /** Team del alumno (si pertenece a un pool): la base pasa a ser `team_feature_prefs`. */
    clientTeamId?: string | null
    /** Org del alumno (si enterprise): NO se gatea (ver regla 2 abajo). */
    clientOrgId?: string | null
    /** Quien mira. `'student'` (D9-A) => las prefs no participan. Default `'coach'`. */
    audience?: FeaturePrefsAudience
}

/** Los 5 dominios prendidos: objeto NUEVO en cada llamada (nunca compartir la referencia). */
function allDomainsOn(): Record<FeatureDomain, boolean> {
    const out = {} as Record<FeatureDomain, boolean>
    for (const domain of FEATURE_DOMAIN_KEYS) out[domain] = true
    return out
}

/**
 * ¿Que dominios estan PRENDIDOS para este contexto? (master switch `_enabled`, plan §4.8).
 * Distinto de las secciones: si un dominio da `false`, el coach lo apago entero → su menu y todo
 * su contenido se ocultan del panel.
 *
 * AGREGADOR: una sola lectura para los 5 dominios (`select` SIN filtro de dominio). Los wrappers
 * boolean por dominio delegan acá, así una pantalla que pregunta por 2 o 3 dominios no paga 5
 * SELECT por render. React.cache dedupea dentro del request (mismo patrón que el resto del
 * servicio). No mira entitlement: el master switch es pura preferencia.
 *
 * Orden de reglas:
 * 1. Audiencia ALUMNO (D9-A) => los 5 `true`, CERO lecturas: la preferencia del panel del coach
 *    no le apaga superficies a sus alumnos.
 * 2. Enterprise (`clientOrgId`) => los 5 `true`, CERO lecturas. El coach enterprise NO entra a
 *    la pantalla de Funciones (SPEC §10, OUTLINE §5): gatearlo sería encerrarlo sin puerta de
 *    salida (no tendría dónde volver a prender el dominio). Su gate real son los módulos de la org.
 * 3. Base = team (si hay `clientTeamId`) o coach; override = fila del alumno (si hay `clientId`).
 * 4. Fila ausente => `null` => fail-OPEN `true` (lo garantiza el resolver puro).
 * 5. Cualquier error de lectura => los 5 `true` (fail-open, espejo de `resolveDisabledDomains`
 *    en `coach/layout.tsx`): un hipo de DB no puede vaciarle el panel al coach.
 */
export const resolveDomainsEnabled = cache(
    async (ctx: DomainCtx, userDbOverride?: DB): Promise<Record<FeatureDomain, boolean>> => {
        // 1. AUDIENCIA ALUMNO (D9-A) => fail-OPEN sin leer prefs.
        if (!prefsApplyFor(ctx.audience)) return allDomainsOn()
        // 2. Enterprise => fail-OPEN sin leer prefs (no hay pantalla donde revertirlo).
        if (ctx.clientOrgId) return allDomainsOn()

        const useTeamBase = !!ctx.clientTeamId
        const serviceDb = createServiceRoleClient()
        // El override por-alumno se lee request-scoped (RLS = techo, igual que `readClientPrefs`).
        // Solo se construye el cliente si hay alumno: sin `clientId` no hay nada que leer ahí.
        const userDb = ctx.clientId ? (userDbOverride ?? (await createClient())) : null

        try {
            // 3. UNA query para la base (los 5 dominios juntos) + UNA para el override.
            const basePromise = useTeamBase
                ? serviceDb
                      .from('team_feature_prefs')
                      .select('domain, preset, sections')
                      .eq('team_id', ctx.clientTeamId!)
                : serviceDb
                      .from('coach_feature_prefs')
                      .select('domain, preset, sections')
                      .eq('coach_id', ctx.coachId)
            const overridePromise =
                userDb && ctx.clientId
                    ? userDb
                          .from('client_feature_prefs')
                          .select('domain, sections')
                          .eq('client_id', ctx.clientId)
                    : Promise.resolve({ data: [], error: null })

            const [baseRes, overrideRes] = await Promise.all([basePromise, overridePromise])
            if (baseRes.error) throw baseRes.error
            if (overrideRes.error) throw overrideRes.error

            const baseByDomain = new Map<string, { preset: string | null; sections: SectionPrefs | null }>()
            for (const row of baseRes.data ?? []) {
                baseByDomain.set(row.domain, {
                    preset: row.preset ?? null,
                    sections: (row.sections ?? null) as SectionPrefs | null,
                })
            }
            const overrideByDomain = new Map<string, SectionPrefs | null>()
            for (const row of overrideRes.data ?? []) {
                overrideByDomain.set(row.domain, (row.sections ?? null) as SectionPrefs | null)
            }

            // 4. Resolver puro por dominio (dominio ausente => fila `null` => fail-open `true`).
            const out = {} as Record<FeatureDomain, boolean>
            for (const domain of FEATURE_DOMAIN_KEYS) {
                const base = baseByDomain.get(domain) ?? null
                out[domain] = resolveDomainEnabled({
                    // Solo importan las capas de preferencia + useTeamBase; el resto es no-op aca.
                    domain,
                    entitledByModule: {},
                    preset: base?.preset as Preset | string | null,
                    useTeamBase,
                    coachSections: useTeamBase ? null : base?.sections ?? null,
                    teamSections: useTeamBase ? base?.sections ?? null : null,
                    clientSections: overrideByDomain.get(domain) ?? null,
                })
            }
            return out
        } catch {
            // 5. Fail-open ante cualquier error de lectura. Sin `console.error`: el camino normal
            // de un coach sin filas no debe ensuciar los logs.
            return allDomainsOn()
        }
    },
)

/**
 * ¿Esta PRENDIDO el dominio Nutricion completo para este contexto? (master switch `_enabled`,
 * plan §4.8). Distinto de las secciones: si devuelve `false`, el coach apago el dominio entero
 * → el menu de Nutricion y todo su contenido se ocultan.
 *
 * Mismo contrato que el resto del servicio: React.cache (dedup por request) + prefs siempre-on
 * (Ola de orden W1.10, 2026-09-01 — ya no hay flag transicional). Fail-OPEN sin fila: coach sin
 * preferencias guardadas => `true`, el dominio NO se oculta. No mira entitlement: el master
 * switch es pura preferencia.
 *
 * `audience: 'student'` (D9-A) => `true` siempre: la preferencia del panel del coach no apaga la
 * nutricion de sus alumnos. El gate real de la superficie del alumno es su plan/entitlement.
 */
export const resolveNutritionDomainEnabled = cache(
    async (input: DomainCtx, userDbOverride?: DB): Promise<boolean> =>
        (await resolveDomainsEnabled(input, userDbOverride)).nutrition,
)

/** Master switch del dominio Entrenamiento. Mismo contrato que la version de nutricion. */
export const resolveTrainingDomainEnabled = cache(
    async (input: DomainCtx, userDbOverride?: DB): Promise<boolean> =>
        (await resolveDomainsEnabled(input, userDbOverride)).training,
)

/** Master switch del dominio Cardio. Mismo contrato que la version de nutricion. */
export const resolveCardioDomainEnabled = cache(
    async (input: DomainCtx, userDbOverride?: DB): Promise<boolean> =>
        (await resolveDomainsEnabled(input, userDbOverride)).cardio,
)

/** Master switch del dominio Movimiento. Mismo contrato que la version de nutricion. */
export const resolveMovementDomainEnabled = cache(
    async (input: DomainCtx, userDbOverride?: DB): Promise<boolean> =>
        (await resolveDomainsEnabled(input, userDbOverride)).movement,
)

/** Master switch del dominio Composicion corporal. Mismo contrato que la version de nutricion. */
export const resolveBodycompDomainEnabled = cache(
    async (input: DomainCtx, userDbOverride?: DB): Promise<boolean> =>
        (await resolveDomainsEnabled(input, userDbOverride)).bodycomp,
)

/**
 * Gate de ruta para las pantallas que hacen REDIRECT LISO cuando el dominio esta apagado
 * (`training` y `nutrition`, W1.4). Si el dominio esta prendido no hace nada; si esta apagado
 * llama `redirect()` — que lanza, asi que NO retorna y el resto de la pagina no corre.
 *
 * Las pantallas que ya tienen un `status` propio (cardio/movement/bodycomp) NO usan esto:
 * componen el resolver boolean adentro de su funcion `_data` y devuelven `status: 'domain_off'`.
 */
export async function assertDomainEnabled(
    domain: FeatureDomain,
    ctx: DomainCtx,
    userDbOverride?: DB,
): Promise<void> {
    const domains = await resolveDomainsEnabled(ctx, userDbOverride)
    if (!domains[domain]) redirect(domainOffRedirectPath(domain))
}

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

        const [entitledByModule, base, override] = await Promise.all([
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
        // que el alumno "hereda" de la base coach/team. Prefs siempre-on (W1.10, 2026-09-01): ya
        // no hay rama de bypass por flag; el fail-open sin fila lo cubre el resolver puro.
        const baseEffective = resolveSections({
            domain,
            entitledByModule,
            preset: base.preset as Preset | string | null,
            useTeamBase,
            coachSections: useTeamBase ? null : base.sections,
            teamSections: useTeamBase ? base.sections : null,
            clientSections: null,
        }) as Record<NutritionSectionKey, boolean>

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
        }
    },
)
