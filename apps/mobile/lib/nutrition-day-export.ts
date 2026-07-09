import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { calculateFoodItemMacros, type FoodItemForMacros } from './nutrition-utils'
import { canUseBranding, type SubscriptionTier } from './coach-tiers'

/**
 * Export del día de nutrición del alumno (E4-16). Tres salidas, espejo exacto de
 * la web (`NutritionShell.handleCopyDayDetail` / `handleCopyDayShort` /
 * `downloadNutritionDayPdf` + `nutrition-pdf-brand`):
 *   (a) PDF branded vía `expo-print` — layout espejo del PDF web (jsPDF) con el
 *       logo/color del coach; misma paleta, mismos chips de macros, mismo footer
 *       legal. Rama free / sin marca ⇒ EVA (paridad `resolvePdfBrand`).
 *   (b) "Copiar detalle" — texto con macros por comida + subtotales (clipboard).
 *   (c) "Resumen WhatsApp" — texto corto con macros por comida (Share nativo).
 *
 * Macros SIEMPRE vía `calculateFoodItemMacros` del motor único `@eva/nutrition-engine`
 * (cero drift). Módulo PURO salvo `exportNutritionDayPdf` (efecto: print + share).
 */

// ── Contrato de datos del día (lo que expone el shell: `normalizedMeals`, `goals`) ──

export interface ExportMeal {
  name: string
  food_items: FoodItemForMacros[]
}

export interface ExportGoals {
  calories: number
  protein: number
  carbs: number
  fats: number
}

export interface NutritionDayExportParams {
  planName: string
  /** ISO `YYYY-MM-DD` (PDF) — el texto usa `dateLabel`. */
  date: string
  /** Etiqueta legible para el texto ("Hoy" / ISO). Default = `date`. */
  dateLabel?: string
  instructions?: string | null
  meals: ExportMeal[]
  goals: ExportGoals
}

// ── Marca del PDF (espejo de `@/lib/nutrition-pdf-brand`) ─────────────────────

type Rgb = [number, number, number]

const EVA_ACCENT: Rgb = [16, 185, 129] // emerald-500
const EVA_HEADER_BG: Rgb = [15, 23, 42] // slate-900

/** Fuente de marca del tenant (lo que el shell lee de `useTheme().branding`). */
export interface NutritionExportBrandSource {
  displayName?: string | null
  primaryColor?: string | null
  logoUrl?: string | null
  subscriptionTier?: string | null
}

export interface NutritionExportBrand {
  brandName: string
  primaryColor: string
  logoUrl: string | null
  poweredByEva: boolean
}

export const EVA_EXPORT_BRAND: NutritionExportBrand = {
  brandName: 'EVA FITNESS',
  primaryColor: '#10B981',
  logoUrl: null,
  poweredByEva: true,
}

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function darken(rgb: Rgb, factor: number): Rgb {
  return [Math.round(rgb[0] * factor), Math.round(rgb[1] * factor), Math.round(rgb[2] * factor)]
}

/**
 * Marca del PDF a partir del branding del coach (mismo criterio que la web:
 * free tier / sin nombre / sin color válido ⇒ EVA exacto — nunca un PDF "a medias").
 */
export function resolveNutritionExportBrand(source: NutritionExportBrandSource | null | undefined): NutritionExportBrand {
  if (!source) return EVA_EXPORT_BRAND
  const tier = (source.subscriptionTier ?? 'free') as SubscriptionTier
  if (!canUseBranding(tier)) return EVA_EXPORT_BRAND
  const name = source.displayName?.trim()
  if (!name) return EVA_EXPORT_BRAND
  const color = source.primaryColor && hexToRgb(source.primaryColor) ? source.primaryColor : EVA_EXPORT_BRAND.primaryColor
  return { brandName: name, primaryColor: color, logoUrl: source.logoUrl ?? null, poweredByEva: false }
}

interface Palette {
  accent: Rgb
  headerBg: Rgb
  brandName: string
  generatedWithLabel: string
  logoUrl: string | null
}

function derivePalette(brand: NutritionExportBrand): Palette {
  if (brand.poweredByEva) {
    return {
      accent: EVA_ACCENT,
      headerBg: EVA_HEADER_BG,
      brandName: EVA_EXPORT_BRAND.brandName,
      generatedWithLabel: 'Generado con EVA Fitness',
      logoUrl: null,
    }
  }
  const accent = hexToRgb(brand.primaryColor) ?? EVA_ACCENT
  const headerBg = luminance(accent) > 0.35 ? darken(accent, 0.28) : accent
  return {
    accent,
    headerBg,
    brandName: brand.brandName,
    generatedWithLabel: `Generado con ${brand.brandName}`,
    logoUrl: brand.logoUrl,
  }
}

