import { Suspense } from 'react'
import { ComplianceScoresCard } from './ComplianceScoresCard'
import { NutritionDailySummary } from './nutrition/NutritionDailySummary'
import { WeightWidget } from './weight/WeightWidget'
import { PersonalRecordsBanner } from './records/PersonalRecordsBanner'
import { HabitsTrackerWidget } from './habits/HabitsTrackerWidget'
import { ComplianceRingsSkeleton, HabitsSkeleton, NutritionSkeleton, PersonalRecordsSkeleton, WeightSkeleton } from './dashboard-skeletons'
import { RevealStagger, RevealItem } from '@/components/motion/Reveal'

/**
 * Bloque lateral (§5): deduplicación de datos vía `React.cache` en queries aunque se monte 2× (mobile + desktop).
 * P2: cascada de entrada — cada bloque en `RevealItem` dentro de `RevealStagger`.
 * Reveal solo usa CSS transform/opacity → barato aunque el sidebar se monte 2× (mobile + desktop)
 * y es reduced-motion aware (salta al estado final si el usuario lo prefiere).
 * Los anillos de compliance ya cuentan-up por dentro (se dejan intactos).
 */
export function DashboardSidebarBlocks({ userId, coachSlug }: { userId: string; coachSlug: string }) {
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
            <RevealItem>
                <Suspense fallback={<NutritionSkeleton />}>
                    <NutritionDailySummary userId={userId} coachSlug={coachSlug} />
                </Suspense>
            </RevealItem>
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
