/**
 * Selector de DÍA del plan (strip Lu-Do sin fechas) — helper PURO compartido web/RN.
 *
 * Modelo mental aprobado por el owner (2026-07-29, mockup "selector de días"): **el coach toca
 * DÍAS, no variantes**. Las 7 celdas describen qué recibe cada día de la semana: el día que tiene
 * variante propia (`dayOfWeek` fijo) y el que HEREDA el día base. Es la misma regla que el
 * snapshot del alumno ya congela (`resolveNutritionDayVariantForDow`): acá no se decide nada
 * nuevo, solo se EXPLICA para poder navegarlo.
 *
 * Diferencia con `week-view.ts` (`buildNutritionWeek`): esa tira es de SEGUIMIENTO — lleva fechas
 * reales, consumo y adherencia del alumno. Esta es del PLAN: día de semana puro, kcal de la
 * estructura, sin fechas y sin historial. Conviven en la misma pantalla con semánticas distintas
 * y por eso son helpers distintos.
 *
 * Convención de `dayOfWeek`: 0=domingo … 6=sábado (idéntica a `extract(dow)` de Postgres), y la
 * semana se recorre en `NUTRITION_WEEK_ORDER` (lunes → domingo, lectura latam).
 *
 * Reglas de honestidad que respeta:
 *  - kcal PRESCRITAS (Σ de los items de las franjas) manda sobre el objetivo cuando existe: es lo
 *    que el alumno realmente recibe. Sin ningún item con kcal cae al objetivo del día, y se
 *    informa CUÁL de las dos cifras es (`caloriesSource`) para que la UI no confunda al coach.
 *  - Un día sin items y sin objetivo queda en `null`, nunca en `0` (un 0 inventado se lee como
 *    "no come nada").
 *  - Sin variante base y sin match exacto ⇒ `variant: null` (el snapshot tampoco prescribiría).
 *
 * Framework-neutral: sin React, sin DOM, sin RN. Una sola verdad para PWA y app nativa.
 */

import {
  NUTRITION_DAY_LABELS,
  NUTRITION_DAY_SHORT_LABELS,
  NUTRITION_WEEK_ORDER,
  nutritionDayOfWeekFromIso,
  resolveNutritionDayVariantForDow,
  type NutritionDayVariantLike,
} from './day-variants'
import { formatNutritionCalories } from './design'

/** Franja mínima para contar kcal/porciones. El read-model y el draft la cumplen sin casts. */
export interface NutritionPlanDowSlotLike {
  prescriptionItems?: ReadonlyArray<{ macros?: { calories?: number | null } | null }> | null
  exchangeTargets?: ReadonlyArray<{ portions?: number | null }> | null
}

/** Variante mínima para el strip: `plan.dayVariants[number]` del read-model la cumple. */
export interface NutritionPlanDowVariantLike extends NutritionDayVariantLike {
  label?: string | null
  targets?: { calories?: number | null } | null
  mealSlots?: ReadonlyArray<NutritionPlanDowSlotLike> | null
}

/** Cifras de un día ya resueltas (nada que recalcular en la UI). */
export interface NutritionPlanDowTotals {
  slotCount: number
  itemCount: number
  /** Σ de porciones a elección prescritas en el día (0 = el plan no usa porciones). */
  portionCount: number
  /** Σ kcal de los items prescritos; `null` si ningún item trae energía. */
  prescribedCalories: number | null
  /** Objetivo de energía del día (`targets.calories`). */
  targetCalories: number | null
  /** La cifra que la celda muestra: prescritas si existen, si no el objetivo. */
  displayCalories: number | null
  caloriesSource: 'prescribed' | 'target' | null
}

/** Una celda del strip: un día de la semana y la estructura que le toca. */
export interface NutritionPlanDowCell<T> extends NutritionPlanDowTotals {
  dayOfWeek: number
  /** "Lu" … "Do" (diccionario compartido; la UI decide si va en mayúsculas). */
  shortLabel: string
  /** "Lunes" … "Domingo". */
  longLabel: string
  /** Variante que aplica ese día (propia o la base heredada). */
  variant: T | null
  /** La variante que aplica tiene ESE día fijo ⇒ día propio (punto lleno). */
  isOwnDay: boolean
  /** El día toma la variante base ⇒ hereda (punto hueco). */
  inheritsBase: boolean
  isToday: boolean
}

/** Nota del plan de un solo día: el strip no aporta y la UI muestra la card directa. */
export const NUTRITION_PLAN_DOW_UNIFORM_NOTE = 'Este plan aplica igual los 7 días.'

/** Leyenda del strip (copy única web/RN). */
export const NUTRITION_PLAN_DOW_LEGEND = {
  own: 'día propio',
  inherited: 'sigue el día base',
} as const

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** "1,5" / "2" en es-CL (las porciones van de medio en medio). */
function formatPortionsEsCl(portions: number): string {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(portions)
}

