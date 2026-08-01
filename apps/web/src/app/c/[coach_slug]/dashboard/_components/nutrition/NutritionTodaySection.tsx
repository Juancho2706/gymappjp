import { Suspense } from 'react'
import { SectionTitle } from '../shared/SectionTitle'
import { NutritionSkeleton } from '../dashboard-skeletons'
import { NutritionDailySummary } from './NutritionDailySummary'
import { NutritionDailySummaryV2 } from './NutritionDailySummaryV2'
import { getClientScope } from '../../../nutrition/_data/client-scope.queries'

/**
 * Nutrición V2 es canónica en standalone y Team. Enterprise conserva la card V1 aislada hasta
 * su retiro dedicado.
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
    let enterpriseWorkspace = false
    try {
        const scope = await getClientScope(userId)
        enterpriseWorkspace = scope.orgId != null
    } catch {
        // Ante una lectura de scope fallida no mostramos datos legacy; V2 mantiene sus propios gates.
        enterpriseWorkspace = false
    }

    if (!enterpriseWorkspace) {
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
 * Fallback de la sección mientras se resuelve el workspace. Mantiene visible el encabezado
 * sobre el esqueleto de la card y apunta a la ruta canónica V2.
 */
export function NutritionTodaySectionFallback({ base }: { base: string }) {
    return (
        <div>
            <SectionTitle accent="var(--ember-500)" action="Ver nutrición" actionHref={`${base}/nutrition-v2`}>
                Nutrición de hoy
            </SectionTitle>
            <NutritionSkeleton />
        </div>
    )
}
