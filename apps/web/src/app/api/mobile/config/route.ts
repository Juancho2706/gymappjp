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
import { resolveStudentAccessForCoach } from '@/lib/student-access.server'

/**
 * Config operacional + entitlements para el cliente mobile. Fuente única de verdad de:
 *  - módulos de pago efectivos del scope,
 *  - master switch y secciones de Nutrición.
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
    scope: NutritionScope,
    applied: EnabledModules,
): Promise<{ nutritionEnabled: boolean; sections: Record<NutritionSectionKey, boolean> }> {
    const entitledByModule: Partial<Record<ModuleKey, boolean>> = {
        nutrition_exchanges: applied.nutrition_exchanges === true,
        body_composition: applied.body_composition === true,
    }
    // D9-A (owner, 22-08 ratificada 26-08): la preferencia de modulos es SOLO del panel del COACH.
    // Scope ALUMNO (`clientId` presente — en scope coach siempre es null) => las prefs no
    // participan: todo prendido, modulado unicamente por los entitlements reales del plan. El
    // scope COACH sigue igual: su `nutritionEnabled` (CoachMobileChrome) respeta su propia
    // preferencia, ahora siempre (prefs siempre-on desde W1.10, 2026-09-01).
    if (scope.clientId || (!scope.coachId && !scope.teamId)) {
        return { nutritionEnabled: true, sections: failOpenSections(entitledByModule) }
    }
    const useTeamBase = !!scope.teamId && !scope.orgId
    try {
        // Solo llega scope COACH (el ALUMNO retorno arriba), o sea nunca hay capa por-alumno:
        // `client_feature_prefs` ya no se lee en este endpoint.
        const base = await readBaseNutritionPrefs(admin, useTeamBase, scope)
        const resolverInput = {
            domain: 'nutrition' as const,
            entitledByModule,
            preset: base.preset as Preset | string | null,
            useTeamBase,
            coachSections: useTeamBase ? null : base.sections,
            teamSections: useTeamBase ? base.sections : null,
            clientSections: null,
        }
        return {
            nutritionEnabled: resolveDomainEnabled(resolverInput),
            sections: resolveSections(resolverInput) as Record<NutritionSectionKey, boolean>,
        }
    } catch {
        return { nutritionEnabled: true, sections: failOpenSections(entitledByModule) }
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

    const { nutritionEnabled, sections } = await resolveNutritionPrefs(admin, scope, applied)

    return NextResponse.json({
        enabledModules,
        disabledModules,
        featurePrefs: { nutritionEnabled, sections },
        // ESPEJO LEGACY (W1.10, 2026-09-01): lo lee apps/mobile/lib/coach-client-detail.ts en binarios/OTAs anteriores; el valor real ya no existe (prefs siempre-on). Retirar junto con featurePrefs.nutritionEnabled en la wave siguiente.
        featurePrefsEnabled: true,
        studentAccess: studentAccess
            ? { state: studentAccess.state, graceEndsAt: studentAccess.graceEndsAt }
            : null,
    })
}
