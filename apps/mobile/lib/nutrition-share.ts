import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { calculateFoodItemMacros } from './nutrition-utils'
import type { MealWithFoodItems } from './nutrition-utils'

/**
 * Exportadores de nutrición del alumno — espejo 1:1 de `handleCopyDayDetail`,
 * `handleCopyDayShort` y `downloadNutritionDayPdf` de la web (NutritionShell).
 * Copy verbatim para paridad WhatsApp.
 */

type ExportMeal = MealWithFoodItems & { name: string }
type Goals = { calories: number; protein: number; carbs: number; fats: number }

/** Texto "Copiar detalle" — comidas y alimentos uno por uno (WhatsApp detalle). */
export function buildDayDetailText(opts: {
  planName: string
  date: string
  instructions?: string | null
  meals: ExportMeal[]
  goals: Goals
}): string {
  const { planName, date, instructions, meals, goals } = opts
  const lines: string[] = []
  lines.push(`*Plan Nutricional: ${planName || 'Mi Plan'}*`)
  lines.push(`_Fecha: ${date}_`)
  lines.push('')
  if (typeof instructions === 'string' && instructions.trim().length > 0) {
    lines.push('*Indicaciones del coach:*')
    lines.push(instructions.trim())
    lines.push('')
  }
  for (const meal of meals) {
    lines.push(`*${meal.name.toUpperCase()}*`)
    const items = meal.food_items ?? []
    let mealCalories = 0
    let mealProtein = 0
    let mealCarbs = 0
    let mealFats = 0
    for (const fi of items) {
      const name = fi.foods?.name ?? '—'
      const qty = fi.quantity ?? 0
      const unit = fi.unit ?? 'g'
      const macros = fi.foods ? calculateFoodItemMacros(fi) : null
      const kcalStr = macros ? ` · ${Math.round(macros.calories)} kcal` : ''
      if (macros) {
        mealCalories += macros.calories
        mealProtein += macros.protein
        mealCarbs += macros.carbs
        mealFats += macros.fats
      }
      lines.push(`• ${name} — ${qty}${unit}${kcalStr}`)
    }
    lines.push(
      `Subtotal: ${Math.round(mealCalories)} kcal | P ${Math.round(mealProtein)}g · C ${Math.round(mealCarbs)}g · G ${Math.round(mealFats)}g`
    )
    lines.push('')
  }
  lines.push(`📊 Meta: ${goals.calories} kcal | P ${goals.protein}g · C ${goals.carbs}g · G ${goals.fats}g`)
  return lines.join('\n')
}

/** Texto "Copiar resumen" — un renglón por comida + meta diaria (WhatsApp resumen). */
export function buildDayShortText(opts: {
  planName: string
  date: string
  meals: ExportMeal[]
  goals: Goals
}): string {
  const { planName, date, meals, goals } = opts
  const lines: string[] = []
  lines.push(`*${planName || 'Mi plan'} · ${date}*`)
  lines.push('')
  for (const meal of meals) {
    const items = meal.food_items ?? []
    let kcal = 0
    let p = 0
    let c = 0
    let f = 0
    for (const fi of items) {
      const macros = fi.foods ? calculateFoodItemMacros(fi) : null
      if (macros) {
        kcal += macros.calories
        p += macros.protein
        c += macros.carbs
        f += macros.fats
      }
    }
    lines.push(
      `• ${meal.name} — ${Math.round(kcal)} kcal (P ${Math.round(p)} · C ${Math.round(c)} · G ${Math.round(f)})`
    )
  }
  lines.push('')
  lines.push(`Meta diaria: ${goals.calories} kcal | P ${goals.protein}g · C ${goals.carbs}g · G ${goals.fats}g`)
  return lines.join('\n')
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** PDF del día (comidas + alimentos + metas) vía expo-print + expo-sharing. */
export async function downloadNutritionDayPdf(opts: {
  planName: string
  date: string
  instructions?: string | null
  meals: ExportMeal[]
  goals: Goals
}): Promise<void> {
  const { planName, date, instructions, meals, goals } = opts

  const mealsHtml = meals
    .map((meal) => {
      const items = meal.food_items ?? []
      let kcal = 0
      let p = 0
      let c = 0
      let f = 0
      const rows = items
        .map((fi) => {
          const macros = fi.foods ? calculateFoodItemMacros(fi) : null
          if (macros) {
            kcal += macros.calories
            p += macros.protein
            c += macros.carbs
            f += macros.fats
          }
          const kcalStr = macros ? `${Math.round(macros.calories)} kcal` : ''
          return `<tr><td class="food">${esc(fi.foods?.name ?? '—')}</td><td class="qty">${fi.quantity ?? 0}${esc(fi.unit ?? 'g')}</td><td class="kcal">${kcalStr}</td></tr>`
        })
        .join('')
      return `<div class="meal">
        <div class="meal-head"><span class="meal-name">${esc(meal.name)}</span><span class="meal-sub">${Math.round(kcal)} kcal · P ${Math.round(p)}g · C ${Math.round(c)}g · G ${Math.round(f)}g</span></div>
        <table>${rows || '<tr><td class="food" colspan="3">Sin alimentos especificados</td></tr>'}</table>
      </div>`
    })
    .join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(planName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #111; background: #fff; padding: 20px 28px; }
    .doc-header { padding-bottom: 12px; margin-bottom: 18px; border-bottom: 3px solid #111; }
    .doc-title { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
    .doc-meta { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 5px; }
    .instructions { font-size: 11px; color: #444; background: #f7f7f7; border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; white-space: pre-wrap; }
    .meal { border: 1.5px solid #e0e0e0; border-radius: 8px; overflow: hidden; margin-bottom: 12px; break-inside: avoid; }
    .meal-head { background: #f7f7f7; padding: 9px 14px; border-bottom: 1.5px solid #e0e0e0; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .meal-name { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
    .meal-sub { font-size: 9px; color: #888; }
    table { width: 100%; border-collapse: collapse; }
    td { font-size: 11px; padding: 6px 14px; border-bottom: 1px solid #f0f0f0; }
    tr:last-child td { border-bottom: none; }
    .food { font-weight: 600; }
    .qty { color: #16a34a; font-weight: 700; text-align: right; white-space: nowrap; }
    .kcal { color: #888; text-align: right; white-space: nowrap; }
    .goal { margin-top: 14px; font-size: 11px; font-weight: 800; color: #111; }
    @page { margin: 14mm 16mm; size: A4 portrait; }
  </style></head><body>
    <div class="doc-header">
      <div class="doc-title">${esc(planName || 'Plan nutricional')}</div>
      <div class="doc-meta">Fecha: ${esc(date)}</div>
    </div>
    ${typeof instructions === 'string' && instructions.trim() ? `<div class="instructions">${esc(instructions.trim())}</div>` : ''}
    ${mealsHtml}
    <div class="goal">📊 Meta: ${goals.calories} kcal | P ${goals.protein}g · C ${goals.carbs}g · G ${goals.fats}g</div>
  </body></html>`

  const { uri } = await Print.printToFileAsync({ html })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: planName })
  }
}
