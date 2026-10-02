import { getDashboardNutritionDomainEnabled, getHeroComplianceBundle } from '../_data/heroComplianceBundle'
import { HeroSection } from './hero/HeroSection'

/** Bloque principal del hero (datos vía `getHeroComplianceBundle`; anillos en `ComplianceScoresCard`). */
export async function HeroAndComplianceGroup({
    userId,
    coachSlug,
    coachName = null,
}: {
    userId: string
    coachSlug: string
    /** Marca que el alumno ve (coach o team): la nombra la tarjeta de «sin programa». */
    coachName?: string | null
}) {
    // Master switch del dominio Nutricion: el RestDayCard linkea a /nutrition ("Ver nutrición →") —
    // se oculta ese link cuando el coach apago la nutricion para este alumno. React.cache dedupe la
    // lectura del dominio con el sidebar + tarjeta de compliance (1 query por request).
    const [{ hero, cycle }, nutritionEnabled] = await Promise.all([
        getHeroComplianceBundle(userId, coachSlug),
        getDashboardNutritionDomainEnabled(userId),
    ])
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
            cycle={cycle}
            nutritionEnabled={nutritionEnabled}
            coachName={coachName}
        />
    )
}
