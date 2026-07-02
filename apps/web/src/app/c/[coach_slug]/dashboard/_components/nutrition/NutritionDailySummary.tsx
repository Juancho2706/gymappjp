import Link from 'next/link'
import { Apple, Flame } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getActiveNutritionPlan, getTodayNutritionBundle } from '../../_data/dashboard.queries'
import { getDashboardNutritionDomainEnabled } from '../../_data/heroComplianceBundle'
import { getTodayInSantiago, nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'
import {
  applyMealFoodSwaps,
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  portionPctMapFromMealLogs,
  type NutritionMealMacroSource,
} from '@/lib/nutrition-utils'
import { MacroBar } from './MacroBar'
import { MealCompletionRow } from './MealCompletionRow'
import { getClientBasePath } from '@/lib/client/base-path'

export async function NutritionDailySummary({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    // Master switch del dominio Nutricion (plan §4.8): si el coach lo apago para este alumno,
    // no renderizamos el resumen diario — se oculta limpio (sin esqueleto roto, NN/g pitfall).
    const nutritionEnabled = await getDashboardNutritionDomainEnabled(userId)
    if (!nutritionEnabled) return null

    const base = await getClientBasePath(coachSlug)
    const plan = await getActiveNutritionPlan(userId)
    const { iso: today } = getTodayInSantiago()

    if (!plan) {
        return (
            <Card padding="lg" className="text-center">
                <Apple className="mx-auto h-10 w-10 text-muted" />
                <p className="font-bold text-strong">Sin plan nutricional</p>
                <p className="-mt-2 text-xs text-muted">Pídele un plan a tu coach</p>
            </Card>
        )
    }

    const { dailyLog, meals } = await getTodayNutritionBundle(userId, plan.id, today)
    const mealLogs =
        (dailyLog as {
            nutrition_meal_logs?: { meal_id: string; is_completed: boolean; consumed_quantity: number | null }[]
            nutrition_meal_food_swaps?: {
                meal_id: string
                original_food_id: string
                swapped_food_id: string
                swapped_quantity?: number | null
                swapped_unit?: string | null
            }[]
        } | null)?.nutrition_meal_logs ?? []
    const mealSwaps =
        (dailyLog as {
            nutrition_meal_food_swaps?: {
                meal_id: string
                original_food_id: string
                swapped_food_id: string
                swapped_quantity?: number | null
                swapped_unit?: string | null
            }[]
        } | null)?.nutrition_meal_food_swaps ?? []
    const doneByMeal = new Map(mealLogs.map((m) => [m.meal_id, m.is_completed]))

    type MealRow = NutritionMealMacroSource & { name: string }
    const mealsToday = (meals as MealRow[]).filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, today))
    const totalMeals = mealsToday.length

    const tCal = plan.daily_calories ?? 0
    const tP = plan.protein_g ?? 0
    const tC = plan.carbs_g ?? 0
    const tF = plan.fats_g ?? 0

    const completedIds = new Set(
        mealLogs.filter((m) => m.is_completed).map((m) => m.meal_id)
    )
    const swapByMealFood = new Map<string, (typeof mealSwaps)[number]>()
    for (const s of mealSwaps) {
        swapByMealFood.set(`${s.meal_id}:${s.original_food_id}`, s)
    }
    const mealsWithSwaps = mealsToday.map((meal) => {
        const normalized = normalizeMealForMacros(meal)
        const swapFoodsByOriginal = new Map<
            string,
            {
                swappedFood: {
                    id?: string
                    name: string
                    calories: number
                    protein_g: number
                    carbs_g: number
                    fats_g: number
                    serving_size: number
                    serving_unit: string | null
                }
                swappedQuantity?: number | null
                swappedUnit?: string | null
            }
        >()
        for (const item of normalized.food_items) {
            const originalFoodId = item.foods.id
            if (!originalFoodId) continue
            const swapLog = swapByMealFood.get(`${meal.id}:${originalFoodId}`)
            if (!swapLog) continue
            const option = (item.swap_options ?? []).find((x) => x.food_id === swapLog.swapped_food_id)
            if (!option) continue
            swapFoodsByOriginal.set(originalFoodId, {
                swappedFood: {
                    id: option.food_id,
                    name: option.name,
                    calories: option.calories,
                    protein_g: option.protein_g,
                    carbs_g: option.carbs_g,
                    fats_g: option.fats_g,
                    serving_size: option.serving_size,
                    serving_unit: option.serving_unit ?? null,
                },
                swappedQuantity: swapLog.swapped_quantity ?? null,
                swappedUnit: swapLog.swapped_unit ?? null,
            })
        }
        return applyMealFoodSwaps(normalized, swapFoodsByOriginal)
    })
    const mealsForMacros = mealsWithSwaps
    const portionMap = portionPctMapFromMealLogs(mealLogs)
    const realConsumed = calculateConsumedMacrosWithCompletionFallback(
        mealsForMacros,
        completedIds,
        {
            calories: tCal,
            protein: tP,
            carbs: tC,
            fats: tF,
        },
        portionMap
    )
    const consumedCal = Math.round(realConsumed.calories)
    const consumedP = realConsumed.protein
    const consumedC = realConsumed.carbs
    const consumedF = realConsumed.fats

    return (
        <Card padding="md" className="gap-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-ember-100 text-ember-700">
                        <Apple className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-strong">{plan.name}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-subtle">Hoy</span>
                    </div>
                </div>
                <Link href={`${base}/nutrition`} className="shrink-0 text-[11px] font-bold text-sport-600">
                    Ver todo →
                </Link>
            </div>
            {!dailyLog && totalMeals > 0 ? (
                <p className="text-xs text-muted">¡Registra tu primera comida desde nutrición!</p>
            ) : null}
            {/* Hero kcal (kit alumno-dashboard.jsx:536-542): número grande + "/ target" + badge ember restantes. */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-[27px] font-black leading-none tabular-nums text-strong">
                        {consumedCal.toLocaleString('es-CL')}
                    </span>
                    <span className="text-[13px] text-muted">/ {tCal.toLocaleString('es-CL')} kcal</span>
                </div>
                <Badge tone="ember" icon={<Flame />}>
                    {Math.max(0, tCal - consumedCal).toLocaleString('es-CL')} restantes
                </Badge>
            </div>
            <MacroBar label="Proteína" consumed={consumedP} target={tP} unit="g" colorClass="bg-[color:var(--color-macro-protein)]" delayIndex={0} />
            <MacroBar label="Carbos" consumed={consumedC} target={tC} unit="g" colorClass="bg-[color:var(--color-macro-carbs)]" delayIndex={1} />
            <MacroBar label="Grasas" consumed={consumedF} target={tF} unit="g" colorClass="bg-[color:var(--color-macro-fats)]" delayIndex={2} />
            <div className="space-y-2">
                {mealsToday.map((m) => (
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
                href={`${base}/nutrition`}
                className="animate-pulse-cta block rounded-control bg-ember-100 px-4 py-2.5 text-center text-xs font-bold text-ember-700 ring-1 ring-ember-500/40 transition-colors hover:bg-ember-200"
            >
                Ver plan completo con macros →
            </Link>
        </Card>
    )
}
