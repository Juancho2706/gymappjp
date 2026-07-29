import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getClientProfileData } from '@/services/client/client-detail.service'
import { hasModule } from '@/services/entitlements.service'
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
    const supabase = await createClient()
    const isOrgScoped = !!nutritionClient.org_id
    const moduleCtx = nutritionClient.team_id
        ? { teamId: nutritionClient.team_id }
        : { coachId: nutritionClient.coach_id ?? '' }

    const [cardio, movement, bodycomp, nutritionV2] = await Promise.all([
        isOrgScoped ? Promise.resolve(false) : hasModule(supabase, 'cardio', moduleCtx),
        isOrgScoped
            ? Promise.resolve(false)
            : hasModule(supabase, 'movement_assessment', moduleCtx),
        isOrgScoped
            ? Promise.resolve(false)
            : hasModule(supabase, 'body_composition', moduleCtx),
        // Poda 2026-07-29: el panel resuelve el MISMO resumen V2 que la ruta standalone. Antes
        // no lo resolvía, así que este camino mostraba el tab V1 (borrado) pase lo que pase.
        resolveNutritionTabV2(clientId),
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
            activeProgramName:
                (data.activeProgram as { name?: string | null } | null | undefined)?.name ?? null,
        },
        /** Accesos a módulos movida (espejo visual de ModuleLinksRow). */
        moduleFlags: { cardio, movement, bodycomp },
        /** Resumen del tab Nutrición (SIEMPRE V2). `null` ⇒ el tab pinta su estado degradado. */
        nutritionV2,
    }
}

/** Tipo del bundle de la ficha — inferido del retorno para conservar tipos exactos. */
export type ClientFichaPanelBundle = Awaited<ReturnType<typeof assembleClientFichaPanel>>
