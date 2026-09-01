import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import { resolveMobileClientMutationContext } from '../coach/clients/_mutation-auth'
import {
    MODULE_KEYS,
    type EnabledModules,
    isModuleKilledByOperator,
    applyOperatorKillSwitch,
    getCoachEnabledModules,
    getTeamEnabledModules,
} from '@/services/entitlements.service'
import {
    FEATURE_DOMAINS,
    FEATURE_DOMAIN_KEYS,
    NAV_ORDER_DOMAIN,
    NAV_ORDER_KEY,
    parseNavOrder,
    resolveDomainEnabled,
    resolveSections,
    type FeatureDomain,
    type ModuleKey,
    type NutritionSectionKey,
    type Preset,
    type SectionPrefs,
} from '@eva/feature-prefs'
import { resolveStudentAccessForCoach } from '@/lib/student-access.server'

/**
 * Config operacional + entitlements para el cliente mobile. Fuente única de verdad de:
 *  - módulos de pago efectivos del scope,
 *  - master switch (`_enabled`) de los 5 dominios + secciones de Nutrición,
 *  - orden PERSONAL de la barra del coach (fila reservada `_nav`).
 */

type DB = ReturnType<typeof createServiceRoleClient>

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

type NutritionScope = {
    coachId: string | null
    clientId: string | null
    teamId: string | null
    orgId: string | null
}

/** Fila cruda de `coach_feature_prefs` / `team_feature_prefs`: una por dominio (PK compuesta). */
type FeaturePrefsRow = {
    domain: string
    preset: string | null
    sections: SectionPrefs | null
}

/** Master switch resuelto de los 5 dominios, en el orden canónico de `FEATURE_DOMAIN_KEYS`. */
type DomainFlags = Record<FeatureDomain, boolean>

type ResolvedFeaturePrefs = {
    domains: DomainFlags
    sections: Record<NutritionSectionKey, boolean>
    /**
     * Orden PERSONAL de la barra del coach (fila reservada `domain = '_nav'`), ya validado con
     * `parseNavOrder`. `null` = nunca lo tocó ⇒ la app cae en el orden de su especialidad.
     * Scope alumno / enterprise ⇒ siempre `null` (no hay barra de coach que ordenar).
     */
    navOrder: FeatureDomain[] | null
}

/** Los 5 dominios prendidos (fail-open / audiencias que no leen prefs). */
function allDomainsEnabled(): DomainFlags {
    const out = {} as DomainFlags
    for (const domain of FEATURE_DOMAIN_KEYS) out[domain] = true
    return out
}

function failOpenSections(
    entitledByModule: Partial<Record<ModuleKey, boolean>>,
): Record<NutritionSectionKey, boolean> {
    const out = {} as Record<NutritionSectionKey, boolean>
    for (const section of FEATURE_DOMAINS.nutrition) {
        out[section.key] = section.core
            ? true
            : section.requiresModule
              ? entitledByModule[section.requiresModule] === true
              : true
    }
    return out
}

function failOpenPrefs(
    entitledByModule: Partial<Record<ModuleKey, boolean>>,
): ResolvedFeaturePrefs {
    return {
        domains: allDomainsEnabled(),
        sections: failOpenSections(entitledByModule),
        navOrder: null,
    }
}

/** Lee `sections.order` de una fila `_nav` cruda y lo valida. `null` = sin orden guardado. */
function navOrderFromRow(sections: unknown): FeatureDomain[] | null {
    if (!sections || typeof sections !== 'object') return null
    return parseNavOrder((sections as Record<string, unknown>)[NAV_ORDER_KEY])
}

/**
 * Orden de la barra del coach en modo TEAM. La fila `_nav` es preferencia PERSONAL (la barra es su
 * teléfono, aunque trabaje en un pool), así que NO está entre las filas del team: se pide aparte,
 * por PK y solo esa fila — las prefs de dominio del coach standalone siguen sin aplicar en team.
 * Error de PostgREST => se tira para que el `catch` del llamador resuelva fail-open.
 */
async function readCoachNavOrder(admin: DB, coachId: string | null): Promise<FeatureDomain[] | null> {
    if (!coachId) return null
    const { data, error } = await admin
        .from('coach_feature_prefs')
        .select('sections')
        .eq('coach_id', coachId)
        .eq('domain', NAV_ORDER_DOMAIN)
        .maybeSingle()
    if (error) throw error
    return navOrderFromRow((data as { sections?: unknown } | null)?.sections)
}

/**
 * UNA sola lectura por request para los 5 dominios: sin `.eq('domain', …)` y sin `.maybeSingle()`,
 * las filas se agrupan después en un Map por `domain`. Las secciones de Nutrición salen de la
 * MISMA lectura (la fila `nutrition` del Map), así que no queda una segunda query.
 * Error de PostgREST => se tira para que el `catch` del llamador resuelva fail-open.
 */
