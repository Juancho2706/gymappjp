import { Suspense } from 'react'
import { SectionTitle } from '../shared/SectionTitle'
import { NutritionSkeleton } from '../dashboard-skeletons'
import { NutritionDailySummary } from './NutritionDailySummary'
import { NutritionDailySummaryV2 } from './NutritionDailySummaryV2'
import { getClientScope } from '../../../nutrition/_data/client-scope.queries'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

/**
 * Enruta la sección "Nutrición de hoy" del dashboard del alumno entre V1 (card clásica de
 * comidas) y V2 (resumen del read model de hoy), según el rollout técnico `webStudent` —
 * mismo patrón que la página de nutrición del alumno.
 *
 * Fail-closed: cualquier error al resolver el flag deja la card V1 intacta (comportamiento de
 * hoy). La card V1 no se toca; solo se oculta cuando el alumno está dentro del rollout V2.
 */
export async function NutritionTodaySection({
    userId,
    coachSlug,
    base,
}: {
    userId: string
    coachSlug: string
    base: string
}) {
    let v2Enabled = false
    try {
        const scope = await getClientScope(userId)
        v2Enabled = await isNutritionV2Enabled({
            surface: 'webStudent',
            userId,
            clientId: userId,
            coachId: scope.coachId,
            teamId: scope.teamId,
            orgId: scope.orgId,
        })
    } catch {
        v2Enabled = false
    }

    if (v2Enabled) {
        return (
            <div>
                <SectionTitle accent="var(--ember-500)" action="Ver nutrición" actionHref={`${base}/nutrition-v2`}>
                    Nutrición de hoy
                </SectionTitle>
                <Suspense fallback={<NutritionSkeleton />}>
                    <NutritionDailySummaryV2 clientId={userId} base={base} />
                </Suspense>
            </div>
        )
    }

    return (
        <div>
            <SectionTitle accent="var(--ember-500)" action="Ver nutrición" actionHref={`${base}/nutrition`}>
                Nutrición de hoy
            </SectionTitle>
            <Suspense fallback={<NutritionSkeleton />}>
                <NutritionDailySummary userId={userId} coachSlug={coachSlug} />
            </Suspense>
        </div>
    )
}

/**
 * Fallback de la sección mientras se resuelve el rollout. Mantiene visible el encabezado
 * "Nutrición de hoy" (sin salto de layout) sobre el esqueleto de la card. La acción apunta a
 * la ruta V1 por defecto (el 99% de los alumnos fuera del canary); al resolver, la sección
 * ajusta el destino real.
 */
export function NutritionTodaySectionFallback({ base }: { base: string }) {
    return (
        <div>
            <SectionTitle accent="var(--ember-500)" action="Ver nutrición" actionHref={`${base}/nutrition`}>
                Nutrición de hoy
            </SectionTitle>
            <NutritionSkeleton />
        </div>
    )
}
