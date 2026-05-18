import { calculateFoodItemMacros, type FoodItemForMacros } from '@/lib/nutrition-utils'

export type PlainExportMeal = {
  name: string
  food_items: FoodItemForMacros[]
}

/**
 * Texto plano multilínea del día (PDF / impresión). Sin markdown de WhatsApp.
 */
export function buildNutritionDayPlainTextLines(params: {
  planName: string
  date: string
  instructions?: string | null
  meals: PlainExportMeal[]
  goals: { calories: number; protein: number; carbs: number; fats: number }
}): string[] {
  const lines: string[] = []
  const title = params.planName.trim() || 'Plan nutricional'
  lines.push(`${title}`)
  lines.push(`Fecha: ${params.date}`)
  lines.push('')

  if (typeof params.instructions === 'string' && params.instructions.trim().length > 0) {
    lines.push('Indicaciones del coach')
    lines.push(params.instructions.trim())
    lines.push('')
  }

  for (const meal of params.meals) {
    lines.push(meal.name.toUpperCase())
    const items = meal.food_items ?? []
    let mealCalories = 0
    let mealProtein = 0
    let mealCarbs = 0
    let mealFats = 0
    for (const fi of items) {
      const name = fi.foods?.name ?? '—'
      const qty = fi.quantity ?? 0
      const unit = fi.unit ?? 'g'
      const macros = fi.foods
        ? calculateFoodItemMacros({
            quantity: qty,
            unit,
            foods: fi.foods,
          })
        : null
      const kcalStr = macros ? ` · ${Math.round(macros.calories)} kcal` : ''
      if (macros) {
        mealCalories += macros.calories
        mealProtein += macros.protein
        mealCarbs += macros.carbs
        mealFats += macros.fats
      }
      lines.push(`  • ${name} — ${qty}${unit}${kcalStr}`)
    }
    lines.push(
      `  Subtotal: ${Math.round(mealCalories)} kcal | P ${Math.round(mealProtein)}g · C ${Math.round(mealCarbs)}g · G ${Math.round(mealFats)}g`
    )
    lines.push('')
  }

  lines.push(
    `Meta diaria: ${params.goals.calories} kcal | P ${params.goals.protein}g · C ${params.goals.carbs}g · G ${params.goals.fats}g`
  )
  lines.push('')
  lines.push('Generado desde EVA Fitness — uso personal del plan asignado por tu coach.')

  return lines
}
