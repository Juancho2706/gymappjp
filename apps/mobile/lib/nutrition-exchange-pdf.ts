import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import {
  exchangeGroupColor,
  macrosForTargets,
  portionsSummaryLabel,
  type DayVariant,
  type ExchangeFoodEquivalence,
  type ExchangeGroup,
} from '@eva/nutrition-engine'
import {
  EVA_EXPORT_BRAND,
  type NutritionExportBrand,
} from './nutrition-day-export'
import type { ExchangeTargetDraft } from './nutrition-exchanges.coach'

/**
 * PDF de la pauta por INTERCAMBIOS (módulo `nutrition_exchanges`), export coach vía
 * `expo-print` — espejo del `downloadNutritionExchangePdf` web. Dos formatos:
 *   - 'compact': comidas con su resumen de porciones ("2C · 1LAC") + macros derivados
 *     y totales por variante vs objetivo.
 *   - 'equivalences': lo anterior + tabla de equivalencias (alimento → porción) por grupo.
 *
 * Marca resuelta por el caller desde `useTheme().branding` (misma `NutritionExportBrand`
 * que el PDF del día). Cálculo derivado 100% con el motor puro `@eva/nutrition-engine`
 * (cero duplicación). Standalone v1: sin bitácora team (shouldLogExchangePdf ⇒ no-op).
 */

export interface ExchangePdfMeal {
  name: string
  targets: ExchangeTargetDraft[]
  dayVariantId: string | null
}

export interface NutritionExchangePdfParams {
  planName: string
  goals: { calories: number; protein: number; carbs: number; fats: number }
  instructions?: string | null
  meals: ExchangePdfMeal[]
  groups: ExchangeGroup[]
  variants: DayVariant[]
  equivalences: ExchangeFoodEquivalence[]
  format: 'compact' | 'equivalences'
}