/**
 * Cifras de una variante: franjas, items, porciones y las dos energías (prescrita vs objetivo).
 * `prescribedCalories` suma solo los items que TRAEN kcal: una franja de puras porciones no
 * inventa un 0 que la UI leería como "sin comida".
 */
export function summarizeNutritionPlanDowVariant(
  variant: NutritionPlanDowVariantLike | null | undefined,
): NutritionPlanDowTotals {
  const targetCalories = finiteOrNull(variant?.targets?.calories)
  const slots = variant?.mealSlots ?? []
  let itemCount = 0
  let portionCount = 0
  let prescribed: number | null = null

  for (const slot of slots) {
    for (const item of slot.prescriptionItems ?? []) {
      itemCount += 1
      const calories = finiteOrNull(item.macros?.calories)
      if (calories != null) prescribed = (prescribed ?? 0) + calories
    }
    for (const target of slot.exchangeTargets ?? []) {
      const portions = finiteOrNull(target.portions)
      if (portions != null) portionCount += portions
    }
  }

  const displayCalories = prescribed ?? targetCalories
  return {
    slotCount: slots.length,
    itemCount,
    portionCount,
    prescribedCalories: prescribed,
    targetCalories,
    displayCalories,
    caloriesSource: prescribed != null ? 'prescribed' : targetCalories != null ? 'target' : null,
  }
}

/**
 * Las 7 celdas del strip, lunes → domingo. `todayIso` solo marca el día actual (realce sutil);
 * no cambia qué variante aplica.
 */
export function buildNutritionPlanDowStrip<T extends NutritionPlanDowVariantLike>(params: {
  variants: readonly T[]
  todayIso?: string | null
}): NutritionPlanDowCell<T>[] {
  const todayDow = nutritionDayOfWeekFromIso(params.todayIso)
  return NUTRITION_WEEK_ORDER.map((dayOfWeek) => {
    const variant = resolveNutritionDayVariantForDow(params.variants, dayOfWeek)
    const isOwnDay = variant != null && variant.dayOfWeek === dayOfWeek
    return {
      dayOfWeek,
      shortLabel: NUTRITION_DAY_SHORT_LABELS[dayOfWeek],
      longLabel: NUTRITION_DAY_LABELS[dayOfWeek],
      variant,
      isOwnDay,
      inheritsBase: variant != null && !isOwnDay,
      isToday: dayOfWeek === todayDow,
      ...summarizeNutritionPlanDowVariant(variant),
    }
  })
}

/** ¿Los 7 días reciben exactamente la misma variante? Entonces el selector no aporta. */
export function isNutritionPlanDowUniform(
  cells: readonly NutritionPlanDowCell<NutritionPlanDowVariantLike>[],
): boolean {
  if (cells.length === 0) return false
  const first = cells[0].variant
  if (first == null) return false
  return cells.every((cell) => isSameDowVariant(cell.variant, first))
}

function isSameDowVariant(
  a: NutritionPlanDowVariantLike | null,
  b: NutritionPlanDowVariantLike | null,
): boolean {
  if (a == null || b == null) return false
  if (a === b) return true
  return a.id != null && b.id != null && a.id === b.id
}

/** Contexto del día elegido: qué es, con quién lo comparte y cuánto trae. */
export interface NutritionPlanDowSelection<T> {
  dayOfWeek: number
  /** "Sábado". */
  dayLabel: string
  kind: 'own' | 'inherited' | 'none'
  variant: T | null
  /** Etiqueta de la variante cuando aporta algo distinto del nombre del día. */
  variantLabel: string | null
  /** Días (cortos) que reciben la MISMA variante, sin contar el elegido. */
  sharedShortLabels: string[]
  /** "Sábado · Día libre controlado" / "Lunes sigue el Día base". */
  title: string
  /** "Igual que Ma · Mi · Ju · Vi" — solo cuando el día comparte su estructura. */
  sharedLabel: string | null
  /** "2.640 kcal prescritas · 3 franjas · 5 porciones". */
  statsLabel: string | null
  totals: NutritionPlanDowTotals
}

function trimmedLabel(value: string | null | undefined): string | null {
  const label = typeof value === 'string' ? value.trim() : ''
  return label.length > 0 ? label : null
}

/**
 * Copy del contexto del día elegido, en una sola voz para web y RN (si cada gemelo armara la
 * frase, la ficha y el móvil dirían cosas distintas del mismo plan).
 */
