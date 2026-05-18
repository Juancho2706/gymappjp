import { getHeroComplianceBundle } from '../_data/heroComplianceBundle'
import { HeroSection } from './hero/HeroSection'

/** Bloque principal del hero (datos vía `getHeroComplianceBundle`; anillos en `ComplianceScoresCard`). */
export async function HeroAndComplianceGroup({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const { hero } = await getHeroComplianceBundle(userId, coachSlug)
    return (
        <HeroSection
            coachSlug={coachSlug}
            hasWorkout={hero.hasWorkout}
            planId={hero.planId}
            planTitle={hero.planTitle}
            blocks={hero.blocks}
            isAlreadyLogged={hero.isAlreadyLogged}
            totalSetsTarget={hero.totalSetsTarget}
            totalSetsLogged={hero.totalSetsLogged}
            baseLoggedPerBlock={hero.baseLoggedPerBlock}
            nextWorkoutTitle={hero.nextWorkoutTitle}
            nextWorkoutDayLabel={hero.nextWorkoutDayLabel}
        />
    )
}
