import { Card } from '@/components/ui/card'
import {
    getActiveProgram,
    getClientWorkoutPlans,
    getRecentWorkoutLogs,
} from '../../_data/dashboard.queries'
import { getDashboardNutritionDomainEnabled, getHeroComplianceBundle } from '../../_data/heroComplianceBundle'
import { getSantiagoIsoYmdForUtcInstant, getTodayInSantiago } from '@/lib/date-utils'
import {
    programWeekIndex1Based,
    resolveEffectiveWeekVariant,
    workoutPlanMatchesVariant,
} from '@/lib/workout/programWeekVariant'
import { ComplianceRing } from '../compliance/ComplianceRing'
import { MomentumWeekStrip, type MomentumDay } from './MomentumWeekStrip'
import { SectionTitle } from '../shared/SectionTitle'

const LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * "Momentum" (Ola 4 del diseño): FUSIÓN de la tira semanal + los 3 anillos de cumplimiento en
 * UNA sola card (antes eran WeekCalendar + ComplianceScoresCard separados). Estructura 1:1 con el
 * jsx: week strip arriba, divisor, anillos (Entrenos / Nutrición / Check-ins) abajo.
 *
 * Mapeo de data real: tira semanal computada igual que `WeekCalendar` (programa + planes + logs).
 * Anillos = `scores` de `getHeroComplianceBundle` (workoutScore, nutritionEngagementScore,
 * checkInScore). El diseño mostraba sublíneas mock ("12/14 días", "3 de 4") → omitidas para no
 * inventar conteos; el % real con count-up vive dentro del anillo (paridad de la métrica).
 */
export async function MomentumCard({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const [program, allPlans, logs, { scores }, nutritionEnabled] = await Promise.all([
        getActiveProgram(userId),
        getClientWorkoutPlans(userId),
        getRecentWorkoutLogs(userId),
        getHeroComplianceBundle(userId, coachSlug),
        getDashboardNutritionDomainEnabled(userId),
    ])

    const activePlans = allPlans.filter((p) => !p.program_id || p.program_id === program?.id)
    const { date: userLocalDate, iso: today } = getTodayInSantiago()
    const abMode = !!program?.ab_mode
    const weekIdx = program ? programWeekIndex1Based(program, userLocalDate) : null
    const activeVariant = resolveEffectiveWeekVariant(
        program,
        program ? activePlans.filter((p) => p.program_id === program.id) : [],
        weekIdx,
        userLocalDate
    )

    const curr = userLocalDate
    const firstDay = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1)
    const days: MomentumDay[] = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(curr)
        d.setDate(firstDay + i)
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const dDow = d.getDay() === 0 ? 7 : d.getDay()
        const assignedPlan = activePlans.find((p) => p.assigned_date === dStr)
        const programPlan = program
            ? activePlans.find(
                  (p) =>
                      p.program_id === program.id &&
                      p.day_of_week === dDow &&
                      workoutPlanMatchesVariant(p, activeVariant, abMode)
              )
            : undefined
        const dayPlan = assignedPlan ?? programPlan ?? null
        const isFutureDay = dStr > today
        const isCompleted =
            !!dayPlan &&
            !isFutureDay &&
            logs.some(
                (l) => l.workout_blocks?.plan_id === dayPlan.id && getSantiagoIsoYmdForUtcInstant(l.logged_at) === dStr
            )
        return {
            label: LABELS[i],
            isToday: dStr === today,
            hasWorkout: !!dayPlan,
            isCompleted,
        }
    })

    return (
        <section>
            <SectionTitle accent="var(--sport-500)">Momentum</SectionTitle>
            <Card padding="md">
                <MomentumWeekStrip days={days} />
                <div className="my-4 h-px bg-[var(--border-subtle)]" />
                <div className={`grid items-start gap-2 ${nutritionEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <ComplianceRing value={scores.workoutScore} label="Entrenos" color="sport" />
                    {nutritionEnabled ? (
                        <ComplianceRing
                            value={scores.nutritionEngagementScore}
                            label="Nutrición"
                            color="ember"
                            empty={!scores.nutritionHasLogs}
                        />
                    ) : null}
                    <ComplianceRing value={scores.checkInScore} label="Check-ins" color="success" />
                </div>
            </Card>
        </section>
    )
}