// ── Macros ─────────────────────────────────────────────────────────────────

interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fats: number
}

function foodMacros(fi: FoodItemForMacros): MacroTotals | null {
  if (!fi.foods) return null
  return calculateFoodItemMacros(fi)
}

function sumMeal(meal: ExportMeal): MacroTotals {
  const t: MacroTotals = { calories: 0, protein: 0, carbs: 0, fats: 0 }
  for (const fi of meal.food_items ?? []) {
    const m = foodMacros(fi)
    if (!m) continue
    t.calories += m.calories
    t.protein += m.protein
    t.carbs += m.carbs
    t.fats += m.fats
  }
  return t
}

const r = Math.round

// ── (b) Copiar detalle — espejo de `handleCopyDayDetail` ─────────────────────

export function buildDayDetailText(params: NutritionDayExportParams): string {
  const { planName, meals, goals } = params
  const label = params.dateLabel ?? params.date
  const lines: string[] = []
  lines.push(`*Plan Nutricional: ${planName || 'Mi Plan'}*`)
  lines.push(`_Fecha: ${label}_`)
  lines.push('')
  const instr = params.instructions?.trim()
  if (instr) {
    lines.push('*Indicaciones del coach:*')
    lines.push(instr)
    lines.push('')
  }
  for (const meal of meals) {
    lines.push(`*${meal.name.toUpperCase()}*`)
    const sub: MacroTotals = { calories: 0, protein: 0, carbs: 0, fats: 0 }
    for (const fi of meal.food_items ?? []) {
      const name = fi.foods?.name ?? '—'
      const qty = fi.quantity ?? 0
      const unit = fi.unit ?? 'g'
      const m = foodMacros(fi)
      const kcalStr = m ? ` · ${r(m.calories)} kcal` : ''
      if (m) {
        sub.calories += m.calories
        sub.protein += m.protein
        sub.carbs += m.carbs
        sub.fats += m.fats
      }
      lines.push(`• ${name} — ${qty}${unit}${kcalStr}`)
    }
    lines.push(`Subtotal: ${r(sub.calories)} kcal | P ${r(sub.protein)}g · C ${r(sub.carbs)}g · G ${r(sub.fats)}g`)
    lines.push('')
  }
  lines.push(`📊 Meta: ${goals.calories} kcal | P ${goals.protein}g · C ${goals.carbs}g · G ${goals.fats}g`)
  return lines.join('\n')
}

// ── (c) Resumen WhatsApp — espejo de `handleCopyDayShort` ────────────────────

export function buildDayShortText(params: NutritionDayExportParams): string {
  const { planName, meals, goals } = params
  const label = params.dateLabel ?? params.date
  const lines: string[] = []
  lines.push(`*${planName || 'Mi plan'} · ${label}*`)
  lines.push('')
  for (const meal of meals) {
    const s = sumMeal(meal)
    lines.push(`• ${meal.name} — ${r(s.calories)} kcal (P ${r(s.protein)} · C ${r(s.carbs)} · G ${r(s.fats)})`)
  }
  lines.push('')
  lines.push(`Meta diaria: ${goals.calories} kcal | P ${goals.protein}g · C ${goals.carbs}g · G ${goals.fats}g`)
  return lines.join('\n')
}

// ── (a) PDF branded (expo-print) — layout espejo del PDF web ─────────────────

const MACRO_COLORS = {
  kcal: [234, 88, 12] as Rgb, // orange-600
  protein: [37, 99, 235] as Rgb, // blue-600
  carbs: [5, 150, 105] as Rgb, // emerald-600
  fats: [147, 51, 234] as Rgb, // purple-600
}

