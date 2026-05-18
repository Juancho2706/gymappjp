import { Suspense } from 'react'
import { ComplianceScoresCard } from './ComplianceScoresCard'
import { NutritionDailySummary } from './nutrition/NutritionDailySummary'
import { WeightWidget } from './weight/WeightWidget'
import { PersonalRecordsBanner } from './records/PersonalRecordsBanner'
import { HabitsTrackerWidget } from './habits/HabitsTrackerWidget'
import { ComplianceRingsSkeleton, HabitsSkeleton, NutritionSkeleton, PersonalRecordsSkeleton, WeightSkeleton } from './dashboard-skeletons'

/** Bloque lateral (§5): deduplicación de datos vía `React.cache` en queries aunque se monte 2× (mobile + desktop). */
export function DashboardSidebarBlocks({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    return (
        <>
            <Suspense fallback={<ComplianceRingsSkeleton />}>
                <ComplianceScoresCard userId={userId} coachSlug={coachSlug} />
            </Suspense>
            <Suspense fallback={<WeightSkeleton />}>
                <WeightWidget userId={userId} coachSlug={coachSlug} />
            </Suspense>
            <Suspense fallback={<NutritionSkeleton />}>
                <NutritionDailySummary userId={userId} coachSlug={coachSlug} />
            </Suspense>
            <Suspense fallback={<HabitsSkeleton />}>
                <HabitsTrackerWidget userId={userId} coachSlug={coachSlug} />
            </Suspense>
            <Suspense fallback={<PersonalRecordsSkeleton />}>
                <PersonalRecordsBanner userId={userId} />
            </Suspense>
        </>
    )
}
