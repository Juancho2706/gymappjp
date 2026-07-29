/**
 * Variantes de día del plan V2 — helpers PUROS compartidos web/RN (FD3).
 *
 * El backend V2 ya resuelve qué variante aplica a una fecha al CONGELAR el snapshot del día
 * (`private.nutrition_v2_ensure_day_snapshot`: `where day_of_week = extract(dow from fecha)
 * or is_default`, ordenando el match exacto primero y cayendo al día base). Estos helpers NO
 * introducen selección nueva: replican esa MISMA regla, ya determinista y documentada, para
 * poder EXPLICARLA en la UI (badge "Hoy: plan de …", tira Lu-Do por card). Ninguna superficie
 * decide con esto qué se prescribe: eso lo decide el snapshot.
 *
 * Convención de `dayOfWeek`: 0=domingo … 6=sábado (idéntica a `extract(dow)` de Postgres y a
 * `Date.prototype.getUTCDay`), y `null` = variante sin día fijo (el día base / "por defecto").
 *
 * Framework-neutral: sin React, sin DOM, sin RN. Una sola verdad para PWA y app nativa.
 */

import { formatNutritionCalories } from './design'

/** Etiquetas largas por `dayOfWeek` (0=domingo), en español latam neutro. */
export const NUTRITION_DAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const

/** Etiquetas cortas para la tira Lu-Do (mismo índice que `NUTRITION_DAY_LABELS`). */
export const NUTRITION_DAY_SHORT_LABELS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'] as const

/** Orden de lectura de la semana en Chile/latam: lunes → domingo. */
export const NUTRITION_WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

/** Forma mínima de una variante para estos helpers (read-model y draft la cumplen). */
export interface NutritionDayVariantLike {
  id?: string | null
  dayOfWeek: number | null
  isDefault: boolean
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Día de semana (0=domingo … 6=sábado) de una fecha local `YYYY-MM-DD`.
 *
 * Se construye en UTC a propósito: la fecha ya viene resuelta en la zona del alumno
 * (`localDate` / `asOfDate` del read-model), así que interpretarla en la zona del dispositivo
 * la correría un día. Devuelve `null` si la cadena no es una fecha válida.
 */
export function nutritionDayOfWeekFromIso(isoDate: string | null | undefined): number | null {
  if (typeof isoDate !== 'string') return null
  const match = ISO_DATE_RE.exec(isoDate.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date.getUTCDay()
}

/** Nombre del día: `formatNutritionDayOfWeek(6)` → "Sábado"; `{ short: true }` → "Sá". */
export function formatNutritionDayOfWeek(
  dayOfWeek: number | null | undefined,
  options: { short?: boolean } = {},
): string | null {
  if (dayOfWeek == null || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null
  return options.short ? NUTRITION_DAY_SHORT_LABELS[dayOfWeek] : NUTRITION_DAY_LABELS[dayOfWeek]
}

/**
 * Variante que aplica a un día de semana, con la MISMA regla del snapshot: gana el match
 * exacto de `dayOfWeek`; si no hay, cae a la variante por defecto. Sin default y sin match
 * exacto ⇒ `null` (el snapshot tampoco prescribiría nada, no inventamos una variante).
 *
 * El orden del arreglo se respeta como desempate porque los read-models ya lo devuelven por
 * `order_index, created_at`, igual que el `order by` del RPC.
 */
export function resolveNutritionDayVariantForDow<T extends NutritionDayVariantLike>(
  variants: readonly T[],
  dayOfWeek: number | null,
): T | null {
  if (variants.length === 0) return null
  if (dayOfWeek != null) {
    const exact = variants.find((variant) => variant.dayOfWeek === dayOfWeek)
    if (exact) return exact
  }
  return variants.find((variant) => variant.isDefault) ?? null
}

/** Igual que `resolveNutritionDayVariantForDow`, tomando la fecha local `YYYY-MM-DD`. */
export function resolveNutritionDayVariantForDate<T extends NutritionDayVariantLike>(
  variants: readonly T[],
  isoDate: string | null | undefined,
): T | null {
  return resolveNutritionDayVariantForDow(variants, nutritionDayOfWeekFromIso(isoDate))
}

/** Misma variante: por `id` cuando ambas lo traen, si no por identidad de referencia. */
function isSameVariant(a: NutritionDayVariantLike, b: NutritionDayVariantLike): boolean {
  if (a === b) return true
  return a.id != null && b.id != null && a.id === b.id
}

/**
 * Orden de presentación pedido por UX: el día base primero y después los días específicos
 * de lunes a domingo. Las variantes sin día fijo que no sean la base (estado inválido en
 * datos, tolerado en lectura) quedan al final conservando su orden original.
 */
export function sortNutritionDayVariantsForDisplay<T extends NutritionDayVariantLike>(
  variants: readonly T[],
): T[] {
  const rank = (variant: T): number => {
    if (variant.isDefault) return -1
    if (variant.dayOfWeek == null) return NUTRITION_WEEK_ORDER.length + 1
    const index = NUTRITION_WEEK_ORDER.indexOf(variant.dayOfWeek as (typeof NUTRITION_WEEK_ORDER)[number])
    return index < 0 ? NUTRITION_WEEK_ORDER.length : index
  }
  return variants
    .map((variant, index) => ({ variant, index }))
    .sort((a, b) => rank(a.variant) - rank(b.variant) || a.index - b.index)
    .map((entry) => entry.variant)
}

/** Una celda de la tira Lu-Do de una card de variante. */
export interface NutritionWeekStripDay {
  dayOfWeek: number
  shortLabel: string
  longLabel: string
  /** La variante de la card es la que aplica ese día. */
  applies: boolean
  /** Ese día es hoy (para el realce del día actual). */
  isToday: boolean
}

/**
 * Tira Lu-Do de una variante: marca los días que efectivamente le tocan. El día base queda
 * marcado en todos los días que NINGUNA variante específica reclama (que es exactamente lo
 * que hará el snapshot), así el alumno entiende sin leer letra chica.
 */
export function buildNutritionDayVariantWeekStrip<T extends NutritionDayVariantLike>(params: {
  variants: readonly T[]
  variant: T
  todayIso?: string | null
}): NutritionWeekStripDay[] {
  const todayDow = nutritionDayOfWeekFromIso(params.todayIso)
  return NUTRITION_WEEK_ORDER.map((dayOfWeek) => {
    const owner = resolveNutritionDayVariantForDow(params.variants, dayOfWeek)
    return {
      dayOfWeek,
      shortLabel: NUTRITION_DAY_SHORT_LABELS[dayOfWeek],
      longLabel: NUTRITION_DAY_LABELS[dayOfWeek],
      applies: owner != null && isSameVariant(owner, params.variant),
      isToday: dayOfWeek === todayDow,
    }
  })
}

/**
 * Texto del badge del "Hoy" del alumno (SPEC multi-día, UX 4): `Hoy: plan de {label} · {kcal}`.
 * Sin objetivo de energía en la variante, el badge se queda solo con la etiqueta.
 */
export function formatNutritionTodayVariantBadge(variant: {
  label: string
  targets?: { calories?: number | null } | null
}): string {
  const calories = variant.targets?.calories
  const suffix = calories != null && Number.isFinite(calories) ? ` · ${formatNutritionCalories(calories)}` : ''
  return `Hoy: plan de ${variant.label}${suffix}`
}
