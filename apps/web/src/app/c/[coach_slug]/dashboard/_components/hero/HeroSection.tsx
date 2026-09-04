import { WorkoutHeroCard, type HeroBlock } from './WorkoutHeroCard'
import { RestDayCard } from './RestDayCard'
import type { HeroCycleView } from '../../_data/heroComplianceBundle'

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
    /**
     * Cursor del programa ya etiquetado (`getHeroComplianceBundle().cycle`, spec
     * `ciclo-real-y-por-lado` W2.11). El hero NO re-deriva «no empezó» ni «hoy toca»: los lee de acá.
     * `null` sólo en tests/legacy sin bundle ⇒ comportamiento weekly de siempre.
     */
    cycle?: HeroCycleView | null
    /** Master switch del dominio Nutricion: oculta el link "Ver nutrición →" del RestDayCard. */
    nutritionEnabled?: boolean
}

/**
 * Copys del hero según el cursor (R30, copys canónicos del SPEC):
 * · no empezó (flexible sin fecha) → «Tu programa está listo · Día 1 de 3» + «Empezar hoy»;
 * · ciclo `todo` → «Hoy toca · Día 2 de 3»; `in_progress` → «En progreso · Día 2 de 3»;
 *   `done` → «Día 2 hecho · Próximo: Día 3 de 3»;
 * · weekly → «Hoy entrenas» (idéntico a hoy).
 */
function heroEyebrow(cycle: HeroCycleView | null | undefined): string | undefined {
    if (!cycle) return undefined
    if (cycle.programState === 'not_started') {
        return cycle.mode === 'cycle' && cycle.todayLabel ? `Tu programa está listo · ${cycle.todayLabel}` : 'Tu programa está listo'
    }
    if (cycle.mode !== 'cycle' || !cycle.todayLabel) return undefined
    if (cycle.todayState === 'in_progress') return `En progreso · ${cycle.todayLabel}`
    if (cycle.todayState === 'done') {
        const doneLabel = cycle.todayCycleIndex != null ? `Día ${cycle.todayCycleIndex} hecho` : `${cycle.todayLabel} hecho`
        return cycle.nextLabel ? `${doneLabel} · Próximo: ${cycle.nextLabel}` : doneLabel
    }
    return `Hoy toca · ${cycle.todayLabel}`
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
    cycle = null,
    nutritionEnabled = true,
}: HeroSectionProps) {
    if (hasWorkout && planId && planTitle) {
        // «Empezar hoy» sólo cuando el motor dice `not_started` (flexible sin fecha, R30) y hay
        // programa al que ponerle fecha; la RPC es la única que escribe (R14/R23).
        const startProgram =
            cycle?.programState === 'not_started' && cycle.programId ? { programId: cycle.programId } : null
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
                eyebrow={heroEyebrow(cycle)}
                startProgram={startProgram}
                nextLabel={cycle?.mode === 'cycle' && cycle.todayState === 'done' ? cycle.nextLabel : null}
            />
        )
    }
    // En `cycle` el cursor siempre resuelve un día mientras haya planes (M2: sin «Día de descanso»
    // forzado); acá sólo se cae con programa vacío o sin programa — mismo RestDayCard de siempre.
    return <RestDayCard coachSlug={coachSlug} nextWorkoutTitle={nextWorkoutTitle} nextWorkoutDayLabel={nextWorkoutDayLabel} showNutritionLink={nutritionEnabled} />
}