export function describeNutritionPlanDowSelection<T extends NutritionPlanDowVariantLike>(params: {
  cells: readonly NutritionPlanDowCell<T>[]
  dayOfWeek: number
}): NutritionPlanDowSelection<T> | null {
  const cell = params.cells.find((candidate) => candidate.dayOfWeek === params.dayOfWeek) ?? null
  if (cell == null) return null

  const dayLabel = cell.longLabel
  const variantLabelRaw = trimmedLabel(cell.variant?.label)
  const kind: NutritionPlanDowSelection<T>['kind'] =
    cell.variant == null ? 'none' : cell.isOwnDay ? 'own' : 'inherited'

  const shared = params.cells.filter(
    (candidate) =>
      candidate.dayOfWeek !== cell.dayOfWeek && isSameDowVariant(candidate.variant, cell.variant),
  )
  const sharedShortLabels = shared.map((candidate) => candidate.shortLabel)

  // "Sábado" como etiqueta de la variante del sábado no aporta nada: solo se muestra el nombre
  // cuando el coach lo personalizó ("Día libre controlado").
  const variantLabel =
    variantLabelRaw != null && variantLabelRaw.toLocaleLowerCase() !== dayLabel.toLocaleLowerCase()
      ? variantLabelRaw
      : null

  const baseLabel = variantLabelRaw ?? 'día base'
  const title =
    kind === 'none'
      ? `${dayLabel} · sin estructura prescrita`
      : kind === 'own'
        ? `${dayLabel} · ${variantLabel ?? 'día propio'}`
        : `${dayLabel} sigue el ${baseLabel}`

  const sharedLabel =
    kind === 'inherited' && sharedShortLabels.length > 0
      ? sharedShortLabels.length === NUTRITION_WEEK_ORDER.length - 1
        ? 'Igual todos los días'
        : `Igual que ${sharedShortLabels.join(' · ')}`
      : null

  return {
    dayOfWeek: cell.dayOfWeek,
    dayLabel,
    kind,
    variant: cell.variant,
    variantLabel,
    sharedShortLabels,
    title,
    sharedLabel,
    statsLabel: formatNutritionPlanDowStats(cell),
    totals: {
      slotCount: cell.slotCount,
      itemCount: cell.itemCount,
      portionCount: cell.portionCount,
      prescribedCalories: cell.prescribedCalories,
      targetCalories: cell.targetCalories,
      displayCalories: cell.displayCalories,
      caloriesSource: cell.caloriesSource,
    },
  }
}

/**
 * "2.640 kcal prescritas · 3 franjas · 5 porciones". Cada pieza aparece solo si existe: un plan
 * sin porciones no arrastra un "0 porciones", y un día sin energía conocida no muestra kcal.
 */
export function formatNutritionPlanDowStats(totals: NutritionPlanDowTotals): string | null {
  const parts: string[] = []
  if (totals.displayCalories != null) {
    const suffix = totals.caloriesSource === 'prescribed' ? 'prescritas' : 'de objetivo'
    parts.push(`${formatNutritionCalories(totals.displayCalories)} ${suffix}`)
  }
  if (totals.slotCount > 0) {
    parts.push(`${totals.slotCount} franja${totals.slotCount === 1 ? '' : 's'}`)
  }
  if (totals.portionCount > 0) {
    parts.push(
      `${formatPortionsEsCl(totals.portionCount)} ${totals.portionCount === 1 ? 'porción' : 'porciones'}`,
    )
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * kcal de una celda del strip: solo el número ("2.180"), porque la unidad no cabe siete veces en
 * una fila. La unidad y la fuente (prescritas / objetivo) viajan en el `aria-label` de la celda y
 * en la barra de contexto, así el dato nunca queda ambiguo.
 */
export function formatNutritionPlanDowCalories(value: number | null | undefined): string {
  const calories = finiteOrNull(value ?? null)
  if (calories == null) return '—'
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(calories)
}

/**
 * Etiqueta accesible de una celda: "Sábado, día propio, 420 kcal prescritas, hoy". Compartida por
 * los dos gemelos para que lector de pantalla y TalkBack digan exactamente lo mismo.
 */
export function formatNutritionPlanDowCellAccessibilityLabel(
  cell: NutritionPlanDowCell<NutritionPlanDowVariantLike>,
): string {
  const parts: string[] = [cell.longLabel]
  parts.push(
    cell.variant == null
      ? 'sin estructura prescrita'
      : cell.isOwnDay
        ? NUTRITION_PLAN_DOW_LEGEND.own
        : NUTRITION_PLAN_DOW_LEGEND.inherited,
  )
  if (cell.displayCalories != null) {
    const suffix = cell.caloriesSource === 'prescribed' ? 'prescritas' : 'de objetivo'
    parts.push(`${formatNutritionCalories(cell.displayCalories)} ${suffix}`)
  }
  if (cell.isToday) parts.push('hoy')
  return parts.join(', ')
}

/** Día inicial del selector: hoy si la semana lo trae, si no el primer día con estructura. */
export function initialNutritionPlanDow(
  cells: readonly NutritionPlanDowCell<NutritionPlanDowVariantLike>[],
): number | null {
  if (cells.length === 0) return null
  const today = cells.find((cell) => cell.isToday)
  if (today != null) return today.dayOfWeek
  const withStructure = cells.find((cell) => cell.variant != null)
  return (withStructure ?? cells[0]).dayOfWeek
}