async function readFeaturePrefsRows(
    admin: DB,
    useTeamBase: boolean,
    scope: NutritionScope,
): Promise<FeaturePrefsRow[]> {
    if (useTeamBase && scope.teamId) {
        const { data, error } = await admin
            .from('team_feature_prefs')
            .select('domain, preset, sections')
            .eq('team_id', scope.teamId)
        if (error) throw error
        return (data ?? []) as unknown as FeaturePrefsRow[]
    }
    if (scope.coachId) {
        const { data, error } = await admin
            .from('coach_feature_prefs')
            .select('domain, preset, sections')
            .eq('coach_id', scope.coachId)
        if (error) throw error
        return (data ?? []) as unknown as FeaturePrefsRow[]
    }
    return []
}

/**
 * Resuelve el master switch de los 5 dominios + las secciones de Nutrición con una única lectura.
 */
async function resolveFeaturePrefs(
    admin: DB,
    scope: NutritionScope,
    applied: EnabledModules,
): Promise<ResolvedFeaturePrefs> {
    const entitledByModule: Partial<Record<ModuleKey, boolean>> = {
        nutrition_exchanges: applied.nutrition_exchanges === true,
        body_composition: applied.body_composition === true,
    }
    // D9-A (owner, 22-08 ratificada 26-08): la preferencia de módulos es SOLO del panel del COACH.
    // Scope ALUMNO (`clientId` presente — en scope coach siempre es null) => las prefs no
    // participan: todo prendido, modulado únicamente por los entitlements reales del plan. El
    // scope COACH sigue igual: su panel (CoachMobileChrome) respeta su propia preferencia, ahora
    // siempre (prefs siempre-on desde W1.10, 2026-09-01).
    if (scope.clientId || (!scope.coachId && !scope.teamId)) {
        return failOpenPrefs(entitledByModule)
    }
    // ENTERPRISE (SPEC §10 / OUTLINE §5): el coach `org_managed` NO tiene la zona «Funciones» —
    // no hay dónde volver a prender un dominio, así que un gate acá sería un lockout sin puerta.
    // Los 5 quedan prendidos y ni siquiera se leen las prefs.
    if (scope.orgId) {
        return failOpenPrefs(entitledByModule)
    }
    // `orgId` ya quedó descartado arriba: base = team si hay `teamId`, si no el coach standalone.
    const useTeamBase = !!scope.teamId
    try {
        // Solo llega scope COACH (el ALUMNO retornó arriba), o sea nunca hay capa por-alumno:
        // `client_feature_prefs` ya no se lee en este endpoint.
        const rows = await readFeaturePrefsRows(admin, useTeamBase, scope)
        const byDomain = new Map<string, FeaturePrefsRow>(rows.map((row) => [row.domain, row]))

        // Standalone: la fila `_nav` ya vino en la MISMA lectura (se mapea por dominio como el resto
        // y los demás lectores la ignoran). Team: hay que pedirla aparte, es del coach y no del pool.
        const navOrder = useTeamBase
            ? await readCoachNavOrder(admin, scope.coachId)
            : navOrderFromRow(byDomain.get(NAV_ORDER_DOMAIN)?.sections)

        const domains = {} as DomainFlags
        let nutritionSections: Record<NutritionSectionKey, boolean> | null = null
        for (const domain of FEATURE_DOMAIN_KEYS) {
            const row = byDomain.get(domain) ?? null
            const rowSections = (row?.sections ?? null) as SectionPrefs | null
            const resolverInput = {
                domain,
                preset: (row?.preset ?? null) as Preset | string | null,
                useTeamBase,
                coachSections: useTeamBase ? null : rowSections,
                teamSections: useTeamBase ? rowSections : null,
                clientSections: null,
            }
            // El master switch `_enabled` es PURA preferencia: no lo modula ningún entitlement
            // (el gate de dinero lo aplican los módulos, no esta key) => `entitledByModule` vacío.
            domains[domain] = resolveDomainEnabled({ ...resolverInput, entitledByModule: {} })
            if (domain === 'nutrition') {
                // Misma fila, misma lectura: las secciones sí se modulan por entitlement.
                nutritionSections = resolveSections({
                    ...resolverInput,
                    entitledByModule,
                }) as Record<NutritionSectionKey, boolean>
            }
        }
        return {
            domains,
            sections: nutritionSections ?? failOpenSections(entitledByModule),
            navOrder,
        }
    } catch {
        return failOpenPrefs(entitledByModule)
    }
}

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const auth = await verifyMobileBearer(token)
    if (!auth.ok) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }
    const userId = auth.userId
    const admin = createServiceRoleClient()

    const [coachRow, clientRow] = await Promise.all([
        admin.from('coaches').select('enabled_modules').eq('id', userId).maybeSingle(),
        admin.from('clients').select('coach_id, team_id, org_id').eq('id', userId).maybeSingle(),
    ])

    let rawModules: EnabledModules = {}
    let scope: NutritionScope = {
        coachId: null,
        clientId: null,
        teamId: null,
        orgId: null,
    }
    const requestedKind = request.nextUrl.searchParams.get('workspaceKind')

    if (requestedKind) {
        const requestedWorkspace = {
            kind: requestedKind,
            teamId: request.nextUrl.searchParams.get('teamId') || null,
            orgId: request.nextUrl.searchParams.get('orgId') || null,
        }
        const context = await resolveMobileClientMutationContext(request, requestedWorkspace)
        if ('error' in context) return context.error
        if (context.scope.type === 'team') {
            rawModules = await getTeamEnabledModules(admin, context.scope.teamId)
            scope = {
                coachId: userId,
                clientId: null,
                teamId: context.scope.teamId,
                orgId: null,
            }
        } else if (context.scope.type === 'enterprise') {
            // Enterprise = org paga (coach `org_managed`, acceso siempre) ⇒ los 4 módulos incluidos.
            // Se resuelve por el coach (espejo de la web, que resuelve enterprise vía el coach): el
            // resolver deriva ON para `org_managed`. UNION con cualquier flag crudo del coach.
            rawModules = await getCoachEnabledModules(admin, userId)
            scope = {
                coachId: userId,
                clientId: null,
                teamId: null,
                orgId: context.scope.orgId,
            }
        } else {
            rawModules = await getCoachEnabledModules(admin, userId)
            scope = { coachId: userId, clientId: null, teamId: null, orgId: null }
        }
    } else if (coachRow.data) {
        // Standalone coach (sin workspaceKind): pasar por el resolver para heredar la derivación
        // "pago ⇒ los 4 módulos incluidos" (UNION con sus flags crudos/cortesías).
        rawModules = await getCoachEnabledModules(admin, userId)
        scope = { coachId: userId, clientId: null, teamId: null, orgId: null }
    } else if (clientRow.data) {
        const c = clientRow.data as {
            coach_id: string | null
            team_id: string | null
            org_id: string | null
        }
        if (c.org_id) {
            rawModules = {}
        } else if (c.team_id) {
            rawModules = await getTeamEnabledModules(admin, c.team_id)
        } else if (c.coach_id) {
            rawModules = await getCoachEnabledModules(admin, c.coach_id)
        }
        scope = {
            coachId: c.coach_id ?? null,
            clientId: userId,
            teamId: c.team_id ?? null,
            orgId: c.org_id ?? null,
        }
    }

    const applied = applyOperatorKillSwitch(rawModules)
    const enabledModules = MODULE_KEYS.filter((key) => applied[key] === true)
    const disabledModules = MODULE_KEYS.filter((key) => isModuleKilledByOperator(key))

    // Gate de suscripcion del coach para el alumno RN (politica CEO 2026-07-18). Resuelto server-side
    // con service-role (bypassa RLS → lectura confiable de las columnas de sub del coach). Solo aplica
    // a usuarios ALUMNO (scope.clientId); para un coach el campo es null. La app RN usa {state} para
    // banner (grace) / pantalla honesta (readonly). NOTA: cosmetico — la RLS/RPC es la barrera real.
    const studentAccess = scope.clientId
        ? await resolveStudentAccessForCoach(admin, scope.coachId)
        : null

    const { domains, sections, navOrder } = await resolveFeaturePrefs(admin, scope, applied)

    return NextResponse.json({
        enabledModules,
        disabledModules,
        featurePrefs: {
            // ESPEJO LEGACY (W1.1, 2026-09-01): binarios/OTAs anteriores leen este campo plano; retirar junto con featurePrefsEnabled en la wave siguiente.
            nutritionEnabled: domains.nutrition,
            sections,
            domains,
            // Orden de la barra elegido por el coach en «Funciones». `null` = usa el de su
            // especialidad; la app NUNCA lo deriva de acá para decidir visibilidad, solo prioridad.
            navOrder,
        },
        // ESPEJO LEGACY (W1.10, 2026-09-01): lo lee apps/mobile/lib/coach-client-detail.ts en binarios/OTAs anteriores; el valor real ya no existe (prefs siempre-on). Retirar junto con featurePrefs.nutritionEnabled en la wave siguiente.
        featurePrefsEnabled: true,
        studentAccess: studentAccess
            ? { state: studentAccess.state, graceEndsAt: studentAccess.graceEndsAt }
            : null,
    })
}
