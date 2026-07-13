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

/**
 * Config operacional + entitlements para el cliente mobile. Fuente UNICA de verdad de:
 *  - los modulos de pago EFECTIVOS del scope del bearer (coach o alumno),
 *  - el master switch del dominio Nutricion (gate del tab del alumno),
 *  - flags remotos (reservado),
 * todo lo que RN no puede resolver por si mismo (env server-only + lecturas que la RLS del
 * alumno no permite sobre `coaches`/`teams`).
 *
 * Contrato del GET (Bearer, read-only — patron `verifyMobileBearer`, jose local + degrade a
 * getUser; ver lib/mobile-auth.ts):
 * {
 *   enabledModules:  ModuleKey[]   // modulos EFECTIVOS del scope (enabled_modules del recurso
 *                                  //   MENOS el kill-switch de operador EVA_DISABLED_MODULES).
 *                                  //   Coach => sus modulos (standalone v1, teamId null).
 *                                  //   Alumno => los de SU coach (o su team si pertenece a un
 *                                  //   pool; enterprise/org => [] por diseno, mobile diferido).
 *   disabledModules: ModuleKey[]   // los apagados por el kill-switch de operador (debug/defensa
 *                                  //   en profundidad: el cliente los resta de enabledModules).
 *   featurePrefs: { nutritionEnabled: boolean; sections: Record<NutritionSectionKey, boolean> }
 *                                  // master switch `_enabled` del dominio Nutricion + visibilidad
 *                                  //   por seccion, resueltos para el scope del bearer
 *                                  //   (coach/team/cliente) con el resolver PURO de @eva/feature-prefs
 *                                  //   (cero drift vs web). `nutritionEnabled` gatea el tab "Plan"
 *                                  //   del nav Y la ruta (RN muestra NutritionDomainOff, no el plan).
 *                                  //   `sections` gatea cada seccion (notas/compras/plato/off-plan/
 *                                  //   recetas/micros) render-only, mismo choke point que web
 *                                  //   `sectionFlags`. Fail-OPEN: flag FEATURE_PREFS_ENABLED
 *                                  //   OFF/ausente/Edge caido => nutritionEnabled=true + secciones
 *                                  //   = core||entitled (mostrar todo lo entitled).
 *   featurePrefsEnabled: boolean   // flag Edge Config FEATURE_PREFS_ENABLED (fail-OPEN).
 *   flags: {}                      // objeto reservado para flags remotos de pantalla (E0-G4,
 *                                  //   apps/mobile/lib/flags.ts). Vacio por ahora.
 * }
 *
 * Por que `featurePrefs` se resuelve aca y no viaja "por otro lado": mobile habla PostgREST
 * directo, pero la RLS del alumno NO le deja leer `coach_feature_prefs`/`team_feature_prefs` de
 * su coach/team (ni `coaches.enabled_modules`). El resolver server-side (service-role) es el
 * unico camino — espejo de `client-root.queries.ts#getStudentNutritionNavEnabled` en la web.
 *
 * El gate de DINERO (escritura) NO vive aca: ya esta en los endpoints /api/mobile/* (assertModule).
 * Esto solo espeja la VISIBILIDAD para que la UI mobile no muestre superficie apagada.
 */

type DB = ReturnType<typeof createServiceRoleClient>

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

function asEnabledModules(value: unknown): EnabledModules {
    return value && typeof value === 'object' ? (value as EnabledModules) : {}
}

/** Lee FEATURE_PREFS_ENABLED de Edge Config. Fail-OPEN: cualquier fallo => false (= mostrar todo). */
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

/** Lee la fila base de prefs de nutricion (team si pool, si no coach). Fail-safe a vacio. */
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
        return { preset: (data?.preset ?? null) as string | null, sections: (data?.sections ?? null) as SectionPrefs | null }
    }
    if (scope.coachId) {
        const { data } = await admin
            .from('coach_feature_prefs')
            .select('preset, sections')
            .eq('coach_id', scope.coachId)
            .eq('domain', 'nutrition')
            .maybeSingle()
        return { preset: (data?.preset ?? null) as string | null, sections: (data?.sections ?? null) as SectionPrefs | null }
    }
    return { preset: null, sections: null }
}

