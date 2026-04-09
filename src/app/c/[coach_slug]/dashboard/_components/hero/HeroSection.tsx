import { WorkoutHeroCard, type HeroBlock } from './WorkoutHeroCard'
import { RestDayCard } from './RestDayCard'

interface HeroSectionProps {
    coachSlug: string
    hasWorkout: boolean
    planId: string | null
    planTitle: string | null
    blocks: HeroBlock[]
    isAlreadyLogged: boolean
    totalSetsTarget: number
    totalSetsLogged: number
    baseLoggedPerBlock: Record<string, number>
    nextWorkoutTitle: string | null
    nextWorkoutDayLabel: string | null
}

export function HeroSection({
    coachSlug,
    hasWorkout,
    planId,
    planTitle,
    blocks,
    isAlreadyLogged,
    totalSetsTarget,
    totalSetsLogged,
    baseLoggedPerBlock,
    nextWorkoutTitle,
    nextWorkoutDayLabel,
}: HeroSectionProps) {
    if (hasWorkout && planId && planTitle) {
        return (
            <WorkoutHeroCard
                coachSlug={coachSlug}
                planId={planId}
                title={planTitle}
                blocks={blocks}
                isAlreadyLogged={isAlreadyLogged}
                totalSetsTarget={totalSetsTarget}
                totalSetsLogged={totalSetsLogged}
                baseLoggedPerBlock={baseLoggedPerBlock}
            />
        )
    }
    return <RestDayCard coachSlug={coachSlug} nextWorkoutTitle={nextWorkoutTitle} nextWorkoutDayLabel={nextWorkoutDayLabel} />
}