function css(c: Rgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/** Fondo del chip = 8% del color hacia blanco (idéntico a `macroChip` del PDF web). */
function chipBg(c: Rgb): string {
  return css([
    r(255 - (255 - c[0]) * 0.08),
    r(255 - (255 - c[1]) * 0.08),
    r(255 - (255 - c[2]) * 0.08),
  ] as Rgb)
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  if (!y || !m || !d) return iso
  return `${d} ${months[m - 1]} ${y}`
}

function macroChipHtml(label: string, value: string, color: Rgb): string {
  return `<div class="chip" style="background:${chipBg(color)};border-color:${css(color)}">
    <div class="chip-label" style="color:${css(color)}">${esc(label)}</div>
    <div class="chip-value">${esc(value)}</div>
  </div>`
}

function mealHtml(meal: ExportMeal, accent: Rgb): string {
  const rows = (meal.food_items ?? [])
    .map((fi, i) => {
      const m = foodMacros(fi)
      const name = esc(fi.foods?.name ?? '—')
      const qty = `${fi.quantity ?? 0}${fi.unit ?? 'g'}`
      const alt = i % 2 === 1 ? ' class="alt"' : ''
      return `<tr${alt}>
        <td class="fname">${name}</td>
        <td class="fqty">${esc(qty)}</td>
        <td class="num">${m ? r(m.calories) : '—'}</td>
        <td class="num">${m ? r(m.protein) : '—'}</td>
        <td class="num">${m ? r(m.carbs) : '—'}</td>
        <td class="num">${m ? r(m.fats) : '—'}</td>
      </tr>`
    })
    .join('')
  const s = sumMeal(meal)
  return `<div class="meal">
    <div class="meal-hdr">
      <div class="meal-accent" style="background:${css(accent)}"></div>
      <div class="meal-name">${esc(meal.name.toUpperCase())}</div>
      <div class="meal-kcal">${r(s.calories)} kcal</div>
    </div>
    <table class="foods">
      <thead><tr>
        <th class="fname">ALIMENTO</th><th class="fqty">CANT.</th>
        <th class="num">KCAL</th><th class="num">P</th><th class="num">C</th><th class="num">G</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td class="fname sub">Subtotal</td><td></td>
        <td class="num sub">${r(s.calories)}</td>
        <td class="num sub">${r(s.protein)}g</td>
        <td class="num sub">${r(s.carbs)}g</td>
        <td class="num sub">${r(s.fats)}g</td>
      </tr></tfoot>
    </table>
  </div>`
}

function buildDayPdfHtml(params: NutritionDayExportParams, brand: NutritionExportBrand): string {
  const p = derivePalette(brand)
  const { goals } = params
  const totals = params.meals.reduce<MacroTotals>(
    (acc, meal) => {
      const s = sumMeal(meal)
      acc.calories += s.calories
      acc.protein += s.protein
      acc.carbs += s.carbs
      acc.fats += s.fats
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )

  const instr = params.instructions?.trim()
  const totalsCols: [string, number, number, Rgb][] = [
    ['KCAL', r(totals.calories), goals.calories, MACRO_COLORS.kcal],
    ['PROTEÍNA (G)', r(totals.protein), goals.protein, MACRO_COLORS.protein],
    ['CARBOS (G)', r(totals.carbs), goals.carbs, MACRO_COLORS.carbs],
    ['GRASAS (G)', r(totals.fats), goals.fats, MACRO_COLORS.fats],
  ]

  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: rgb(15,23,42); background: #fff; }
    .hdr { position: relative; background: ${css(p.headerBg)}; color: #fff; padding: 16px 18px 14px; }
    .hdr-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: ${css(p.accent)}; }
    .hdr-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
    .hdr-logo { height: 26px; max-width: 120px; object-fit: contain; margin-bottom: 6px; }
    .brand-eyebrow { font-size: 8px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: ${css(p.accent)}; }
    .plan-name { font-size: 17px; font-weight: 900; letter-spacing: 0.02em; text-transform: uppercase; margin-top: 4px; line-height: 1.15; }
    .hdr-date { font-size: 10px; color: rgb(148,163,184); white-space: nowrap; padding-top: 2px; }
    .body { padding: 16px 18px 0; }
    .chips { display: flex; gap: 6px; margin-bottom: 14px; }
    .chip { flex: 1; border: 1px solid; border-radius: 5px; padding: 5px 7px; }
    .chip-label { font-size: 6.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
    .chip-value { font-size: 13px; font-weight: 800; color: rgb(15,23,42); margin-top: 2px; }
    .instr { margin-bottom: 14px; }
    .instr-hd { background: rgb(241,245,249); font-size: 8px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: rgb(71,85,105); padding: 4px 6px; }
    .instr-body { font-size: 10px; color: rgb(71,85,105); line-height: 1.45; padding: 5px 6px 0; }
    .meal { margin-bottom: 12px; break-inside: avoid; }
    .meal-hdr { position: relative; display: flex; align-items: center; background: rgb(241,245,249); padding: 6px 8px 6px 12px; }
    .meal-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
    .meal-name { flex: 1; font-size: 10px; font-weight: 800; letter-spacing: 0.04em; color: rgb(15,23,42); }
    .meal-kcal { font-size: 9px; font-weight: 700; color: rgb(71,85,105); }
    table.foods { width: 100%; border-collapse: collapse; }
    table.foods th { font-size: 6.5px; font-weight: 800; letter-spacing: 0.04em; color: rgb(148,163,184); text-align: left; padding: 4px 4px 3px; border-bottom: 0.5px solid rgb(203,213,225); }
    table.foods td { font-size: 9px; color: rgb(15,23,42); padding: 3px 4px; }
    table.foods tr.alt td { background: rgb(248,250,252); }
    .fqty { color: rgb(71,85,105); }
    th.num, td.num { text-align: right; width: 9%; color: rgb(71,85,105); }
    th.fqty, td.fqty { width: 14%; }
    table.foods tfoot td { border-top: 0.5px solid rgb(203,213,225); font-size: 8.5px; padding-top: 4px; }
    .sub { font-weight: 800; color: rgb(15,23,42); }
    .totals { background: ${css(p.headerBg)}; border-top: 2px solid ${css(p.accent)}; padding: 10px 12px 12px; margin-top: 6px; break-inside: avoid; }
    .totals-hd { font-size: 8px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: ${css(p.accent)}; margin-bottom: 8px; }
    .totals-row { display: flex; gap: 8px; }
    .totals-col { flex: 1; }
    .tc-label { font-size: 6px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
    .tc-value { font-size: 15px; font-weight: 800; color: #fff; margin-top: 2px; }
    .tc-goal { font-size: 7.5px; color: rgb(148,163,184); margin-top: 1px; }
    .footer { margin-top: 14px; padding: 8px 0 16px; border-top: 0.5px solid rgb(203,213,225); display: flex; justify-content: space-between; gap: 10px; }
    .footer span { font-size: 7px; color: rgb(148,163,184); }
    @page { margin: 0 0 12mm; size: A4 portrait; }
  `

  const logoHtml = p.logoUrl ? `<img class="hdr-logo" src="${esc(p.logoUrl)}" />` : ''
  const chips = [
    macroChipHtml('KCAL META', String(goals.calories), MACRO_COLORS.kcal),
    macroChipHtml('PROTEÍNA', `${goals.protein}g`, MACRO_COLORS.protein),
    macroChipHtml('CARBOHIDRATOS', `${goals.carbs}g`, MACRO_COLORS.carbs),
    macroChipHtml('GRASAS', `${goals.fats}g`, MACRO_COLORS.fats),
  ].join('')

  const instrHtml = instr
    ? `<div class="instr"><div class="instr-hd">Indicaciones del coach</div><div class="instr-body">${esc(instr)}</div></div>`
    : ''

  const mealsHtml = params.meals.map((m) => mealHtml(m, p.accent)).join('')

  const totalsHtml = `<div class="totals">
    <div class="totals-hd">Resumen del día</div>
    <div class="totals-row">
      ${totalsCols
        .map(
          ([label, consumed, goal, color]) => `<div class="totals-col">
        <div class="tc-label" style="color:${css(color)}">${esc(label)}</div>
        <div class="tc-value">${consumed}</div>
        <div class="tc-goal">meta: ${goal}</div>
      </div>`
        )
        .join('')}
    </div>
  </div>`

  const now = new Date().toLocaleString('es-CL')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(params.planName)}</title><style>${styles}</style></head><body>
    <div class="hdr">
      <div class="hdr-accent"></div>
      <div class="hdr-row">
        <div>
          ${logoHtml}
          <div class="brand-eyebrow">${esc(p.brandName.toUpperCase())}</div>
          <div class="plan-name">${esc((params.planName || 'Plan nutricional').toUpperCase())}</div>
        </div>
        <div class="hdr-date">${esc(formatDate(params.date))}</div>
      </div>
    </div>
    <div class="body">
      <div class="chips">${chips}</div>
      ${instrHtml}
      ${mealsHtml}
      ${totalsHtml}
      <div class="footer">
        <span>${esc(p.generatedWithLabel)}. Uso personal. No reemplaza valoración clínica, dietética ni médica.</span>
        <span>${esc(now)}</span>
      </div>
    </div>
  </body></html>`
}

/**
 * Genera el PDF del día y abre la hoja de compartir nativa. `brand` resuelto por
 * el caller desde `useTheme().branding` (vía `resolveNutritionExportBrand`).
 */
export async function exportNutritionDayPdf(
  params: NutritionDayExportParams,
  brand: NutritionExportBrand = EVA_EXPORT_BRAND
): Promise<void> {
  const html = buildDayPdfHtml(params, brand)
  const { uri } = await Print.printToFileAsync({ html })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: params.planName || 'Plan nutricional',
    })
  }
}