type Rgb = [number, number, number]
const EVA_ACCENT: Rgb = [16, 185, 129]
const EVA_HEADER_BG: Rgb = [15, 23, 42]
const r = Math.round

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function luminance([rr, gg, bb]: Rgb): number {
  return (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255
}
function darken(rgb: Rgb, factor: number): Rgb {
  return [r(rgb[0] * factor), r(rgb[1] * factor), r(rgb[2] * factor)]
}
function css(c: Rgb): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`
}
function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

function chipHtml(code: string, color: string, portionsLabel: string): string {
  return `<span class="pchip"><span class="pdot" style="background:${esc(color)}">${esc(code)}</span><span class="pnum">${esc(portionsLabel)}${esc(code)}</span></span>`
}

function mealHtml(meal: ExchangePdfMeal, groups: ExchangeGroup[], accent: Rgb): string {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const m = macrosForTargets(meal.targets, groups)
  const summary = portionsSummaryLabel(meal.targets, groups)
  const chips = meal.targets
    .map((t) => ({ group: byId.get(t.exchangeGroupId), portions: t.portions }))
    .filter((x): x is { group: ExchangeGroup; portions: number } => !!x.group && x.portions > 0)
    .sort((a, b) =>
      a.group.sortOrder !== b.group.sortOrder ? a.group.sortOrder - b.group.sortOrder : a.group.code.localeCompare(b.group.code)
    )
    .map((x) => chipHtml(x.group.code, exchangeGroupColor(x.group), String(x.portions)))
    .join('')
  return `<div class="meal">
    <div class="meal-hdr">
      <div class="meal-accent" style="background:${css(accent)}"></div>
      <div class="meal-name">${esc(meal.name.toUpperCase())}</div>
      <div class="meal-kcal">${r(m.calories)} kcal</div>
    </div>
    <div class="meal-body">
      <div class="chips">${chips || '<span class="muted">Sin porciones asignadas</span>'}</div>
      <div class="meal-macros">${esc(summary)}${summary ? ' · ' : ''}P ${m.proteinG}g · C ${m.carbsG}g · G ${m.fatsG}g</div>
    </div>
  </div>`
}

function equivalencesHtml(groups: ExchangeGroup[], equivalences: ExchangeFoodEquivalence[]): string {
  const byGroup = new Map<string, ExchangeFoodEquivalence[]>()
  for (const e of equivalences) {
    const arr = byGroup.get(e.exchangeGroupId)
    if (arr) arr.push(e)
    else byGroup.set(e.exchangeGroupId, [e])
  }
  const blocks = groups
    .filter((g) => (byGroup.get(g.id)?.length ?? 0) > 0)
    .map((g) => {
      const rows = (byGroup.get(g.id) ?? [])
        .map((e) => {
          const measure = e.portionLabel ?? (e.portionGrams != null ? `${e.portionGrams} g` : '—')
          return `<tr><td class="eq-name">${esc(e.name)}</td><td class="eq-measure">${esc(measure)}</td></tr>`
        })
        .join('')
      return `<div class="eq-group">
        <div class="eq-hdr"><span class="eq-dot" style="background:${esc(exchangeGroupColor(g))}">${esc(g.code)}</span><span class="eq-title">${esc(g.name)}</span><span class="eq-sub">1 porción equivale a…</span></div>
        <table class="eq-table"><tbody>${rows}</tbody></table>
      </div>`
    })
    .join('')
  if (!blocks) return ''
  return `<div class="eq"><div class="eq-section-hd">Equivalencias por grupo</div>${blocks}</div>`
}

function buildHtml(params: NutritionExchangePdfParams, brand: NutritionExportBrand): string {
  const p = derivePalette(brand)
  const { goals, groups, variants } = params
  const totalsRows = (() => {
    // Totales por variante vs objetivo (comida con variante NULL cuenta en todas).
    const meals = params.meals.map((mm) => ({ targets: mm.targets, dayVariantId: mm.dayVariantId }))
    if (variants.length === 0) {
      const t = macrosForTargets(meals.flatMap((mm) => mm.targets), groups)
      return [{ name: 'Día completo', totals: t }]
    }
    return variants.map((v) => {
      const applies = meals.filter((mm) => mm.dayVariantId == null || mm.dayVariantId === v.id)
      const t = macrosForTargets(applies.flatMap((mm) => mm.targets), groups)
      return { name: v.name, totals: t }
    })
  })()

  const instr = params.instructions?.trim()
  const logoHtml = p.logoUrl ? `<img class="hdr-logo" src="${esc(p.logoUrl)}" />` : ''
  const goalsChips = [
    ['KCAL META', String(goals.calories)],
    ['PROTEÍNA', `${goals.protein}g`],
    ['CARBOS', `${goals.carbs}g`],
    ['GRASAS', `${goals.fats}g`],
  ]
    .map(([l, v]) => `<div class="chip"><div class="chip-label">${esc(l)}</div><div class="chip-value">${esc(v)}</div></div>`)
    .join('')

  const totalsHtml = `<div class="totals">
    <div class="totals-hd">Derivado vs objetivo</div>
    ${totalsRows
      .map(
        (row) => `<div class="totals-row">
      <span class="tr-name">${esc(row.name)}</span>
      <span class="tr-val">${r(row.totals.calories)}/${goals.calories} kcal · P ${row.totals.proteinG}/${goals.protein} · C ${row.totals.carbsG}/${goals.carbs} · G ${row.totals.fatsG}/${goals.fats}</span>
    </div>`
      )
      .join('')}
  </div>`

  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: rgb(15,23,42); background: #fff; }
    .hdr { position: relative; background: ${css(p.headerBg)}; color: #fff; padding: 16px 18px 14px; }
    .hdr-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: ${css(p.accent)}; }
    .hdr-logo { height: 26px; max-width: 120px; object-fit: contain; margin-bottom: 6px; }
    .brand-eyebrow { font-size: 8px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: ${css(p.accent)}; }
    .plan-name { font-size: 17px; font-weight: 900; letter-spacing: 0.02em; text-transform: uppercase; margin-top: 4px; line-height: 1.15; }
    .mode-tag { font-size: 9px; color: rgb(148,163,184); margin-top: 4px; }
    .body { padding: 16px 18px 0; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
    .chip { flex: 1; min-width: 60px; border: 1px solid rgb(226,232,240); border-radius: 5px; padding: 5px 7px; }
    .chip-label { font-size: 6.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: rgb(100,116,139); }
    .chip-value { font-size: 13px; font-weight: 800; color: rgb(15,23,42); margin-top: 2px; }
    .instr { margin-bottom: 12px; }
    .instr-hd { background: rgb(241,245,249); font-size: 8px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: rgb(71,85,105); padding: 4px 6px; }
    .instr-body { font-size: 10px; color: rgb(71,85,105); line-height: 1.45; padding: 5px 6px 0; }
    .meal { margin-bottom: 10px; break-inside: avoid; border: 0.5px solid rgb(226,232,240); border-radius: 6px; overflow: hidden; }
    .meal-hdr { position: relative; display: flex; align-items: center; background: rgb(241,245,249); padding: 6px 8px 6px 12px; }
    .meal-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
    .meal-name { flex: 1; font-size: 10px; font-weight: 800; letter-spacing: 0.04em; color: rgb(15,23,42); }
    .meal-kcal { font-size: 9px; font-weight: 700; color: rgb(71,85,105); }
    .meal-body { padding: 8px 10px; }
    .meal-body .chips { margin-bottom: 6px; }
    .pchip { display: inline-flex; align-items: center; gap: 5px; border: 0.5px solid rgb(226,232,240); border-radius: 999px; padding: 2px 8px 2px 3px; margin: 0 4px 4px 0; }
    .pdot { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 999px; color: #fff; font-size: 7px; font-weight: 900; }
    .pnum { font-size: 9px; font-weight: 800; color: rgb(15,23,42); }
    .meal-macros { font-size: 8.5px; font-weight: 700; color: rgb(71,85,105); }
    .muted { font-size: 9px; color: rgb(148,163,184); }
    .totals { background: ${css(p.headerBg)}; border-top: 2px solid ${css(p.accent)}; padding: 10px 12px 12px; margin-top: 6px; break-inside: avoid; }
    .totals-hd { font-size: 8px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: ${css(p.accent)}; margin-bottom: 8px; }
    .totals-row { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
    .tr-name { font-size: 9px; font-weight: 800; color: #fff; }
    .tr-val { font-size: 8.5px; font-weight: 700; color: rgb(203,213,225); }
    .eq { margin-top: 14px; }
    .eq-section-hd { font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: rgb(71,85,105); border-bottom: 0.5px solid rgb(203,213,225); padding-bottom: 4px; margin-bottom: 8px; }
    .eq-group { margin-bottom: 10px; break-inside: avoid; }
    .eq-hdr { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .eq-dot { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 999px; color: #fff; font-size: 7px; font-weight: 900; }
    .eq-title { font-size: 9.5px; font-weight: 800; color: rgb(15,23,42); }
    .eq-sub { font-size: 7.5px; color: rgb(148,163,184); }
    .eq-table { width: 100%; border-collapse: collapse; }
    .eq-table td { font-size: 8.5px; padding: 2px 4px; border-bottom: 0.5px solid rgb(241,245,249); }
    .eq-name { color: rgb(15,23,42); }
    .eq-measure { text-align: right; color: rgb(71,85,105); font-weight: 700; width: 40%; }
    .footer { margin-top: 14px; padding: 8px 0 16px; border-top: 0.5px solid rgb(203,213,225); display: flex; justify-content: space-between; gap: 10px; }
    .footer span { font-size: 7px; color: rgb(148,163,184); }
    @page { margin: 0 0 12mm; size: A4 portrait; }
  `

  const instrHtml = instr
    ? `<div class="instr"><div class="instr-hd">Indicaciones del coach</div><div class="instr-body">${esc(instr)}</div></div>`
    : ''
  const mealsHtml = params.meals.map((mm) => mealHtml(mm, groups, p.accent)).join('')
  const eqHtml = params.format === 'equivalences' ? equivalencesHtml(groups, params.equivalences) : ''
  const now = new Date().toLocaleString('es-CL')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(params.planName)}</title><style>${styles}</style></head><body>
    <div class="hdr">
      <div class="hdr-accent"></div>
      ${logoHtml}
      <div class="brand-eyebrow">${esc(p.brandName.toUpperCase())}</div>
      <div class="plan-name">${esc((params.planName || 'Pauta nutricional').toUpperCase())}</div>
      <div class="mode-tag">Prescripción por porciones de intercambio</div>
    </div>
    <div class="body">
      <div class="chips">${goalsChips}</div>
      ${instrHtml}
      ${mealsHtml}
      ${totalsHtml}
      ${eqHtml}
      <div class="footer">
        <span>${esc(p.generatedWithLabel)}. Uso personal. No reemplaza valoración clínica, dietética ni médica.</span>
        <span>${esc(now)}</span>
      </div>
    </div>
  </body></html>`
}

export async function exportNutritionExchangePdf(
  params: NutritionExchangePdfParams,
  brand: NutritionExportBrand = EVA_EXPORT_BRAND
): Promise<void> {
  const html = buildHtml(params, brand)
  const { uri } = await Print.printToFileAsync({ html })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: params.planName || 'Pauta nutricional',
    })
  }
}
