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
    resolveDomainEnabled,
    resolveSections,
    type ModuleKey,
    type NutritionSectionKey,
    type Preset,
    type SectionPrefs,
} from '@eva/feature-prefs'
import { resolveNutritionV2RolloutDecision } from '@/services/nutrition-v2-rollout.service'
import { resolveStudentAccessForCoach } from '@/lib/student-access.server'

/**
 * Config operacional + entitlements para el cliente mobile. Fuente única de verdad de:
 *  - módulos de pago efectivos del scope,
 *  - master switch y secciones de Nutrición V1,
 *  - rollout técnico fail-closed de Nutrición V2.
 *
 * El rollout V2 NO es un entitlement comercial y NO se mezcla con feature prefs.
 */

type DB = ReturnType<typeof createServiceRoleClient>

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

/** Lee FEATURE_PREFS_ENABLED de Edge Config. Fail-open para V1. */
async function readFeaturePrefsEnabled(): Promise<boolean> {
    if (!process.env.EDGE_CONFIG) return false
    try {
        const { get } = await import('@vercel/edge-config')
        return (await get<boolean>('FEATURE_PREFS_ENABLED')) === true
    } catch {
        return false
    }
}

type NutritionScope = {
    coachId: string | null
    clientId: string | null
    teamId: string | null
    orgId: string | null
}

