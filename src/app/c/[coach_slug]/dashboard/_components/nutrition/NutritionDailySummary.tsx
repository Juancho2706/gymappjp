import Link from 'next/link'
import { Apple } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { getActiveNutritionPlan, getTodayNutritionBundle } from '../../_data/dashboard.queries'
import { getTodayInSantiago } from '@/lib/date-utils'
import { calculateConsumedMacros, normalizeMealForMacros } from '@/lib/nutrition-utils'
import { MacroBar } from './MacroBar'
import { MealCompletionRow } from './MealCompletionRow'

export async function NutritionDailySummary({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const plan = await getActiveNutritionPlan(userId)
    const { iso: today } = getTodayInSantiago()

    if (!plan) {
        return (
            <GlassCard className="p-5 text-center">
                <Apple className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
                <p className="font-semibold text-foreground">Sin plan nutricional</p>
                <p className="mt-1 text-xs text-muted-foreground">Pídele un plan a tu coach</p>
            </GlassCard>
        )
    }

    const { dailyLog, meals } = await getTodayNutritionBundle(userId, plan.id, today)
    const mealLogs = (dailyLog as { nutrition_meal_logs?: { meal_id: string; is_completed: boolean }[] } | null)?.nutrition_meal_logs ?? []
    const doneByMeal = new Map(mealLogs.map((m) => [m.meal_id, m.is_completed]))

    const totalMeals = meals.length

    const tCal = plan.daily_calories ?? 0
    const tP = plan.protein_g ?? 0
    const tC = plan.carbs_g ?? 0
    const tF = plan.fats_g ?? 0

    const completedIds = new Set(
        mealLogs.filter((m) => m.is_completed).map((m) => m.meal_id)
    )
    const mealsForMacros = meals.map((m) => normalizeMealForMacros(m))
    const realConsumed = calculateConsumedMacros(mealsForMacros, completedIds)
    const consumedCal = Math.round(realConsumed.calories)
    const consumedP = realConsumed.protein
    const consumedC = realConsumed.carbs
    const consumedF = realConsumed.fats

    return (
        <GlassCard className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Apple className="h-5 w-5 shrink-0 text-emerald-500" />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{plan.name}</p>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Hoy</span>
                    </div>
                </div>
                <Link href={`/c/${coachSlug}/nutrition`} className="shrink-0 text-[10px] font-semibold text-[color:var(--theme-primary)]">
                    Ver todo →
                </Link>
            </div>
            {!dailyLog && totalMeals > 0 ? (
                <p className="text-xs text-muted-foreground">¡Registra tu primera comida desde nutrición!</p>
            ) : null}
            <div>
                <div className="mb-1 flex justify-between text-xs font-semibold">
                    <span className="text-muted-foreground">Calorías</span>
                    <span className="tabular-nums text-foreground">
                        {consumedCal} / {tCal} kcal
                    </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{
                            width: `${tCal > 0 ? Math.min(100, (consumedCal / tCal) * 100) : 0}%`,
                            backgroundColor: 'var(--theme-primary)',
                        }}
                    />
                </div>
            </div>
            <MacroBar label="Proteína" consumed={consumedP} target={tP} unit="g" colorClass="bg-rose-500" delayIndex={0} />
            <MacroBar label="Carbos" consumed={consumedC} target={tC} unit="g" colorClass="bg-amber-500" delayIndex={1} />
            <MacroBar label="Grasas" consumed={consumedF} target={tF} unit="g" colorClass="bg-emerald-500" delayIndex={2} />
            <div className="space-y-2">
                {meals.map((m) => (
                    <MealCompletionRow
                        key={m.id}
                        mealId={m.id}
                        name={m.name}
                        completed={!!doneByMeal.get(m.id)}
                        clientId={userId}
                        planId={plan.id}
                        dailyLogId={dailyLog?.id}
                        coachSlug={coachSlug}
                    />
                ))}
            </div>
            <Link
                href={`/c/${coachSlug}/nutrition`}
                className="animate-pulse-cta block rounded-xl bg-emerald-500/15 px-4 py-2.5 text-center text-xs font-bold text-emerald-700 ring-1 ring-emerald-500/50 transition-colors hover:bg-emerald-500/25 dark:text-emerald-300"
            >
                Ver plan completo con macros →
            </Link>
        </GlassCard>
    )
}
