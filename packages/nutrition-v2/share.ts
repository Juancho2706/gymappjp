/**
 * Texto de resumen del día del alumno para "Compartir" (nutrición V2).
 * Puro y framework-neutral: web (Web Share API / portapapeles) y RN (Share nativo)
 * comparten EXACTAMENTE el mismo texto → paridad de microcopy garantizada.
 *
 * Reglas: español latam neutro, sin jerga, SIN datos privados del coach y SIN
 * marca de la app (white-label safe: no inyecta "EVA" en el contexto del coach).
 * El nombre del plan es del propio alumno, así que sí puede incluirse.
 */

export interface NutritionDayShareItem {
  name: string
  quantity: number
  unit: string
}

export interface NutritionDayShareInput {
  /** Fecha local del día en formato ISO `YYYY-MM-DD`. */
  localDate: string
  /** Nombre del plan del alumno (opcional). */
  planName?: string | null
  consumed: { calories: number; proteinG: number; carbsG: number; fatsG: number }
  targets: {
    calories?: number | null
    proteinG?: number | null
    carbsG?: number | null
    fatsG?: number | null
  }
  /** Lo consumido del día (mismo conjunto que "Consumido hoy"). */
  items: readonly NutritionDayShareItem[]
  /** Máximo de ítems listados antes de resumir con "(y N más)". Default 8. */
  maxItems?: number
}

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * Fecha legible en español desde `YYYY-MM-DD`, sin desfase de zona horaria
 * (se arma en UTC y se lee en UTC → determinista, testeable). Si la entrada no
 * es una fecha válida devuelve la cadena original.
 */
function formatLegibleDate(iso: string): string {
  const [rawY, rawM, rawD] = iso.split('-')
  const y = Number(rawY)
  const m = Number(rawM)
  const d = Number(rawD)
  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return iso
  }
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${WEEKDAYS_ES[date.getUTCDay()]} ${d} de ${MONTHS_ES[m - 1]}`
}

function fmtNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(Math.max(safe, 0)))
}

function fmtQuantity(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Math.max(safe, 0))
}

/** "Etiqueta: consumido / meta unidad", o "Etiqueta: consumido unidad" si no hay meta. */
function macroLine(label: string, consumed: number, target: number | null | undefined, unit: string): string {
  const consumedLabel = fmtNumber(consumed)
  if (target == null || target <= 0) return `${label}: ${consumedLabel} ${unit}`
  return `${label}: ${consumedLabel} / ${fmtNumber(target)} ${unit}`
}

export function buildNutritionDayShareText(input: NutritionDayShareInput): string {
  const maxItems = input.maxItems && input.maxItems > 0 ? input.maxItems : 8
  const planName = input.planName?.trim()
  const lines: string[] = []

  lines.push(planName ? `Mi día · ${planName}` : 'Mi día de nutrición')
  lines.push(formatLegibleDate(input.localDate))
  lines.push('')
  lines.push(macroLine('Energía', input.consumed.calories, input.targets.calories, 'kcal'))
  lines.push(macroLine('Proteína', input.consumed.proteinG, input.targets.proteinG, 'g'))
  lines.push(macroLine('Carbohidratos', input.consumed.carbsG, input.targets.carbsG, 'g'))
  lines.push(macroLine('Grasas', input.consumed.fatsG, input.targets.fatsG, 'g'))
  lines.push('')

  if (input.items.length === 0) {
    lines.push('Todavía no registro alimentos hoy.')
  } else {
    lines.push('Lo que comí:')
    const shown = input.items.slice(0, maxItems)
    for (const item of shown) {
      lines.push(`• ${item.name} — ${fmtQuantity(item.quantity)} ${item.unit}`)
    }
    const extra = input.items.length - shown.length
    if (extra > 0) lines.push(`(y ${extra} más)`)
  }

  return lines.join('\n')
}