async function readBaseNutritionPrefs(
    admin: DB,
    useTeamBase: boolean,
    scope: NutritionScope,
): Promise<{ preset: string | null; sections: SectionPrefs | null }> {
    if (useTeamBase && scope.teamId) {
        const { data } = await admin
            .from('team_feature_prefs')
            .select('preset, sections')
            .eq('team_id', scope.teamId)
            .eq('domain', 'nutrition')
            .maybeSingle()
        return {
            preset: (data?.preset ?? null) as string | null,
            sections: (data?.sections ?? null) as SectionPrefs | null,
        }
    }
    if (scope.coachId) {
        const { data } = await admin
            .from('coach_feature_prefs')
            .select('preset, sections')
            .eq('coach_id', scope.coachId)
            .eq('domain', 'nutrition')
            .maybeSingle()
        return {
            preset: (data?.preset ?? null) as string | null,
            sections: (data?.sections ?? null) as SectionPrefs | null,
        }
    }
    return { preset: null, sections: null }
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

async function resolveNutritionPrefs(
    admin: DB,
    prefsEnabled: boolean,
    scope: NutritionScope,
    applied: EnabledModules,
): Promise<{ nutritionEnabled: boolean; sections: Record<NutritionSectionKey, boolean> }> {
    const entitledByModule: Partial<Record<ModuleKey, boolean>> = {
        nutrition_exchanges: applied.nutrition_exchanges === true,
        body_composition: applied.body_composition === true,
    }
    if (!prefsEnabled || (!scope.coachId && !scope.teamId)) {
        return { nutritionEnabled: true, sections: failOpenSections(entitledByModule) }
    }
    const useTeamBase = !!scope.teamId && !scope.orgId
    try {
        const [base, clientRes] = await Promise.all([
            readBaseNutritionPrefs(admin, useTeamBase, scope),
            scope.clientId
                ? admin
                      .from('client_feature_prefs')
                      .select('sections')
                      .eq('client_id', scope.clientId)
                      .eq('domain', 'nutrition')
                      .maybeSingle()
                : Promise.resolve({ data: null }),
        ])
        const clientSections = (
            (clientRes.data as { sections?: SectionPrefs } | null)?.sections ?? null
        ) as SectionPrefs | null
        const resolverInput = {
            domain: 'nutrition' as const,
            entitledByModule,
            preset: base.preset as Preset | string | null,
            useTeamBase,
            coachSections: useTeamBase ? null : base.sections,
            teamSections: useTeamBase ? base.sections : null,
            clientSections,
        }
        return {
            nutritionEnabled: resolveDomainEnabled(resolverInput),
            sections: resolveSections(resolverInput) as Record<NutritionSectionKey, boolean>,
        }
    } catch {
        return { nutritionEnabled: true, sections: failOpenSections(entitledByModule) }
    }
}

/**
 * ¿El alumno `clientId` pertenece al workspace coach ya resuelto? Espeja `mobileContextOwnsClient`:
 * standalone/team por columna de scope, enterprise por asignación activa. Solo decide si el canary por
 * alumno (allowlist por alumno) puede alcanzar la ficha del coach en mobile.
 */
async function coachWorkspaceOwnsClient(
    admin: DB,
    scope: NutritionScope,
    userId: string,
    clientId: string,
): Promise<boolean> {
    if (scope.orgId) {
        const [{ data: client }, { data: assignment }] = await Promise.all([
            admin.from('clients').select('id').eq('id', clientId).eq('org_id', scope.orgId).is('team_id', null).maybeSingle(),
            admin
                .from('coach_client_assignments')
                .select('id')
                .eq('org_id', scope.orgId)
                .eq('client_id', clientId)
                .eq('coach_id', userId)
                .is('deleted_at', null)
                .maybeSingle(),
        ])
        return Boolean(client && assignment)
    }
    if (scope.teamId) {
        const { data } = await admin
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .eq('team_id', scope.teamId)
            .is('org_id', null)
            .maybeSingle()
        return Boolean(data)
    }
    const { data } = await admin
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', userId)
        .is('org_id', null)
        .is('team_id', null)
        .maybeSingle()
    return Boolean(data)
}

/**
 * Decisión de rollout de la superficie `mobileCoach`. Cuando la pantalla mobile es de un alumno puntual
 * (`clientId` de query) y ese alumno pertenece al workspace, se pasa su id al contexto para que un
 * canary acotado por alumno alcance la ficha/constructor del coach (paridad con web). Fail-closed: un
 * `clientId` ajeno o inexistente se ignora y se evalúa el flag global del coach, jamás un error.
 */
async function resolveMobileCoachV2Decision(
    admin: DB,
    scope: NutritionScope,
    userId: string,
    requestedClientId: string | null,
) {
    const canaryClientId =
        requestedClientId && (await coachWorkspaceOwnsClient(admin, scope, userId, requestedClientId))
            ? requestedClientId
            : null
    return resolveNutritionV2RolloutDecision({
        surface: 'mobileCoach',
        userId,
        coachId: userId,
        clientId: canaryClientId,
        teamId: scope.teamId,
        orgId: scope.orgId,
    })
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
    // Opcional: id del alumno de la ficha/constructor abierto en mobile, para alcanzar un canary
    // acotado por alumno en la rama coach. Ausente => comportamiento idéntico al histórico.
    const requestedClientId = request.nextUrl.searchParams.get('clientId')

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

    const featurePrefsEnabled = await readFeaturePrefsEnabled()
    const [{ nutritionEnabled, sections }, studentV2, coachV2] = await Promise.all([
        resolveNutritionPrefs(admin, featurePrefsEnabled, scope, applied),
        scope.clientId
            ? resolveNutritionV2RolloutDecision({
                  surface: 'mobileStudent',
                  userId,
                  clientId: scope.clientId,
                  coachId: scope.coachId,
                  teamId: scope.teamId,
                  orgId: scope.orgId,
              })
            : Promise.resolve({ enabled: false }),
        coachRow.data
            ? resolveMobileCoachV2Decision(admin, scope, userId, requestedClientId)
            : Promise.resolve({ enabled: false }),
    ])

    return NextResponse.json({
        enabledModules,
        disabledModules,
        featurePrefs: { nutritionEnabled, sections },
        featurePrefsEnabled,
        flags: {
            nutritionV2Student: studentV2.enabled === true,
            nutritionV2Coach: coachV2.enabled === true,
        },
        studentAccess: studentAccess
            ? { state: studentAccess.state, graceEndsAt: studentAccess.graceEndsAt }
            : null,
    })
}