/**
 * Fail-OPEN de las secciones (flag OFF / sin scope / error de lectura): mostrar TODO lo entitled
 * — core => true; gateada => entitled del modulo; libre => true. Espejo EXACTO de la rama fail-open
 * de `resolveFeaturePrefs` de la web (feature-prefs.service.ts) => cero drift.
 */
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

/**
 * Resuelve el master switch `_enabled` del dominio Nutricion + la visibilidad por seccion para el
 * scope del bearer, con service-role (la RLS del alumno no deja leer prefs del coach/team). Reusa
 * los resolvers PUROS `resolveDomainEnabled` + `resolveSections` de @eva/feature-prefs (misma
 * logica que la web => cero drift). `entitledByModule` se deriva de los modulos EFECTIVOS del scope
 * (post kill-switch) — las secciones que gatea mobile (notas/compras/plato/off-plan/recetas) son
 * todas `requiresModule: null`, asi que la preferencia (preset + toggles) es lo unico que las achica.
 * Fail-OPEN + fail-safe: flag OFF / sin scope / fallo de lectura => dominio ON + secciones entitled.
 */
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
        const clientSections = ((clientRes.data as { sections?: SectionPrefs } | null)?.sections ?? null) as SectionPrefs | null
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

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const auth = await verifyMobileBearer(token)
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    const userId = auth.userId

    const admin = createServiceRoleClient()

    // El bearer puede ser un coach (coaches.id = uid) o un alumno (clients.id = uid — identidad
    // legacy). Resolvemos ambas filas en paralelo y priorizamos coach.
    const [coachRow, clientRow] = await Promise.all([
        admin.from('coaches').select('enabled_modules').eq('id', userId).maybeSingle(),
        admin.from('clients').select('coach_id, team_id, org_id').eq('id', userId).maybeSingle(),
    ])

    let rawModules: EnabledModules = {}
    let scope: NutritionScope = { coachId: null, clientId: null, teamId: null, orgId: null }
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
            scope = { coachId: userId, clientId: null, teamId: context.scope.teamId, orgId: null }
        } else if (context.scope.type === 'enterprise') {
            // Enterprise conserva módulos personales fuera del workspace, igual que web.
            rawModules = {}
            scope = { coachId: userId, clientId: null, teamId: null, orgId: context.scope.orgId }
        } else {
            rawModules = await getCoachEnabledModules(admin, userId)
            scope = { coachId: userId, clientId: null, teamId: null, orgId: null }
        }
    } else if (coachRow.data) {
        // Coach standalone v1: teamId null (mobile aun no opera workspaces de pool).
        rawModules = asEnabledModules(coachRow.data.enabled_modules)
        scope = { coachId: userId, clientId: null, teamId: null, orgId: null }
    } else if (clientRow.data) {
        const c = clientRow.data as { coach_id: string | null; team_id: string | null; org_id: string | null }
        if (c.org_id) {
            // Enterprise (org): los modulos de pago no se ofrecen en contexto org (espejo de
            // isStudentMovementEnabled / getStudentBodyCompositionView). Mobile enterprise diferido.
            rawModules = {}
        } else if (c.team_id) {
            // Pool/team: el team decide (pool gana, no union).
            rawModules = await getTeamEnabledModules(admin, c.team_id)
        } else if (c.coach_id) {
            rawModules = await getCoachEnabledModules(admin, c.coach_id)
        }
        scope = { coachId: c.coach_id ?? null, clientId: userId, teamId: c.team_id ?? null, orgId: c.org_id ?? null }
    }

    const applied = applyOperatorKillSwitch(rawModules)
    const enabledModules = MODULE_KEYS.filter((k) => applied[k] === true)
    const disabledModules = MODULE_KEYS.filter((k) => isModuleKilledByOperator(k))

    const featurePrefsEnabled = await readFeaturePrefsEnabled()
    const { nutritionEnabled, sections } = await resolveNutritionPrefs(admin, featurePrefsEnabled, scope, applied)

    return NextResponse.json({
        enabledModules,
        disabledModules,
        featurePrefs: { nutritionEnabled, sections },
        featurePrefsEnabled,
        flags: {},
    })
}
