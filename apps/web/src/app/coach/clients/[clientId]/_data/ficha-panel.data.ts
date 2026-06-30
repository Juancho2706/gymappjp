import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getClientProfileData } from '@/services/client/client-detail.service'
import { hasModule } from '@/services/entitlements.service'
import {
    resolveClientFeaturePrefsOverrideContext,
    resolveFeaturePrefs,
    resolveNutritionDomainEnabled,
} from '@/services/feature-prefs.service'
import { getCoachNutrientTargets } from './nutrient-targets.queries'
import { getCoachPrivateNotes, getCoachMealComments } from './nutrition-notes.queries'

/**
 * Arma el bundle serializable de la ficha del alumno (hero + dashboard completo + zona C
 * de nutrición + entitlements de módulos) para renderizarla INLINE en el panel derecho
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

    const nutritionTodayIso = (data.todayIso as string | undefined) ?? ''

    const nutritionClient = client as {
        coach_id?: string | null
        team_id?: string | null
        org_id?: string | null
    }
    const nutritionCoachId = nutritionClient.coach_id ?? ''
    const activeNutritionPlanId =
        (data.activeNutritionPlanWithMeals as { id?: string } | null | undefined)?.id ?? null
    const featurePrefsInput = {
        coachId: nutritionCoachId,
        clientId,
        clientTeamId: nutritionClient.team_id ?? null,
        clientOrgId: nutritionClient.org_id ?? null,
    }

    // Entitlements de módulos por el contexto del RECURSO del alumno (team del pool
    // manda; si no, el coach). Enterprise (org_id) fuera en v1 → todo false. Espejo del
    // gate server-side de cada página de módulo (assertModule) y de ModuleLinksRow.
    const supabase = await createClient()
    const isOrgScoped = !!nutritionClient.org_id
    const moduleCtx = nutritionClient.team_id
        ? { teamId: nutritionClient.team_id }
        : { coachId: nutritionClient.coach_id ?? '' }

    const [
        coachNutrientTargets,
        coachPrivateNotes,
        coachMealComments,
        nutritionDomainEnabled,
        nutritionSectionFlags,
        nutritionOverrideContext,
        cardio,
        movement,
        bodycomp,
        nutritionPro,
    ] = await Promise.all([
        getCoachNutrientTargets(clientId),
        getCoachPrivateNotes(clientId),
        nutritionTodayIso
            ? getCoachMealComments(clientId, nutritionTodayIso)
            : Promise.resolve([]),
        resolveNutritionDomainEnabled(featurePrefsInput),
        resolveFeaturePrefs({
            domain: 'nutrition',
            ...featurePrefsInput,
            planId: activeNutritionPlanId,
        }),
        resolveClientFeaturePrefsOverrideContext({
            domain: 'nutrition',
            ...featurePrefsInput,
            planId: activeNutritionPlanId,
        }),
        isOrgScoped ? Promise.resolve(false) : hasModule(supabase, 'cardio', moduleCtx),
        isOrgScoped
            ? Promise.resolve(false)
            : hasModule(supabase, 'movement_assessment', moduleCtx),
        isOrgScoped
            ? Promise.resolve(false)
            : hasModule(supabase, 'body_composition', moduleCtx),
        isOrgScoped
            ? Promise.resolve(false)
            : hasModule(supabase, 'nutrition_exchanges', moduleCtx),
    ])

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
            attentionScore: data.attentionScore,
            currentWeightKg,
            weightDeltaKg,
            nutritionPlansLength: nutritionPlans.length,
            nutritionFirstPlanId: firstPlan?.id as string | undefined,
        },
        /** Accesos a módulos movida (espejo visual de ModuleLinksRow). */
        moduleFlags: { cardio, movement, bodycomp },
        coachNutrientTargets,
        coachPrivateNotes,
        coachMealComments,
        nutritionProEnabled: nutritionPro,
        nutritionDomainEnabled,
        nutritionSectionFlags,
        nutritionOverrideContext,
    }
}

/** Tipo del bundle de la ficha — inferido del retorno para conservar tipos exactos. */
export type ClientFichaPanelBundle = Awaited<ReturnType<typeof assembleClientFichaPanel>>
