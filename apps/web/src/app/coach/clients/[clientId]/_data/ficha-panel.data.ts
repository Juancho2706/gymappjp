import 'server-only'

import { getClientProfileData } from '@/services/client/client-detail.service'
import {
    getEnabledModulesForRender,
    hasModuleFromMap,
} from '@/services/entitlements-render-cache'
import { applyNutritionAttentionScore } from '@/services/dashboard.service'
import { resolveDomainsEnabled } from '@/services/feature-prefs.service'
import { resolveNutritionTabV2 } from './nutrition-tab-v2.data'

/**
 * Arma el bundle serializable de la ficha del alumno (hero + dashboard completo + resumen
 * de nutrición V2 + entitlements de módulos) para renderizarla INLINE en el panel derecho
 * del master-detail de Alumnos (desktop).
 *
 * Espejo verbatim del ensamblado server-side de `ProfileContent` en
 * `[clientId]/page.tsx`: misma fuente de datos REAL. NO fabrica nada. La ruta standalone
 * `/coach/clients/[clientId]` queda intacta; este loader es el camino de datos para el
 * panel del master-detail (se invoca vía server action al seleccionar un alumno). El tipo
 * del bundle se INFIERE del retorno para que cada campo conserve el tipo exacto que la
 * ficha real (ClientProfileHero / ClientProfileDashboard) espera en sus props.
 */
export async function assembleClientFichaPanel(clientId: string) {
    const data = await getClientProfileData(clientId)
    const { client, nutritionPlans, checkIns, compliance } = data

    const nutritionClient = client as {
        coach_id?: string | null
        team_id?: string | null
        org_id?: string | null
    }

    // Entitlements de módulos por el contexto del RECURSO del alumno (team del pool
    // manda; si no, el coach). Enterprise (org_id) fuera en v1 → todo false. Espejo del
    // gate server-side de cada página de módulo (assertModule) y de ModuleLinksRow.
    // Poda 2026-07-29: UNA lectura memoizada del mapa en vez de 3 `hasModule` = 3 SELECT
    // idénticos por selección de alumno en el rail.
    const isOrgScoped = !!nutritionClient.org_id

    const [enabledModules, nutritionV2, domainsEnabled] = await Promise.all([
        isOrgScoped
            ? Promise.resolve({})
            : getEnabledModulesForRender(
                  nutritionClient.team_id ?? null,
                  nutritionClient.coach_id ?? null
              ),
        // Poda 2026-07-29: el panel resuelve el MISMO resumen V2 que la ruta standalone. Antes
        // no lo resolvía, así que este camino mostraba el tab V1 (borrado) pase lo que pase.
        resolveNutritionTabV2(clientId),
        // Dominios PRENDIDOS del panel del coach (Ola de orden W1.8): misma resolución que
        // `[clientId]/page.tsx` — el panel del master-detail es la MISMA ficha y no puede mostrar
        // pestañas que la ruta standalone esconde. Sin `clientId` (4A: el override por-alumno no
        // oculta pestañas); enterprise ⇒ los 5 en true sin leer.
        nutritionClient.coach_id
            ? resolveDomainsEnabled({
                  coachId: nutritionClient.coach_id,
                  clientTeamId: nutritionClient.team_id ?? null,
                  clientOrgId: nutritionClient.org_id ?? null,
              })
            : Promise.resolve({}),
    ])
    const cardio = hasModuleFromMap(enabledModules, 'cardio')
    const movement = hasModuleFromMap(enabledModules, 'movement_assessment')
    const bodycomp = hasModuleFromMap(enabledModules, 'body_composition')

    const sortedCheckIns = [...(checkIns || [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    const lastCheckIn = sortedCheckIns[0]
    const prevCheckIn = sortedCheckIns[1]
    const intake = (client as { client_intake?: { weight_kg?: number } }).client_intake
    const currentWeightRaw = lastCheckIn?.weight ?? intake?.weight_kg ?? 0
    const currentWeightKg = typeof currentWeightRaw === 'number' ? currentWeightRaw : 0
    const weightDeltaKg =
        lastCheckIn && prevCheckIn && lastCheckIn.weight != null && prevCheckIn.weight != null
            ? Number((lastCheckIn.weight - prevCheckIn.weight).toFixed(2))
            : 0

    const firstPlan = nutritionPlans[0]

    return {
        clientId,
        /** Objeto crudo del perfil (lo consume ClientProfileDashboard tal cual). */
        data,
        /** Props derivadas para ClientProfileHero. */
        hero: {
            client: {
                full_name: client.full_name,
                email: client.email,
                phone: client.phone,
                subscription_start_date: client.subscription_start_date,
                created_at: client.created_at,
                is_active: client.is_active,
            },
            compliance,
            profileLastActivityAt: data.profileLastActivityAt,
            // Mismo cierre que la ruta standalone: el service ya no mira nutrición, la señal V2 de
            // esta misma carga completa el score (sin plan V2 vigente NO penaliza).
            attentionScore: applyNutritionAttentionScore(
                data.attentionScore,
                nutritionV2?.isAtRisk ?? null
            ),
            currentWeightKg,
            weightDeltaKg,
            nutritionPlansLength: nutritionPlans.length,
            nutritionFirstPlanId: firstPlan?.id as string | undefined,
            activeProgramName:
                (data.activeProgram as { name?: string | null } | null | undefined)?.name ?? null,
        },
        /** Accesos a módulos movida (espejo visual de ModuleLinksRow). */
        moduleFlags: { cardio, movement, bodycomp },
        /** Resumen del tab Nutrición (SIEMPRE V2). `null` ⇒ el tab pinta su estado degradado. */
        nutritionV2,
        /** Dominios prendidos del panel del coach: gobiernan las pestañas de la ficha (W1.8 · 4A). */
        domainsEnabled,
    }
}

/** Tipo del bundle de la ficha — inferido del retorno para conservar tipos exactos. */
export type ClientFichaPanelBundle = Awaited<ReturnType<typeof assembleClientFichaPanel>>
