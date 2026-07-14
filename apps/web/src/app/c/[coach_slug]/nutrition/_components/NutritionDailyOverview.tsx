import Link from 'next/link'
import { ArrowRight, CheckCircle2, Plus, Target, Utensils } from 'lucide-react'
import {
  calculateIntakeEntriesTotals,
  combineNutritionMacros,
  nutritionTargetPercent,
} from '@eva/nutrition-engine'
import {
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  portionPctMapFromMealLogs,
  type NutritionMealMacroSource,
} from '@/lib/nutrition-utils'
import { nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'
import type { IntakeEntryWithFood } from '@/services/nutrition-intake.service'

interface Props {
  plan: {
    id: string
    daily_calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fats_g?: number | null
    nutrition_meals?: Array<NutritionMealMacroSource & {
      name: string
      order_index: number
    }>
  }
  todayLog: Record<string, unknown> | null
  intakeEntries: IntakeEntryWithFood[]
  today: string
  addHref: string
}

type MealLog = {
  meal_id: string
  is_completed: boolean
  consumed_quantity: number | null
}

function MacroStat({
  label,
  consumed,
  target,
}: {
  label: string
  consumed: number
  target: number
}) {
  const percent = nutritionTargetPercent(consumed, target)
  return (
    <div className="min-w-0 rounded-control bg-background/70 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      <p className="mt-1 font-mono text-sm font-black tabular-nums text-foreground">
        {Math.round(consumed)}
        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">/ {Math.round(target)}g</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-ember-500 transition-[width]"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function NutritionDailyOverview({ plan, todayLog, intakeEntries, today, addHref }: Props) {
  const meals = [...(plan.nutrition_meals ?? [])]
    .filter((meal) => nutritionMealAppliesOnIsoYmdInSantiago(meal, today))
    .sort((a, b) => a.order_index - b.order_index)
  const logs = ((todayLog?.nutrition_meal_logs as MealLog[] | undefined) ?? [])
  const completed = new Set(logs.filter((row) => row.is_completed).map((row) => row.meal_id))
  const portions = portionPctMapFromMealLogs(logs)

  const targets = {
    calories: Number(plan.daily_calories) || 0,
    protein: Number(plan.protein_g) || 0,
    carbs: Number(plan.carbs_g) || 0,
    fats: Number(plan.fats_g) || 0,
  }

  const prescribedConsumed = calculateConsumedMacrosWithCompletionFallback(
    meals.map(normalizeMealForMacros),
    completed,
    targets,
    portions,
  )
  const realAdditional = calculateIntakeEntriesTotals(intakeEntries)
  const total = combineNutritionMacros(prescribedConsumed, realAdditional)
  const caloriesPct = nutritionTargetPercent(total.calories, targets.calories)
  const nextMeal = meals.find((meal) => !completed.has(meal.id)) ?? null
  const completedCount = meals.filter((meal) => completed.has(meal.id)).length

  return (
    <section aria-label="Resumen nutricional de hoy" className="overflow-hidden rounded-card border border-ember-500/20 bg-card shadow-sm">
      <div className="bg-gradient-to-br from-ember-500/[0.16] via-card to-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-ember-700 dark:text-ember-300">
              <Target className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-[0.12em]">Consumido vs objetivo</span>
            </div>
            <p className="mt-2 font-mono text-3xl font-black tracking-tight tabular-nums text-foreground">
              {Math.round(total.calories).toLocaleString('es-CL')}
              <span className="ml-1.5 text-sm font-bold text-muted-foreground">
                / {Math.round(targets.calories).toLocaleString('es-CL')} kcal
              </span>
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {Math.round(prescribedConsumed.calories)} kcal del plan + {Math.round(realAdditional.calories)} kcal registradas
            </p>
          </div>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-ember-500/20 bg-card font-mono text-sm font-black tabular-nums text-ember-700 dark:text-ember-300">
            {caloriesPct}%
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MacroStat label="Proteína" consumed={total.protein} target={targets.protein} />
          <MacroStat label="Carbos" consumed={total.carbs} target={targets.carbs} />
          <MacroStat label="Grasas" consumed={total.fats} target={targets.fats} />
        </div>
      </div>

      <div className="grid gap-3 border-t border-border/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-ember-100 text-ember-700 dark:bg-ember-500/15 dark:text-ember-300">
            {nextMeal ? <Utensils className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {nextMeal ? 'Próxima comida' : 'Plan del día'}
            </p>
            <p className="truncate text-sm font-extrabold text-foreground">
              {nextMeal ? nextMeal.name : 'Todas las comidas completadas'}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
              {completedCount} de {meals.length} comidas marcadas
            </p>
          </div>
        </div>

        <Link
          href={addHref}
          className="flex h-11 items-center justify-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-extrabold text-white transition-transform hover:bg-ember-600 active:scale-[.98]"
        >
          <Plus className="h-4 w-4" />
          Registrar alimento
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}
