import { Suspense } from 'react'
import { ComplianceScoresCard } from './ComplianceScoresCard'
import { NutritionDailySummary } from './nutrition/NutritionDailySummary'
import { WeightWidget } from './weight/WeightWidget'
import { PersonalRecordsBanner } from './records/PersonalRecordsBanner'
import { HabitsTrackerWidget } from './habits/HabitsTrackerWidget'
import { ComplianceRingsSkeleton, HabitsSkeleton, NutritionSkeleton, PersonalRecordsSkeleton, WeightSkeleton } from './dashboard-skeletons'
import { RevealStagger, RevealItem } from '@/components/motion/Reveal'
import { getDashboardNutritionDomainEnabled } from '../_data/heroComplianceBundle'

/**
 * Bloque lateral (§5): deduplicación de datos vía `React.cache` en queries aunque se monte 2× (mobile + desktop).
 * P2: cascada de entrada — cada bloque en `RevealItem` dentro de `RevealStagger`.
 * Reveal solo usa CSS transform/opacity → barato aunque el sidebar se monte 2× (mobile + desktop)
 * y es reduced-motion aware (salta al estado final si el usuario lo prefiere).
 * Los anillos de compliance ya cuentan-up por dentro (se dejan intactos).
 *
 * Gate del dominio Nutricion (master switch §4.8): cuando el coach lo apaga para este alumno, el
 * `RevealItem` del resumen diario NO se monta — evita un slot vacío con su `gap-4` colgando (NN/g
 * pitfall). El anillo de Nutrición dentro de `ComplianceScoresCard` se oculta por su cuenta (la
 * tarjeta de compliance sigue presente con Entrenos + Check-ins). React.cache dedupe la lectura del
 * dominio entre este componente, la tarjeta de compliance y el resumen (1 query por request).
 */
export async function DashboardSidebarBlocks({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const nutritionEnabled = await getDashboardNutritionDomainEnabled(userId)
    return (
        <RevealStagger className="flex flex-col gap-4">
            <RevealItem>
                <Suspense fallback={<ComplianceRingsSkeleton />}>
                    <ComplianceScoresCard userId={userId} coachSlug={coachSlug} />
                </Suspense>
            </RevealItem>
            <RevealItem>
                <Suspense fallback={<WeightSkeleton />}>
                    <WeightWidget userId={userId} coachSlug={coachSlug} />
                </Suspense>
            </RevealItem>
            {nutritionEnabled ? (
                <RevealItem>
                    <Suspense fallback={<NutritionSkeleton />}>
                        <NutritionDailySummary userId={userId} coachSlug={coachSlug} />
                    </Suspense>
                </RevealItem>
            ) : null}
            <RevealItem>
                <Suspense fallback={<HabitsSkeleton />}>
                    <HabitsTrackerWidget userId={userId} coachSlug={coachSlug} />
                </Suspense>
            </RevealItem>
            <RevealItem>
                <Suspense fallback={<PersonalRecordsSkeleton />}>
                    <PersonalRecordsBanner userId={userId} />
                </Suspense>
            </RevealItem>
        </RevealStagger>
    )
}
